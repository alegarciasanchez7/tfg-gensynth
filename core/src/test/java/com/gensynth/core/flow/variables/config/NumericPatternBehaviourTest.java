package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** Exact output of the Sequential, Drift (bounce) and Random patterns. */
public class NumericPatternBehaviourTest {

    private static List<Double> take(NumericVariableConfig config, int n) {
        List<Double> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add(((Number) config.generateNextValue()).doubleValue());
        }
        return out;
    }

    @Test
    public void sequentialPlaysEveryDrawnPointIncludingTheLast() {
        NumericVariableConfig config = VariableFactory.createNumeric("seq").from(0).to(10)
                .pattern(GenerationPattern.SEQUENTIAL).precision("INTEGER")
                .sequentialGraph(List.of(Map.of("x", 0, "y", 1), Map.of("x", 1, "y", 5), Map.of("x", 2, "y", 9)));

        assertEquals(List.of(1.0, 5.0, 9.0, 1.0, 5.0, 9.0, 1.0), take(config, 7));
    }

    @Test
    public void driftBounceGoesBackAndForthBetweenTheLimits() {
        NumericVariableConfig config = VariableFactory.createNumeric("drift").from(0).to(10)
                .pattern(GenerationPattern.DRIFT).driftRate(2).driftInitialValue(6.0)
                .driftLimitMode("BOUNCE").simulationTimeStep(1).precision("INTEGER");

        assertEquals(List.of(6.0, 8.0, 10.0, 8.0, 6.0, 4.0, 2.0, 0.0, 2.0, 4.0), take(config, 10));
    }

    @Test
    public void integerRandomCanReachTheMaximum() {
        NumericVariableConfig config = VariableFactory.createNumeric("rnd").from(0).to(3)
                .pattern(GenerationPattern.RANDOM).precision("INTEGER");

        Set<Double> seen = new HashSet<>(take(config, 400));
        assertEquals(Set.of(0.0, 1.0, 2.0, 3.0), seen);
    }

    @Test
    public void randomIgnoresALeftoverDistributionType() {
        NumericVariableConfig config = VariableFactory.createNumeric("rnd").from(0).to(100)
                .pattern(GenerationPattern.RANDOM).distributionType("EXPONENTIAL").precision("INTEGER");

        // Exponential piles values near the minimum; uniform spreads them over the whole range
        long upperHalf = take(config, 2000).stream().filter(v -> v > 50).count();
        assertTrue("upper half count " + upperHalf, upperHalf > 800);
    }
}
