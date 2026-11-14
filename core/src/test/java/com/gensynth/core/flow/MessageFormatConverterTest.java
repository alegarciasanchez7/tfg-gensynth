package com.gensynth.core.flow;

import org.junit.Test;
import static org.junit.Assert.*;

public class MessageFormatConverterTest {

    @Test
    public void testJsonToXml() {
        String json = "{\"id\": \"123\", \"name\": \"sensor1\", \"value\": 45.6}";
        String xml = MessageFormatConverter.convert(json, "JSON", "XML");

        assertNotNull(xml);
        assertTrue(xml.contains("<root>"));
        assertTrue(xml.contains("<id>123</id>"));
        assertTrue(xml.contains("<name>sensor1</name>"));
        assertTrue(xml.contains("<value>45.6</value>"));
        assertTrue(xml.contains("</root>"));
    }

    @Test
    public void testJsonToCsv() {
        String json = "{\"id\": \"123\", \"name\": \"sensor1\", \"value\": 45.6}";
        String csv = MessageFormatConverter.convert(json, "JSON", "CSV");

        assertNotNull(csv);
        assertTrue(csv.contains("id,name,value"));
        assertTrue(csv.contains("123,sensor1,45.6"));
    }

    @Test
    public void testXmlToJson() {
        String xml = "<root><id>123</id><name>sensor1</name><value>45.6</value></root>";
        String json = MessageFormatConverter.convert(xml, "XML", "JSON");

        assertNotNull(json);
        assertTrue(json.contains("123"));
        assertTrue(json.contains("sensor1"));
    }

    @Test
    public void testXmlToCsv() {
        String xml = "<root><id>123</id><name>sensor1</name><value>45.6</value></root>";
        String csv = MessageFormatConverter.convert(xml, "XML", "CSV");

        assertNotNull(csv);
        assertTrue(csv.contains("id,name,value"));
        assertTrue(csv.contains("123,sensor1,45.6"));
    }

    @Test
    public void testCsvToJson() {
        String csv = "id,name,value\n123,sensor1,45.6";
        String json = MessageFormatConverter.convert(csv, "CSV", "JSON");

        assertNotNull(json);
        assertTrue(json.contains("123"));
        assertTrue(json.contains("sensor1"));
    }

    @Test
    public void testCsvToXml() {
        String csv = "id,name,value\n123,sensor1,45.6";
        String xml = MessageFormatConverter.convert(csv, "CSV", "XML");

        assertNotNull(xml);
        assertTrue(xml.contains("<root>"));
        assertTrue(xml.contains("<id>123</id>"));
        assertTrue(xml.contains("<name>sensor1</name>"));
    }

    @Test
    public void xmlRepeatedTagsAndItemsBecomeArraysWithTypedValues() {
        String xml = "<root><tag>1</tag><tag>2.5</tag><item>true</item><name> text </name><empty/>"
            + "<nested><flag>FALSE</flag></nested></root>";

        String json = MessageFormatConverter.convert(xml, "XML", "JSON").replaceAll("\\s", "");

        assertEquals("{\"tag\":[1,2.5],\"item\":[true],\"name\":\"text\",\"empty\":\"\",\"nested\":{\"flag\":false}}", json);
    }

    @Test
    public void csvWithSeveralRowsBecomesAnArrayWithTypedValues() {
        String csv = "id,ok,ratio,label\n1,true,0.5,\"a,b\"\n\n2,false\n";

        String json = MessageFormatConverter.convert(csv, "CSV", "JSON").replaceAll("\\s", "");

        // Blank lines are skipped and missing trailing fields are empty text
        assertEquals("[{\"id\":1,\"ok\":true,\"ratio\":0.5,\"label\":\"a,b\"},"
            + "{\"id\":2,\"ok\":false,\"ratio\":\"\",\"label\":\"\"}]", json);
    }

    @Test
    public void jsonArraysAndScalarsBecomeCsvRows() {
        assertEquals("a,b,value\n1,,\n,\"x,y\",\n,,7",
            MessageFormatConverter.convert("[{\"a\":1,\"b\":null},{\"b\":\"x,y\"},7]", "JSON", "CSV"));
        assertEquals("value\nhello", MessageFormatConverter.convert("\"hello\"", "JSON", "CSV"));
        assertEquals("", MessageFormatConverter.convert("[]", "JSON", "CSV"));
    }

    @Test
    public void testSameFormatReturnsUnchanged() {
        String json = "{\"id\": \"123\"}";
        assertEquals(json, MessageFormatConverter.convert(json, "JSON", "JSON"));
    }
}
