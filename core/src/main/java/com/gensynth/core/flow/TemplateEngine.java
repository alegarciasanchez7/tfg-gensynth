package com.gensynth.core.flow;

import com.gensynth.core.flow.variables.VariableConfiguration;
import com.gensynth.core.flow.variables.VariableFactory;
import com.gensynth.core.flow.variables.VariableType;
import com.gensynth.core.flow.variables.config.TemporalVariableConfig;
import com.gensynth.core.model.Variable;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TemplateEngine {
    private static final String CONFIG_SUFFIX = "_config";
    private static final String LENGTH = "length";
    private static final int NOT_REACHABLE = -1;
    private static final Set<String> KNOWN_SCOPES = Set.of("local", "group", "global");

    private final DataGenerator dataGenerator;
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{([^}]+)\\}\\}");
    /** Built-in placeholder replaced by the name of the flow that renders the template. */
    public static final String FLOW_NAME_PLACEHOLDER = "flow.name";

    public TemplateEngine() {
        this.dataGenerator = new DataGenerator();
    }

    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, String flowId, String groupId) {
        return evaluate(template, sequenceNumber, variables, flowId, groupId, new java.util.HashMap<>());
    }

    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, String flowId, String groupId, Map<String, Object> context) {
        return evaluate(template, sequenceNumber, variables, flowId, groupId, null, context);
    }

    /**
     * Renders a flow template into one message.
     *
     * Each variable produces a single value per message: repeated references, sub-properties
     * ({@code {{pos.x}}}, {@code {{pos.y}}}) and dependencies of formulas or conditional rules all
     * share the value already stored in {@code context}.
     *
     * @param template       template with {@code {{...}}} placeholders
     * @param sequenceNumber value of the {@code {{n}}} built-in
     * @param variables      all variables, by id
     * @param flowId         flow rendering the template (resolves LOCAL variables)
     * @param groupId        group of that flow (resolves GROUP variables)
     * @param flowName       value of the {@code {{flow.name}}} built-in; when {@code null} the placeholder is left as is
     * @param context        values generated for this message, by variable id and name; may be {@code null}
     * @return the rendered message, or an empty string for an empty template
     */
    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, String flowId, String groupId, String flowName, Map<String, Object> context) {
        return evaluate(template, sequenceNumber, variables, new RenderTarget(flowId, groupId, flowName, null), context);
    }

    /**
     * Renders a flow template into one message, writing points and lists in the target's format
     * (see {@link StructuredValueWriter}).
     *
     * @param template       template with {@code {{...}}} placeholders
     * @param sequenceNumber value of the {@code {{n}}} built-in
     * @param variables      all variables, by id
     * @param target         flow, group, flow name and format the message is rendered for
     * @param context        values generated for this message, by variable id and name; may be {@code null}
     * @return the rendered message, or an empty string for an empty template
     */
    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, RenderTarget target, Map<String, Object> context) {
        return evaluate(template, sequenceNumber, variables, target, context, DataGenerator.NO_TICK);
    }

    /**
     * Renders a flow template into one message of a tick. LOCAL variables give a new value on
     * every message; GROUP and GLOBAL variables give one value per tick, the same for every flow
     * that renders a message on that tick.
     *
     * @param template       template with {@code {{...}}} placeholders
     * @param sequenceNumber value of the {@code {{n}}} built-in
     * @param variables      all variables, by id
     * @param target         flow, group, flow name and format the message is rendered for
     * @param context        values generated for this message, by variable id and name; may be {@code null}
     * @param tickNumber     global tick of the message, or {@link DataGenerator#NO_TICK} to give
     *                       GROUP and GLOBAL variables a new value on every call
     * @return the rendered message, or an empty string for an empty template
     */
    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables, RenderTarget target,
                           Map<String, Object> context, long tickNumber) {
        if (template == null || template.isEmpty()) {
            return "";
        }
        Map<String, Object> messageContext = context != null ? context : new java.util.HashMap<>();

        // Built-in values are generated once per message
        String currentTs = Instant.now().toString();
        String currentUuid = UUID.randomUUID().toString();
        String currentSeq = String.valueOf(sequenceNumber);

        StructuredValueWriter structuredWriter = StructuredValueWriter.forTemplate(template, target.format());

        // We do a manual loop to handle user variables safely without breaking JSON syntax
        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        StringBuilder result = new StringBuilder();

        while (matcher.find()) {
            String fullVarSpec = matcher.group(1).trim(); // e.g. "local.temp" or just "temp"
            String replacement = switch (fullVarSpec) {
                case "uuid" -> currentUuid;
                case "ts" -> currentTs;
                case "n" -> currentSeq;
                case FLOW_NAME_PLACEHOLDER -> target.flowName() != null ? target.flowName() : matcher.group(0);
                default -> resolveUserVariable(fullVarSpec, matcher, variables, target, messageContext, structuredWriter, tickNumber);
            };

            // Matcher.appendReplacement has issues with literal $ and \, so we quote replacement
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);

        return result.toString();
    }

    /**
     * What a message is rendered for.
     *
     * @param flowId   flow rendering the template (resolves LOCAL variables)
     * @param groupId  group of that flow (resolves GROUP variables)
     * @param flowName value of the {@code {{flow.name}}} built-in; when {@code null} the placeholder is left as is
     * @param format   the flow's format label ({@code json}, {@code xml}, {@code csv}, {@code plain}); may be {@code null}
     */
    public record RenderTarget(String flowId, String groupId, String flowName, String format) {
    }

    /** Parts of a user placeholder: {@code [scope.]name[.itemN][.property]}. */
    private record PlaceholderSpec(String scope, String name, Integer itemIndex, String property) {
        static PlaceholderSpec parse(String fullVarSpec) {
            if (!fullVarSpec.contains(".")) {
                return new PlaceholderSpec(null, fullVarSpec, null, null);
            }
            String[] parts = fullVarSpec.split("\\.");
            String first = parts[0].toLowerCase();
            if (KNOWN_SCOPES.contains(first)) {
                return fromParts(first, parts, 1);
            }
            return fromParts(null, parts, 0);
        }

        /** Reads the name at {@code nameIndex} and the optional item index and property after it. */
        private static PlaceholderSpec fromParts(String scope, String[] parts, int nameIndex) {
            String name = parts[nameIndex];
            if (parts.length <= nameIndex + 1) {
                return new PlaceholderSpec(scope, name, null, null);
            }
            String sub = parts[nameIndex + 1];
            if (!sub.toLowerCase().startsWith("item")) {
                return new PlaceholderSpec(scope, name, null, sub);
            }
            String property = parts.length > nameIndex + 2 ? parts[nameIndex + 2] : null;
            return new PlaceholderSpec(scope, name, parseItemIndex(sub), property);
        }

        /** Index of an {@code itemN} part, or {@code null} when N is not a number. */
        private static Integer parseItemIndex(String sub) {
            try {
                return Integer.parseInt(sub.substring(4));
            } catch (NumberFormatException notAnIndex) {
                return null;
            }
        }
    }

    /** Resolves a user variable placeholder with scope enforcement; unknown variables are left as is. */
    private String resolveUserVariable(String fullVarSpec, Matcher matcher, Map<String, Variable> variables,
                                       RenderTarget target, Map<String, Object> context,
                                       StructuredValueWriter structuredWriter, long tickNumber) {
        PlaceholderSpec spec = PlaceholderSpec.parse(fullVarSpec);
        Variable variable = findAccessibleVariable(variables, spec.name(), spec.scope(), target.flowId(), target.groupId());
        if (variable == null) {
            // Unknown or inaccessible variable, leave it as is
            return matcher.group(0);
        }

        Object generatedValue = valueForMessage(variable, variables, target, context, tickNumber);
        Map<String, Object> varConfig = variable.getConfig();
        boolean constantPattern = isConstantPattern(varConfig);
        checkItemReference(variable, varConfig, spec.itemIndex());
        Object targetObj = selectTarget(variable, generatedValue, spec, context);

        if (spec.property() != null) {
            String propResolved = resolveVariableProperty(targetObj, spec.property(), variable);
            return propResolved != null ? propResolved : "";
        }
        if (spec.itemIndex() != null) {
            return targetObj != null ? targetObj.toString() : "";
        }
        if (StructuredValueWriter.isStructured(generatedValue)) {
            return structuredWriter.write(generatedValue, matcher.start());
        }
        return formatValue(generatedValue, constantPattern);
    }

    /** The variable's value for this message: generated (with its dependencies) on first use, then reused. */
    private Object valueForMessage(Variable variable, Map<String, Variable> variables, RenderTarget target,
                                   Map<String, Object> context, long tickNumber) {
        if (variable.getId() != null && context.containsKey(variable.getId())) {
            // Already generated for this message (repeated reference or dependency)
            return context.get(variable.getId());
        }
        return generateInto(variable, variables, target.flowId(), target.groupId(), context, new HashSet<>(), tickNumber);
    }

    /**
     * Generates the variable for a message and stores the value in its context. A LOCAL variable
     * is generated with its dependencies in that context; a GROUP or GLOBAL one takes its value
     * of the tick (see {@link #generateShared}).
     */
    private Object generateInto(Variable variable, Map<String, Variable> variables, String flowId, String groupId,
                                Map<String, Object> context, Set<String> resolutionStack, long tickNumber) {
        Object value;
        if (isShared(variable)) {
            value = dataGenerator.sharedValue(variable, tickNumber, () -> generateShared(variable, variables, tickNumber));
            // Sub-properties and inheriting variables of this message read the generator
            dataGenerator.exposeGenerator(variable, context);
        } else {
            ensureDependenciesAvailable(variable, variables, flowId, groupId, context, resolutionStack, tickNumber);
            value = dataGenerator.generateValue(variable, context);
        }
        storeGenerated(variable, value, context);
        return value;
    }

    /**
     * Generates a new value of a GROUP or GLOBAL variable in a context of its own, with its
     * dependencies resolved from its scope (the GROUP variables of its group and the GLOBAL ones),
     * never from the flow that happens to ask first: the value is the same for every flow.
     */
    private Object generateShared(Variable variable, Map<String, Variable> variables, long tickNumber) {
        Map<String, Object> sharedContext = new java.util.HashMap<>();
        String ownerGroupId = "GROUP".equalsIgnoreCase(variable.getScope()) ? variable.getGroupId() : null;
        ensureDependenciesAvailable(variable, variables, null, ownerGroupId, sharedContext, new HashSet<>(), tickNumber);
        return dataGenerator.generateValue(variable, sharedContext);
    }

    /**
     * @param variable a variable
     * @return true for a GROUP or GLOBAL variable, which gives one value per tick to every flow
     */
    public static boolean isShared(Variable variable) {
        return "GROUP".equalsIgnoreCase(variable.getScope()) || "GLOBAL".equalsIgnoreCase(variable.getScope());
    }

    private static void storeGenerated(Variable variable, Object value, Map<String, Object> context) {
        if (variable.getId() != null) {
            context.put(variable.getId(), value);
        }
        if (variable.getName() != null) {
            context.put(variable.getName(), value);
        }
    }

    private static boolean isConstantPattern(Map<String, Object> varConfig) {
        if (varConfig == null) {
            return false;
        }
        Object pat = varConfig.get("pattern");
        return pat != null && "CONSTANT".equalsIgnoreCase(pat.toString());
    }

    /** Only a FIXED_SUBSET list (or one without a strategy) can be read item by item. */
    private static void checkItemReference(Variable variable, Map<String, Object> varConfig, Integer itemIndex) {
        if (itemIndex == null || !VariableType.LIST.matches(variable.getType())) {
            return;
        }
        Object stratObj = varConfig != null ? varConfig.get("selectionStrategy") : null;
        if (stratObj != null && !"FIXED_SUBSET".equalsIgnoreCase(stratObj.toString())) {
            throw new IllegalStateException("Invalid item reference: Variable '" + variable.getName() + "' uses selection strategy '" + stratObj + "' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).");
        }
    }

    /** The object a sub-property or item index is read from. */
    private static Object selectTarget(Variable variable, Object generatedValue, PlaceholderSpec spec,
                                       Map<String, Object> context) {
        Object targetObj = generatedValue;
        if (spec.property() != null && VariableType.TEMPORAL.matches(variable.getType())) {
            // Read date parts from the generated instant, not from the formatted text
            Instant instant = lastInstantOf(context.get(variable.getId() + CONFIG_SUFFIX));
            if (instant != null) {
                targetObj = instant;
            }
        }
        if (spec.itemIndex() != null && targetObj instanceof List<?> list) {
            targetObj = itemAt(list, spec.itemIndex());
        }
        if (spec.itemIndex() == null && isListCollectionProperty(spec.property())
                && VariableType.LIST.matches(variable.getType())
                && !(targetObj instanceof List<?>)) {
            // Single-item strategies yield one item, not a list: answer as a one-item list
            targetObj = targetObj != null ? List.of(targetObj) : List.of();
        }
        return targetObj;
    }

    private static Object itemAt(List<?> list, int index) {
        return index >= 0 && index < list.size() ? list.get(index) : null;
    }

    /** Whether the property reads the list as a whole ({@code .size}, {@code .first}, {@code .last} and aliases). */
    private static boolean isListCollectionProperty(String propertyPart) {
        if (propertyPart == null) {
            return false;
        }
        switch (propertyPart.toLowerCase(java.util.Locale.ROOT)) {
            case "size", LENGTH, "count", "first", "firstitem", "last", "lastitem":
                return true;
            default:
                return false;
        }
    }

    /** Text of a sub-property of a generated value (package-private for tests). */
    static String resolveVariableProperty(Object targetObj, String propertyPart, Variable variable) {
        if (propertyPart == null) return null;
        String prop = propertyPart.toLowerCase(Locale.ROOT);
        VariableType varType = variable != null ? VariableType.fromName(variable.getType()) : null;

        // Sections in order; one that does not know the property falls through to the next
        String resolved = mapProperty(targetObj, propertyPart, prop);
        if (resolved == null) {
            resolved = temporalProperty(targetObj, prop, varType, variable);
        }
        if (resolved == null) {
            resolved = numericProperty(targetObj, prop, varType);
        }
        if (resolved == null) {
            resolved = stringProperty(targetObj, prop, varType);
        }
        if (resolved == null) {
            resolved = booleanProperty(targetObj, prop, varType);
        }
        if (resolved == null) {
            resolved = listProperty(targetObj, prop);
        }
        if (resolved != null) {
            return resolved;
        }
        return targetObj != null ? targetObj.toString() : "";
    }

    /** Map target object (Point, Graph route node, custom map): its keys, then the node aliases. */
    private static String mapProperty(Object targetObj, String propertyPart, String prop) {
        if (!(targetObj instanceof Map<?, ?> map)) {
            return null;
        }
        if (map.containsKey(propertyPart)) {
            return textOrEmpty(map.get(propertyPart));
        }
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (String.valueOf(entry.getKey()).equalsIgnoreCase(propertyPart)) {
                return textOrEmpty(entry.getValue());
            }
        }
        return switch (prop) {
            case "node", "nodename", "node_name" -> firstNonNullText(map, "nodeName", "node_name", "node");
            case "nodeid", "node_id" -> firstNonNullText(map, "nodeId", "node_id");
            case "targetnode", "targetnodename", "target_node_name" -> firstNonNullText(map, "targetNodeName", "target_node_name");
            case "targetnodeid", "target_node_id" -> firstNonNullText(map, "targetNodeId", "target_node_id");
            default -> null;
        };
    }

    /** Text of the first key with a non-null value, or an empty string. */
    private static String firstNonNullText(Map<?, ?> map, String... keys) {
        for (String key : keys) {
            Object v = map.get(key);
            if (v != null) {
                return String.valueOf(v);
            }
        }
        return "";
    }

    private static String textOrEmpty(Object value) {
        return value != null ? String.valueOf(value) : "";
    }

    /** TEMPORAL variable attributes (date parts, epoch millis, time zone). */
    private static String temporalProperty(Object targetObj, String prop, VariableType varType, Variable variable) {
        if (varType != VariableType.TEMPORAL && !(targetObj instanceof Instant) && !(targetObj instanceof java.util.Date)) {
            return null;
        }
        Instant instant = instantOf(targetObj);
        // Same zone as the formatted value: the variable's Time Zone, or the computer's zone
        ZoneId zone = zoneOf(variable);
        ZonedDateTime zdt = instant.atZone(zone);

        return switch (prop) {
            case "month", "monthtext", "month_text", "monthname", "month_name" ->
                    zdt.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
            case "monthshort", "month_short" -> zdt.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
            case "monthnumber", "monthvalue", "month_number", "month_val" -> String.valueOf(zdt.getMonthValue());
            case "year" -> String.valueOf(zdt.getYear());
            case "day", "dayofmonth", "day_of_month" -> String.valueOf(zdt.getDayOfMonth());
            case "dayofweek", "day_of_week", "dayofweekname" ->
                    zdt.getDayOfWeek().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
            case "dayofweeknumber", "dayofweekvalue" -> String.valueOf(zdt.getDayOfWeek().getValue());
            case "hour", "hours" -> String.valueOf(zdt.getHour());
            case "minute", "minutes" -> String.valueOf(zdt.getMinute());
            case "second", "seconds" -> String.valueOf(zdt.getSecond());
            case "millisecond", "millis", "timestamp", "epochmilli", "epoch_milli" -> String.valueOf(instant.toEpochMilli());
            case "timezone", "time_zone", "tz" -> zone.getId();
            default -> null;
        };
    }

    /** The instant a temporal target stands for; the current time when it cannot be read. */
    private static Instant instantOf(Object targetObj) {
        Instant instant = null;
        if (targetObj instanceof Instant ins) {
            instant = ins;
        } else if (targetObj instanceof Number num) {
            instant = Instant.ofEpochMilli(num.longValue());
        } else if (targetObj instanceof String str) {
            instant = parseInstant(str);
        }
        return instant != null ? instant : Instant.now();
    }

    /** An ISO-8601 instant or epoch millis, or {@code null} when the text is neither. */
    private static Instant parseInstant(String text) {
        try {
            return Instant.parse(text);
        } catch (DateTimeException notIso) {
            return parseEpochMillis(text);
        }
    }

    private static Instant parseEpochMillis(String text) {
        try {
            return Instant.ofEpochMilli(Long.parseLong(text));
        } catch (NumberFormatException notMillis) {
            return null;
        }
    }

    private static ZoneId zoneOf(Variable variable) {
        Object configuredZone = variable != null && variable.getConfig() != null
                ? variable.getConfig().get("timeZone") : null;
        return TemporalVariableConfig.resolveZone(configuredZone != null ? configuredZone.toString() : null);
    }

    /** NUMERIC variable attributes. */
    private static String numericProperty(Object targetObj, String prop, VariableType varType) {
        if (varType != VariableType.NUMERIC && !(targetObj instanceof Number)) {
            return null;
        }
        double val = numericValueOf(targetObj);
        return switch (prop) {
            case "integerpart", "int", "integer", "integer_part" -> String.valueOf((long) val);
            case "fractionalpart", "decimalpart", "fraction", "decimal", "fractional_part" -> fractionalDigits(val);
            case "abs", "absolute" ->
                    val % 1 == 0 ? String.valueOf((long) Math.abs(val)) : String.valueOf(Math.abs(val));
            case "round" -> String.valueOf(Math.round(val));
            case "floor" -> String.valueOf((long) Math.floor(val));
            case "ceil", "ceiling" -> String.valueOf((long) Math.ceil(val));
            case "sign", "signum" -> String.valueOf((int) Math.signum(val));
            default -> null;
        };
    }

    /** A number, or the number its text stands for; 0 when it has none. */
    private static double numericValueOf(Object targetObj) {
        if (targetObj instanceof Number num) {
            return num.doubleValue();
        }
        if (targetObj == null) {
            return 0.0;
        }
        try {
            return Double.parseDouble(targetObj.toString());
        } catch (NumberFormatException notANumber) {
            return 0.0;
        }
    }

    /** Decimal digits of a number without trailing zeros, or {@code "0"} when there are none. */
    private static String fractionalDigits(double val) {
        String s = String.format(Locale.US, "%f", val);
        int idx = s.indexOf('.');
        if (idx == -1) {
            return "0";
        }
        String sub = stripTrailingZeros(s.substring(idx + 1));
        return sub.isEmpty() ? "0" : sub;
    }

    /** STRING variable attributes. */
    private static String stringProperty(Object targetObj, String prop, VariableType varType) {
        if (varType != VariableType.STRING && !(targetObj instanceof String)) {
            return null;
        }
        String str = targetObj != null ? targetObj.toString() : "";
        return switch (prop) {
            case LENGTH, "size" -> String.valueOf(str.length());
            case "upper", "uppercase" -> str.toUpperCase(Locale.ROOT);
            case "lower", "lowercase" -> str.toLowerCase(Locale.ROOT);
            case "trim" -> str.trim();
            case "firstchar", "first_char" -> str.isEmpty() ? "" : String.valueOf(str.charAt(0));
            case "lastchar", "last_char" -> str.isEmpty() ? "" : String.valueOf(str.charAt(str.length() - 1));
            default -> null;
        };
    }

    /** BOOLEAN variable attributes. */
    private static String booleanProperty(Object targetObj, String prop, VariableType varType) {
        if (varType != VariableType.BOOLEAN && !(targetObj instanceof Boolean)) {
            return null;
        }
        boolean bool = targetObj instanceof Boolean b ? b : targetObj != null && Boolean.parseBoolean(targetObj.toString());
        return switch (prop) {
            case "inverse", "negation", "not" -> String.valueOf(!bool);
            case "asnumber", "binary", "int" -> bool ? "1" : "0";
            case "asstring", "text" -> String.valueOf(bool);
            case "asupper", "upper" -> bool ? "TRUE" : "FALSE";
            default -> null;
        };
    }

    /** LIST variable attributes (only a generated list has them). */
    private static String listProperty(Object targetObj, String prop) {
        if (!(targetObj instanceof List<?> list)) {
            return null;
        }
        return switch (prop) {
            case "size", LENGTH, "count" -> String.valueOf(list.size());
            case "first", "firstitem" -> list.isEmpty() ? "" : textOrEmpty(list.get(0));
            case "last", "lastitem" -> list.isEmpty() ? "" : textOrEmpty(list.get(list.size() - 1));
            default -> null;
        };
    }

    /**
     * A variable used by a template.
     *
     * @param name     name (or id) written in the placeholder
     * @param scope    scope written in the placeholder ({@code local}, {@code group} or
     *                 {@code global}), or null when none was written
     * @param variable the variable the flow reaches with it, or null when there is none (the
     *                 placeholder is then sent unchanged)
     */
    public record VariableReference(String name, String scope, Variable variable) {
    }

    /**
     * Lists the variables a template uses, in order of first use and without repetitions, as
     * {@link #evaluate} resolves them: {@code {{scope.name...}}} only in that scope,
     * {@code {{name...}}} in the closest scope (LOCAL, then GROUP, then GLOBAL). Item and property
     * access ({@code .item1}, {@code .round}) count as a use of the variable; the built-ins
     * ({@code uuid}, {@code ts}, {@code n}, {@code flow.name}) are not variables. Nothing is
     * generated.
     *
     * @param template  the flow template
     * @param variables all variables, by id
     * @param flowId    the flow of the template
     * @param groupId   the group of that flow
     * @return the references found
     */
    public List<VariableReference> findReferencedVariables(String template, Map<String, Variable> variables,
                                                           String flowId, String groupId) {
        List<VariableReference> references = new ArrayList<>();
        if (template == null || template.isEmpty()) {
            return references;
        }
        Set<String> seen = new HashSet<>();
        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        while (matcher.find()) {
            VariableReference reference = referenceOf(matcher.group(1).trim(), variables, flowId, groupId);
            if (reference != null && seen.add(referenceKey(reference))) {
                references.add(reference);
            }
        }
        return references;
    }

    /** The reference a placeholder makes, or {@code null} for a built-in or a scope without a name. */
    private VariableReference referenceOf(String spec, Map<String, Variable> variables, String flowId, String groupId) {
        if (spec.isEmpty() || isBuiltIn(spec)) {
            return null;
        }
        String[] parts = spec.split("\\.");
        String scope = null;
        String name = parts[0].trim();
        if (KNOWN_SCOPES.contains(name.toLowerCase(Locale.ROOT))) {
            if (parts.length < 2 || parts[1].isBlank()) {
                return null;
            }
            scope = name.toLowerCase(Locale.ROOT);
            name = parts[1].trim();
        }
        return new VariableReference(name, scope, findAccessibleVariable(variables, name, scope, flowId, groupId));
    }

    private static boolean isBuiltIn(String spec) {
        return switch (spec) {
            case "uuid", "ts", "n", FLOW_NAME_PLACEHOLDER -> true;
            default -> false;
        };
    }

    /** Two placeholders reaching the same variable (or naming the same missing one) are one reference. */
    private static String referenceKey(VariableReference reference) {
        return reference.variable() != null
                ? "id:" + reference.variable().getId()
                : "name:" + reference.scope() + "." + reference.name();
    }

    /**
     * Finds the variable a flow can reach by name or id. When several reachable variables share a
     * name, the closest scope wins (LOCAL, then GROUP, then GLOBAL), so the result never depends on
     * map order.
     *
     * @param variables        all variables, by id
     * @param variableNameOrId name or id to look for
     * @param scopeFilter      "local", "group" or "global" to restrict the scope, or {@code null}
     * @param flowId           flow that references the variable
     * @param groupId          group of that flow
     * @return the matching variable, or {@code null} if none is reachable
     */
    public Variable findAccessibleVariable(
        Map<String, Variable> variables,
        String variableNameOrId,
        String scopeFilter,
        String flowId,
        String groupId
    ) {
        Variable best = null;
        int bestRank = Integer.MAX_VALUE;
        for (Variable v : variables.values()) {
            int rank = accessRank(v, variableNameOrId, scopeFilter, flowId, groupId);
            if (rank == NOT_REACHABLE) {
                continue;
            }
            if (hasId(v, variableNameOrId)) {
                return v; // an id is unique
            }
            if (rank < bestRank) {
                best = v;
                bestRank = rank;
            }
        }
        return best;
    }

    /** Scope rank of a variable matching the name or id (lower is closer), or {@link #NOT_REACHABLE}. */
    private static int accessRank(Variable v, String nameOrId, String scopeFilter, String flowId, String groupId) {
        boolean matchesName = v.getName() != null && v.getName().equals(nameOrId);
        if (!matchesName && !hasId(v, nameOrId)) {
            return NOT_REACHABLE;
        }
        if (scopeFilter != null && !v.getScope().equalsIgnoreCase(scopeFilter)) {
            return NOT_REACHABLE;
        }
        return scopeRank(v, flowId, groupId);
    }

    private static int scopeRank(Variable v, String flowId, String groupId) {
        String vScope = v.getScope().toUpperCase();
        if ("LOCAL".equals(vScope) && flowId != null && flowId.equals(v.getFlowId())) {
            return 0;
        }
        if ("GROUP".equals(vScope) && groupId != null && groupId.equals(v.getGroupId())) {
            return 1;
        }
        if ("GLOBAL".equals(vScope)) {
            return 2;
        }
        return NOT_REACHABLE;
    }

    private static boolean hasId(Variable v, String id) {
        return v.getId() != null && v.getId().equals(id);
    }

    private void ensureDependenciesAvailable(
        Variable variable,
        Map<String, Variable> variables,
        String flowId,
        String groupId,
        Map<String, Object> context,
        Set<String> resolutionStack,
        long tickNumber
    ) {
        if (variable == null || variable.getConfig() == null) {
            return;
        }

        String variableId = variable.getId();
        if (variableId != null && !resolutionStack.add(variableId)) {
            return;
        }

        try {
            for (String depNameOrId : dependenciesOf(variable)) {
                Variable dependencyVariable = missingDependency(variable, depNameOrId, variables, flowId, groupId, context);
                if (dependencyVariable != null) {
                    generateInto(dependencyVariable, variables, flowId, groupId, context, resolutionStack, tickNumber);
                }
            }
        } finally {
            if (variableId != null) {
                resolutionStack.remove(variableId);
            }
        }
    }

    /**
     * Names or ids the variable depends on (conditional rule targets, the inherited list, and the
     * references of formulas and string templates): from its parsed configuration, else from its
     * raw conditional rules.
     *
     * @param variable a variable
     * @return the names or ids it reads; empty when it reads none
     */
    public static Set<String> dependenciesOf(Variable variable) {
        if (variable.getConfig() == null) {
            return new HashSet<>();
        }
        VariableConfiguration varConfig = parseConfiguration(variable);
        Set<String> deps = new HashSet<>();
        if (varConfig != null) {
            deps.addAll(varConfig.getDependencies());
        } else {
            deps.addAll(conditionalRuleTargets(variable.getConfig()));
        }
        return deps;
    }

    private static VariableConfiguration parseConfiguration(Variable variable) {
        try {
            return VariableFactory.createFromMap(variable.getName(), variable.getType(), variable.getConfig());
        } catch (Exception invalidConfig) {
            // An invalid configuration still exposes the targets of its conditional rules
            return null;
        }
    }

    private static List<String> conditionalRuleTargets(Map<String, Object> config) {
        List<String> targets = new ArrayList<>();
        if (config.get("conditionalRules") instanceof List<?> rules) {
            for (Object ruleObj : rules) {
                if (ruleObj instanceof Map<?, ?> map && map.get("targetVariable") instanceof String s && !s.trim().isEmpty()) {
                    targets.add(s.trim());
                }
            }
        }
        return targets;
    }

    /** The variable behind a dependency when it still has to be generated for this message, else {@code null}. */
    private Variable missingDependency(Variable variable, String depNameOrId, Map<String, Variable> variables,
                                       String flowId, String groupId, Map<String, Object> context) {
        if (depNameOrId.equals(variable.getName()) || depNameOrId.equals(variable.getId())) {
            return null;
        }
        if (isInContext(context, depNameOrId)) {
            return null;
        }
        Variable dependencyVariable = findAccessibleVariable(variables, depNameOrId, null, flowId, groupId);
        if (dependencyVariable == null
                || (dependencyVariable.getId() != null && isInContext(context, dependencyVariable.getId()))) {
            return null;
        }
        return dependencyVariable;
    }

    /** Whether the value, or its generator (stored under the {@code _config} suffix), is already in the context. */
    private static boolean isInContext(Map<String, Object> context, String key) {
        return context.containsKey(key) || context.containsKey(key + CONFIG_SUFFIX);
    }

    private static java.time.Instant lastInstantOf(Object generator) {
        if (generator instanceof com.gensynth.core.flow.variables.ConfigurableVariable cv
                && cv.getConfiguration() instanceof com.gensynth.core.flow.variables.config.TemporalVariableConfig temporal) {
            return temporal.getLastInstant();
        }
        return null;
    }

    public void clearVariableCache() {
        this.dataGenerator.clearCache();
    }

    public void removeCachedVariable(String variableId) {
        if (variableId != null) {
            this.dataGenerator.removeCachedVariable(variableId);
        }
    }

    /**
     * Formats a generated value the way it is written into a message: lists and maps as JSON,
     * whole numbers of a Constant numeric variable without decimals ({@code 42}, not {@code 42.0}),
     * and anything else with {@link String#valueOf(Object)}. Shared by flow templates and the
     * String variable's Template mode so both render a value identically.
     *
     * @param value           the generated value (may be {@code null})
     * @param constantPattern whether the value comes from a numeric variable with the Constant pattern
     * @return the text written for the value
     */
    public static String formatValue(Object value, boolean constantPattern) {
        if (StructuredValueWriter.isStructured(value)) {
            return StructuredValueWriter.compactJson(value);
        }
        if (constantPattern && value instanceof Double d && d % 1.0 == 0.0) {
            return String.format(java.util.Locale.ROOT, "%.0f", d);
        }
        if (constantPattern && value instanceof Float f && f % 1.0f == 0.0f) {
            return String.format(java.util.Locale.ROOT, "%.0f", (double) f);
        }
        return String.valueOf(value);
    }

    /**
     * Removes the trailing {@code '0'} characters of a digit string (same result as
     * {@code replaceAll("0+$", "")}, but in linear time).
     */
    static String stripTrailingZeros(String digits) {
        int end = digits.length();
        while (end > 0 && digits.charAt(end - 1) == '0') {
            end--;
        }
        return digits.substring(0, end);
    }
}
