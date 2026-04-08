package com.gensynth.core.flow.serialization;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.flow.DataEvent;
import com.gensynth.core.flow.RingBufferPipeline;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.util.List;
import java.util.Map;
import org.junit.Test;

import static org.junit.Assert.*;

public class PipelineSerializationIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void testFlushSerializedJson() throws Exception {
        RingBufferPipeline pipeline = new RingBufferPipeline(16, 80.0, new JsonEventSerializer());

        assertTrue(pipeline.submit(new DataEvent(1L, "f1", "temp", 23.1, "double")));
        assertTrue(pipeline.submit(new DataEvent(2L, "f1", "active", true, "boolean")));

        byte[] bytes = pipeline.flushSerialized(10);
        List<Map<String, Object>> payload = MAPPER.readValue(bytes, new TypeReference<List<Map<String, Object>>>() {});

        assertEquals(2, payload.size());
        assertEquals("temp", payload.get(0).get("variableId"));
        assertEquals("active", payload.get(1).get("variableId"));
        assertEquals(0L, pipeline.getBufferSize());
    }

    @Test
    public void testFlushSerializedBinary() throws Exception {
        RingBufferPipeline pipeline = new RingBufferPipeline(16, 80.0, new BinaryEventSerializer());

        assertTrue(pipeline.submit(new DataEvent(1L, "f1", "a", 42, "int")));
        assertTrue(pipeline.submit(new DataEvent(2L, "f1", "b", "ok", "string")));

        byte[] bytes = pipeline.flushSerialized(10);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes));

        assertEquals(1, in.readUnsignedByte()); // batch version
        assertEquals(2, in.readInt()); // number of events
        assertEquals(0L, pipeline.getBufferSize());
    }

    @Test
    public void testSwitchSerializerAtRuntime() {
        RingBufferPipeline pipeline = new RingBufferPipeline();
        assertEquals("application/json", pipeline.getSerializerContentType());

        pipeline.setSerializer(new BinaryEventSerializer());
        assertEquals("application/x-gensynth-binary", pipeline.getSerializerContentType());
    }
}
