package com.gensynth.core.flow.variables;

/**
* Enum that defines the types of anomalies that can be injected into variables.
*/
public enum AnomalyType {
    MAKE_AND_BACK("Anomaly and return to normal pattern"),
    MAKE_AND_KEEP("Anomaly and keep it forever"),
    MAKE_AND_KEEP_N_TIMES("Anomaly and repeat N times");

    private final String description;

    AnomalyType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}
