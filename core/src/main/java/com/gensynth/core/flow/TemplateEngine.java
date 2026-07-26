package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;

import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TemplateEngine {

    private final DataGenerator dataGenerator;
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{([^}]+)\\}\\}");

    public TemplateEngine() {
        this.dataGenerator = new DataGenerator();
    }

    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, String flowId, String groupId) {
        return evaluate(template, sequenceNumber, variables, flowId, groupId, new java.util.HashMap<>());
    }

    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, String flowId, String groupId, Map<String, Object> context) {
        if (template == null || template.isEmpty()) {
            return "";
        }

        if (context == null) {
            context = new java.util.HashMap<>();
        }

        // Replace built-in system variables
        String currentTs = Instant.now().toString();
        String currentUuid = UUID.randomUUID().toString();
        String currentSeq = String.valueOf(sequenceNumber);

        // We do a manual loop to handle user variables safely without breaking JSON syntax
        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        StringBuilder result = new StringBuilder();

        while (matcher.find()) {
            String fullVarSpec = matcher.group(1).trim(); // e.g. "local.temp" or just "temp"
            String replacement = "";

            // Built-in checks
            if (fullVarSpec.equals("uuid")) {
                replacement = currentUuid;
            } else if (fullVarSpec.equals("ts")) {
                replacement = currentTs;
            } else if (fullVarSpec.equals("n")) {
                replacement = currentSeq;
            } else {
                // User variable resolution with scope enforcement
                String scopePart = null;
                String namePart = fullVarSpec;

                if (fullVarSpec.contains(".")) {
                    int lastDot = fullVarSpec.lastIndexOf('.');
                    scopePart = fullVarSpec.substring(0, lastDot).toLowerCase();
                    namePart = fullVarSpec.substring(lastDot + 1);
                }

                Variable variable = findAccessibleVariable(variables, namePart, scopePart, flowId, groupId);

                if (variable != null) {
                    ensureConditionalDependenciesAvailable(
                        variable,
                        variables,
                        flowId,
                        groupId,
                        context,
                        new HashSet<>()
                    );
                    Object generatedValue = dataGenerator.generateValue(variable, context);
                    if (variable.getId() != null) {
                        context.put(variable.getId(), generatedValue);
                    }
                    if (variable.getName() != null) {
                        context.put(variable.getName(), generatedValue);
                    }
                    // Convert value to string representation
                    boolean isConstantPattern = false;
                    Map<String, Object> varConfig = variable.getConfig();
                    if (varConfig != null) {
                        Object pat = varConfig.get("pattern");
                        if (pat != null && "CONSTANT".equalsIgnoreCase(pat.toString())) {
                            isConstantPattern = true;
                        }
                    }

                    if (isConstantPattern && generatedValue instanceof Double) {
                        double d = (Double) generatedValue;
                        if (d % 1.0 == 0.0) {
                            replacement = String.format(java.util.Locale.US, "%.0f", d);
                        } else {
                            replacement = String.valueOf(generatedValue);
                        }
                    } else if (isConstantPattern && generatedValue instanceof Float) {
                        float f = (Float) generatedValue;
                        if (f % 1.0f == 0.0f) {
                            replacement = String.format(java.util.Locale.US, "%.0f", (double) f);
                        } else {
                            replacement = String.valueOf(generatedValue);
                        }
                    } else {
                        replacement = String.valueOf(generatedValue);
                    }
                } else {
                    // Unknown or inaccessible variable, leave it as is or replace with empty
                    replacement = matcher.group(0);
                }
            }

            // Matcher.appendReplacement has issues with literal $ and \, so we quote replacement
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);

        return result.toString();
    }

    private Variable findAccessibleVariable(
        Map<String, Variable> variables,
        String variableName,
        String scopeFilter,
        String flowId,
        String groupId
    ) {
        for (Variable v : variables.values()) {
            if (!v.getName().equals(variableName)) {
                continue;
            }

            if (scopeFilter != null && !v.getScope().equalsIgnoreCase(scopeFilter)) {
                continue;
            }

            String vScope = v.getScope().toUpperCase();
            if ("GLOBAL".equals(vScope)) {
                return v;
            }
            if ("GROUP".equals(vScope) && groupId != null && groupId.equals(v.getGroupId())) {
                return v;
            }
            if ("LOCAL".equals(vScope) && flowId != null && flowId.equals(v.getFlowId())) {
                return v;
            }
        }
        return null;
    }

    private void ensureConditionalDependenciesAvailable(
        Variable variable,
        Map<String, Variable> variables,
        String flowId,
        String groupId,
        Map<String, Object> context,
        Set<String> resolutionStack
    ) {
        if (variable == null || variable.getConfig() == null) {
            return;
        }

        String variableId = variable.getId();
        if (variableId != null && !resolutionStack.add(variableId)) {
            return;
        }

        try {
            Object rulesObj = variable.getConfig().get("conditionalRules");
            if (!(rulesObj instanceof java.util.List<?>)) {
                return;
            }

            for (Object ruleObj : (java.util.List<?>) rulesObj) {
                if (!(ruleObj instanceof Map<?, ?>)) {
                    continue;
                }

                Object targetObj = ((Map<?, ?>) ruleObj).get("targetVariable");
                if (!(targetObj instanceof String)) {
                    continue;
                }

                String targetVariableName = ((String) targetObj).trim();
                if (targetVariableName.isEmpty()) {
                    continue;
                }

                if (targetVariableName.equals(variable.getName()) || context.containsKey(targetVariableName)) {
                    continue;
                }

                Variable dependencyVariable = findAccessibleVariable(
                    variables,
                    targetVariableName,
                    null,
                    flowId,
                    groupId
                );
                if (dependencyVariable == null) {
                    continue;
                }

                if (dependencyVariable.getId() != null && context.containsKey(dependencyVariable.getId())) {
                    continue;
                }

                ensureConditionalDependenciesAvailable(
                    dependencyVariable,
                    variables,
                    flowId,
                    groupId,
                    context,
                    resolutionStack
                );

                Object dependencyValue = dataGenerator.generateValue(dependencyVariable, context);
                if (dependencyVariable.getId() != null) {
                    context.put(dependencyVariable.getId(), dependencyValue);
                }
                if (dependencyVariable.getName() != null) {
                    context.put(dependencyVariable.getName(), dependencyValue);
                }
            }
        } finally {
            if (variableId != null) {
                resolutionStack.remove(variableId);
            }
        }
    }

    public void clearVariableCache() {
        this.dataGenerator.clearCache();
    }

    public void removeCachedVariable(String variableId) {
        if (variableId != null) {
            this.dataGenerator.removeCachedVariable(variableId);
        }
    }
}
