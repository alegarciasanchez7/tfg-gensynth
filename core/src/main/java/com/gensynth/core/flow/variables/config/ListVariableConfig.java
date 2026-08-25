package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates values from a predefined list using different selection strategies:
 * WEIGHTED_RANDOM, SEQUENTIAL, SHUFFLE, and MARKOV_CHAIN.
 * Supports embedded sub-variable generators for polymorphic/heterogeneous list items.
 */
public class ListVariableConfig extends VariableConfiguration {

    public enum SelectionStrategy {
        WEIGHTED_RANDOM,
        SEQUENTIAL,
        SHUFFLE,
        MARKOV_CHAIN
    }

    public static class ListItem {
        private String id;
        private Object value;
        private double weight = 1.0;
        private VariableConfiguration embeddedConfig;

        public ListItem() {
            this.id = UUID.randomUUID().toString();
        }

        public ListItem(String id, Object value, double weight) {
            this.id = (id != null && !id.isEmpty()) ? id : UUID.randomUUID().toString();
            this.value = value;
            this.weight = weight;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public Object getValue() {
            return value;
        }

        public void setValue(Object value) {
            this.value = value;
        }

        public double getWeight() {
            return weight;
        }

        public void setWeight(double weight) {
            this.weight = weight;
        }

        public VariableConfiguration getEmbeddedConfig() {
            return embeddedConfig;
        }

        public void setEmbeddedConfig(VariableConfiguration embeddedConfig) {
            // Enforcement: Max 1 level of embedded ListVariableConfig nesting
            if (embeddedConfig instanceof ListVariableConfig) {
                ListVariableConfig innerList = (ListVariableConfig) embeddedConfig;
                for (ListItem innerItem : innerList.getItems()) {
                    if (innerItem.getEmbeddedConfig() != null) {
                        throw new IllegalArgumentException("Maximum 1 level of nested list variable generators is supported.");
                    }
                }
            }
            this.embeddedConfig = embeddedConfig;
        }

        public Object generateValue() {
            if (embeddedConfig != null) {
                return embeddedConfig.generateNextValue();
            }
            return value;
        }
    }

    private SelectionStrategy selectionStrategy = SelectionStrategy.WEIGHTED_RANDOM;
    private List<ListItem> items = new ArrayList<>();
    private Map<String, Map<String, Double>> transitionMatrix = new HashMap<>();

    // Runtime state
    private int currentIndex = 0;
    private List<Integer> shuffleIndices = new ArrayList<>();
    private int currentShufflePointer = 0;
    private String currentMarkovStateId = null;

    // Fast cache arrays for WEIGHTED_RANDOM
    private double[] cachedWeights;
    private double cachedTotalWeight = 0.0;

    // Anomaly state
    private long cachedWhenTicks = -1;
    private boolean isAnomalous;
    private long anomalyStartTick;

    public ListVariableConfig() {
        this.type = VariableType.LIST;
        this.pattern = GenerationPattern.RANDOM_FROM_LIST;
    }

    public SelectionStrategy getSelectionStrategy() {
        return selectionStrategy;
    }

    public ListVariableConfig selectionStrategy(SelectionStrategy strategy) {
        this.selectionStrategy = strategy;
        if (strategy == SelectionStrategy.MARKOV_CHAIN) {
            this.pattern = GenerationPattern.MARKOV_CHAIN;
        } else if (strategy == SelectionStrategy.SEQUENTIAL) {
            this.pattern = GenerationPattern.SEQUENTIAL_FROM_LIST;
        } else if (strategy == SelectionStrategy.SHUFFLE) {
            this.pattern = GenerationPattern.SEQUENTIAL_FROM_LIST;
        } else {
            this.pattern = GenerationPattern.RANDOM_FROM_LIST;
        }
        return this;
    }

    public List<ListItem> getItems() {
        return items;
    }

