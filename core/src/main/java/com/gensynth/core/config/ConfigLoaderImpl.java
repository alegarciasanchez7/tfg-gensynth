package com.gensynth.core.config;

import org.yaml.snakeyaml.Yaml;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Implementation of ConfigLoader supporting YAML and JSON formats.
    * This class provides optimized loading and validation of configuration files,
    * with caching to prevent redundant loads and pre-compilation of patterns for key retrieval.
 */
public class ConfigLoaderImpl implements ConfigLoader {

    // Constants
    private static final int MAX_CONFIG_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    private static final Pattern DOT_PATTERN = Pattern.compile("\\.");
    private static final TypeReference<Map<String, Object>> MAP_TYPE_REF =
        new TypeReference<Map<String, Object>>() {};
    private static final Set<String> REQUIRED_KEYS = Set.of("server", "brokers");

    // Parsers
    private final Yaml yaml = new Yaml();
    private final ObjectMapper jackson = new ObjectMapper();

    // State
    private Map<String, Object> configMap = new HashMap<>();
    private boolean isLoaded = false;  // Cache flag to prevent redundant loads
    private String lastLoadedFile;      // Track last loaded file path

    @Override
    public Map<String, Object> loadFromFile(String filePath) throws ConfigLoadException {
        try {
            Path path = Paths.get(filePath);
            return loadFromFile(path.toFile());
        } catch (ConfigLoadException e) {
            throw e;
        } catch (Exception e) {
            throw new ConfigLoadException("Error loading configuration from file: " + filePath, e);
        }
    }

    @Override
    public Map<String, Object> loadFromFile(File file) throws ConfigLoadException {
        if (!file.exists()) {
            throw new ConfigLoadException("Configuration file not found: " + file.getAbsolutePath());
        }

        // Optimization: check if already loaded from same file
        if (isLoaded && file.getAbsolutePath().equals(lastLoadedFile)) {
            return Collections.unmodifiableMap(configMap);
        }

        // Optimization: validate file size before reading
        if (file.length() > MAX_CONFIG_FILE_SIZE) {
            throw new ConfigLoadException(
                String.format("Configuration file exceeds maximum size of %d bytes: %s",
                    MAX_CONFIG_FILE_SIZE, file.getAbsolutePath())
            );
        }

        String fileName = file.getName().toLowerCase();
        try {
            if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
                return loadYaml(file.getAbsolutePath());
            } else if (fileName.endsWith(".json")) {
                return loadJson(file.getAbsolutePath());
            } else {
                throw new ConfigLoadException(
                    String.format("Unsupported file format: %s. Supported formats: .yml, .yaml, .json",
                        file.getName())
                );
            }
        } catch (ConfigLoadException e) {
            throw e;
        } catch (Exception e) {
            throw new ConfigLoadException("Failed to parse configuration file: " + file.getName(), e);
        }
    }

    @Override
    public Map<String, Object> loadFromStream(InputStream inputStream, String format)
            throws ConfigLoadException {
        if (inputStream == null) {
            throw new ConfigLoadException("Input stream cannot be null");
        }

        // Optimization: use try-with-resources for automatic stream closure
        try (InputStream stream = inputStream) {
            if ("yaml".equalsIgnoreCase(format) || "yml".equalsIgnoreCase(format)) {
                Object data = yaml.load(stream);
                if (data instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> map = (Map<String, Object>) data;
                    this.configMap = map;
                    this.isLoaded = true;
                    this.lastLoadedFile = null;  // Stream source, no file path
                    return Collections.unmodifiableMap(this.configMap);
                } else {
                    throw new ConfigLoadException("YAML stream did not parse to a Map");
                }
            } else if ("json".equalsIgnoreCase(format)) {
                this.configMap = jackson.readValue(stream, MAP_TYPE_REF);
                this.isLoaded = true;
                this.lastLoadedFile = null;
                return Collections.unmodifiableMap(this.configMap);
            } else {
                throw new ConfigLoadException(
                    String.format("Unsupported format: %s. Supported formats: yaml, yml, json", format)
                );
            }
        } catch (ConfigLoadException e) {
            throw e;
        } catch (IOException e) {
            throw new ConfigLoadException("Error reading from input stream: " + format, e);
        }
    }

    @Override
    public Map<String, Object> loadYaml(String filePath) throws ConfigLoadException {
        try {
            // Optimization: explicit UTF-8 charset
            byte[] fileContent = Files.readAllBytes(Paths.get(filePath));
            String content = new String(fileContent, StandardCharsets.UTF_8);
            Object data = yaml.load(content);

            if (data instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) data;
                this.configMap = map;
                this.isLoaded = true;
                this.lastLoadedFile = filePath;
                return Collections.unmodifiableMap(this.configMap);
            } else {
                throw new ConfigLoadException("YAML file did not parse to a Map: " + filePath);
            }
        } catch (IOException e) {
            throw new ConfigLoadException("Error reading YAML file: " + filePath, e);
        } catch (ClassCastException e) {
            throw new ConfigLoadException("Invalid YAML structure: " + filePath, e);
        }
    }

    @Override
    public Map<String, Object> loadJson(String filePath) throws ConfigLoadException {
        try {
            this.configMap = jackson.readValue(new File(filePath), MAP_TYPE_REF);
            this.isLoaded = true;
            this.lastLoadedFile = filePath;
            return Collections.unmodifiableMap(this.configMap);
        } catch (FileNotFoundException e) {
            throw new ConfigLoadException("JSON file not found: " + filePath, e);
        } catch (IOException e) {
            throw new ConfigLoadException("Error reading JSON file: " + filePath, e);
        }
    }

    @Override
    public boolean validate(Map<String, Object> config) throws ConfigValidationException {
        if (config == null || config.isEmpty()) {
            throw new ConfigValidationException("Configuration cannot be null or empty");
        }

        // Optimization: use Set instead of List for missing keys (O(1) contains)
        Set<String> missingKeys = new HashSet<>();
        for (String key : REQUIRED_KEYS) {
            if (!config.containsKey(key)) {
                missingKeys.add(key);
            }
        }

        if (!missingKeys.isEmpty()) {
            throw new ConfigValidationException(
                String.format("Missing required configuration keys: %s", missingKeys)
            );
        }

        // Validate brokers section
        Object brokersObj = config.get("brokers");
        if (!(brokersObj instanceof Map)) {
            throw new ConfigValidationException("'brokers' section must be a map");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> brokers = (Map<String, Object>) brokersObj;
        if (brokers.isEmpty()) {
            throw new ConfigValidationException("At least one broker must be configured");
        }

        return true;
    }

    @Override
    public Object getValue(String keyPath, Object defaultValue) {
        try {
            return getValue(keyPath);
        } catch (ConfigKeyException e) {
            return defaultValue;
        }
    }

    @Override
    public Object getValue(String keyPath) throws ConfigKeyException {
        if (keyPath == null || keyPath.isEmpty()) {
            throw new ConfigKeyException("Key path cannot be null or empty");
        }

        // Optimization: use pre-compiled pattern for splitting
        String[] keys = DOT_PATTERN.split(keyPath, -1);
        Object current = this.configMap;

        for (String key : keys) {
            if (current instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) current;
                current = map.get(key);
                if (current == null) {
                    throw new ConfigKeyException("Configuration key not found: " + keyPath);
                }
            } else {
                throw new ConfigKeyException(
                    String.format("Cannot traverse configuration at key: %s " +
                        "(expected Map, got %s)", key, current.getClass().getSimpleName())
                );
            }
        }

        return current;
    }

}
