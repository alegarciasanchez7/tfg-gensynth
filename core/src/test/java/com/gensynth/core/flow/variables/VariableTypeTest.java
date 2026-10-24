package com.gensynth.core.flow.variables;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class VariableTypeTest {

    @Test
    public void temporalAndItsCoreAliasDateResolveToTemporal() {
        assertEquals(VariableType.TEMPORAL, VariableType.fromName("temporal"));
        assertEquals(VariableType.TEMPORAL, VariableType.fromName("date"));
        assertEquals(VariableType.TEMPORAL, VariableType.fromName(" DATE "));
        assertTrue(VariableType.TEMPORAL.matches("Date"));
    }

    @Test
    public void everyStoredNameResolvesIgnoringCase() {
        assertEquals(VariableType.NUMERIC, VariableType.fromName("numeric"));
        assertEquals(VariableType.STRING, VariableType.fromName("String"));
        assertEquals(VariableType.BOOLEAN, VariableType.fromName("BOOLEAN"));
        assertEquals(VariableType.POINT, VariableType.fromName("point"));
        assertEquals(VariableType.LIST, VariableType.fromName("list"));
        assertFalse(VariableType.LIST.matches("numeric"));
    }

    @Test
    public void unknownOrMissingNamesResolveToNull() {
        assertNull(VariableType.fromName(null));
        assertNull(VariableType.fromName("number"));
        assertFalse(VariableType.TEMPORAL.matches(null));
    }

    @Test
    public void factoryBuildsTemporalConfigsForBothNames() {
        assertEquals(VariableType.TEMPORAL, VariableFactory.createFromMap("a", "date", java.util.Map.of()).getType());
        assertEquals(VariableType.TEMPORAL, VariableFactory.createFromMap("b", "temporal", java.util.Map.of()).getType());
    }
}
