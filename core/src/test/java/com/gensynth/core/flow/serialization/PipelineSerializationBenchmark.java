package com.gensynth.core.flow.serialization;

import com.gensynth.core.flow.DataEvent;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Benchmark for pipeline serialization formats.
 *
 * Compares JSON vs binary serialization for batch sizes:
 * 100, 1000, 10000 events.
 */
public class PipelineSerializationBenchmark {

    private static final int[] BATCH_SIZES = {100, 1000, 10000};

    public static void main(String[] args) {
        System.out.println("Pipeline Serialization Benchmark");
        System.out.println("Formats: JSON vs Binary");
        System.out.println("Batch sizes: 100, 1000, 10000");
        System.out.println();

        runForSerializer("JSON", new JsonEventSerializer());
        runForSerializer("BINARY", new BinaryEventSerializer());
    }

    private static void runForSerializer(String label, EventSerializer serializer) {
        System.out.println("=== " + label + " (" + serializer.contentType() + ") ===");

        for (int batchSize : BATCH_SIZES) {
            int iterations = iterationsFor(batchSize);
            int warmupIterations = Math.max(10, iterations / 5);

            List<DataEvent> batch = createBatch(batchSize);

            // Warmup
            long warmupChecksum = 0;
            for (int i = 0; i < warmupIterations; i++) {
                byte[] payload = serializer.serializeBatch(batch);
                warmupChecksum += payload.length;
            }

            long start = System.nanoTime();
            long totalBytes = 0;
            long checksum = warmupChecksum;
            for (int i = 0; i < iterations; i++) {
                byte[] payload = serializer.serializeBatch(batch);
                totalBytes += payload.length;
                checksum += payload[0] & 0xFF;
            }
            long elapsedNs = System.nanoTime() - start;

            long totalEvents = (long) batchSize * iterations;
            double seconds = elapsedNs / 1_000_000_000.0;
            double eventsPerSecond = totalEvents / seconds;
            double mbPerSecond = (totalBytes / (1024.0 * 1024.0)) / seconds;
            double avgBytesPerEvent = totalBytes / (double) totalEvents;

            System.out.printf(
                "batch=%5d | it=%4d | throughput=%12.0f ev/s | bandwidth=%10.2f MB/s | avg=%8.2f B/ev | checksum=%d%n",
                batchSize,
                iterations,
                eventsPerSecond,
                mbPerSecond,
                avgBytesPerEvent,
                checksum
            );
        }

        System.out.println();
    }

    private static int iterationsFor(int batchSize) {
        if (batchSize <= 100) {
            return 2500;
        }
        if (batchSize <= 1000) {
            return 900;
        }
        return 220;
    }

    private static List<DataEvent> createBatch(int size) {
        List<DataEvent> events = new ArrayList<>(size);
        long baseTs = System.currentTimeMillis();

        for (int i = 0; i < size; i++) {
            Object value;
            String dataType;

            switch (i % 6) {
                case 0:
                    value = 20.0 + (i * 0.01);
                    dataType = "double";
                    break;
                case 1:
                    value = i;
                    dataType = "int";
                    break;
                case 2:
                    value = (i % 2 == 0);
                    dataType = "boolean";
                    break;
                case 3:
                    value = "sensor-" + i;
                    dataType = "string";
                    break;
                case 4:
                    value = Instant.ofEpochMilli(baseTs + i);
                    dataType = "date";
                    break;
                default:
                    value = new PointVariableConfig.Point3D(i * 0.1, i * 0.2, i * 0.3);
                    dataType = "point";
                    break;
            }

            events.add(new DataEvent(
                baseTs + i,
                "flow-bench",
                "var-" + (i % 12),
                value,
                dataType
            ));
        }

        return events;
    }
}
