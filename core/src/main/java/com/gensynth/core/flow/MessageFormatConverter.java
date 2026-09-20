package com.gensynth.core.flow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.StringReader;
import java.util.*;

/**
 * Utility service for converting content payloads between standard formats: JSON, XML, and CSV.
 */
public class MessageFormatConverter {

    private static final Logger logger = LoggerFactory.getLogger(MessageFormatConverter.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private MessageFormatConverter() {
        // Utility class
    }

    /**
     * Converts a given text payload from a source format to a target format.
     *
     * @param content      Raw message text payload
     * @param sourceFormat Source format identifier ("JSON", "XML", "CSV")
     * @param targetFormat Target format identifier ("JSON", "XML", "CSV")
     * @return Converted string content in target format
     */
    public static String convert(String content, String sourceFormat, String targetFormat) {
        if (content == null || content.trim().isEmpty()) {
            return content != null ? content : "";
        }

        String src = sourceFormat != null ? sourceFormat.trim().toUpperCase() : "JSON";
        String tgt = targetFormat != null ? targetFormat.trim().toUpperCase() : "JSON";

        if (src.equals(tgt)) {
            return content;
        }

        try {
            // First normalize input into a generic JsonNode structural representation
            JsonNode rootNode = parseToTree(content, src);

            // Then format the tree representation into target format
            return formatTree(rootNode, tgt);
        } catch (Exception e) {
            logger.warn("Failed to convert message content from {} to {}: {}", src, tgt, e.getMessage());
            return content;
        }
    }

    /**
     * Parses content of specified format into a Jackson JsonNode tree structure.
     */
    private static JsonNode parseToTree(String content, String format) throws Exception {
        String trimmed = content.trim();
        switch (format) {
            case "JSON":
                return mapper.readTree(trimmed);
            case "XML":
                return parseXmlToTree(trimmed);
            case "CSV":
                return parseCsvToTree(trimmed);
            default:
                // Fallback attempt: try reading as JSON, else create raw string wrapper object
                try {
                    return mapper.readTree(trimmed);
                } catch (Exception ignored) {
                    ObjectNode fallback = mapper.createObjectNode();
                    fallback.put("message", trimmed);
                    return fallback;
                }
        }
    }

    /**
     * Formats a JsonNode tree into the target text format.
     */
    private static String formatTree(JsonNode node, String format) throws Exception {
        switch (format) {
            case "JSON":
                return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
            case "XML":
                return treeToXml(node);
            case "CSV":
                return treeToCsv(node);
            default:
                return mapper.writeValueAsString(node);
        }
    }

    // ==========================================
    // XML Parsing & Formatting Helpers
    // ==========================================

    private static JsonNode parseXmlToTree(String xmlContent) throws Exception {
        javax.xml.parsers.DocumentBuilderFactory factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(false);
        // Security protections against XXE
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        
        javax.xml.parsers.DocumentBuilder builder = factory.newDocumentBuilder();
        org.w3c.dom.Document doc = builder.parse(new org.xml.sax.InputSource(new StringReader(xmlContent)));
        org.w3c.dom.Element root = doc.getDocumentElement();

        return elementToJsonNode(root);
    }

    private static JsonNode elementToJsonNode(org.w3c.dom.Element element) {
        org.w3c.dom.NodeList children = element.getChildNodes();
        List<org.w3c.dom.Element> childElements = new ArrayList<>();
        
        for (int i = 0; i < children.getLength(); i++) {
            org.w3c.dom.Node node = children.item(i);
            if (node.getNodeType() == org.w3c.dom.Node.ELEMENT_NODE) {
                childElements.add((org.w3c.dom.Element) node);
            }
        }

        if (childElements.isEmpty()) {
            String text = element.getTextContent();
            if (text == null) return mapper.getNodeFactory().textNode("");
            text = text.trim();
            if (text.equalsIgnoreCase("true") || text.equalsIgnoreCase("false")) {
                return mapper.getNodeFactory().booleanNode(Boolean.parseBoolean(text));
            }
            try {
                if (text.contains(".")) {
                    return mapper.getNodeFactory().numberNode(Double.parseDouble(text));
                } else {
                    return mapper.getNodeFactory().numberNode(Long.parseLong(text));
                }
            } catch (NumberFormatException ignored) {
                return mapper.getNodeFactory().textNode(text);
            }
        }

        // Group children by tag name to check if we have arrays
        Map<String, List<org.w3c.dom.Element>> grouped = new LinkedHashMap<>();
        for (org.w3c.dom.Element child : childElements) {
            grouped.computeIfAbsent(child.getTagName(), k -> new ArrayList<>()).add(child);
        }

        ObjectNode objNode = mapper.createObjectNode();

        for (Map.Entry<String, List<org.w3c.dom.Element>> entry : grouped.entrySet()) {
            String tag = entry.getKey();
            List<org.w3c.dom.Element> list = entry.getValue();

            if (list.size() == 1 && !tag.equalsIgnoreCase("item")) {
                objNode.set(tag, elementToJsonNode(list.get(0)));
            } else {
                ArrayNode arrNode = mapper.createArrayNode();
                for (org.w3c.dom.Element itemEl : list) {
                    arrNode.add(elementToJsonNode(itemEl));
                }
                objNode.set(tag, arrNode);
            }
        }

        return objNode;
    }

    private static String treeToXml(JsonNode node) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<root>\n");

        if (node.isObject()) {
            objectToXml((ObjectNode) node, sb, "  ");
        } else if (node.isArray()) {
            for (JsonNode item : node) {
                sb.append("  <item>\n");
                if (item.isObject()) {
                    objectToXml((ObjectNode) item, sb, "    ");
                } else {
                    sb.append("    ").append(escapeXml(item.asText())).append("\n");
                }
                sb.append("  </item>\n");
            }
        } else {
            sb.append("  <value>").append(escapeXml(node.asText())).append("</value>\n");
        }

        sb.append("</root>");
        return sb.toString();
    }

