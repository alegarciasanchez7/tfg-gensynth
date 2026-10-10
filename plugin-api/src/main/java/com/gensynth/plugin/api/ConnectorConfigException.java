package com.gensynth.plugin.api;

import java.util.List;

/**
 * Thrown by {@link ConnectorConfig#resolve} when the configuration of a connector is invalid.
 */
public class ConnectorConfigException extends IllegalArgumentException {

    private final List<String> errors;

    /**
     * @param errors one readable message per invalid field
     */
    public ConnectorConfigException(List<String> errors) {
        super(String.join("; ", errors));
        this.errors = List.copyOf(errors);
    }

    /**
     * @return one readable message per invalid field, e.g. "Host is required"
     */
    public List<String> getErrors() {
        return errors;
    }
}
