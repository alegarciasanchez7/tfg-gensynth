package com.gensynth.core.flow.serialization;

import com.gensynth.core.flow.DataEvent;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.Test;

import static org.junit.Assert.*;

public class BinaryEventSerializerTest {

    @Test
    public void testSerializeSingleEventHeaderAndFields() throws Exception {
        BinaryEventSerializer serializer = new BinaryEventSerializer();
        DataEvent event = new DataEvent(1234L, "flow-1", "name", "sensor-A", "string");

        byte[] bytes = serializer.serialize(event);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes));

        assertEquals(1, in.readUnsignedByte()); // version
        assertEquals(1234L, in.readLong());
        assertEquals("flow-1", readString(in));
        assertEquals("name", readString(in));
        assertEquals("string", readString(in));
        assertEquals(1, in.readUnsignedByte()); // TYPE_STRING
        assertEquals("sensor-A", readString(in));
    }

    @Test
    public void testSerializeInstantAndPoint() throws Exception {
        BinaryEventSerializer serializer = new BinaryEventSerializer();

        DataEvent instantEvent = new DataEvent(
            2000L,
            "flow-2",
            "ts",
            Instant.ofEpochMilli(1710000000000L),
            "date"
        );
        byte[] instantBytes = serializer.serialize(instantEvent);
        DataInputStream inInstant = new DataInputStream(new ByteArrayInputStream(instantBytes));

        inInstant.readUnsignedByte();
        inInstant.readLong();
        readString(inInstant);
        readString(inInstant);
        readString(inInstant);
        assertEquals(7, inInstant.readUnsignedByte()); // TYPE_INSTANT
        assertEquals(1710000000000L, inInstant.readLong());

        DataEvent pointEvent = new DataEvent(
            3000L,
            "flow-3",
            "position",
            new PointVariableConfig.Point3D(1.0, 2.0, 3.0),
            "point"
        );
        byte[] pointBytes = serializer.serialize(pointEvent);
        DataInputStream inPoint = new DataInputStream(new ByteArrayInputStream(pointBytes));

        inPoint.readUnsignedByte();
        inPoint.readLong();
        readString(inPoint);
        readString(inPoint);
        readString(inPoint);
        assertEquals(8, inPoint.readUnsignedByte()); // TYPE_POINT3D
        assertEquals(1.0, inPoint.readDouble(), 0.000001);
        assertEquals(2.0, inPoint.readDouble(), 0.000001);
        assertEquals(3.0, inPoint.readDouble(), 0.000001);
    }

    @Test
    public void testSerializeBatchWithCountAndItems() throws Exception {
        BinaryEventSerializer serializer = new BinaryEventSerializer();

        List<DataEvent> events = List.of(
            new DataEvent(1L, "f1", "a", 10, "int"),
            new DataEvent(2L, "f1", "b", false, "boolean")
        );

        byte[] bytes = serializer.serializeBatch(events);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes));

        assertEquals(1, in.readUnsignedByte()); // batch version
        assertEquals(2, in.readInt()); // item count

        // Event 1
        assertEquals(1L, in.readLong());
        assertEquals("f1", readString(in));
        assertEquals("a", readString(in));
        assertEquals("int", readString(in));
        assertEquals(2, in.readUnsignedByte()); // TYPE_INT
        assertEquals(10, in.readInt());

        // Event 2
        assertEquals(2L, in.readLong());
        assertEquals("f1", readString(in));
        assertEquals("b", readString(in));
        assertEquals("boolean", readString(in));
        assertEquals(6, in.readUnsignedByte()); // TYPE_BOOLEAN
        assertFalse(in.readBoolean());
    }

    private String readString(DataInputStream in) throws Exception {
        int length = in.readInt();
        byte[] bytes = new byte[length];
        in.readFully(bytes);
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
