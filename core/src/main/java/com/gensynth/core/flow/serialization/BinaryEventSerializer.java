package com.gensynth.core.flow.serialization;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.flow.DataEvent;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Compact binary serializer for DataEvent payloads.
 *
 * Event format (single event):
 * - version (1 byte)
 * - timestamp (8 bytes)
 * - deviceId (length + UTF-8 bytes)
 * - variableId (length + UTF-8 bytes)
 * - dataType (length + UTF-8 bytes)
 * - valueType (1 byte)
 * - value payload (typed)
 */
public class BinaryEventSerializer implements EventSerializer {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final byte VERSION = 1;

    private static final byte TYPE_STRING = 1;
    private static final byte TYPE_INT = 2;
    private static final byte TYPE_LONG = 3;
    private static final byte TYPE_DOUBLE = 4;
    private static final byte TYPE_FLOAT = 5;
    private static final byte TYPE_BOOLEAN = 6;
    private static final byte TYPE_INSTANT = 7;
    private static final byte TYPE_POINT3D = 8;
    private static final byte TYPE_JSON = 9;

    @Override
    public byte[] serialize(DataEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("event cannot be null");
        }

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream(128);
            DataOutputStream out = new DataOutputStream(baos);
            writeEvent(out, event, true);
            out.flush();

            return baos.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to serialize DataEvent to binary", e);
        }
    }

    @Override
    public byte[] serializeBatch(List<DataEvent> events) {
        if (events == null) {
            throw new IllegalArgumentException("events cannot be null");
        }

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream(Math.max(128, events.size() * 64));
            DataOutputStream out = new DataOutputStream(baos);

            out.writeByte(VERSION);
            out.writeInt(events.size());
            for (DataEvent event : events) {
                if (event == null) {
                    throw new IllegalArgumentException("events cannot contain null values");
                }
                writeEvent(out, event, false);
            }
            out.flush();

            return baos.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to serialize DataEvent batch to binary", e);
        }
    }

    @Override
    public String contentType() {
        return "application/x-gensynth-binary";
    }

    private void writeEvent(DataOutputStream out, DataEvent event, boolean includeVersion)
        throws IOException {
        if (includeVersion) {
            out.writeByte(VERSION);
        }

        out.writeLong(event.getTimestamp());
        writeString(out, event.getDeviceId());
        writeString(out, event.getVariableId());
        writeString(out, event.getDataType());
        writeValue(out, event.getValue());
    }

    private void writeString(DataOutputStream out, String value) throws IOException {
        String safeValue = value == null ? "" : value;
        byte[] bytes = safeValue.getBytes(StandardCharsets.UTF_8);
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private void writeValue(DataOutputStream out, Object value) throws IOException {
        if (value instanceof String v) {
            out.writeByte(TYPE_STRING);
            writeString(out, v);
            return;
        }
        if (value instanceof Integer v) {
            out.writeByte(TYPE_INT);
            out.writeInt(v);
            return;
        }
        if (value instanceof Long v) {
            out.writeByte(TYPE_LONG);
            out.writeLong(v);
            return;
        }
        if (value instanceof Double v) {
            out.writeByte(TYPE_DOUBLE);
            out.writeDouble(v);
            return;
        }
        if (value instanceof Float v) {
            out.writeByte(TYPE_FLOAT);
            out.writeFloat(v);
            return;
        }
        if (value instanceof Boolean v) {
            out.writeByte(TYPE_BOOLEAN);
            out.writeBoolean(v);
            return;
        }
        if (value instanceof Instant v) {
            out.writeByte(TYPE_INSTANT);
            out.writeLong(v.toEpochMilli());
            return;
        }
        if (value instanceof Date v) {
            out.writeByte(TYPE_INSTANT);
            out.writeLong(v.getTime());
            return;
        }
        if (value instanceof PointVariableConfig.Point3D p) {
            out.writeByte(TYPE_POINT3D);
            out.writeDouble(p.x);
            out.writeDouble(p.y);
            out.writeDouble(p.z);
            return;
        }
        if (value instanceof Map<?, ?> map
            && map.containsKey("x") && map.containsKey("y") && map.containsKey("z")) {
            out.writeByte(TYPE_POINT3D);
            out.writeDouble(asDouble(map.get("x")));
            out.writeDouble(asDouble(map.get("y")));
            out.writeDouble(asDouble(map.get("z")));
            return;
        }

        // Fallback: JSON payload for unsupported types
        out.writeByte(TYPE_JSON);
        byte[] bytes = serializeUnknownValue(value);
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        throw new IllegalArgumentException("Point coordinate must be numeric");
    }

    private byte[] serializeUnknownValue(Object value) {
        try {
            return MAPPER.writeValueAsBytes(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize fallback JSON value", e);
        }
    }
}
