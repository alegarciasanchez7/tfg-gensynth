package com.gensynth.core.flow.variables.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Represents a 2D/3D spatial obstacle or barrier wall segment.
 * Obstacles can be line-segment walls or closed forbidden interior polygons.
 */
public class BoundaryObstacle {

    public enum ObstacleType {
        WALL_SEGMENT,       // Impassable 2D line segment barrier
        OBSTACLE_POLYGON    // Forbidden interior polygon region (e.g. room wall, obstacle)
    }

    private String id;
    private ObstacleType type;
    private String name;
    private List<PointVariableConfig.Point3D> points;
    private boolean enabled;

    public BoundaryObstacle() {
        this.id = UUID.randomUUID().toString();
        this.type = ObstacleType.WALL_SEGMENT;
        this.name = "Wall Barrier";
        this.points = new ArrayList<>();
        this.enabled = true;
    }

    public BoundaryObstacle(String name, ObstacleType type, List<PointVariableConfig.Point3D> points) {
        this.id = UUID.randomUUID().toString();
        this.name = name != null ? name : "Obstacle";
        this.type = type != null ? type : ObstacleType.WALL_SEGMENT;
        this.points = points != null ? new ArrayList<>(points) : new ArrayList<>();
        this.enabled = true;
    }

    public String getId() {
        return id;
    }

    public BoundaryObstacle id(String id) {
        if (id != null && !id.trim().isEmpty()) {
            this.id = id;
        }
        return this;
    }

    public ObstacleType getType() {
        return type;
    }

    public BoundaryObstacle type(ObstacleType type) {
        if (type != null) {
            this.type = type;
        }
        return this;
    }

    public String getName() {
        return name;
    }

    public BoundaryObstacle name(String name) {
        this.name = name;
        return this;
    }

    public List<PointVariableConfig.Point3D> getPoints() {
        return points;
    }

    public BoundaryObstacle points(List<PointVariableConfig.Point3D> points) {
        if (points != null) {
            this.points = new ArrayList<>(points);
        }
        return this;
    }

    public BoundaryObstacle addPoint(double x, double y, double z) {
        this.points.add(new PointVariableConfig.Point3D(x, y, z));
        return this;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public BoundaryObstacle enabled(boolean enabled) {
        this.enabled = enabled;
        return this;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof BoundaryObstacle that)) return false;
        return enabled == that.enabled &&
               Objects.equals(id, that.id) &&
               type == that.type &&
               Objects.equals(name, that.name) &&
               Objects.equals(points, that.points);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, type, name, points, enabled);
    }

    @Override
    public String toString() {
        return "BoundaryObstacle{" +
                "id='" + id + '\'' +
                ", type=" + type +
                ", name='" + name + '\'' +
                ", points=" + points.size() +
                ", enabled=" + enabled +
                '}';
    }
}

