package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates values from a predefined list using different selection strategies.
 * Can iterate sequentially, randomly pick, or maintain constant value.
 * Supports optional shuffling for sequential mode.
 */
public class ListVariableConfig extends VariableConfiguration {
    
    // Constants
    private static final boolean DEFAULT_SHUFFLE = false;
    
    // Source data
    private List<?> sourceList;            // The items to select from
    private Object[] sourceArray;          // Fast access for random/sequential selection
    private int sourceSize;                // Cached size for hot path
    private int currentIndex;              // Current position for sequential mode
    private boolean shuffle;               // Whether to shuffle sequential list
    private Object[] shuffledArray;        // Cache for shuffled sequence
    private boolean needsReshuffle;        // Flag for cache invalidation

    // Anomaly state
    private long cachedWhenTicks = -1;     // -1 means not calculated
    private boolean isAnomalous;
    private long anomalyStartTick;

    public ListVariableConfig() {
        this.type = VariableType.LIST;
        this.pattern = GenerationPattern.RANDOM_FROM_LIST;
        this.sourceList = new ArrayList<>();
        this.sourceArray = new Object[0];
        this.sourceSize = 0;
        this.currentIndex = 0;
        this.shuffle = DEFAULT_SHUFFLE;
        this.needsReshuffle = true;
        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    /**
     * Set the source list for this variable.
     * Can contain any type of objects (Integer, String, Double, custom objects).
     */
    public ListVariableConfig list(List<?> items) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("Source list cannot be null or empty");
        }
        this.sourceList = new ArrayList<>(items);  // Defensive copy
        this.sourceArray = this.sourceList.toArray();
        this.sourceSize = this.sourceArray.length;
        this.currentIndex = 0;
        this.needsReshuffle = true;
        return this;
    }

    /**
     * Add items to the source list.
     */
    @SuppressWarnings("unchecked")
    public ListVariableConfig addItem(Object item) {
        if (sourceList == null) {
            sourceList = new ArrayList<>();
        }
        ((List<Object>)sourceList).add(item);
        this.sourceArray = this.sourceList.toArray();
        this.sourceSize = this.sourceArray.length;
        needsReshuffle = true;
        return this;
    }

    /**
     * Enable or disable shuffling for sequential mode.
     */
    public ListVariableConfig shuffle(boolean enabled) {
        this.shuffle = enabled;
        this.needsReshuffle = enabled;
        return this;
    }

    /**
     * Get the source list size (for testing/monitoring).
     */
    public int getSourceListSize() {
        return sourceSize;
    }

    /**
     * Get current index (for testing).
     */
    public int getCurrentIndex() {
        return currentIndex;
    }

    /**
     * Get source list reference (for testing).
     */
    public List<?> getSourceList() {
        return sourceList;
    }

    /**
     * Check if shuffle is enabled.
     */
    public boolean isShuffle() {
        return shuffle;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();
        
        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }
        
        if (sourceSize == 0) {
            return null;
        }
        
        switch (pattern) {
            case SEQUENTIAL_FROM_LIST:
                return generateSequential();
            case RANDOM_FROM_LIST:
                return generateRandom();
            case CONSTANT_FROM_LIST:
                return generateConstant();
            default:
                return sourceList.get(0);
        }
    }

    /**
     * Sequential iteration through list: item1 → item2 → item3 → item1→...
     */
    private Object generateSequential() {
        if (shuffle && needsReshuffle) {
            shuffledArray = Arrays.copyOf(sourceArray, sourceSize);
            shuffleArray(shuffledArray);
            needsReshuffle = false;
        }
        
        Object[] itemArray = shuffle ? shuffledArray : sourceArray;
        Object value = itemArray[currentIndex];
        currentIndex++;
        if (currentIndex == sourceSize) {
            currentIndex = 0;
        }
        return value;
    }

    /**
     * Random selection: pick random item each time.
     */
    private Object generateRandom() {
        int randomIndex = ThreadLocalRandom.current().nextInt(sourceSize);
        return sourceArray[randomIndex];
    }

    /**
     * Constant mode: always return the first element.
     */
    private Object generateConstant() {
        return sourceArray[0];
    }

    @Override
    public void reset() {
        currentIndex = 0;
        tickCounter = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
        cachedWhenTicks = -1;
        needsReshuffle = shuffle;  // Reset shuffle state
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(8);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("listSize", sourceList != null ? sourceList.size() : 0);
        map.put("currentIndex", currentIndex);
        map.put("shuffle", shuffle);
        
        if (anomalyConfig != null && anomalyConfig.isEnabled()) {
            map.put("anomalyEnabled", true);
            map.put("anomalyType", anomalyConfig.getType().toString());
        }
        
        return map;
    }

    /**
     * Builder method for identifier.
     */
    @Override
    public ListVariableConfig identifier(String id) {
        this.identifier = id;
        return this;
    }

    /**
     * Builder method for pattern.
     */
    @Override
    public ListVariableConfig pattern(GenerationPattern p) {
        this.pattern = p;
        return this;
    }

    /**
     * Builder method for default value.
     */
    @Override
    public ListVariableConfig defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    /**
     * Builder method for anomaly configuration.
     */
    @Override
    public ListVariableConfig anomaly(AnomalyConfig config) {
        this.anomalyConfig = config;
        this.cachedWhenTicks = -1;  // Reset anomaly cache
        return this;
    }

    /**
     * Check if anomaly condition is met (tick-based or probability-based).
     */
    private void checkAnomalyCondition() {
        if (anomalyConfig == null || !anomalyConfig.isEnabled()) {
            isAnomalous = false;
            return;
        }

        // Already anomalous - check if duration expired
        if (isAnomalous) {
            long elapsedTicks = tickCounter - anomalyStartTick;
            handleAnomalyDuration(elapsedTicks);
            return;
        }

        // Not anomalous - check if we should trigger
        boolean shouldTrigger = false;

        if (anomalyConfig.getWhenTicks() > 0) {
            // Tick-based: trigger at specific tick
            if (cachedWhenTicks == -1) {
                cachedWhenTicks = anomalyConfig.getWhenTicks();
            }
            shouldTrigger = (tickCounter == cachedWhenTicks);
        } else if (anomalyConfig.getProbabilityRatio() > 0) {
            // Probability-based: trigger with probability
            double random100 = ThreadLocalRandom.current().nextDouble(100.0);
            shouldTrigger = (random100 < anomalyConfig.getProbabilityRatio());
        }

        if (shouldTrigger) {
            isAnomalous = true;
            anomalyStartTick = tickCounter;
        }
    }

    /**
     * Handle anomaly duration logic.
     */
    private void handleAnomalyDuration(long elapsedTicks) {
        switch (anomalyConfig.getType()) {
            case MAKE_AND_BACK:
                if (elapsedTicks >= 1) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
            case MAKE_AND_KEEP:
                // Stay anomalous indefinitely
                break;
            case MAKE_AND_KEEP_N_TIMES:
                if (elapsedTicks >= anomalyConfig.getKeepNTimes()) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
        }
    }

    private void shuffleArray(Object[] array) {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int i = array.length - 1; i > 0; i--) {
            int swapIndex = random.nextInt(i + 1);
            Object temp = array[i];
            array[i] = array[swapIndex];
            array[swapIndex] = temp;
        }
    }

}