    public ListVariableConfig items(List<ListItem> newItems) {
        this.items = (newItems != null) ? new ArrayList<>(newItems) : new ArrayList<>();
        rebuildCache();
        return this;
    }

    public ListVariableConfig shuffle(boolean enabled) {
        if (enabled) {
            this.selectionStrategy = SelectionStrategy.SHUFFLE;
            this.pattern = GenerationPattern.SEQUENTIAL_FROM_LIST;
        }
        return this;
    }

    public boolean isShuffle() {
        return this.selectionStrategy == SelectionStrategy.SHUFFLE;
    }

    public List<Object> getSourceList() {
        List<Object> res = new ArrayList<>();
        if (items != null) {
            for (ListItem item : items) {
                res.add(item.getValue() != null ? item.getValue() : item.getId());
            }
        }
        return res;
    }

    public int getSourceListSize() {
        return items != null ? items.size() : 0;
    }

    public int getCurrentIndex() {
        return currentIndex;
    }

    public ListVariableConfig addItem(ListItem item) {
        if (this.items == null) {
            this.items = new ArrayList<>();
        }
        this.items.add(item);
        rebuildCache();
        return this;
    }

    public ListVariableConfig addItem(Object item) {
        if (item instanceof ListItem) {
            return addItem((ListItem) item);
        }
        return addItem(new ListItem(null, item, 1.0));
    }

    /**
     * Legacy support method for raw items list.
     */
    public ListVariableConfig list(List<?> rawItems) {
        if (rawItems == null || rawItems.isEmpty()) {
            throw new IllegalArgumentException("Source list cannot be null or empty");
        }
        List<ListItem> parsedItems = new ArrayList<>();
        for (Object obj : rawItems) {
            if (obj instanceof ListItem) {
                parsedItems.add((ListItem) obj);
            } else if (obj instanceof WeightedItem) {
                WeightedItem wi = (WeightedItem) obj;
                parsedItems.add(new ListItem(null, wi.value, wi.weight));
            } else if (obj instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) obj;
                String itemId = map.containsKey("id") ? String.valueOf(map.get("id")) : null;
                Object val = map.containsKey("value") ? map.get("value") : obj;
                double w = map.containsKey("weight") ? ((Number) map.get("weight")).doubleValue() : 1.0;
                parsedItems.add(new ListItem(itemId, val, w));
            } else {
                parsedItems.add(new ListItem(null, obj, 1.0));
            }
        }
        return items(parsedItems);
    }

    public Map<String, Map<String, Double>> getTransitionMatrix() {
        return transitionMatrix;
    }

    public ListVariableConfig transitionMatrix(Map<String, Map<String, Double>> matrix) {
        this.transitionMatrix = (matrix != null) ? new HashMap<>(matrix) : new HashMap<>();
        return this;
    }

    private void rebuildCache() {
        int size = items.size();
        cachedWeights = new double[size];
        cachedTotalWeight = 0.0;
        for (int i = 0; i < size; i++) {
            double w = items.get(i).getWeight();
            cachedWeights[i] = w;
            cachedTotalWeight += w;
        }
        resetRuntimeState();
    }

    private void resetRuntimeState() {
        this.currentIndex = 0;
        this.currentShufflePointer = 0;
        this.shuffleIndices.clear();
        if (items != null && !items.isEmpty()) {
            for (int i = 0; i < items.size(); i++) {
                shuffleIndices.add(i);
            }
            Collections.shuffle(shuffleIndices);
            this.currentMarkovStateId = items.get(0).getId();
        } else {
            this.currentMarkovStateId = null;
        }
    }

