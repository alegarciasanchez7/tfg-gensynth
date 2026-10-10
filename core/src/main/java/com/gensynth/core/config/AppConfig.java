package com.gensynth.core.config;

/**
 * Configuración central de la aplicación.
 * Carga parámetros desde application.yml/json incluyendo configuración del thread pool.
 */
public class AppConfig {

    // WebSocket defaults
    private static final String DEFAULT_WEBSOCKET_HOST = "localhost";
    private static final int DEFAULT_WEBSOCKET_PORT = 8765;

    // Thread Pool defaults (conservative for secondary application)
    private static final int DEFAULT_THREAD_POOL_CORE_SIZE = 2;
    private static final int DEFAULT_THREAD_POOL_MAX_SIZE = 4;
    private static final long DEFAULT_THREAD_POOL_KEEP_ALIVE_SECONDS = 60;

    // WebSocket configuration
    private String websocketHost;
    private int websocketPort;

    // Thread Pool configuration
    private int threadPoolCoreSize;
    private int threadPoolMaxSize;
    private long threadPoolKeepAliveSeconds;

    public AppConfig() {
        this.websocketHost = DEFAULT_WEBSOCKET_HOST;
        this.websocketPort = DEFAULT_WEBSOCKET_PORT;
        this.threadPoolCoreSize = DEFAULT_THREAD_POOL_CORE_SIZE;
        this.threadPoolMaxSize = DEFAULT_THREAD_POOL_MAX_SIZE;
        this.threadPoolKeepAliveSeconds = DEFAULT_THREAD_POOL_KEEP_ALIVE_SECONDS;
    }

    // ============ WebSocket Configuration ============

    public String getWebsocketHost() {
        return websocketHost;
    }

    public void setWebsocketHost(String websocketHost) {
        this.websocketHost = websocketHost;
    }

    public int getWebsocketPort() {
        return websocketPort;
    }

    public void setWebsocketPort(int websocketPort) {
        this.websocketPort = websocketPort;
    }

    // ============ Thread Pool Configuration ============

    /**
     * Get the core pool size for the thread pool.
     * This is the number of threads to keep alive even if idle.
     * Conservative default (2) to avoid contention with main application.
     */
    public int getThreadPoolCoreSize() {
        return threadPoolCoreSize;
    }

    public void setThreadPoolCoreSize(int threadPoolCoreSize) {
        validateThreadPoolSize(threadPoolCoreSize, threadPoolMaxSize);
        this.threadPoolCoreSize = threadPoolCoreSize;
    }

    /**
     * Get the maximum pool size for the thread pool.
     * This is the maximum number of threads that can be created.
     * Default (4) is 2x core size to handle I/O spikes.
     */
    public int getThreadPoolMaxSize() {
        return threadPoolMaxSize;
    }

    public void setThreadPoolMaxSize(int threadPoolMaxSize) {
        validateThreadPoolSize(threadPoolCoreSize, threadPoolMaxSize);
        this.threadPoolMaxSize = threadPoolMaxSize;
    }

    /**
     * Get the keep-alive time in seconds for idle threads.
     * Default (60) means threads are removed after 60 seconds of inactivity.
     */
    public long getThreadPoolKeepAliveSeconds() {
        return threadPoolKeepAliveSeconds;
    }

    public void setThreadPoolKeepAliveSeconds(long threadPoolKeepAliveSeconds) {
        if (threadPoolKeepAliveSeconds <= 0) {
            throw new IllegalArgumentException(
                String.format("keepAliveSeconds must be positive, got: %d", threadPoolKeepAliveSeconds)
            );
        }
        this.threadPoolKeepAliveSeconds = threadPoolKeepAliveSeconds;
    }

    // ============ FlowEngine Configuration ============

    /**
     * Enable or disable the FlowEngine.
     * Default: true (enabled)
     */
    private boolean flowEngineEnabled = true;

    /**
     * Number of virtual devices to simulate.
     * Each device runs on a virtual thread.
     * Default: 10
     */
    private int deviceCount = 10;

    /**
     * Simulation interval in milliseconds for device data generation.
     * How often each device generates new data.
     * Default: 1000 (1 second)
     */
    private long simulationInterval = 1000;

    /**
     * Enable virtual threads for data generation.
     * Recommended: true for best scalability (millions of devices).
     * Default: true
     */
    private boolean useVirtualThreads = true;

    // Getters and Setters for FlowEngine Configuration

    public boolean isFlowEngineEnabled() {
        return flowEngineEnabled;
    }

    public void setFlowEngineEnabled(boolean flowEngineEnabled) {
        this.flowEngineEnabled = flowEngineEnabled;
    }

    public int getDeviceCount() {
        if (deviceCount < 1) {
            throw new IllegalArgumentException(
                String.format("deviceCount must be at least 1, got: %d", deviceCount)
            );
        }
        return deviceCount;
    }

    public void setDeviceCount(int deviceCount) {
        if (deviceCount < 1) {
            throw new IllegalArgumentException(
                String.format("deviceCount must be at least 1, got: %d", deviceCount)
            );
        }
        this.deviceCount = deviceCount;
    }

    /**
     * Get the simulation interval in milliseconds.
     * This is how often devices generate new data points.
     */
    public long getSimulationInterval() {
        if (simulationInterval < 1) {
            throw new IllegalArgumentException(
                String.format("simulationInterval must be at least 1ms, got: %d", simulationInterval)
            );
        }
        return simulationInterval;
    }

    public void setSimulationInterval(long simulationInterval) {
        if (simulationInterval < 1) {
            throw new IllegalArgumentException(
                String.format("simulationInterval must be at least 1ms, got: %d", simulationInterval)
            );
        }
        this.simulationInterval = simulationInterval;
    }

    /**
     * Check if virtual threads are enabled.
     * Virtual threads are recommended for Gen-Synth (millions of lightweight threads).
     * Falls back to traditional ThreadPool if false.
     */
    public boolean useVirtualThreads() {
        return useVirtualThreads;
    }

    public void setUseVirtualThreads(boolean useVirtualThreads) {
        this.useVirtualThreads = useVirtualThreads;
    }

    // ============ Plugin Management Configuration ============

    /**
     * Directory where external plugin JARs are stored.
     * Relative to the working directory.
     * Default: "plugins"
     */
    private String pluginsDirectory = "plugins";

    /**
     * Get the plugins directory path.
     *
     * @return path to the directory containing external plugin JARs
     */
    public String getPluginsDirectory() {
        return pluginsDirectory;
    }

    public void setPluginsDirectory(String pluginsDirectory) {
        if (pluginsDirectory == null || pluginsDirectory.isBlank()) {
            throw new IllegalArgumentException("pluginsDirectory cannot be null or blank");
        }
        this.pluginsDirectory = pluginsDirectory;
    }

    // ============ Validation Methods ============

    /**
     * Validate that coreSize <= maxSize.
     * Called when either thread pool size is modified.
     */
    private void validateThreadPoolSize(int coreSize, int maxSize) {
        if (coreSize < 1) {
            throw new IllegalArgumentException(
                String.format("coreSize must be at least 1, got: %d", coreSize)
            );
        }
        if (maxSize < 1) {
            throw new IllegalArgumentException(
                String.format("maxSize must be at least 1, got: %d", maxSize)
            );
        }
        if (coreSize > maxSize) {
            throw new IllegalArgumentException(
                String.format("coreSize (%d) cannot be greater than maxSize (%d)", coreSize, maxSize)
            );
        }
    }
}
