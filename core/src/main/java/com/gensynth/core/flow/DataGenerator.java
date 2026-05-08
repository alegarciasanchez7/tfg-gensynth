package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;
import net.datafaker.Faker;

import java.time.Instant;
import java.util.Map;
import java.util.Random;
import java.util.List;

public class DataGenerator {

    private final Faker faker;
    private final Random random;

    public DataGenerator() {
        this.faker = new Faker();
        this.random = new Random();
    }

    public Object generateValue(Variable variable) {
        String type = variable.getType();
        Map<String, Object> config = variable.getConfig();

        // In the future, we can read from the `config` map to determine bounds or
        // formats.
        // For now we apply basic random generation based on the type.

        switch (type.toLowerCase()) {
            case "numeric":
                double min = config.containsKey("min") ? ((Number) config.get("min")).doubleValue() : 0.0;
                double max = config.containsKey("max") ? ((Number) config.get("max")).doubleValue() : 100.0;
                return min + (max - min) * random.nextDouble();

            case "string":
                return faker.lorem().word();

            case "boolean":
                return random.nextBoolean();

            case "date":
            case "temporal":
                return Instant.now().toEpochMilli();

            case "point":
                // Basic random 3D point
                return Map.of(
                        "x", random.nextDouble() * 100,
                        "y", random.nextDouble() * 100,
                        "z", random.nextDouble() * 100);

            case "list":
                // Basic random choice from a generic list or random generation
                return List.of(faker.color().name(), faker.color().name());

            default:
                return variable.getDefaultValue();
        }
    }
}