    @Override
    public List<String> validate() {
        List<String> errors = new ArrayList<>();
        if (items == null || items.isEmpty()) {
            return errors;
        }

        boolean hasExplicitWeights = false;
        boolean hasPositiveWeight = false;
        for (ListItem item : items) {
            if (item.getWeight() != 1.0) {
                hasExplicitWeights = true;
            }
            if (item.getWeight() < 0) {
                errors.add("Weights cannot be negative. Found negative weight: " + item.getWeight());
            }
            if (item.getWeight() > 0) {
                hasPositiveWeight = true;
            }
        }

        if (hasExplicitWeights && !hasPositiveWeight) {
            errors.add("List variable has weights config but all weights are zero or negative");
        }

        if (selectionStrategy == SelectionStrategy.MARKOV_CHAIN) {
            if (transitionMatrix == null || transitionMatrix.isEmpty()) {
                errors.add("Markov chain strategy requires a non-empty transition matrix");
            }
        }

        // Validate embedded configurations
        for (ListItem item : items) {
            if (item.getEmbeddedConfig() != null) {
                List<String> subErrors = item.getEmbeddedConfig().validate();
                for (String err : subErrors) {
                    errors.add("Embedded item (" + item.getId() + ") error: " + err);
                }
            }
        }

        return errors;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();

        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }

        if (pattern == GenerationPattern.CONSTANT_FROM_LIST) {
            return items.get(0).generateValue();
        }

