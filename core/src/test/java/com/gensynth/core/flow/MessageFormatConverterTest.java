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
    public void testSameFormatReturnsUnchanged() {
        String json = "{\"id\": \"123\"}";
        assertEquals(json, MessageFormatConverter.convert(json, "JSON", "JSON"));
    }
}
