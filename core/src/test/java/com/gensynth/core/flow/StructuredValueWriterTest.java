package com.gensynth.core.flow;

import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;

public class StructuredValueWriterTest {

    private static final Map<String, Object> POINT = point();

    private static Map<String, Object> point() {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("x", 12.5);
        p.put("y", 40.0);
        p.put("z", 3.0);
        return p;
    }

    /** Writes the value at the single placeholder {{v}} of the template, as the engine does. */
    private static String render(String template, String format, Object value) {
        int at = template.indexOf("{{v}}");
        String text = StructuredValueWriter.forTemplate(template, format).write(value, at);
        return template.substring(0, at) + text + template.substring(at + "{{v}}".length());
    }

    @Test
    public void multiLineJsonGetsEachEntryOnItsOwnIndentedLine() {
        String template = "{\n  \"posicion\": {{v}},\n  \"list\": 1\n}";

        assertEquals(
            "{\n  \"posicion\": {\n    \"x\": 12.5,\n    \"y\": 40.0,\n    \"z\": 3.0\n  },\n  \"list\": 1\n}",
            render(template, "json", POINT));
    }

    @Test
    public void multiLineJsonListsFollowTheTemplateIndentation() {
        String template = "{\n    \"tags\": {{v}}\n}";

        assertEquals("{\n    \"tags\": [\n        \"a\",\n        2\n    ]\n}", render(template, "json", List.of("a", 2)));
    }

    @Test
    public void oneLineJsonAndValuesInsideQuotesStayOnOneLine() {
        assertEquals("{\"p\": {\"x\": 12.5, \"y\": 40.0, \"z\": 3.0}}", render("{\"p\": {{v}}}", "json", POINT));
        assertEquals("{\n  \"p\": \"{\"x\": 12.5, \"y\": 40.0, \"z\": 3.0}\"\n}",
            render("{\n  \"p\": \"{{v}}\"\n}", "json", POINT));
    }

    @Test
    public void xmlGetsChildElements() {
        String template = "<event>\n  <posicion>{{v}}</posicion>\n</event>";

        assertEquals(
            "<event>\n  <posicion>\n    <x>12.5</x>\n    <y>40.0</y>\n    <z>3.0</z>\n  </posicion>\n</event>",
            render(template, "xml", POINT));
        assertEquals("<list><item>a &amp; b</item><item>2</item></list>", render("<list>{{v}}</list>", "xml", List.of("a & b", 2)));
    }

    @Test
    public void xmlIsDetectedFromTheTemplateWhateverTheLabel() {
        assertEquals("<p><x>12.5</x><y>40.0</y><z>3.0</z></p>", render("<p>{{v}}</p>", "plain", POINT));
    }

    @Test
    public void csvKeepsTheValueInOneQuotedCell() {
        assertEquals("id,pos\n7,\"{\"\"x\"\": 12.5, \"\"y\"\": 40.0, \"\"z\"\": 3.0}\"", render("id,pos\n7,{{v}}", "csv", POINT));
        assertEquals("7,\"[\"\"a\"\", 2]\"", render("7,\"{{v}}\"", "csv", List.of("a", 2)));
    }

    @Test
    public void plainTextGetsCompactJson() {
        assertEquals("At {\"x\": 12.5, \"y\": 40.0, \"z\": 3.0} now", render("At {{v}} now", "plain", POINT));
    }

    @Test
    public void escapesJsonStrings() {
        assertEquals("[\"say \\\"hi\\\"\", \"a\\\\b\", \"line\\nbreak\"]",
            StructuredValueWriter.compactJson(List.of("say \"hi\"", "a\\b", "line\nbreak")));
    }
}
