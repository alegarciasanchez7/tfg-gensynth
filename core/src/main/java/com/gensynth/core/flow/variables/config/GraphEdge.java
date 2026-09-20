package com.gensynth.core.flow.variables.config;

import java.util.Objects;

/**
 * Represents a connection (edge) between two nodes in a graph route.
 */
public class GraphEdge {

    private String id;
    private String fromNodeId;
    private String toNodeId;
    private boolean bidirectional;

    /**
     * Default constructor.
     */
    public GraphEdge() {
        this.id = "";
        this.fromNodeId = "";
        this.toNodeId = "";
        this.bidirectional = true;
    }

    /**
     * Constructs a GraphEdge with specified parameters.
     *
     * @param id            Unique identifier for edge
     * @param fromNodeId    Origin node ID
     * @param toNodeId      Destination node ID
     * @param bidirectional True if movement can occur in both directions
     */
    public GraphEdge(String id, String fromNodeId, String toNodeId, boolean bidirectional) {
        this.id = id;
        this.fromNodeId = fromNodeId;
        this.toNodeId = toNodeId;
        this.bidirectional = bidirectional;
    }

    /**
     * Gets edge ID.
     *
     * @return edge ID
     */
    public String getId() {
        return id;
    }

    /**
     * Sets edge ID.
     *
     * @param id edge ID
     */
    public void setId(String id) {
        this.id = id;
    }

    /**
     * Gets origin node ID.
     *
     * @return origin node ID
     */
    public String getFromNodeId() {
        return fromNodeId;
    }

    /**
     * Sets origin node ID.
     *
     * @param fromNodeId origin node ID
     */
    public void setFromNodeId(String fromNodeId) {
        this.fromNodeId = fromNodeId;
    }

    /**
     * Gets destination node ID.
     *
     * @return destination node ID
     */
    public String getToNodeId() {
        return toNodeId;
    }

    /**
     * Sets destination node ID.
     *
     * @param toNodeId destination node ID
     */
    public void setToNodeId(String toNodeId) {
        this.toNodeId = toNodeId;
    }

    /**
     * Returns whether edge allows bidirectional traversal.
     *
     * @return true if bidirectional, false if directed
     */
    public boolean isBidirectional() {
        return bidirectional;
    }

    /**
     * Sets whether edge allows bidirectional traversal.
     *
     * @param bidirectional true if bidirectional
     */
    public void setBidirectional(boolean bidirectional) {
        this.bidirectional = bidirectional;
    }

    /**
     * Checks if this edge connects the specified node ID to another.
     *
     * @param nodeId Node ID to check
     * @return true if edge touches node ID
     */
    public boolean connectsNode(String nodeId) {
        if (nodeId == null) return false;
        if (nodeId.equals(fromNodeId)) return true;
        return bidirectional && nodeId.equals(toNodeId);
    }

    /**
     * Gets target node ID given a starting node ID along this edge.
     *
     * @param startNodeId Current starting node ID
     * @return Neighbor node ID, or null if not connected
     */
    public String getNeighborId(String startNodeId) {
        if (startNodeId == null) return null;
        if (startNodeId.equals(fromNodeId)) {
            return toNodeId;
        }
        if (bidirectional && startNodeId.equals(toNodeId)) {
            return fromNodeId;
        }
        return null;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        GraphEdge graphEdge = (GraphEdge) o;
        return bidirectional == graphEdge.bidirectional &&
               Objects.equals(id, graphEdge.id) &&
               Objects.equals(fromNodeId, graphEdge.fromNodeId) &&
               Objects.equals(toNodeId, graphEdge.toNodeId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, fromNodeId, toNodeId, bidirectional);
    }
}

