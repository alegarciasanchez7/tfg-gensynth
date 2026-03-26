package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Configuration for string variables.
 * Generates random strings with configurable character components.
 */
public class StringVariableConfig extends VariableConfiguration {
    
    // Size
    private boolean fixedSize;
    private int fixedLength;
    private int minLength;
    private int maxLength;
    
    // Components
    private CharacterSetConfig lowerCase;
    private CharacterSetConfig upperCase;
    private CharacterSetConfig numbers;
    private CharacterSetConfig symbols;
    
    // Constants
    private static final String LOWERCASE_CHARS = "abcdefghijklmnopqrstuvwxyz";
    private static final String UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final String NUMBER_CHARS = "0123456789";
    private static final String SYMBOL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    
    // Performance optimization: pre-computed character sets cache
    private CharacterSet[] enabledCharSets;
    private double totalProbability;
    private boolean needsRebuild = true;

    public StringVariableConfig() {
        super();
        this.type = VariableType.STRING;
        this.pattern = GenerationPattern.RANDOM_STRING;
        this.fixedSize = true;
        this.fixedLength = 8;
        this.lowerCase = new CharacterSetConfig(true, 0.3);
        this.upperCase = new CharacterSetConfig(true, 0.2);
        this.numbers = new CharacterSetConfig(true, 0.4);
        this.symbols = new CharacterSetConfig(false, 0.1);
        buildCharacterSetCache();
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        
        // Rebuild cache if configuration changed
        if (needsRebuild) {
            buildCharacterSetCache();
        }
        
        int length = fixedSize ? fixedLength : ThreadLocalRandom.current().nextInt(minLength, maxLength + 1);
        StringBuilder sb = new StringBuilder(length);
        
        for (int i = 0; i < length; i++) {
            CharacterSet charSet = selectCharacterSet();
            sb.append(charSet.getRandomChar());
        }
        
        return sb.toString();
    }

    /**
     * Pre-computes enabled character sets and their total probability.
     * Called only when configuration changes, not on every generation.
     */
    private void buildCharacterSetCache() {
        CharacterSet[] temp = new CharacterSet[4];
        int count = 0;
        double total = 0.0;
        
        if (lowerCase.enabled) {
            temp[count++] = new CharacterSet(LOWERCASE_CHARS, lowerCase.probability);
            total += lowerCase.probability;
        }
        if (upperCase.enabled) {
            temp[count++] = new CharacterSet(UPPERCASE_CHARS, upperCase.probability);
            total += upperCase.probability;
        }
        if (numbers.enabled) {
            temp[count++] = new CharacterSet(NUMBER_CHARS, numbers.probability);
            total += numbers.probability;
        }
        if (symbols.enabled) {
            temp[count++] = new CharacterSet(SYMBOL_CHARS, symbols.probability);
            total += symbols.probability;
        }
        
        // Shrink array to exact size
        this.enabledCharSets = new CharacterSet[count];
        System.arraycopy(temp, 0, this.enabledCharSets, 0, count);
        this.totalProbability = total;
        this.needsRebuild = false;
    }

    /**
     * Selects a character set based on probability (optimized - no stream, single random).
     */
    private CharacterSet selectCharacterSet() {
        if (enabledCharSets.length == 0) {
            return new CharacterSet(LOWERCASE_CHARS, 1.0);
        }
        
        double random = ThreadLocalRandom.current().nextDouble(totalProbability);
        double cumulative = 0.0;
        
        // Loop-based selection is faster than stream for small arrays
        for (int i = 0; i < enabledCharSets.length; i++) {
            cumulative += enabledCharSets[i].probability;
            if (random <= cumulative) {
                return enabledCharSets[i];
            }
        }
        
        // Fallback (should rarely happen)
        return enabledCharSets[enabledCharSets.length - 1];
    }

    @Override
    public void reset() {
        tickCounter = 0;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(7);
        map.put("identifier", identifier);
        map.put("type", type.name());
        map.put("pattern", pattern.name());
        map.put("fixedSize", fixedSize);
        map.put("fixedLength", fixedLength);
        map.put("minLength", minLength);
        map.put("maxLength", maxLength);
        return map;
    }

    // Builder methods - Override from base class
    @Override
    public StringVariableConfig identifier(String id) {
        super.identifier(id);
        return this;
    }

    @Override
    public StringVariableConfig pattern(GenerationPattern pattern) {
        super.pattern(pattern);
        return this;
    }

    @Override
    public StringVariableConfig defaultValue(Object value) {
        super.defaultValue(value);
        return this;
    }

    @Override
    public StringVariableConfig anomaly(AnomalyConfig config) {
        super.anomaly(config);
        return this;
    }

    // String-specific builder methods
    public StringVariableConfig fixedSize(int length) {
        this.fixedSize = true;
        this.fixedLength = length;
        return this;
    }

    public StringVariableConfig variableSize(int min, int max) {
        this.fixedSize = false;
        this.minLength = min;
        this.maxLength = max;
        return this;
    }

    public StringVariableConfig lowerCase(double probability) {
        this.lowerCase = new CharacterSetConfig(true, probability);
        this.needsRebuild = true;
        return this;
    }

    public StringVariableConfig upperCase(double probability) {
        this.upperCase = new CharacterSetConfig(true, probability);
        this.needsRebuild = true;
        return this;
    }

    public StringVariableConfig numbers(double probability) {
        this.numbers = new CharacterSetConfig(true, probability);
        this.needsRebuild = true;
        return this;
    }

    public StringVariableConfig symbols(double probability) {
        this.symbols = new CharacterSetConfig(true, probability);
        this.needsRebuild = true;
        return this;
    }

    // Getters
    public boolean isFixedSize() { return fixedSize; }
    public int getFixedLength() { return fixedLength; }
    public int getMinLength() { return minLength; }
    public int getMaxLength() { return maxLength; }

    /**
     * Character set configuration
     */
    public static class CharacterSetConfig {
        public boolean enabled;
        public double probability;

        public CharacterSetConfig(boolean enabled, double probability) {
            this.enabled = enabled;
            this.probability = probability;
        }
    }

    /**
     * Helper for character selection
     */
    private static class CharacterSet {
        String chars;
        double probability;

        CharacterSet(String chars, double probability) {
            this.chars = chars;
            this.probability = probability;
        }

        char getRandomChar() {
            return chars.charAt(ThreadLocalRandom.current().nextInt(chars.length()));
        }
    }
}