        ListItem selectedItem = selectNextItem();
        return (selectedItem != null) ? selectedItem.generateValue() : null;
    }

    private ListItem selectNextItem() {
        if (items.isEmpty()) return null;

        if (pattern == GenerationPattern.SEQUENTIAL_FROM_LIST && selectionStrategy != SelectionStrategy.SHUFFLE) {
            return selectSequential();
        }
        if (pattern == GenerationPattern.CONSTANT_FROM_LIST) {
            return items.get(0);
        }

        switch (selectionStrategy) {
            case SEQUENTIAL:
                return selectSequential();
            case SHUFFLE:
                return selectShuffle();
            case MARKOV_CHAIN:
                return selectMarkovChain();
            case WEIGHTED_RANDOM:
            default:
                return selectWeightedRandom();
        }
    }

    private ListItem selectSequential() {
        if (currentIndex >= items.size()) {
            currentIndex = 0;
        }
        ListItem item = items.get(currentIndex);
        currentIndex = (currentIndex + 1) % items.size();
        return item;
    }

    private ListItem selectShuffle() {
        if (shuffleIndices.size() != items.size() || currentShufflePointer >= shuffleIndices.size()) {
            shuffleIndices.clear();
            for (int i = 0; i < items.size(); i++) {
                shuffleIndices.add(i);
            }
            Collections.shuffle(shuffleIndices);
            currentShufflePointer = 0;
        }
        int itemIndex = shuffleIndices.get(currentShufflePointer);
        currentShufflePointer++;
        return items.get(itemIndex);
    }

    private ListItem selectWeightedRandom() {
        if (cachedWeights == null || cachedWeights.length != items.size()) {
            rebuildCache();
        }
        if (cachedTotalWeight <= 0) {
            int randomIndex = ThreadLocalRandom.current().nextInt(items.size());
            return items.get(randomIndex);
        }

        double randomWeight = ThreadLocalRandom.current().nextDouble() * cachedTotalWeight;
        double currentSum = 0.0;
        for (int i = 0; i < items.size(); i++) {
            currentSum += cachedWeights[i];
            if (randomWeight <= currentSum) {
                return items.get(i);
            }
        }
        return items.get(items.size() - 1);
    }

    private ListItem selectMarkovChain() {
        if (currentMarkovStateId == null) {
            currentMarkovStateId = items.get(0).getId();
        }

        // Find current item corresponding to current state
        ListItem currentItem = null;
        for (ListItem item : items) {
            if (item.getId().equals(currentMarkovStateId)) {
                currentItem = item;
                break;
            }
        }
        if (currentItem == null) {
            currentItem = items.get(0);
            currentMarkovStateId = currentItem.getId();
        }

        // Calculate next state for subsequent call
        Map<String, Double> transitions = transitionMatrix.get(currentMarkovStateId);
        if (transitions != null && !transitions.isEmpty()) {
            double sum = 0.0;
            for (double p : transitions.values()) {
                if (p > 0) sum += p;
            }

            if (sum > 0) {
                double randomVal = ThreadLocalRandom.current().nextDouble() * sum;
                double currentSum = 0.0;
                for (Map.Entry<String, Double> entry : transitions.entrySet()) {
                    if (entry.getValue() <= 0) continue;
                    currentSum += entry.getValue();
                    if (randomVal <= currentSum) {
                        currentMarkovStateId = entry.getKey();
                        break;
                    }
                }
            }
        }

        return currentItem;
    }

    @Override
    public void reset() {
        tickCounter = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
        cachedWhenTicks = -1;
        resetRuntimeState();
        for (ListItem item : items) {
            if (item.getEmbeddedConfig() != null) {
                item.getEmbeddedConfig().reset();
            }
        }
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(10);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("selectionStrategy", selectionStrategy.toString());
        map.put("listSize", items != null ? items.size() : 0);
        map.put("currentIndex", currentIndex);
        map.put("shuffle", isShuffle());
        map.put("transitionMatrix", transitionMatrix);

        if (items != null) {
            List<Map<String, Object>> serializedItems = new ArrayList<>();
            for (ListItem item : items) {
                Map<String, Object> itemMap = new HashMap<>();
                itemMap.put("id", item.getId());
                itemMap.put("value", item.getValue());
                itemMap.put("weight", item.getWeight());
                if (item.getEmbeddedConfig() != null) {
                    itemMap.put("isEmbedded", true);
                    itemMap.put("embeddedType", item.getEmbeddedConfig().getType().name());
                    itemMap.put("embeddedConfig", item.getEmbeddedConfig().toMap());
                }
                serializedItems.add(itemMap);
            }
            map.put("items", serializedItems);
        }

        if (anomalyConfig != null && anomalyConfig.isEnabled()) {
            map.put("anomalyEnabled", true);
            map.put("anomalyType", anomalyConfig.getType().toString());
        }

        return map;
    }

    @Override
    public ListVariableConfig identifier(String id) {
        this.identifier = id;
        return this;
    }

    @Override
    public ListVariableConfig pattern(GenerationPattern p) {
        this.pattern = p;
        return this;
    }

    @Override
    public ListVariableConfig defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    @Override
    public ListVariableConfig anomaly(AnomalyConfig config) {
        this.anomalyConfig = config;
        this.cachedWhenTicks = -1;
        return this;
    }

    private void checkAnomalyCondition() {
        if (anomalyConfig == null || !anomalyConfig.isEnabled()) {
            isAnomalous = false;
            return;
        }

        if (isAnomalous) {
            long elapsedTicks = tickCounter - anomalyStartTick;
            handleAnomalyDuration(elapsedTicks);
            return;
        }

        boolean shouldTrigger = false;
        if (anomalyConfig.getWhenTicks() > 0) {
            if (cachedWhenTicks == -1) {
                cachedWhenTicks = anomalyConfig.getWhenTicks();
            }
            shouldTrigger = (tickCounter == cachedWhenTicks);
        } else if (anomalyConfig.getProbabilityRatio() > 0) {
            double random100 = ThreadLocalRandom.current().nextDouble(100.0);
            shouldTrigger = (random100 < anomalyConfig.getProbabilityRatio());
        }

        if (shouldTrigger) {
            isAnomalous = true;
            anomalyStartTick = tickCounter;
        }
    }

    private void handleAnomalyDuration(long elapsedTicks) {
        switch (anomalyConfig.getType()) {
            case MAKE_AND_BACK:
                if (elapsedTicks >= 1) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
            case MAKE_AND_KEEP:
                break;
            case MAKE_AND_KEEP_N_TIMES:
                if (elapsedTicks >= anomalyConfig.getKeepNTimes()) {
                    isAnomalous = false;
                    cachedWhenTicks = -1;
                }
                break;
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
