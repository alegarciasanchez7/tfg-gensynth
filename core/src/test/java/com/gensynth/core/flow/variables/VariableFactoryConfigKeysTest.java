package com.gensynth.core.flow.variables;

import com.gensynth.core.flow.variables.config.BoundaryObstacle;
import com.gensynth.core.flow.variables.config.NumericVariableConfig;
import com.gensynth.core.flow.variables.config.PointVariableConfig;
import org.junit.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

/**
 * Reading of the optional config keys: a key saved as null keeps the default, and the
 * legacy keys of older projects are still understood.
 */
public class VariableFactoryConfigKeysTest {

    /** A config where every given key is present with a null value (as the UI saves cleared fields). */
    private static Map<String, Object> nullKeys(String... keys) {
        Map<String, Object> config = new HashMap<>();
        for (String key : keys) {
            config.put(key, null);
        }
        return config;
    }

    @Test
    public void numericNullKeysKeepTheDefaults() {
        NumericVariableConfig defaults = VariableFactory.createNumeric("v");
        Map<String, Object> config = nullKeys("initialValue", "initial", "sineFrequency", "sineAmplitude",
            "sinePhase", "sineOffset", "driftRate", "driftInitialValue", "simulationTimeStep", "noiseEnabled",
            "noiseAmplitude", "noiseStdDev", "spikeEnabled", "spikeProbability", "spikeMagnitude", "spikeMin",
            "spikeMax", "spikeMultiplier", "sourceListVariableId", "sourceListSelectionMode", "selectedListItemId");

        NumericVariableConfig numeric = (NumericVariableConfig) VariableFactory.createFromMap("v", "NUMERIC", config);

        assertEquals(defaults.getSineFrequency(), numeric.getSineFrequency(), 0.0);
        assertEquals(defaults.getDriftRate(), numeric.getDriftRate(), 0.0);
        assertEquals(defaults.getNoiseStdDev(), numeric.getNoiseStdDev(), 0.0);
        assertEquals(defaults.getSpikeMultiplier(), numeric.getSpikeMultiplier(), 0.0);
        assertNull(numeric.getDriftInitialValue());
        assertNull(numeric.getSourceListVariableId());
        assertEquals(defaults.getSourceListSelectionMode(), numeric.getSourceListSelectionMode());
        assertNull(numeric.getSelectedListItemId());
    }

    @Test
    public void numericReadsTheInitialValueAndTheLegacyInitialKey() {
        NumericVariableConfig current = (NumericVariableConfig) VariableFactory.createFromMap("v", "NUMERIC",
            Map.of("min", 0, "max", 100, "initialValue", 12, "driftInitialValue", 7));
        NumericVariableConfig legacy = (NumericVariableConfig) VariableFactory.createFromMap("v", "NUMERIC",
            Map.of("min", 0, "max", 100, "initial", 34));

        assertEquals(12.0, current.getInitialValue(), 0.0);
        assertEquals(7.0, current.getDriftInitialValue(), 0.0);
        assertEquals(34.0, legacy.getInitialValue(), 0.0);
    }

    @Test
    public void inheritedListItemIsRead() {
        VariableConfiguration config = VariableFactory.createFromMap("v", "STRING",
            Map.of("sourceListVariableId", "colors", "sourceListSelectionMode", "FIXED", "selectedListItemId", "red"));

        assertEquals("colors", config.getSourceListVariableId());
        assertEquals("FIXED", config.getSourceListSelectionMode());
        assertEquals("red", config.getSelectedListItemId());
    }

    @Test
    public void stringReadsTheCorruptionKeysAndIgnoresNullOnes() {
        assertNotNull(VariableFactory.createFromMap("v", "STRING",
            Map.of("corruptionEnabled", true, "corruptionProbability", 0.5, "corruptionMagnitude", 2)));
        assertNotNull(VariableFactory.createFromMap("v", "STRING",
            nullKeys("corruptionEnabled", "corruptionProbability", "corruptionMagnitude")));
    }

    @Test
    public void listNullKeysKeepAnEmptyList() {
        assertNotNull(VariableFactory.createFromMap("v", "LIST",
            nullKeys("items", "transitionMatrix", "selectionStrategy", "itemOrder")));
    }

    @Test
    public void booleanNullKeysKeepTheDefaults() {
        assertNotNull(VariableFactory.createFromMap("v", "BOOLEAN",
            nullKeys("pattern", "currentValue", "onDurationTicks", "offDurationTicks", "alternationInterval",
                "trueProbability", "flipInterval", "burstDurationTicks", "burstIdleTicks", "pTrueToTrue",
                "pFalseToTrue")));
    }

    @Test
    public void temporalNullKeysKeepTheDefaults() {
        assertNotNull(VariableFactory.createFromMap("v", "TEMPORAL",
            nullKeys("timeAdvanceMode", "clockDriftEnabled", "maxDriftMs", "driftType", "driftRateMsPerTick",
                "backfillStrategy", "incrementMs", "startDate", "fixedDate", "rangeStart")));
    }

    @Test
    public void temporalRangeWithoutEndLastsOneHour() {
        Map<String, Object> config = new HashMap<>();
        config.put("rangeStart", "2026-01-01T00:00:00Z");
        config.put("rangeEnd", null);

        assertNotNull(VariableFactory.createFromMap("v", "TEMPORAL", config));
    }

    @Test
    public void pointReadsTheInitialAltitudeAndTheLegacyNavigationMode() {
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("initialAltitude", 25, "navigationMode", "sequence"));

        assertEquals(25.0, point.getInitialAltitude(), 0.0);
        assertEquals(PointVariableConfig.GraphNavigationMode.SEQUENCE, point.getGraphNavigationMode());
    }

    @Test
    public void pointNullKeysKeepTheDefaults() {
        PointVariableConfig defaults = VariableFactory.createPoint("v");
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            nullKeys("initialAltitude", "graphNavigationMode", "navigationMode"));

        assertEquals(defaults.getInitialAltitude(), point.getInitialAltitude());
        assertEquals(defaults.getGraphNavigationMode(), point.getGraphNavigationMode());
    }

    @Test
    public void obstacleCanBeSavedDisabled() {
        Map<String, Object> obstacle = new HashMap<>();
        obstacle.put("name", "Wall");
        obstacle.put("enabled", false);
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("obstacles", List.of(obstacle)));

        BoundaryObstacle parsed = point.getObstacles().get(0);
        assertEquals("Wall", parsed.getName());
        assertFalse(parsed.isEnabled());
    }

    @Test
    public void graphEdgesAcceptTheLegacyEndpointKeys() {
        Map<String, Object> nullEndpoints = new HashMap<>();
        nullEndpoints.put("fromNodeId", null);
        nullEndpoints.put("sourceId", null);
        nullEndpoints.put("toNodeId", null);
        nullEndpoints.put("targetId", null);
        PointVariableConfig point = (PointVariableConfig) VariableFactory.createFromMap("v", "POINT",
            Map.of("edges", List.of(
                Map.of("sourceId", "a", "targetId", "b"),
                Map.of("from", "b", "to", "c"),
                nullEndpoints)));

        assertEquals("a", point.getGraphEdges().get(0).getFromNodeId());
        assertEquals("b", point.getGraphEdges().get(0).getToNodeId());
        assertEquals("b", point.getGraphEdges().get(1).getFromNodeId());
        assertEquals("c", point.getGraphEdges().get(1).getToNodeId());
        assertEquals("", point.getGraphEdges().get(2).getFromNodeId());
        assertEquals("", point.getGraphEdges().get(2).getToNodeId());
    }
}
