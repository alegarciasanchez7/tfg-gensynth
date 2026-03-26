package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates 3D points using fixed, random and path interpolation modes.
 */
public class PointVariableConfig extends VariableConfiguration {

    private Point3D fixedPoint;
    private Point3D minPoint;
    private Point3D maxPoint;

    private List<Point3D> path;
    private int interpolationSteps;
    private int currentSegmentIndex;
    private int stepInSegment;

    // Anomaly state
    private long cachedWhenTicks = -1;
    private boolean isAnomalous;
    private long anomalyStartTick;

    public PointVariableConfig() {
        this.type = VariableType.POINT;
        this.pattern = GenerationPattern.RANDOM_POINT;
        this.fixedPoint = new Point3D(0.0, 0.0, 0.0);
        this.minPoint = new Point3D(0.0, 0.0, 0.0);
        this.maxPoint = new Point3D(1.0, 1.0, 1.0);
        this.path = new ArrayList<>(8);
        this.interpolationSteps = 1;
        this.currentSegmentIndex = 0;
        this.stepInSegment = 0;
        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    public PointVariableConfig fixedPoint(double x, double y, double z) {
        this.fixedPoint = new Point3D(x, y, z);
        return this;
    }

    public PointVariableConfig range(double minX, double maxX, double minY, double maxY, double minZ, double maxZ) {
        if (maxX < minX || maxY < minY || maxZ < minZ) {
            throw new IllegalArgumentException("Max bounds must be >= min bounds");
        }
        this.minPoint = new Point3D(minX, minY, minZ);
        this.maxPoint = new Point3D(maxX, maxY, maxZ);
        return this;
    }

    public PointVariableConfig addPathPoint(double x, double y, double z) {
        this.path.add(new Point3D(x, y, z));
        return this;
    }

    public PointVariableConfig interpolationSteps(int steps) {
        if (steps <= 0) {
            throw new IllegalArgumentException("Interpolation steps must be positive");
        }
        this.interpolationSteps = steps;
        return this;
    }

    @Override
    public Object generateNextValue() {
        tickCounter++;
        checkAnomalyCondition();

        if (isAnomalous) {
            return anomalyConfig.getAnomalousValue();
        }

        switch (pattern) {
            case FIXED_POINT:
                return fixedPoint;
            case RANDOM_POINT:
                return generateRandomPoint();
            case PATH_INTERPOLATOR:
                return generatePathPoint();
            default:
                return fixedPoint;
        }
    }

    private Point3D generateRandomPoint() {
        double x = randomInRange(minPoint.x, maxPoint.x);
        double y = randomInRange(minPoint.y, maxPoint.y);
        double z = randomInRange(minPoint.z, maxPoint.z);
        return new Point3D(x, y, z);
    }

    private Point3D generatePathPoint() {
        if (path.isEmpty()) {
            return fixedPoint;
        }
        if (path.size() == 1) {
            return path.get(0);
        }

        Point3D from = path.get(currentSegmentIndex);
        Point3D to = path.get((currentSegmentIndex + 1) % path.size());

        double t = interpolationSteps <= 1 ? 0.0 : (double) stepInSegment / (interpolationSteps - 1);
        Point3D result = new Point3D(
            lerp(from.x, to.x, t),
            lerp(from.y, to.y, t),
            lerp(from.z, to.z, t)
        );

        stepInSegment++;
        if (stepInSegment >= interpolationSteps) {
            stepInSegment = 0;
            currentSegmentIndex = (currentSegmentIndex + 1) % path.size();
        }

        return result;
    }

    private double randomInRange(double min, double max) {
        if (max <= min) {
            return min;
        }
        return min + (ThreadLocalRandom.current().nextDouble() * (max - min));
    }

    private double lerp(double from, double to, double t) {
        return from + ((to - from) * t);
    }

    @Override
    public void reset() {
        tickCounter = 0;
        currentSegmentIndex = 0;
        stepInSegment = 0;
        isAnomalous = false;
        anomalyStartTick = 0;
        cachedWhenTicks = -1;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(6);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("fixedPoint", fixedPoint.toString());
        map.put("pathSize", path.size());
        map.put("interpolationSteps", interpolationSteps);
        return map;
    }

    @Override
    public PointVariableConfig identifier(String id) {
        this.identifier = id;
        return this;
    }

    @Override
    public PointVariableConfig pattern(GenerationPattern p) {
        this.pattern = p;
        return this;
    }

    @Override
    public PointVariableConfig defaultValue(Object value) {
        this.defaultValue = value;
        return this;
    }

    @Override
    public PointVariableConfig anomaly(AnomalyConfig config) {
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

    public int getPathSize() {
        return path.size();
    }

    public int getInterpolationSteps() {
        return interpolationSteps;
    }

    public static class Point3D {
        public final double x;
        public final double y;
        public final double z;

        public Point3D(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof Point3D)) {
                return false;
            }
            Point3D point3D = (Point3D) o;
            return Double.compare(point3D.x, x) == 0
                && Double.compare(point3D.y, y) == 0
                && Double.compare(point3D.z, z) == 0;
        }

        @Override
        public int hashCode() {
            return Objects.hash(x, y, z);
        }

        @Override
        public String toString() {
            return "Point3D{" + "x=" + x + ", y=" + y + ", z=" + z + '}';
        }
    }
}
