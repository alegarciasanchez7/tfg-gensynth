package com.gensynth.core.flow;

import java.util.List;
import java.util.Map;

/**
 * Writes structured values (points as maps, lists) into a message in the format of its template:
 *
 * <ul>
 *   <li><b>JSON</b>: on several lines, indented like the template, when the template is laid out on
 *       several lines; on one line otherwise, or when the placeholder is inside a string.</li>
 *   <li><b>XML</b>: as child elements ({@code <x>1.0</x>}, lists as {@code <item>} elements), on
 *       several lines when the template is; compact JSON inside an attribute value.</li>
 *   <li><b>CSV</b>: compact JSON in one quoted cell, so its commas do not split the row.</li>
 *   <li>Any other text: compact JSON.</li>
 * </ul>
 */
public final class StructuredValueWriter {

    private enum Kind { JSON, XML, CSV, TEXT }

    private static final String DEFAULT_INDENT = "  ";

    private final String template;
    private final Kind kind;
    private final boolean multiLine;
    private final String indentUnit;

    private StructuredValueWriter(String template, Kind kind) {
        this.template = template;
        this.kind = kind;
        this.multiLine = template.indexOf('\n') >= 0;
        this.indentUnit = indentUnitOf(template);
    }

    /**
     * @param template the flow template
     * @param format   the flow's format label ({@code json}, {@code xml}, {@code csv}, {@code plain});
     *                 may be {@code null}. A template that starts as JSON or XML is written as such
     *                 whatever the label says.
     * @return a writer for the placeholders of that template
     */
    public static StructuredValueWriter forTemplate(String template, String format) {
        String text = template == null ? "" : template;
        String start = text.stripLeading();
        Kind kind;
        if (start.startsWith("{") || start.startsWith("[")) {
            kind = Kind.JSON;
        } else if (start.startsWith("<")) {
            kind = Kind.XML;
        } else if ("csv".equalsIgnoreCase(format)) {
            kind = Kind.CSV;
        } else {
            kind = Kind.TEXT;
        }
        return new StructuredValueWriter(text, kind);
    }

    /**
     * @param value a generated value
     * @return whether the value is a point or a list, written by {@link #write}
     */
    public static boolean isStructured(Object value) {
        return value instanceof Map<?, ?> || value instanceof List<?>;
    }

    /**
     * @param value            a map or a list
     * @param placeholderStart index of the placeholder in the template
     * @return the text that replaces the placeholder
     */
    public String write(Object value, int placeholderStart) {
        char before = placeholderStart > 0 ? template.charAt(placeholderStart - 1) : '\0';
        boolean inQuotes = before == '"' || before == '\'';
        String indent = lineIndentAt(placeholderStart);
        switch (kind) {
            case JSON:
                if (inQuotes || !multiLine) {
                    return compactJson(value);
                }
                StringBuilder json = new StringBuilder();
                writePrettyJson(json, value, indent);
                return json.toString();
            case XML:
                if (inQuotes) {
                    return compactJson(value);
                }
                StringBuilder xml = new StringBuilder();
                writeXmlChildren(xml, value, indent + indentUnit);
                if (multiLine) {
                    xml.append('\n').append(indent);
                }
                return xml.toString();
            case CSV:
                String cell = compactJson(value).replace("\"", "\"\"");
                return inQuotes ? cell : "\"" + cell + "\"";
            default:
                return compactJson(value);
        }
    }

    /**
     * @param value a map, a list or a single value
     * @return the value as JSON on one line, e.g. {@code {"x": 1.0, "y": 2.0}}
     */
    public static String compactJson(Object value) {
        StringBuilder sb = new StringBuilder();
        writeCompactJson(sb, value);
        return sb.toString();
    }

    private static void writeCompactJson(StringBuilder sb, Object value) {
        if (value instanceof Map<?, ?> map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) sb.append(", ");
                first = false;
                sb.append(jsonString(String.valueOf(entry.getKey()))).append(": ");
                writeCompactJson(sb, entry.getValue());
            }
            sb.append('}');
        } else if (value instanceof List<?> list) {
            sb.append('[');
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(", ");
                writeCompactJson(sb, list.get(i));
            }
            sb.append(']');
        } else {
            sb.append(jsonScalar(value));
        }
    }

    /** Writes the value with each entry on its own line; the first line continues the template line. */
    private void writePrettyJson(StringBuilder sb, Object value, String indent) {
        String inner = indent + indentUnit;
        if (value instanceof Map<?, ?> map && !map.isEmpty()) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                sb.append(first ? "\n" : ",\n").append(inner);
                first = false;
                sb.append(jsonString(String.valueOf(entry.getKey()))).append(": ");
                writePrettyJson(sb, entry.getValue(), inner);
            }
            sb.append('\n').append(indent).append('}');
        } else if (value instanceof List<?> list && !list.isEmpty()) {
            sb.append('[');
            for (int i = 0; i < list.size(); i++) {
                sb.append(i == 0 ? "\n" : ",\n").append(inner);
                writePrettyJson(sb, list.get(i), inner);
            }
            sb.append('\n').append(indent).append(']');
        } else {
            writeCompactJson(sb, value);
        }
    }

    /** Writes one element per map entry or list item, each on its own line when the template is multi-line. */
    private void writeXmlChildren(StringBuilder sb, Object value, String indent) {
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                writeXmlElement(sb, String.valueOf(entry.getKey()), entry.getValue(), indent);
            }
        } else if (value instanceof List<?> list) {
            for (Object item : list) {
                writeXmlElement(sb, "item", item, indent);
            }
        }
    }

    private void writeXmlElement(StringBuilder sb, String name, Object value, String indent) {
        if (multiLine) {
            sb.append('\n').append(indent);
        }
        sb.append('<').append(name).append('>');
        if (isStructured(value)) {
            writeXmlChildren(sb, value, indent + indentUnit);
            if (multiLine) {
                sb.append('\n').append(indent);
            }
        } else if (value != null) {
            sb.append(xmlText(String.valueOf(value)));
        }
        sb.append("</").append(name).append('>');
    }

    /** Leading spaces and tabs of the template line that contains the index. */
    private String lineIndentAt(int index) {
        int lineStart = template.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
        int end = lineStart;
        while (end < template.length() && (template.charAt(end) == ' ' || template.charAt(end) == '\t')) {
            end++;
        }
        return template.substring(lineStart, end);
    }

    /** The template's smallest indentation step, so nested lines follow its style (2 spaces by default). */
    private static String indentUnitOf(String template) {
        String unit = null;
        for (String line : template.split("\n")) {
            int n = 0;
            while (n < line.length() && (line.charAt(n) == ' ' || line.charAt(n) == '\t')) {
                n++;
            }
            if (n > 0 && n < line.length() && (unit == null || n < unit.length())) {
                unit = line.substring(0, n);
            }
        }
        return unit != null ? unit : DEFAULT_INDENT;
    }

    private static String jsonScalar(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        return jsonString(value.toString());
    }

    private static String jsonString(String text) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }

    private static String xmlText(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
