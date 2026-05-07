package com.gensynth.core.flow.serialization;

import com.gensynth.core.flow.DataEvent;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Plain text serializer for DataEvent payloads.
 * Outputs one event per line in pipe-delimited format:
 * timestamp|deviceId|variableId|value|dataType
 */
public class TextEventSerializer implements EventSerializer {

    private static final String DELIMITER = "|";
    private static final String NEWLINE = "\n";
    private static final DateTimeFormatter ISO_FORMATTER = DateTimeFormatter.ISO_INSTANT;

    @Override
    public byte[] serialize(DataEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("event cannot be null");
        }
        String line = formatEvent(event) + NEWLINE;
        return line.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public byte[] serializeBatch(List<DataEvent> events) {
        if (events == null) {
            throw new IllegalArgumentException("events cannot be null");
        }

        StringBuilder sb = new StringBuilder();
        for (DataEvent event : events) {
            if (event == null) {
                throw new IllegalArgumentException("events cannot contain null values");
            }
            sb.append(formatEvent(event)).append(NEWLINE);
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public String contentType() {
        return "text/plain";
    }

    private String formatEvent(DataEvent event) {
        // Convert epoch millis to Instant, then format
        Instant instant = Instant.ofEpochMilli(event.getTimestamp());
        return String.join(
            DELIMITER,
            ISO_FORMATTER.format(instant),
            event.getDeviceId(),
            event.getVariableId(),
            String.valueOf(event.getValue()),
            String.valueOf(event.getDataType())
        );
    }
}
