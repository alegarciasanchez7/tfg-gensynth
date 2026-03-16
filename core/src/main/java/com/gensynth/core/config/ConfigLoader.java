package com.gensynth.core.config;

import java.io.File;
import java.io.InputStream;
import java.util.Map;

/**
 * Interface for loading application configuration from various sources.
 * Supports YAML and JSON formats.
 *
 * ConfigLoader is responsible for:
 * - Loading initial configuration before the application starts
 * - Supporting both YAML and JSON formats
 * - Validating configuration integrity
 * - Providing access to loaded configuration values
 */
public interface ConfigLoader {

    /**
     * Load configuration from a file path.
     * Automatically detects format based on file extension (.yml, .yaml, .json).
     *
     * @param filePath Path to the configuration file
     * @return Map containing the loaded configuration
     * @throws ConfigLoadException if the file cannot be read or parsed
     */
    Map<String, Object> loadFromFile(String filePath) throws ConfigLoadException;

    /**
     * Load configuration from a File object.
     * Automatically detects format based on file extension.
     *
     * @param file Configuration file
     * @return Map containing the loaded configuration
     * @throws ConfigLoadException if the file cannot be read or parsed
     */
    Map<String, Object> loadFromFile(File file) throws ConfigLoadException;

    /**
     * Load configuration from an InputStream (e.g., classpath resources).
     * Requires explicit format specification.
     *
     * @param inputStream Input stream containing configuration data
     * @param format Configuration format ("yaml" or "json")
     * @return Map containing the loaded configuration
     * @throws ConfigLoadException if the stream cannot be parsed
     */
    Map<String, Object> loadFromStream(InputStream inputStream, String format) throws ConfigLoadException;

    /**
     * Load YAML configuration specifically.
     *
     * @param filePath Path to the YAML configuration file
     * @return Map containing the loaded configuration
     * @throws ConfigLoadException if the file cannot be read or parsed
     */
    Map<String, Object> loadYaml(String filePath) throws ConfigLoadException;

    /**
     * Load JSON configuration specifically.
     *
     * @param filePath Path to the JSON configuration file
     * @return Map containing the loaded configuration
     * @throws ConfigLoadException if the file cannot be read or parsed
     */
    Map<String, Object> loadJson(String filePath) throws ConfigLoadException;

    /**
     * Validate the loaded configuration against schema/rules.
     *
     * @param config Configuration map to validate
     * @return true if configuration is valid
     * @throws ConfigValidationException if validation fails
     */
    boolean validate(Map<String, Object> config) throws ConfigValidationException;

    /**
     * Get a configuration value by key path (e.g., "server.port", "brokers.mqtt.host").
     *
     * @param keyPath Dot-separated key path
     * @param defaultValue Default value if key doesn't exist
     * @return Configuration value or defaultValue if not found
     */
    Object getValue(String keyPath, Object defaultValue);

    /**
     * Get a configuration value by key path.
     *
     * @param keyPath Dot-separated key path
     * @return Configuration value
     * @throws ConfigKeyException if key doesn't exist
     */
    Object getValue(String keyPath) throws ConfigKeyException;

}
