package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.config.PointVariableConfig.Point3D;
import java.util.Objects;

/**
 * Represents a spatial node (vertex) in a graph route for Point variables.
 */
public class GraphNode {

    private String id;
    private String name;
    private double x;
    private double y;
    private double z;

    /**
     * Default constructor.
     */
    public GraphNode() {
        this.id = "";
        this.name = "";
        this.x = 0.0;
        this.y = 0.0;
        this.z = 0.0;
    }

    /**
     * Constructs a GraphNode with specified coordinates and identifier.
     *
     * @param id   Unique identifier for the node
     * @param name Display name for the node
     * @param x    X coordinate / Latitude
     * @param y    Y coordinate / Longitude
     * @param z    Z coordinate / Altitude
     */
    public GraphNode(String id, String name, double x, double y, double z) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Gets node ID.
     *
     * @return node ID string
     */
    public String getId() {
        return id;
    }

    /**
     * Sets node ID.
     *
     * @param id node ID string
     */
    public void setId(String id) {
        this.id = id;
    }

    /**
     * Gets node display name.
     *
     * @return node display name
     */
    public String getName() {
        return name;
    }

    /**
     * Sets node display name.
     *
     * @param name node display name
     */
    public void setName(String name) {
        this.name = name;
    }

    /**
     * Gets X coordinate.
     *
     * @return X coordinate
     */
    public double getX() {
        return x;
    }

    /**
     * Sets X coordinate.
     *
     * @param x X coordinate
     */
    public void setX(double x) {
        this.x = x;
    }

    /**
     * Gets Y coordinate.
     *
     * @return Y coordinate
     */
    public double getY() {
        return y;
    }

    /**
     * Sets Y coordinate.
     *
     * @param y Y coordinate
     */
    public void setY(double y) {
        this.y = y;
    }

    /**
     * Gets Z coordinate.
     *
     * @return Z coordinate
     */
    public double getZ() {
        return z;
    }

    /**
     * Sets Z coordinate.
     *
     * @param z Z coordinate
     */
    public void setZ(double z) {
        this.z = z;
    }

    /**
     * Converts node coordinates to Point3D object.
     *
     * @return Point3D representation
     */
    public Point3D toPoint3D() {
        return new Point3D(x, y, z);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        GraphNode graphNode = (GraphNode) o;
        return Double.compare(graphNode.x, x) == 0 &&
               Double.compare(graphNode.y, y) == 0 &&
               Double.compare(graphNode.z, z) == 0 &&
               Objects.equals(id, graphNode.id) &&
               Objects.equals(name, graphNode.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name, x, y, z);
    }
}