    private static void objectToXml(ObjectNode obj, StringBuilder sb, String indent) {
        Iterator<Map.Entry<String, JsonNode>> fields = obj.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String key = sanitizeXmlTagName(field.getKey());
            JsonNode val = field.getValue();

            if (val.isObject()) {
                sb.append(indent).append("<").append(key).append(">\n");
                objectToXml((ObjectNode) val, sb, indent + "  ");
                sb.append(indent).append("</").append(key).append(">\n");
            } else if (val.isArray()) {
                sb.append(indent).append("<").append(key).append(">\n");
                for (JsonNode elem : val) {
                    if (elem.isObject()) {
                        sb.append(indent).append("  <item>\n");
                        objectToXml((ObjectNode) elem, sb, indent + "    ");
                        sb.append(indent).append("  </item>\n");
                    } else {
                        sb.append(indent).append("  <item>").append(escapeXml(elem.asText())).append("</item>\n");
                    }
                }
                sb.append(indent).append("</").append(key).append(">\n");
            } else {
                sb.append(indent).append("<").append(key).append(">")
                  .append(escapeXml(val.asText()))
                  .append("</").append(key).append(">\n");
            }
        }
    }

    private static String sanitizeXmlTagName(String key) {
        if (key == null || key.isEmpty()) return "item";
        String clean = key.replaceAll("[^a-zA-Z0-9_.-]", "_");
        if (Character.isDigit(clean.charAt(0))) {
            clean = "_" + clean;
        }
        return clean;
    }

    private static String escapeXml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&apos;");
    }

    // ==========================================
    // CSV Parsing & Formatting Helpers
    // ==========================================

    private static JsonNode parseCsvToTree(String csvContent) throws Exception {
        BufferedReader reader = new BufferedReader(new StringReader(csvContent));
        String headerLine = reader.readLine();
        if (headerLine == null || headerLine.trim().isEmpty()) {
            return mapper.createArrayNode();
        }

        List<String> headers = parseCsvLine(headerLine);
        List<ObjectNode> rows = new ArrayList<>();

        String line;
        while ((line = reader.readLine()) != null) {
            if (line.trim().isEmpty()) continue;
            List<String> values = parseCsvLine(line);
            ObjectNode row = mapper.createObjectNode();

            for (int i = 0; i < headers.size(); i++) {
                String header = headers.get(i).trim();
                String val = (i < values.size()) ? values.get(i).trim() : "";

                if (val.equalsIgnoreCase("true") || val.equalsIgnoreCase("false")) {
                    row.put(header, Boolean.parseBoolean(val));
                } else {
                    try {
                        if (val.contains(".")) {
                            row.put(header, Double.parseDouble(val));
                        } else {
                            row.put(header, Long.parseLong(val));
                        }
                    } catch (NumberFormatException ignored) {
                        row.put(header, val);
                    }
                }
            }
            rows.add(row);
        }

        if (rows.size() == 1) {
            return rows.get(0);
        }

        ArrayNode array = mapper.createArrayNode();
        for (ObjectNode row : rows) {
            array.add(row);
        }
        return array;
    }

    private static List<String> parseCsvLine(String line) {
        List<String> result = new ArrayList<>();
        boolean inQuotes = false;
        StringBuilder sb = new StringBuilder();

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                result.add(sb.toString());
                sb.setLength(0);
            } else {
                sb.append(c);
            }
        }
        result.add(sb.toString());
        return result;
    }

    private static String treeToCsv(JsonNode node) {
        List<ObjectNode> rows = new ArrayList<>();

        if (node.isObject()) {
            rows.add((ObjectNode) node);
        } else if (node.isArray()) {
            for (JsonNode item : node) {
                if (item.isObject()) {
                    rows.add((ObjectNode) item);
                } else {
                    ObjectNode n = mapper.createObjectNode();
                    n.put("value", item.asText());
                    rows.add(n);
                }
            }
        } else {
            ObjectNode n = mapper.createObjectNode();
            n.put("value", node.asText());
            rows.add(n);
        }

        if (rows.isEmpty()) {
            return "";
        }

        // Collect all distinct headers across rows while keeping ordering
        Set<String> headers = new LinkedHashSet<>();
        for (ObjectNode row : rows) {
            Iterator<String> fieldNames = row.fieldNames();
            while (fieldNames.hasNext()) {
                headers.add(fieldNames.next());
            }
        }

        StringBuilder sb = new StringBuilder();
        // Print header line
        int hCount = 0;
        for (String header : headers) {
            if (hCount > 0) sb.append(",");
            sb.append(escapeCsvField(header));
            hCount++;
        }
        sb.append("\n");

        // Print data rows
        for (ObjectNode row : rows) {
            int rCount = 0;
            for (String header : headers) {
                if (rCount > 0) sb.append(",");
                JsonNode valNode = row.get(header);
                String valStr = (valNode != null && !valNode.isNull()) ? valNode.asText() : "";
                sb.append(escapeCsvField(valStr));
                rCount++;
            }
            sb.append("\n");
        }

        return sb.toString().trim();
    }

    private static String escapeCsvField(String field) {
        if (field == null) return "";
        if (field.contains(",") || field.contains("\"") || field.contains("\n")) {
            return "\"" + field.replace("\"", "\"\"") + "\"";
        }
        return field;
    }
}
