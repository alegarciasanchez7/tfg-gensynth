package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import com.github.curiousoddman.rgxgen.RgxGen;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Configuration for string variables.
 * Generates random strings with configurable character components.
 */
public class StringVariableConfig extends VariableConfiguration {
    
    private static final int CHARACTER_POOL_SIZE = 256;
    
    // Size
    private boolean fixedSize;
    private int fixedLength;
    private int minLength;
    private int maxLength;

    // Advanced Config
    private String regexPattern;
    private RgxGen rgxGen;
    private String constantValue;
    
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
    
    // Performance optimization: pre-computed flat character pool
    private char[] characterPool;
    private boolean needsRebuild = true;

    public StringVariableConfig() {
        super();
        this.type = VariableType.STRING;
        this.pattern = GenerationPattern.RANDOM_STRING;
        this.fixedSize = true;
        this.fixedLength = 8;
        this.constantValue = "";
        this.lowerCase = new CharacterSetConfig(true, 0.3);
        this.upperCase = new CharacterSetConfig(true, 0.2);
        this.numbers = new CharacterSetConfig(true, 0.4);
        this.symbols = new CharacterSetConfig(false, 0.1);
        buildCharacterSetCache();
    }

    @Override
    public java.util.List<String> validate() {
        java.util.List<String> errors = new java.util.ArrayList<>();
        if (pattern == GenerationPattern.CONSTANT) {
            return errors;
        }
        if (fixedSize) {
            if (fixedLength <= 0) {
                errors.add("Fixed string length must be greater than 0");
            }
        } else {
            if (minLength < 0) {
                errors.add("Minimum string length cannot be negative");
            }
            if (minLength > maxLength) {
                errors.add("Minimum string length (" + minLength + ") cannot be greater than maximum string length (" + maxLength + ")");
            }
        }
        if (regexPattern != null && !regexPattern.trim().isEmpty()) {
            try {
                new RgxGen(regexPattern);
            } catch (Exception e) {
                errors.add("Invalid regex pattern: " + e.getMessage());
            }
        }
        return errors;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        
        if (pattern == GenerationPattern.CONSTANT) {
            return constantValue != null ? constantValue : "";
        }

        if (regexPattern != null && !regexPattern.trim().isEmpty()) {
            if (rgxGen == null) {
                rgxGen = new RgxGen(regexPattern);
            }
            return rgxGen.generate();
        }

        // Rebuild cache if configuration changed
        if (needsRebuild) {
            buildCharacterSetCache();
        }
        
        ThreadLocalRandom random = ThreadLocalRandom.current();
        int length = fixedSize ? fixedLength : random.nextInt(minLength, maxLength + 1);
        char[] output = new char[length];

        for (int i = 0; i < length; i++) {
            output[i] = characterPool[random.nextInt(characterPool.length)];
        }
        
        return new String(output);
    }

    /**
     * Pre-computes enabled character sets and their total probability.
     * Called only when configuration changes, not on every generation.
     */
    private void buildCharacterSetCache() {
        List<WeightedCharSet> enabledSets = new ArrayList<>(4);

        if (lowerCase.enabled && lowerCase.probability > 0.0) {
            enabledSets.add(new WeightedCharSet(LOWERCASE_CHARS.toCharArray(), lowerCase.probability));
        }
        if (upperCase.enabled && upperCase.probability > 0.0) {
            enabledSets.add(new WeightedCharSet(UPPERCASE_CHARS.toCharArray(), upperCase.probability));
        }
        if (numbers.enabled && numbers.probability > 0.0) {
            enabledSets.add(new WeightedCharSet(NUMBER_CHARS.toCharArray(), numbers.probability));
        }
        if (symbols.enabled && symbols.probability > 0.0) {
            enabledSets.add(new WeightedCharSet(SYMBOL_CHARS.toCharArray(), symbols.probability));
        }

        if (enabledSets.isEmpty()) {
            this.characterPool = LOWERCASE_CHARS.toCharArray();
            this.needsRebuild = false;
            return;
        }

        double totalProbability = 0.0;
        for (WeightedCharSet set : enabledSets) {
            totalProbability += set.probability;
        }

        char[] pool = new char[CHARACTER_POOL_SIZE];
        ThreadLocalRandom random = ThreadLocalRandom.current();
        int position = 0;
        int remaining = CHARACTER_POOL_SIZE;

        for (int i = 0; i < enabledSets.size(); i++) {
            WeightedCharSet set = enabledSets.get(i);
            int setsLeft = enabledSets.size() - i - 1;
            int slots;

            if (setsLeft == 0) {
                slots = remaining;
            } else {
                double share = set.probability / totalProbability;
                slots = Math.max(1, (int) Math.round(share * CHARACTER_POOL_SIZE));
                slots = Math.min(slots, remaining - setsLeft);
            }

            for (int j = 0; j < slots; j++) {
                pool[position++] = set.chars[random.nextInt(set.chars.length)];
            }
            remaining -= slots;
        }

        this.characterPool = pool;
        this.needsRebuild = false;
    }

    @Override
    public void reset() {
        tickCounter = 0;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(9);
        map.put("identifier", identifier);
        map.put("type", type.name());
        map.put("pattern", pattern.name());
        map.put("fixedSize", fixedSize);
        map.put("fixedLength", fixedLength);
        map.put("minLength", minLength);
        map.put("maxLength", maxLength);
        map.put("regexPattern", regexPattern);
        map.put("constantValue", constantValue);
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

    public StringVariableConfig regex(String pattern) {
        this.regexPattern = pattern;
        this.rgxGen = new RgxGen(pattern);
        return this;
    }

    public StringVariableConfig constant(String val) {
        this.constantValue = val;
        return this;
    }

    // Getters
    public boolean isFixedSize() { return fixedSize; }
    public int getFixedLength() { return fixedLength; }
    public int getMinLength() { return minLength; }
    public int getMaxLength() { return maxLength; }
    public String getRegexPattern() { return regexPattern; }
    public String getConstantValue() { return constantValue; }

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

    private static class WeightedCharSet {
        final char[] chars;
        final double probability;

        WeightedCharSet(char[] chars, double probability) {
            this.chars = chars;
            this.probability = probability;
        }
    }
}
