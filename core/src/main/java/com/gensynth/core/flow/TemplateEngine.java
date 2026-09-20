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
                Integer itemIndex = null;
                String propertyPart = null;

                if (fullVarSpec.contains(".")) {
                    String[] parts = fullVarSpec.split("\\.");
                    Set<String> knownScopes = Set.of("local", "group", "global");

                    if (knownScopes.contains(parts[0].toLowerCase())) {
                        scopePart = parts[0].toLowerCase();
                        namePart = parts[1];
                        if (parts.length >= 3) {
                            String sub = parts[2];
                            if (sub.toLowerCase().startsWith("item")) {
                                try {
                                    itemIndex = Integer.parseInt(sub.substring(4));
                                } catch (NumberFormatException ignored) {}
                                if (parts.length >= 4) {
                                    propertyPart = parts[3];
                                }
                            } else {
                                propertyPart = sub;
                            }
                        }
                    } else {
                        scopePart = null;
                        namePart = parts[0];
                        if (parts.length >= 2) {
                            String sub = parts[1];
                            if (sub.toLowerCase().startsWith("item")) {
                                try {
                                    itemIndex = Integer.parseInt(sub.substring(4));
                                } catch (NumberFormatException ignored) {}
                                if (parts.length >= 3) {
                                    propertyPart = parts[2];
                                }
                            } else {
                                propertyPart = sub;
                            }
                        }
                    }
                }

                Variable variable = findAccessibleVariable(variables, namePart, scopePart, flowId, groupId);

                if (variable != null) {
                    ensureDependenciesAvailable(
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

                    if (itemIndex != null && "list".equalsIgnoreCase(variable.getType())) {
                        Object stratObj = varConfig != null ? varConfig.get("selectionStrategy") : null;
                        if (stratObj != null && !"FIXED_SUBSET".equalsIgnoreCase(stratObj.toString())) {
                            throw new IllegalStateException("Invalid item reference: Variable '" + variable.getName() + "' uses selection strategy '" + stratObj + "' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).");
                        }
                    }

                    Object targetObj = generatedValue;
                    if (itemIndex != null && targetObj instanceof java.util.List<?>) {
                        java.util.List<?> list = (java.util.List<?>) targetObj;
                        if (itemIndex >= 0 && itemIndex < list.size()) {
                            targetObj = list.get(itemIndex);
                        } else {
                            targetObj = null;
                        }
                    }

                    if (propertyPart != null && targetObj instanceof Map<?, ?>) {
                        Map<?, ?> map = (Map<?, ?>) targetObj;
                        Object propVal = null;
                        if (map.containsKey(propertyPart)) {
                            propVal = map.get(propertyPart);
                        } else {
                            for (Map.Entry<?, ?> entry : map.entrySet()) {
                                String key = String.valueOf(entry.getKey());
                                if (key.equalsIgnoreCase(propertyPart)) {
                                    propVal = entry.getValue();
                                    break;
                                }
                            }
                            if (propVal == null) {
                                String lowerProp = propertyPart.toLowerCase();
                                if (lowerProp.equals("node") || lowerProp.equals("nodename") || lowerProp.equals("node_name")) {
                                    propVal = map.get("nodeName");
                                    if (propVal == null) propVal = map.get("node_name");
                                    if (propVal == null) propVal = map.get("node");
                                } else if (lowerProp.equals("nodeid") || lowerProp.equals("node_id")) {
                                    propVal = map.get("nodeId");
                                    if (propVal == null) propVal = map.get("node_id");
                                } else if (lowerProp.equals("targetnode") || lowerProp.equals("targetnodename") || lowerProp.equals("target_node_name")) {
                                    propVal = map.get("targetNodeName");
                                    if (propVal == null) propVal = map.get("target_node_name");
                                } else if (lowerProp.equals("targetnodeid") || lowerProp.equals("target_node_id")) {
                                    propVal = map.get("targetNodeId");
                                    if (propVal == null) propVal = map.get("target_node_id");
                                }
                            }
                        }
                        replacement = propVal != null ? String.valueOf(propVal) : "";
                    } else if (itemIndex != null && propertyPart == null) {
                        replacement = targetObj != null ? targetObj.toString() : "";
                    } else if (generatedValue instanceof java.util.List<?>) {
                        replacement = formatListToJson((java.util.List<?>) generatedValue);
                    } else if (generatedValue instanceof Map<?, ?>) {
                        replacement = formatMapToJson((Map<?, ?>) generatedValue);
                    } else if (isConstantPattern && generatedValue instanceof Double) {
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

    public Variable findAccessibleVariable(
        Map<String, Variable> variables,
        String variableNameOrId,
        String scopeFilter,
        String flowId,
        String groupId
    ) {
        for (Variable v : variables.values()) {
            boolean matchesName = v.getName() != null && v.getName().equals(variableNameOrId);
            boolean matchesId = v.getId() != null && v.getId().equals(variableNameOrId);
            if (!matchesName && !matchesId) {
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

    private void ensureDependenciesAvailable(
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
            com.gensynth.core.flow.variables.VariableConfiguration varConfig = null;
            try {
                varConfig = com.gensynth.core.flow.variables.VariableFactory.createFromMap(
                    variable.getName(), variable.getType(), variable.getConfig()
                );
            } catch (Exception ignored) {}

            Set<String> deps = new HashSet<>();
            if (varConfig != null) {
                deps.addAll(varConfig.getDependencies());
            } else {
                Object rulesObj = variable.getConfig().get("conditionalRules");
                if (rulesObj instanceof java.util.List<?>) {
                    for (Object ruleObj : (java.util.List<?>) rulesObj) {
                        if (ruleObj instanceof Map<?, ?> map) {
                            Object targetObj = map.get("targetVariable");
                            if (targetObj instanceof String s && !s.trim().isEmpty()) {
                                deps.add(s.trim());
                            }
                        }
                    }
                }
            }

            for (String depNameOrId : deps) {
                if (depNameOrId.equals(variable.getName()) || depNameOrId.equals(variable.getId())) {
                    continue;
                }
                if (context.containsKey(depNameOrId) || context.containsKey(depNameOrId + "_config")) {
                    continue;
                }

                Variable dependencyVariable = findAccessibleVariable(
                    variables,
                    depNameOrId,
                    null,
                    flowId,
                    groupId
                );
                if (dependencyVariable == null) {
                    continue;
                }

                if (dependencyVariable.getId() != null && (context.containsKey(dependencyVariable.getId()) || context.containsKey(dependencyVariable.getId() + "_config"))) {
                    continue;
                }

                ensureDependenciesAvailable(
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

    private String formatListToJson(java.util.List<?> list) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(", ");
            Object item = list.get(i);
            if (item == null) {
                sb.append("null");
            } else if (item instanceof Number || item instanceof Boolean) {
                sb.append(item.toString());
            } else {
                String str = item.toString().replace("\"", "\\\"");
                sb.append("\"").append(str).append("\"");
            }
        }
        sb.append("]");
        return sb.toString();
    }

    private String formatMapToJson(Map<?, ?> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!first) sb.append(", ");
            first = false;
            sb.append("\"").append(entry.getKey()).append("\": ");
            Object val = entry.getValue();
            if (val == null) {
                sb.append("null");
            } else if (val instanceof Number || val instanceof Boolean) {
                sb.append(val.toString());
            } else {
                String str = val.toString().replace("\"", "\\\"");
                sb.append("\"").append(str).append("\"");
            }
        }
        sb.append("}");
        return sb.toString();
    }
}
