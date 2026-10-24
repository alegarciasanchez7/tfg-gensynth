package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.GenerationPattern;
import com.gensynth.core.flow.variables.VariableFactory;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.time.Instant;
import java.util.Locale;

import static org.junit.Assert.assertEquals;

/**
 * Generated values must not depend on the computer's language: decimal separators, digits and
 * month names are the same on a Spanish or Thai machine as on an English one.
 */
public class LocaleIndependentOutputTest {

    private Locale previous;

    @Before
    public void setUp() {
        previous = Locale.getDefault();
    }

    @After
    public void tearDown() {
        Locale.setDefault(previous);
    }

    @Test
    public void dmsUsesADotAsDecimalSeparator() {
        Locale.setDefault(Locale.forLanguageTag("es-ES"));

        assertEquals("40° 32' 5.10\" N", PointVariableConfig.convertToDMS(40.53475, true));
        assertEquals("3° 41' 2.40\" W", PointVariableConfig.convertToDMS(-3.684, false));
    }

    @Test
    public void paddedIntegersUseAsciiDigits() {
        // Thai digits are used by String.format("%d") when this is the default locale
        Locale.setDefault(Locale.forLanguageTag("th-TH-u-nu-thai"));

        NumericVariableConfig integer = VariableFactory.createNumeric("n1")
                .pattern(GenerationPattern.CONSTANT).constant(7).precision("INTEGER").integerFormat("000");
        NumericVariableConfig decimal = VariableFactory.createNumeric("n2")
                .pattern(GenerationPattern.CONSTANT).constant(7.5).precision("DOUBLE").decimalPlaces(1).integerFormat("000");

        assertEquals("007", integer.generateNextValue());
        assertEquals("007.5", decimal.generateNextValue());
    }

    @Test
    public void formattedDatesUseEnglishNames() {
        Locale.setDefault(Locale.forLanguageTag("es-ES"));

        TemporalVariableConfig config = new TemporalVariableConfig().identifier("t");
        config.pattern(GenerationPattern.FIXED_TEMPORAL).fixedDate(Instant.parse("2026-03-15T13:45:30Z"));
        config.dateFormat("EEEE d MMMM yyyy").timeZone("UTC");

        assertEquals("Sunday 15 March 2026", config.generateNextValue());
    }
}
