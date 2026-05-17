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
    private double[] weightsArray;         // Weights for random selection
    private boolean hasWeights = false;    // True if at least one weight is not 1.0
    private double totalWeight = 0.0;
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
     * Can contain any type of objects or WeightedItems.
     */
    public ListVariableConfig list(List<?> items) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("Source list cannot be null or empty");
        }
        this.sourceList = new ArrayList<>(items);  // Defensive copy
        this.sourceSize = this.sourceList.size();
        this.sourceArray = new Object[sourceSize];
        this.weightsArray = new double[sourceSize];
        this.hasWeights = false;
        this.totalWeight = 0.0;

        for (int i = 0; i < sourceSize; i++) {
            Object item = this.sourceList.get(i);
            if (item instanceof WeightedItem) {
                WeightedItem wi = (WeightedItem) item;
                this.sourceArray[i] = wi.value;
                this.weightsArray[i] = wi.weight;
                if (wi.weight != 1.0) this.hasWeights = true;
                this.totalWeight += wi.weight;
            } else if (item instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) item;
                if (map.containsKey("value") && map.containsKey("weight")) {
                    this.sourceArray[i] = map.get("value");
                    double w = ((Number) map.get("weight")).doubleValue();
                    this.weightsArray[i] = w;
                    if (w != 1.0) this.hasWeights = true;
                    this.totalWeight += w;
                } else {
                    this.sourceArray[i] = item;
                    this.weightsArray[i] = 1.0;
                    this.totalWeight += 1.0;
                }
            } else {
                this.sourceArray[i] = item;
                this.weightsArray[i] = 1.0;
                this.totalWeight += 1.0;
            }
        }

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
        // Re-initialize array
        return list(this.sourceList);
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
     * Random selection: pick random item each time, respecting weights if provided.
     */
    private Object generateRandom() {
        if (!hasWeights) {
            int randomIndex = ThreadLocalRandom.current().nextInt(sourceSize);
            return sourceArray[randomIndex];
        }

        double randomWeight = ThreadLocalRandom.current().nextDouble() * totalWeight;
        double currentWeight = 0.0;
        for (int i = 0; i < sourceSize; i++) {
            currentWeight += weightsArray[i];
            if (randomWeight <= currentWeight) {
                return sourceArray[i];
            }
        }
        return sourceArray[sourceSize - 1]; // Fallback to last item
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

    public static class WeightedItem {
        public Object value;
        public double weight;

        public WeightedItem(Object value, double weight) {
            this.value = value;
            this.weight = weight;
        }
    }
}
