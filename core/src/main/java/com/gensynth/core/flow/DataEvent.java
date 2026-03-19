package com.gensynth.core.flow;

/**
 * Immutable data event representing a single data point from a device variable.
 *
 * Contains:
 * - Timestamp: When the event was generated
 * - Device ID: Which device generated it
 * - Variable ID: Which variable within the device
 * - Value: The actual data value
 * - Metadata: Optional contextual information
 */
public class DataEvent {

    private final long timestamp;
    private final String deviceId;
    private final String variableId;
    private final Object value;
    private final String dataType;

    /**
     * Constructor for DataEvent.
     *
     * @param timestamp When this event was generated (System.currentTimeMillis())
     * @param deviceId Unique identifier for the device (e.g., "device_0")
     * @param variableId Variable within the device (e.g., "temperature")
     * @param value The actual data value (e.g., 23.5)
     * @param dataType Type of the value (e.g., "double", "int", "string")
     */
    public DataEvent(long timestamp, String deviceId, String variableId,
                     Object value, String dataType) {
        if (timestamp <= 0) {
            throw new IllegalArgumentException("timestamp must be positive");
        }
        if (deviceId == null || deviceId.isEmpty()) {
            throw new IllegalArgumentException("deviceId cannot be null or empty");
        }
        if (variableId == null || variableId.isEmpty()) {
            throw new IllegalArgumentException("variableId cannot be null or empty");
        }
        if (value == null) {
            throw new IllegalArgumentException("value cannot be null");
        }

        this.timestamp = timestamp;
        this.deviceId = deviceId;
        this.variableId = variableId;
        this.value = value;
        this.dataType = dataType;
    }

    /**
     * Get the timestamp when this event was generated.
     */
    public long getTimestamp() {
        return timestamp;
    }

    /**
     * Get the device ID that generated this event.
     */
    public String getDeviceId() {
        return deviceId;
    }

    /**
     * Get the variable ID within the device.
     */
    public String getVariableId() {
        return variableId;
    }

    /**
     * Get the actual data value.
     */
    public Object getValue() {
        return value;
    }

    /**
     * Get the data type of the value.
     */
    public String getDataType() {
        return dataType;
    }

    /**
     * Create a unique key for this event (device + variable).
     */
    public String getKey() {
        return deviceId + ":" + variableId;
    }

    /**
     * Calculate latency from generation to now (in milliseconds).
     */
    public long getLatencyMs() {
        return System.currentTimeMillis() - timestamp;
    }

    @Override
    public String toString() {
        return String.format("DataEvent{device=%s, var=%s, value=%s, ts=%d}",
            deviceId, variableId, value, timestamp);
    }
}
