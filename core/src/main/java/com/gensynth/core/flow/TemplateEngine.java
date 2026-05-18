package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;

import java.time.Instant;
import java.util.Map;
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
        if (template == null || template.isEmpty()) {
            return "";
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

                Variable variable = null;
                for (Variable v : variables.values()) {
                    if (!v.getName().equals(namePart)) continue;

                    // If scope is specified in template, it MUST match
                    if (scopePart != null && !v.getScope().equalsIgnoreCase(scopePart)) continue;

                    // Check actual scoping rules
                    boolean isAccessible = false;
                    String vScope = v.getScope().toUpperCase();

                    if ("GLOBAL".equals(vScope)) {
                        isAccessible = true;
                    } else if ("GROUP".equals(vScope)) {
                        isAccessible = groupId != null && groupId.equals(v.getGroupId());
                    } else if ("LOCAL".equals(vScope)) {
                        isAccessible = flowId != null && flowId.equals(v.getFlowId());
                    }

                    if (isAccessible) {
                        variable = v;
                        break;
                    }
                }

                if (variable != null) {
                    Object generatedValue = dataGenerator.generateValue(variable);
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

    public void clearVariableCache() {
        this.dataGenerator.clearCache();
    }

    public void removeCachedVariable(String variableId) {
        if (variableId != null) {
            this.dataGenerator.removeCachedVariable(variableId);
        }
    }
}
