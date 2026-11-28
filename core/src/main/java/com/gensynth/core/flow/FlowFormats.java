package com.gensynth.core.flow;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Message format of a flow ({@code json}, {@code xml}, {@code csv} or {@code plain}) as it is
 * written: the format stored with the flow, unless its template is a complete JSON document or
 * XML. The editor shows the same format ({@code resolveTemplateFormat} in the UI).
 */
public final class FlowFormats {

    /** JSON format. */
    public static final String JSON = "json";
    /** XML format. */
    public static final String XML = "xml";
    /** Plain text format. */
    public static final String PLAIN = "plain";

    /** A {@code {{...}}} placeholder, replaced by a value that is valid JSON anywhere. */
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{[^{}]*}}");

    private static final ObjectMapper STRICT_JSON = new ObjectMapper()
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private FlowFormats() {
    }

    /**
     * Format a flow's messages are written in. Text still being written keeps the stored format,
     * and flows stored as {@code plain} with a JSON template (new File Output flows up to 0.6.0)
     * are JSON.
     *
     * @param stored   format stored with the flow, or null
     * @param template the flow's template, or null
     * @return {@code json}, {@code xml}, {@code csv} or {@code plain}
     */
    public static String effectiveFormat(String stored, String template) {
        String text = template == null ? "" : PLACEHOLDER.matcher(template).replaceAll("0").strip();
        if (isJsonDocument(text)) {
            return JSON;
        }
        if (text.startsWith("<")) {
            return XML;
        }
        if (stored != null && !stored.isBlank()) {
            return stored.strip().toLowerCase(Locale.ROOT);
        }
        return text.isEmpty() ? JSON : PLAIN;
    }

    /**
     * Format of the File Output file of a flow: its message format, with plain text written as
     * {@code txt} (one message per line).
     *
     * @param stored   format stored with the flow, or null
     * @param template the flow's template, or null
     * @return {@code json}, {@code xml}, {@code csv} or {@code txt}
     */
    public static String fileFormat(String stored, String template) {
        String format = effectiveFormat(stored, template);
        return PLAIN.equals(format) ? "txt" : format;
    }

    private static boolean isJsonDocument(String text) {
        if (!text.startsWith("{") && !text.startsWith("[")) {
            return false;
        }
        try {
            JsonNode node = STRICT_JSON.readTree(text);
            return node != null && (node.isObject() || node.isArray());
        } catch (JsonProcessingException notJson) {
            return false;
        }
    }
}
