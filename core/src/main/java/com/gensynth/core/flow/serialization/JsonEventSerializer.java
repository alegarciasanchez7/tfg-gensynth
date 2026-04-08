package com.gensynth.core.flow.serialization;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.flow.DataEvent;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.Date;
import java.util.List;

/**
 * JSON serializer for DataEvent payloads.
 */
public class JsonEventSerializer implements EventSerializer {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public byte[] serialize(DataEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("event cannot be null");
        }

        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream(128);
            try (JsonGenerator generator = MAPPER.getFactory().createGenerator(out)) {
                writeEvent(generator, event);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to serialize DataEvent to JSON", e);
        }
    }

    @Override
    public byte[] serializeBatch(List<DataEvent> events) {
        if (events == null) {
            throw new IllegalArgumentException("events cannot be null");
        }

        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(128, events.size() * 96));
            try (JsonGenerator generator = MAPPER.getFactory().createGenerator(out)) {
                generator.writeStartArray();
                for (DataEvent event : events) {
                    if (event == null) {
                        throw new IllegalArgumentException("events cannot contain null values");
                    }
                    writeEvent(generator, event);
                }
                generator.writeEndArray();
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to serialize DataEvent batch to JSON", e);
        }
    }

    @Override
    public String contentType() {
        return "application/json";
    }

    private void writeEvent(JsonGenerator generator, DataEvent event) throws IOException {
        generator.writeStartObject();
        generator.writeNumberField("timestamp", event.getTimestamp());
        generator.writeStringField("deviceId", event.getDeviceId());
        generator.writeStringField("variableId", event.getVariableId());
        generator.writeStringField("dataType", event.getDataType());
        generator.writeFieldName("value");
        writeValue(generator, event.getValue());
        generator.writeEndObject();
    }

    private void writeValue(JsonGenerator generator, Object value) throws IOException {
        if (value instanceof Instant instant) {
            generator.writeNumber(instant.toEpochMilli());
            return;
        }
        if (value instanceof Date date) {
            generator.writeNumber(date.getTime());
            return;
        }
        if (value instanceof PointVariableConfig.Point3D point) {
            generator.writeStartObject();
            generator.writeNumberField("x", point.x);
            generator.writeNumberField("y", point.y);
            generator.writeNumberField("z", point.z);
            generator.writeEndObject();
            return;
        }
        generator.writeObject(value);
    }
}
