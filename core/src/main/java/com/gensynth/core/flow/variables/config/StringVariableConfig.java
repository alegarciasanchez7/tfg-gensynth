package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import com.github.curiousoddman.rgxgen.RgxGen;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    
    // Template Mode
    private String template;
    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\{\\{([a-zA-Z0-9_\\-]+)\\}\\}");

    // Formatted Mask Mode
    private String formattedMaskType; // MAC_ADDRESS, IPV4, IPV6, UUID_V4, CUSTOM_MASK, ALPHANUMERIC
    private String customMask;
    private String alphanumericCase; // UPPER, LOWER, MIXED

    // Data Corruption Simulation
    private boolean corruptionEnabled;
    private double corruptionProbability;
    private String corruptionMode; // TRUNCATE, INJECT_ANOMALOUS, REPLACE_CHAR, NULL_BYTE, MIXED
    private int corruptionMagnitude;
    
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
        
        // Defaults for new features
        this.template = "";
        this.formattedMaskType = "ALPHANUMERIC";
        this.customMask = "";
        this.alphanumericCase = "MIXED";
        this.corruptionEnabled = false;
        this.corruptionProbability = 0.05;
        this.corruptionMode = "MIXED";
        this.corruptionMagnitude = 1;
        
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
        if (pattern == GenerationPattern.REGEX && regexPattern != null && !regexPattern.trim().isEmpty()) {
            try {
                new RgxGen(regexPattern);
            } catch (Exception e) {
                errors.add("Invalid regex pattern: " + e.getMessage());
            }
        }
        if (pattern == GenerationPattern.TEMPLATE && (template == null || template.isEmpty())) {
            errors.add("Template pattern requires a valid template string");
        }
        return errors;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        
        String result = "";
        
        if (pattern == GenerationPattern.CONSTANT) {
            result = constantValue != null ? constantValue : "";
        } else if (pattern == GenerationPattern.REGEX) {
            if (regexPattern != null && !regexPattern.trim().isEmpty()) {
                if (rgxGen == null) {
                    rgxGen = new RgxGen(regexPattern);
                }
                result = rgxGen.generate();
            }
        } else if (pattern == GenerationPattern.TEMPLATE) {
            result = resolveTemplate();
        } else if (pattern == GenerationPattern.FORMATTED_MASK) {
            result = generateFormattedMask();
        } else {
            // RANDOM_STRING
            if (needsRebuild) {
                buildCharacterSetCache();
            }
            
            ThreadLocalRandom random = ThreadLocalRandom.current();
            int length = fixedSize ? fixedLength : random.nextInt(minLength, maxLength + 1);
            char[] output = new char[length];

            for (int i = 0; i < length; i++) {
                output[i] = characterPool[random.nextInt(characterPool.length)];
            }
            result = new String(output);
        }
        
        if (corruptionEnabled && corruptionProbability > 0) {
            result = applyDataCorruption(result);
        }
        
        return result;
    }

    private String resolveTemplate() {
        if (template == null || template.isEmpty()) {
            return "";
        }
        Matcher matcher = TEMPLATE_PATTERN.matcher(template);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String varName = matcher.group(1);
            Object value = currentContext.get(varName);
            String replacement = value != null ? value.toString() : "";
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private String generateFormattedMask() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        if ("MAC_ADDRESS".equals(formattedMaskType)) {
            return String.format("%02X:%02X:%02X:%02X:%02X:%02X",
                random.nextInt(256), random.nextInt(256), random.nextInt(256),
                random.nextInt(256), random.nextInt(256), random.nextInt(256));
        } else if ("IPV4".equals(formattedMaskType)) {
            return random.nextInt(256) + "." + random.nextInt(256) + "." +
                   random.nextInt(256) + "." + random.nextInt(256);
        } else if ("IPV6".equals(formattedMaskType)) {
            return String.format("%x:%x:%x:%x:%x:%x:%x:%x",
                random.nextInt(65536), random.nextInt(65536), random.nextInt(65536), random.nextInt(65536),
                random.nextInt(65536), random.nextInt(65536), random.nextInt(65536), random.nextInt(65536));
        } else if ("UUID_V4".equals(formattedMaskType)) {
            return java.util.UUID.randomUUID().toString();
        } else if ("CUSTOM_MASK".equals(formattedMaskType) || "ALPHANUMERIC".equals(formattedMaskType)) {
            if (customMask == null || customMask.isEmpty()) return "";
            StringBuilder sb = new StringBuilder(customMask.length());
            for (char c : customMask.toCharArray()) {
                if (c == '#') {
                    sb.append(NUMBER_CHARS.charAt(random.nextInt(NUMBER_CHARS.length())));
                } else if (c == 'X' || c == 'x') {
                    char hex = "0123456789ABCDEF".charAt(random.nextInt(16));
                    sb.append(c == 'x' ? Character.toLowerCase(hex) : hex);
                } else if (c == 'A' || c == 'a') {
                    char letter = UPPERCASE_CHARS.charAt(random.nextInt(UPPERCASE_CHARS.length()));
                    sb.append(c == 'a' ? Character.toLowerCase(letter) : letter);
                } else if (c == '?') {
                    String alpha = UPPERCASE_CHARS + NUMBER_CHARS;
                    sb.append(alpha.charAt(random.nextInt(alpha.length())));
                } else {
                    sb.append(c);
                }
            }
            String res = sb.toString();
            if ("LOWER".equals(alphanumericCase)) return res.toLowerCase();
            if ("UPPER".equals(alphanumericCase)) return res.toUpperCase();
            return res;
        }
        return "";
    }

    private String applyDataCorruption(String input) {
        if (input == null || input.isEmpty()) return input;
        ThreadLocalRandom random = ThreadLocalRandom.current();
        if (random.nextDouble() > corruptionProbability) {
            return input;
        }

        String mode = corruptionMode != null ? corruptionMode : "MIXED";
        if ("MIXED".equals(mode)) {
            String[] modes = {"TRUNCATE", "INJECT_ANOMALOUS", "REPLACE_CHAR", "NULL_BYTE"};
            mode = modes[random.nextInt(modes.length)];
        }

        int mag = Math.max(1, corruptionMagnitude);
        if ("TRUNCATE".equals(mode)) {
            if (input.length() <= mag) return "";
            return input.substring(0, input.length() - mag);
        } else if ("INJECT_ANOMALOUS".equals(mode)) {
            StringBuilder sb = new StringBuilder(input);
            for (int i = 0; i < mag; i++) {
                int pos = random.nextInt(sb.length() + 1);
                sb.insert(pos, SYMBOL_CHARS.charAt(random.nextInt(SYMBOL_CHARS.length())));
            }
            return sb.toString();
        } else if ("REPLACE_CHAR".equals(mode)) {
            char[] chars = input.toCharArray();
            for (int i = 0; i < Math.min(mag, chars.length); i++) {
                int pos = random.nextInt(chars.length);
                chars[pos] = '?'; // or any anomalous char
            }
            return new String(chars);
        } else if ("NULL_BYTE".equals(mode)) {
            StringBuilder sb = new StringBuilder(input);
            int pos = random.nextInt(sb.length() + 1);
            sb.insert(pos, '\0');
            return sb.toString();
        }
        return input;
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
    public java.util.Set<String> getDependencies() {
        java.util.Set<String> deps = super.getDependencies();
        
        if (pattern == GenerationPattern.TEMPLATE && template != null && !template.isEmpty()) {
            Matcher matcher = TEMPLATE_PATTERN.matcher(template);
            while (matcher.find()) {
                deps.add(matcher.group(1));
            }
        }
        return deps;
    }

    @Override
    public void reset() {
        tickCounter = 0;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(16);
        map.put("identifier", identifier);
        map.put("type", type.name());
        map.put("pattern", pattern.name());
        map.put("fixedSize", fixedSize);
        map.put("fixedLength", fixedLength);
        map.put("minLength", minLength);
        map.put("maxLength", maxLength);
        map.put("regexPattern", regexPattern);
        map.put("constantValue", constantValue);
        map.put("template", template);
        map.put("formattedMaskType", formattedMaskType);
        map.put("customMask", customMask);
        map.put("alphanumericCase", alphanumericCase);
        map.put("corruptionEnabled", corruptionEnabled);
        map.put("corruptionProbability", corruptionProbability);
        map.put("corruptionMode", corruptionMode);
        map.put("corruptionMagnitude", corruptionMagnitude);
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
        this.pattern = GenerationPattern.REGEX;
        return this;
    }

    public StringVariableConfig constant(String val) {
        this.constantValue = val;
        this.pattern = GenerationPattern.CONSTANT;
        return this;
    }
    
    public StringVariableConfig template(String template) {
        this.template = template;
        this.pattern = GenerationPattern.TEMPLATE;
        return this;
    }

    public StringVariableConfig formattedMaskType(String type) {
        this.formattedMaskType = type;
        this.pattern = GenerationPattern.FORMATTED_MASK;
        return this;
    }

    public StringVariableConfig customMask(String mask) {
        this.customMask = mask;
        return this;
    }

    public StringVariableConfig alphanumericCase(String cse) {
        this.alphanumericCase = cse;
        return this;
    }

    public StringVariableConfig corruptionEnabled(boolean enabled) {
        this.corruptionEnabled = enabled;
        return this;
    }

    public StringVariableConfig corruptionProbability(double probability) {
        this.corruptionProbability = probability;
        return this;
    }

    public StringVariableConfig corruptionMode(String mode) {
        this.corruptionMode = mode;
        return this;
    }

    public StringVariableConfig corruptionMagnitude(int mag) {
        this.corruptionMagnitude = mag;
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
