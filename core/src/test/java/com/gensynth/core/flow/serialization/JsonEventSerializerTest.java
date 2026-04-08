package com.gensynth.core.flow.serialization;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.flow.DataEvent;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.Test;

import static org.junit.Assert.*;

public class JsonEventSerializerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void testSerializeSingleEventWithPrimitiveValue() throws Exception {
        JsonEventSerializer serializer = new JsonEventSerializer();
        DataEvent event = new DataEvent(1000L, "flow-1", "temperature", 23.5, "double");

        byte[] bytes = serializer.serialize(event);
        Map<String, Object> payload = MAPPER.readValue(bytes, new TypeReference<Map<String, Object>>() {});

        assertEquals(1000, ((Number) payload.get("timestamp")).longValue());
        assertEquals("flow-1", payload.get("deviceId"));
        assertEquals("temperature", payload.get("variableId"));
        assertEquals("double", payload.get("dataType"));
        assertEquals(23.5, ((Number) payload.get("value")).doubleValue(), 0.000001);
    }

    @Test
    public void testSerializeDateAsEpochMillis() throws Exception {
        JsonEventSerializer serializer = new JsonEventSerializer();
        Instant instant = Instant.ofEpochMilli(1710000000000L);
        DataEvent event = new DataEvent(2000L, "flow-2", "timestamp", instant, "date");

        byte[] bytes = serializer.serialize(event);
        Map<String, Object> payload = MAPPER.readValue(bytes, new TypeReference<Map<String, Object>>() {});

        assertEquals(1710000000000L, ((Number) payload.get("value")).longValue());
    }

    @Test
    public void testSerializePointAsXYZObject() throws Exception {
        JsonEventSerializer serializer = new JsonEventSerializer();
        PointVariableConfig.Point3D point = new PointVariableConfig.Point3D(1.5, 2.5, 3.5);
        DataEvent event = new DataEvent(3000L, "flow-3", "position", point, "point");

        byte[] bytes = serializer.serialize(event);
        Map<String, Object> payload = MAPPER.readValue(bytes, new TypeReference<Map<String, Object>>() {});
        @SuppressWarnings("unchecked")
        Map<String, Object> value = (Map<String, Object>) payload.get("value");

        assertNotNull(value);
        assertEquals(1.5, ((Number) value.get("x")).doubleValue(), 0.000001);
        assertEquals(2.5, ((Number) value.get("y")).doubleValue(), 0.000001);
        assertEquals(3.5, ((Number) value.get("z")).doubleValue(), 0.000001);
    }

    @Test
    public void testSerializeBatch() throws Exception {
        JsonEventSerializer serializer = new JsonEventSerializer();
        List<DataEvent> events = List.of(
            new DataEvent(1L, "f1", "a", true, "boolean"),
            new DataEvent(2L, "f1", "b", "ok", "string")
        );

        byte[] bytes = serializer.serializeBatch(events);
        List<Map<String, Object>> payload = MAPPER.readValue(bytes, new TypeReference<List<Map<String, Object>>>() {});

        assertEquals(2, payload.size());
        assertEquals("a", payload.get(0).get("variableId"));
        assertEquals("b", payload.get(1).get("variableId"));
    }
}
