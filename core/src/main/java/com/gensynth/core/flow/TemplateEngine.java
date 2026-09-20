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

                    if (propertyPart != null) {
                        String propResolved = resolveVariableProperty(targetObj, propertyPart, variable);
                        replacement = propResolved != null ? propResolved : "";
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

    private String resolveVariableProperty(Object targetObj, String propertyPart, Variable variable) {
        if (propertyPart == null) return null;
        String prop = propertyPart.toLowerCase(java.util.Locale.ROOT);
        String varType = variable != null && variable.getType() != null ? variable.getType().toLowerCase(java.util.Locale.ROOT) : "";

        // 1. Map target object (Point, Graph route node, custom map)
        if (targetObj instanceof Map<?, ?> map) {
            if (map.containsKey(propertyPart)) {
                Object v = map.get(propertyPart);
                return v != null ? String.valueOf(v) : "";
            }
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (String.valueOf(entry.getKey()).equalsIgnoreCase(propertyPart)) {
                    Object v = entry.getValue();
                    return v != null ? String.valueOf(v) : "";
                }
            }
            if (prop.equals("node") || prop.equals("nodename") || prop.equals("node_name")) {
                Object v = map.get("nodeName");
                if (v == null) v = map.get("node_name");
                if (v == null) v = map.get("node");
                return v != null ? String.valueOf(v) : "";
            }
            if (prop.equals("nodeid") || prop.equals("node_id")) {
                Object v = map.get("nodeId");
                if (v == null) v = map.get("node_id");
                return v != null ? String.valueOf(v) : "";
            }
            if (prop.equals("targetnode") || prop.equals("targetnodename") || prop.equals("target_node_name")) {
                Object v = map.get("targetNodeName");
                if (v == null) v = map.get("target_node_name");
                return v != null ? String.valueOf(v) : "";
            }
            if (prop.equals("targetnodeid") || prop.equals("target_node_id")) {
                Object v = map.get("targetNodeId");
                if (v == null) v = map.get("target_node_id");
                return v != null ? String.valueOf(v) : "";
            }
        }

        // 2. TEMPORAL Variable Attributes
        if ("temporal".equals(varType) || targetObj instanceof java.time.Instant || targetObj instanceof java.util.Date) {
            java.time.Instant instant = null;
            if (targetObj instanceof java.time.Instant ins) {
                instant = ins;
            } else if (targetObj instanceof java.lang.Number num) {
                instant = java.time.Instant.ofEpochMilli(num.longValue());
            } else if (targetObj instanceof String str) {
                try {
                    instant = java.time.Instant.parse(str);
                } catch (Exception ignored) {
                    try {
                        instant = java.time.Instant.ofEpochMilli(Long.parseLong(str));
                    } catch (Exception ignored2) {}
                }
            }

            if (instant == null) {
                instant = java.time.Instant.now();
            }

            java.time.ZoneId zone = java.time.ZoneId.of("UTC");
            if (variable != null && variable.getConfig() != null && variable.getConfig().get("timeZone") != null) {
                try {
                    zone = java.time.ZoneId.of(variable.getConfig().get("timeZone").toString());
                } catch (Exception ignored) {}
            }

            java.time.ZonedDateTime zdt = instant.atZone(zone);

            switch (prop) {
                case "month":
                case "monthtext":
                case "month_text":
                case "monthname":
                case "month_name":
                    return zdt.getMonth().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH);
                case "monthshort":
                case "month_short":
                    return zdt.getMonth().getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH);
                case "monthnumber":
                case "monthvalue":
                case "month_number":
                case "month_val":
                    return String.valueOf(zdt.getMonthValue());
                case "year":
                    return String.valueOf(zdt.getYear());
                case "day":
                case "dayofmonth":
                case "day_of_month":
                    return String.valueOf(zdt.getDayOfMonth());
                case "dayofweek":
                case "day_of_week":
                case "dayofweekname":
                    return zdt.getDayOfWeek().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH);
                case "dayofweeknumber":
                case "dayofweekvalue":
                    return String.valueOf(zdt.getDayOfWeek().getValue());
                case "hour":
                case "hours":
                    return String.valueOf(zdt.getHour());
                case "minute":
                case "minutes":
                    return String.valueOf(zdt.getMinute());
                case "second":
                case "seconds":
                    return String.valueOf(zdt.getSecond());
                case "millisecond":
                case "millis":
                case "timestamp":
                case "epochmilli":
                case "epoch_milli":
                    return String.valueOf(instant.toEpochMilli());
                case "timezone":
                case "time_zone":
                case "tz":
                    return zone.getId();
                default:
                    break;
            }
        }

        // 3. NUMERIC Variable Attributes
        if ("numeric".equals(varType) || targetObj instanceof Number) {
            double val = 0.0;
            if (targetObj instanceof Number num) {
                val = num.doubleValue();
            } else if (targetObj != null) {
                try {
                    val = Double.parseDouble(targetObj.toString());
                } catch (NumberFormatException ignored) {}
            }

            switch (prop) {
                case "integerpart":
                case "int":
                case "integer":
                case "integer_part":
                    return String.valueOf((long) val);
                case "fractionalpart":
                case "decimalpart":
                case "fraction":
                case "decimal":
                case "fractional_part":
                    String s = String.format(java.util.Locale.US, "%f", val);
                    int idx = s.indexOf('.');
                    if (idx != -1) {
                        String sub = s.substring(idx + 1).replaceAll("0+$", "");
                        return sub.isEmpty() ? "0" : sub;
                    }
                    return "0";
                case "abs":
                case "absolute":
                    return val % 1 == 0 ? String.valueOf((long) Math.abs(val)) : String.valueOf(Math.abs(val));
                case "round":
                    return String.valueOf(Math.round(val));
                case "floor":
                    return String.valueOf((long) Math.floor(val));
                case "ceil":
                case "ceiling":
                    return String.valueOf((long) Math.ceil(val));
                case "sign":
                case "signum":
                    return String.valueOf((int) Math.signum(val));
                default:
                    break;
            }
        }

        // 4. STRING Variable Attributes
        if ("string".equals(varType) || targetObj instanceof String) {
            String str = targetObj != null ? targetObj.toString() : "";
            switch (prop) {
                case "length":
                case "size":
                    return String.valueOf(str.length());
                case "upper":
                case "uppercase":
                    return str.toUpperCase(java.util.Locale.ROOT);
                case "lower":
                case "lowercase":
                    return str.toLowerCase(java.util.Locale.ROOT);
                case "trim":
                    return str.trim();
                case "firstchar":
                case "first_char":
                    return str.isEmpty() ? "" : String.valueOf(str.charAt(0));
                case "lastchar":
                case "last_char":
                    return str.isEmpty() ? "" : String.valueOf(str.charAt(str.length() - 1));
                default:
                    break;
            }
        }

        // 5. BOOLEAN Variable Attributes
        if ("boolean".equals(varType) || targetObj instanceof Boolean) {
            boolean bool = false;
            if (targetObj instanceof Boolean b) {
                bool = b;
            } else if (targetObj != null) {
                bool = Boolean.parseBoolean(targetObj.toString());
            }

            switch (prop) {
                case "inverse":
                case "negation":
                case "not":
                    return String.valueOf(!bool);
                case "asnumber":
                case "binary":
                case "int":
                    return bool ? "1" : "0";
                case "asstring":
                case "text":
                    return String.valueOf(bool);
                case "asupper":
                case "upper":
                    return bool ? "TRUE" : "FALSE";
                default:
                    break;
            }
        }

        // 6. LIST Variable Attributes
        if ("list".equals(varType) || targetObj instanceof java.util.List<?>) {
            if (targetObj instanceof java.util.List<?> list) {
                switch (prop) {
                    case "size":
                    case "length":
                    case "count":
                        return String.valueOf(list.size());
                    case "first":
                    case "firstitem":
                        return !list.isEmpty() && list.get(0) != null ? list.get(0).toString() : "";
                    case "last":
                    case "lastitem":
                        return !list.isEmpty() && list.get(list.size() - 1) != null ? list.get(list.size() - 1).toString() : "";
                    default:
                        break;
                }
            }
        }

        return targetObj != null ? targetObj.toString() : "";
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
