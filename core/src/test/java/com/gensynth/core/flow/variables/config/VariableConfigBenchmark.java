package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;

public class VariableConfigBenchmark {

    private NumericVariableConfig numericRandom;
    private StringVariableConfig stringRandom;
    private ListVariableConfig listRandom;
    private BooleanVariableConfig booleanDuty;
    private TemporalVariableConfig dateIncremental;
    private PointVariableConfig pointRandom;

    private void setUp() {
        numericRandom = new NumericVariableConfig()
            .identifier("bench_numeric")
            .pattern(GenerationPattern.RANDOM)
            .from(0.0)
            .to(1000.0)
            .initial(500.0)
            .steps(100);

        stringRandom = new StringVariableConfig()
            .identifier("bench_string")
            .fixedSize(16)
            .lowerCase(0.4)
            .upperCase(0.2)
            .numbers(0.3)
            .symbols(0.1);

        listRandom = new ListVariableConfig()
            .identifier("bench_list")
            .list(Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))
            .pattern(GenerationPattern.RANDOM_FROM_LIST);

        booleanDuty = new BooleanVariableConfig()
            .identifier("bench_boolean")
            .pattern(GenerationPattern.DUTY_CYCLE)
            .onDurationTicks(3)
            .offDurationTicks(2)
            .startWithTrue(true);

        dateIncremental = new TemporalVariableConfig()
            .identifier("bench_date")
            .pattern(GenerationPattern.START_PLUS_INCREMENT)
            .startDate(Instant.parse("2025-01-01T00:00:00Z"))
            .increment(Duration.ofMillis(250));

        pointRandom = new PointVariableConfig()
            .identifier("bench_point")
            .pattern(GenerationPattern.RANDOM_POINT)
            .range(-1000.0, 1000.0, -1000.0, 1000.0, -1000.0, 1000.0);
    }

    private static double runBenchmark(String name, Runnable action, int warmupIterations, int iterations) {
        for (int i = 0; i < warmupIterations; i++) {
            action.run();
        }

        long start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            action.run();
        }
        long elapsedNs = System.nanoTime() - start;

        double seconds = elapsedNs / 1_000_000_000.0;
        double opsPerSecond = iterations / seconds;
        System.out.printf("%-18s %.2f ops/s%n", name + ":", opsPerSecond);
        return opsPerSecond;
    }

    public static void main(String[] args) {
        VariableConfigBenchmark bench = new VariableConfigBenchmark();
        bench.setUp();

        final int warmupIterations = 200_000;
        final int iterations = 2_000_000;

        System.out.println("Variable Config Micro-Benchmark");
        System.out.println("Warmup iterations: " + warmupIterations);
        System.out.println("Measure iterations: " + iterations);
        System.out.println();

        double n = runBenchmark("Numeric", () -> bench.numericRandom.generateNextValue(), warmupIterations, iterations);
        double s = runBenchmark("String", () -> bench.stringRandom.generateNextValue(), warmupIterations, iterations);
        double l = runBenchmark("List", () -> bench.listRandom.generateNextValue(), warmupIterations, iterations);
        double b = runBenchmark("Boolean", () -> bench.booleanDuty.generateNextValue(), warmupIterations, iterations);
        double d = runBenchmark("Date", () -> bench.dateIncremental.generateNextValue(), warmupIterations, iterations);
        double p = runBenchmark("Point", () -> bench.pointRandom.generateNextValue(), warmupIterations, iterations);

        System.out.println();
        System.out.printf("Total throughput: %.2f ops/s%n", (n + s + l + b + d + p));
    }
}
