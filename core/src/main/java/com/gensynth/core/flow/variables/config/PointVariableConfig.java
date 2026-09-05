package com.gensynth.core.flow.variables.config;

import com.gensynth.core.flow.variables.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates 2D, 3D, and Geospatial points using customizable coordinate systems, 
 * movement patterns, boundary behaviors, and GPS noise jitter.
 */
public class PointVariableConfig extends VariableConfiguration {

    private CoordinateSystem coordinateSystem;
    private GeospatialFormat geospatialFormat;
    private BoundaryBehavior boundaryBehavior;

    private Point3D fixedPoint;
    private Point3D minPoint;
    private Point3D maxPoint;

    private List<Point3D> path;
    private int interpolationSteps;
    private double navigationSpeed;
    private boolean loopPath;
    private int currentSegmentIndex;
    private int stepInSegment;

    // Continuous movement / Random walk
    private double maxStepDistance;
    private double inertia; // 0.0 (pure random step) to 1.0 (full momentum retention)
    private Point3D lastPoint;
    private Point3D lastVelocity;

    // Circular Orbit
    private Point3D orbitCenter;
    private double orbitRadius;
    private double angularSpeed; // radians per tick
    private double spiralRate;   // radius change per tick
    private double currentAngle;
    private double currentRadius;

    // GPS Jitter / Noise
    private boolean gpsNoiseEnabled;
    private double jitterRadius;

    // Custom Multi-Vertex Spatial Polygon (Min 3 vertices)
    private List<Point3D> boundaryPolygon;

    // Anomaly state
    private long cachedWhenTicks = -1;
    private boolean isAnomalous;
    private long anomalyStartTick;

    public enum AltitudeUnit {
        METERS,
        FEET,
        KILOMETERS,
        MILES
    }

    public enum AltitudeReference {
        MSL,       // Mean Sea Level (Orthometric Height / ASL)
        AGL,       // Above Ground Level (Relative to terrain)
        ELLIPSOID  // WGS84 Ellipsoid Height (HAE)
    }

    public enum AltitudePattern {
        FOLLOW_XY,        // Uses the primary movement pattern for altitude Z
        FIXED_ALTITUDE,   // Holds constant fixed elevation Z
        RANDOM_UNIFORM,   // Generates uniform random elevation between minAlt and maxAlt
        RANDOM_WALK,      // Continuous smooth climb/descent random walk
        SINE_OSCILLATION  // Sinusoidal wave up/down hover oscillation
    }

    public enum Shape3DType {
        CUBE,
        PYRAMID,
        CONE,
        SPHERE
    }

    private AltitudeUnit altitudeUnit = AltitudeUnit.METERS;
    private AltitudeReference altitudeReference = AltitudeReference.MSL;
    private AltitudePattern altitudePattern = AltitudePattern.FOLLOW_XY;
    private Shape3DType shape3DType = Shape3DType.CUBE;
    private List<BoundaryObstacle> obstacles = new ArrayList<>();
    private double shape3DWidth = 100.0;
    private double shape3DLength = 100.0;
    private double shape3DHeight = 100.0;
    private double shape3DRadius = 50.0;
    private double maxVerticalStep = 1.0;
    private double altitudeOscillationSpeed = 0.1;
    private double currentAltitudeAngle = 0.0;
    private Double lastZ = null;

    public PointVariableConfig() {
        this.type = VariableType.POINT;
        this.pattern = GenerationPattern.RANDOM_POINT;
        this.coordinateSystem = CoordinateSystem.CARTESIAN_3D;
        this.geospatialFormat = GeospatialFormat.DECIMAL_DEGREES;
        this.boundaryBehavior = BoundaryBehavior.CLAMP;

        this.fixedPoint = new Point3D(0.0, 0.0, 0.0);
        this.minPoint = new Point3D(0.0, 0.0, 0.0);
        this.maxPoint = new Point3D(1.0, 1.0, 1.0);
        this.boundaryPolygon = new ArrayList<>();
        this.obstacles = new ArrayList<>();
        this.path = new ArrayList<>(8);
        this.interpolationSteps = 1;
        this.navigationSpeed = 1.0;
        this.loopPath = true;
        this.currentSegmentIndex = 0;
        this.stepInSegment = 0;

        this.maxStepDistance = 0.1;
        this.inertia = 0.0;
        this.lastPoint = null;
        this.lastVelocity = new Point3D(0.0, 0.0, 0.0);

        this.orbitCenter = new Point3D(0.0, 0.0, 0.0);
        this.orbitRadius = 10.0;
        this.angularSpeed = 0.1;
        this.spiralRate = 0.0;
        this.currentAngle = 0.0;
        this.currentRadius = -1.0;

        this.gpsNoiseEnabled = false;
        this.jitterRadius = 0.0;

        this.isAnomalous = false;
        this.anomalyStartTick = 0;
    }

    public CoordinateSystem getCoordinateSystem() {
        return coordinateSystem;
    }

    public PointVariableConfig coordinateSystem(CoordinateSystem system) {
        if (system != null) {
            this.coordinateSystem = system;
        }
        return this;
    }

    public GeospatialFormat getGeospatialFormat() {
        return geospatialFormat;
    }

    public PointVariableConfig geospatialFormat(GeospatialFormat format) {
        if (format != null) {
            this.geospatialFormat = format;
        }
        return this;
    }

    public BoundaryBehavior getBoundaryBehavior() {
        return boundaryBehavior;
    }

    public PointVariableConfig boundaryBehavior(BoundaryBehavior behavior) {
        if (behavior != null) {
            this.boundaryBehavior = behavior;
        }
        return this;
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

    public PointVariableConfig navigationSpeed(double speed) {
        this.navigationSpeed = speed;
        return this;
    }

    public PointVariableConfig loopPath(boolean loop) {
        this.loopPath = loop;
        return this;
    }

    public PointVariableConfig inertia(double inertia) {
        this.inertia = Math.max(0.0, Math.min(1.0, inertia));
        return this;
    }

    public double getInertia() {
        return inertia;
    }

    public PointVariableConfig orbitCenter(double x, double y, double z) {
        this.orbitCenter = new Point3D(x, y, z);
        double r = (this.orbitRadius > 0 ? this.orbitRadius : 10.0) * 2.0;
        if (x - r < minPoint.x || x + r > maxPoint.x || y - r < minPoint.y || y + r > maxPoint.y) {
            this.minPoint = new Point3D(Math.min(minPoint.x, x - r), Math.min(minPoint.y, y - r), Math.min(minPoint.z, z));
            this.maxPoint = new Point3D(Math.max(maxPoint.x, x + r), Math.max(maxPoint.y, y + r), Math.max(maxPoint.z, z));
        }
        return this;
    }

    public PointVariableConfig orbitRadius(double radius) {
        this.orbitRadius = radius;
        if (this.orbitCenter != null) {
            double cx = orbitCenter.x, cy = orbitCenter.y, cz = orbitCenter.z;
            double r = radius * 2.0;
            if (cx - r < minPoint.x || cx + r > maxPoint.x || cy - r < minPoint.y || cy + r > maxPoint.y) {
                this.minPoint = new Point3D(Math.min(minPoint.x, cx - r), Math.min(minPoint.y, cy - r), Math.min(minPoint.z, cz));
                this.maxPoint = new Point3D(Math.max(maxPoint.x, cx + r), Math.max(maxPoint.y, cy + r), Math.max(maxPoint.z, cz));
            }
        }
        return this;
    }

    public PointVariableConfig angularSpeed(double speedRadPerTick) {
        this.angularSpeed = speedRadPerTick;
        return this;
    }

    public PointVariableConfig spiralRate(double rate) {
        this.spiralRate = rate;
        return this;
    }

    public PointVariableConfig gpsNoiseEnabled(boolean enabled) {
        this.gpsNoiseEnabled = enabled;
        return this;
    }

    public PointVariableConfig jitterRadius(double radius) {
        this.jitterRadius = radius;
        return this;
    }

    public PointVariableConfig addBoundaryPolygonPoint(double x, double y, double z) {
        this.boundaryPolygon.add(new Point3D(x, y, z));
        return this;
    }

    public PointVariableConfig boundaryPolygon(List<Point3D> points) {
        if (points != null) {
            this.boundaryPolygon = new ArrayList<>(points);
        }
        return this;
    }

    public List<Point3D> getBoundaryPolygon() {
        return boundaryPolygon;
    }

    public List<BoundaryObstacle> getObstacles() {
        return obstacles;
    }

    public PointVariableConfig obstacles(List<BoundaryObstacle> list) {
        if (list != null) {
            this.obstacles = new ArrayList<>(list);
        }
        return this;
    }

    public PointVariableConfig addObstacle(BoundaryObstacle obstacle) {
        if (obstacle != null) {
            this.obstacles.add(obstacle);
        }
        return this;
    }

    public boolean isPointInAnyObstacle(double x, double y) {
        if (obstacles == null || obstacles.isEmpty()) {
            return false;
        }
        for (BoundaryObstacle obs : obstacles) {
            if (obs != null && obs.isEnabled() && obs.getType() == BoundaryObstacle.ObstacleType.OBSTACLE_POLYGON) {
                if (obs.getPoints() != null && obs.getPoints().size() >= 3) {
                    if (isPointInsideSpecificPolygon(x, y, obs.getPoints())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private boolean isPointInsideSpecificPolygon(double x, double y, List<Point3D> poly) {
        boolean inside = false;
        int n = poly.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = poly.get(i).x, yi = poly.get(i).y;
            double xj = poly.get(j).x, yj = poly.get(j).y;
            if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    public boolean doLineSegmentsIntersect(double p0_x, double p0_y, double p1_x, double p1_y,
                                          double p2_x, double p2_y, double p3_x, double p3_y) {
        double s1_x = p1_x - p0_x;
        double s1_y = p1_y - p0_y;
        double s2_x = p3_x - p2_x;
        double s2_y = p3_y - p2_y;

        double denom = (-s2_x * s1_y + s1_x * s2_y);
        if (Math.abs(denom) < 1e-9) {
            return false;
        }

        double s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denom;
        double t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denom;

        return (s >= 0.0 && s <= 1.0 && t >= 0.0 && t <= 1.0);
    }

    public boolean doesSegmentIntersectAnyWall(double x1, double y1, double x2, double y2) {
        if (obstacles == null || obstacles.isEmpty()) {
            return false;
        }
        for (BoundaryObstacle obs : obstacles) {
            if (obs == null || !obs.isEnabled()) continue;
            List<Point3D> pts = obs.getPoints();
            if (pts == null) continue;

            if (obs.getType() == BoundaryObstacle.ObstacleType.WALL_SEGMENT && pts.size() >= 2) {
                for (int i = 0; i < pts.size() - 1; i++) {
                    Point3D a = pts.get(i);
                    Point3D b = pts.get(i + 1);
                    if (doLineSegmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) {
                        return true;
                    }
                }
            } else if (obs.getType() == BoundaryObstacle.ObstacleType.OBSTACLE_POLYGON && pts.size() >= 3) {
                int n = pts.size();
                for (int i = 0; i < n; i++) {
                    Point3D a = pts.get(i);
                    Point3D b = pts.get((i + 1) % n);
                    if (doLineSegmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public Shape3DType getShape3DType() {
        return shape3DType;
    }

    public PointVariableConfig shape3DType(Shape3DType shape) {
        if (shape != null) this.shape3DType = shape;
        return this;
    }

    public double getShape3DWidth() {
        return shape3DWidth;
    }

    public PointVariableConfig shape3DWidth(double width) {
        this.shape3DWidth = Math.max(0.1, width);
        return this;
    }

    public double getShape3DLength() {
        return shape3DLength;
    }

    public PointVariableConfig shape3DLength(double length) {
        this.shape3DLength = Math.max(0.1, length);
        return this;
    }

    public double getShape3DRadius() {
        return shape3DRadius;
    }

    public PointVariableConfig shape3DRadius(double radius) {
        this.shape3DRadius = Math.max(0.1, radius);
        return this;
    }

    public double getShape3DHeight() {
        return shape3DHeight;
    }

    public PointVariableConfig shape3DHeight(double height) {
        this.shape3DHeight = (Math.abs(height) < 0.1) ? 0.1 : height;
        return this;
    }

    public AltitudeUnit getAltitudeUnit() {
        return altitudeUnit;
    }

    public PointVariableConfig altitudeUnit(AltitudeUnit unit) {
        if (unit != null) this.altitudeUnit = unit;
        return this;
    }

    public AltitudeReference getAltitudeReference() {
        return altitudeReference;
    }

    public PointVariableConfig altitudeReference(AltitudeReference ref) {
        if (ref != null) this.altitudeReference = ref;
        return this;
    }

    public AltitudePattern getAltitudePattern() {
        return altitudePattern;
    }

    public PointVariableConfig altitudePattern(AltitudePattern pattern) {
        if (pattern != null) this.altitudePattern = pattern;
        return this;
    }

    private Double initialAltitude = null;

    public Double getInitialAltitude() {
        return initialAltitude;
    }

    public PointVariableConfig initialAltitude(Double alt) {
        this.initialAltitude = alt;
        return this;
    }

    public double getMaxVerticalStep() {
        return maxVerticalStep;
    }

    public PointVariableConfig maxVerticalStep(double step) {
        this.maxVerticalStep = step;
        return this;
    }

    public double getAltitudeOscillationSpeed() {
        return altitudeOscillationSpeed;
    }

    public PointVariableConfig altitudeOscillationSpeed(double speed) {
        this.altitudeOscillationSpeed = speed;
        return this;
    }

    private Point3D applyAltitudePattern(Point3D p) {
        if (altitudePattern == AltitudePattern.FOLLOW_XY || altitudePattern == null) {
            return p;
        }

        double minZ = minPoint.z;
        double maxZ = maxPoint.z;
        double midZ = (minZ + maxZ) / 2.0;
        double ampZ = Math.abs(maxZ - minZ) / 2.0;
        double newZ = p.z;

        switch (altitudePattern) {
            case FIXED_ALTITUDE:
                newZ = (fixedPoint != null && fixedPoint.z != 0.0) ? fixedPoint.z : midZ;
                break;

            case RANDOM_UNIFORM:
                newZ = randomInRange(minZ, maxZ);
                break;

            case RANDOM_WALK:
                if (lastZ == null) {
                    lastZ = randomInRange(minZ, maxZ);
                }
                double step = (maxVerticalStep > 0) ? maxVerticalStep : 1.0;
                double delta = (ThreadLocalRandom.current().nextDouble() * 2 - 1) * step;
                lastZ = Math.max(minZ, Math.min(maxZ, lastZ + delta));
                newZ = lastZ;
                break;

            case SINE_OSCILLATION:
                double speed = (altitudeOscillationSpeed > 0) ? altitudeOscillationSpeed : 0.1;
                newZ = midZ + (ampZ * Math.sin(currentAltitudeAngle));
                currentAltitudeAngle += speed;
                newZ = Math.max(minZ, Math.min(maxZ, newZ));
                break;
            case FOLLOW_XY:
                break;
            default:
                break;
        }

        return new Point3D(p.x, p.y, newZ);
    }

    /**
     * Ray-Casting algorithm for checking point inclusion inside 2D/Geospatial boundary polygon.
     */
    public boolean isPointInsidePolygon(double x, double y) {
        if (boundaryPolygon == null || boundaryPolygon.size() < 3) {
            return true;
        }
        boolean inside = false;
        int n = boundaryPolygon.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = boundaryPolygon.get(i).x, yi = boundaryPolygon.get(i).y;
            double xj = boundaryPolygon.get(j).x, yj = boundaryPolygon.get(j).y;
            if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    @Override
    public List<String> validate() {
        List<String> errors = new ArrayList<>();
        if (maxStepDistance < 0) {
            errors.add("Maximum step distance cannot be negative");
        }
        if (jitterRadius < 0) {
            errors.add("Jitter radius cannot be negative");
        }
        return errors;
    }

    @Override
    public Object generateNextValue() {
        incrementTick();
        checkAnomalyCondition();

        if (isAnomalous) {
            Object val = anomalyConfig.getAnomalousValue();
            if (val instanceof Point3D) {
                return formatPointOutput((Point3D) val);
            }
            return val;
        }

        Point3D point;

        switch (pattern) {
            case FIXED_POINT:
                point = fixedPoint;
                break;
            case RANDOM_POINT:
                Point3D rawRand = generateRandomPoint();
                point = applyBoundaries(rawRand.x, rawRand.y, rawRand.z, 0, 0, 0);
                break;
            case PATH_INTERPOLATOR:
            case WAYPOINT_NAVIGATION:
                point = generatePathPoint();
                break;
            case CONTINUOUS_MOVEMENT:
            case RANDOM_WALK:
                point = generateRandomWalkPoint();
                break;
            case CIRCULAR_ORBIT:
                point = generateCircularOrbitPoint();
                break;
            default:
                point = fixedPoint;
                break;
        }

        Point3D altitudePoint = applyAltitudePattern(point);
        Point3D finalPoint = applyJitter(altitudePoint);
        return formatPointOutput(finalPoint);
    }

    public Point3D getCenterPoint() {
        return new Point3D(
            (minPoint.x + maxPoint.x) / 2.0,
            (minPoint.y + maxPoint.y) / 2.0,
            (minPoint.z + maxPoint.z) / 2.0
        );
    }

    private Point3D generateRandomPoint() {
        for (int i = 0; i < 200; i++) {
            double x = randomInRange(minPoint.x, maxPoint.x);
            double y = randomInRange(minPoint.y, maxPoint.y);
            double z = (initialAltitude != null && (altitudePattern == AltitudePattern.FOLLOW_XY || altitudePattern == null))
                ? initialAltitude
                : randomInRange(minPoint.z, maxPoint.z);
            if (isPointInsidePolygon(x, y) && !isPointInAnyObstacle(x, y)) {
                return new Point3D(x, y, z);
            }
        }
        Point3D center = getCenterPoint();
        if (initialAltitude != null && (altitudePattern == AltitudePattern.FOLLOW_XY || altitudePattern == null)) {
            return new Point3D(center.x, center.y, initialAltitude);
        }
        return center;
    }

    private Point3D generatePathPoint() {
        if (path.isEmpty()) {
            return fixedPoint != null && (fixedPoint.x != 0 || fixedPoint.y != 0 || minPoint.x == 0)
                ? fixedPoint
                : getCenterPoint();
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
            if (loopPath) {
                currentSegmentIndex = (currentSegmentIndex + 1) % path.size();
            } else if (currentSegmentIndex < path.size() - 2) {
                currentSegmentIndex++;
            }
        }

        return result;
    }

    private Point3D generateRandomWalkPoint() {
        if (lastPoint == null || isPointInAnyObstacle(lastPoint.x, lastPoint.y)) {
            Point3D initial = (fixedPoint != null && (fixedPoint.x != 0 || fixedPoint.y != 0 || minPoint.x == 0))
                ? fixedPoint
                : generateRandomPoint();
            if (initialAltitude != null && (altitudePattern == AltitudePattern.FOLLOW_XY || altitudePattern == null)) {
                initial = new Point3D(initial.x, initial.y, initialAltitude);
            }
            lastVelocity = new Point3D(0.0, 0.0, 0.0);
            lastPoint = applyBoundaries(initial.x, initial.y, initial.z, 0, 0, 0);
            return lastPoint;
        }

        double spanX = Math.abs(maxPoint.x - minPoint.x);
        double spanY = Math.abs(maxPoint.y - minPoint.y);
        double spanZ = Math.abs(maxPoint.z - minPoint.z);

        double stepXY = (maxStepDistance > 0 && maxStepDistance < Math.max(spanX, spanY)) 
            ? maxStepDistance 
            : Math.max(Math.max(spanX, spanY) * 0.05, 0.0001);

        double stepZ;
        if (coordinateSystem == CoordinateSystem.GEOSPATIAL && spanZ > 0) {
            stepZ = (maxStepDistance >= 1.0) ? maxStepDistance : Math.max(spanZ * 0.05, 0.01);
        } else {
            stepZ = stepXY;
        }

        // Random step vector
        double rx = (ThreadLocalRandom.current().nextDouble() * 2 - 1) * stepXY;
        double ry = (ThreadLocalRandom.current().nextDouble() * 2 - 1) * stepXY;
        double rz = (ThreadLocalRandom.current().nextDouble() * 2 - 1) * stepZ;

        // Apply momentum / inertia angle factor
        double vx = (inertia * lastVelocity.x) + ((1.0 - inertia) * rx);
        double vy = (inertia * lastVelocity.y) + ((1.0 - inertia) * ry);
        double vz = (inertia * lastVelocity.z) + ((1.0 - inertia) * rz);

        double targetX = lastPoint.x + vx;
        double targetY = lastPoint.y + vy;
        double targetZ = lastPoint.z + vz;

        // Check if movement segment hits a wall barrier or steps inside an obstacle zone
        if (doesSegmentIntersectAnyWall(lastPoint.x, lastPoint.y, targetX, targetY) || isPointInAnyObstacle(targetX, targetY)) {
            if (boundaryBehavior == BoundaryBehavior.BOUNCE) {
                lastVelocity = new Point3D(-vx, -vy, vz);
            } else {
                lastVelocity = new Point3D(0.0, 0.0, 0.0);
            }
            return lastPoint;
        }

        Point3D bounded = applyBoundaries(targetX, targetY, targetZ, vx, vy, vz);
        lastPoint = bounded;
        return lastPoint;
    }

    private Point3D generateCircularOrbitPoint() {
        double spanX = Math.abs(maxPoint.x - minPoint.x);
        double spanY = Math.abs(maxPoint.y - minPoint.y);

        Point3D center = (orbitCenter != null && (orbitCenter.x != 0 || orbitCenter.y != 0 || minPoint.x == 0))
            ? orbitCenter
            : getCenterPoint();

        if (currentRadius < 0) {
            currentRadius = (orbitRadius > 0) ? orbitRadius : Math.max(Math.min(spanX, spanY) * 0.35, 0.0001);
        }

        double x = center.x + currentRadius * Math.cos(currentAngle);
        double y = center.y + currentRadius * Math.sin(currentAngle);
        double z = center.z;

        currentAngle += (angularSpeed != 0 ? angularSpeed : 0.05);
        if (spiralRate != 0.0) {
            currentRadius += spiralRate;
        }

        return applyBoundaries(x, y, z, 0, 0, 0);
    }

    private Point3D applyBoundaries(double x, double y, double z, double vx, double vy, double vz) {
        double newX = x;
        double newY = y;
        double newZ = z;
        double newVx = vx;
        double newVy = vy;
        double newVz = vz;

        if (coordinateSystem != CoordinateSystem.CARTESIAN_3D) {
            double boundMinX = Math.min(minPoint.x, maxPoint.x);
            double boundMaxX = Math.max(minPoint.x, maxPoint.x);
            double boundMinY = Math.min(minPoint.y, maxPoint.y);
            double boundMaxY = Math.max(minPoint.y, maxPoint.y);
            double boundMinZ = Math.min(minPoint.z, maxPoint.z);
            double boundMaxZ = Math.max(minPoint.z, maxPoint.z);

            switch (boundaryBehavior) {
                case CLAMP:
                    newX = Math.max(boundMinX, Math.min(boundMaxX, x));
                    newY = Math.max(boundMinY, Math.min(boundMaxY, y));
                    newZ = Math.max(boundMinZ, Math.min(boundMaxZ, z));
                    break;

                case WRAP:
                    newX = wrapValue(x, boundMinX, boundMaxX);
                    newY = wrapValue(y, boundMinY, boundMaxY);
                    newZ = wrapValue(z, boundMinZ, boundMaxZ);
                    break;

                case BOUNCE:
                    if (x < boundMinX || x > boundMaxX) {
                        newVx = -vx;
                        newX = Math.max(boundMinX, Math.min(boundMaxX, x < boundMinX ? boundMinX + (boundMinX - x) : boundMaxX - (x - boundMaxX)));
                    }
                    if (y < boundMinY || y > boundMaxY) {
                        newVy = -vy;
                        newY = Math.max(boundMinY, Math.min(boundMaxY, y < boundMinY ? boundMinY + (boundMinY - y) : boundMaxY - (y - boundMaxY)));
                    }
                    if (z < boundMinZ || z > boundMaxZ) {
                        newVz = -vz;
                        newZ = Math.max(boundMinZ, Math.min(boundMaxZ, z < boundMinZ ? boundMinZ + (boundMinZ - z) : boundMaxZ - (z - boundMaxZ)));
                    }
                    break;
            }
            lastVelocity = new Point3D(newVx, newVy, newVz);
            return new Point3D(newX, newY, newZ);
        }

        if (shape3DType == Shape3DType.SPHERE) {
            double cx = (minPoint.x + maxPoint.x) / 2.0;
            double cy = (minPoint.y + maxPoint.y) / 2.0;
            double cz = (minPoint.z + maxPoint.z) / 2.0;
            double radius = shape3DRadius > 0 ? shape3DRadius : 50.0;

            double dx = x - cx;
            double dy = y - cy;
            double dz = z - cz;
            double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > radius) {
                if (boundaryBehavior == BoundaryBehavior.BOUNCE) {
                    newVx = -vx;
                    newVy = -vy;
                    newVz = -vz;
                    double factor = (radius * 0.95) / (dist > 0 ? dist : 1.0);
                    newX = cx + dx * factor;
                    newY = cy + dy * factor;
                    newZ = cz + dz * factor;
                } else if (boundaryBehavior == BoundaryBehavior.WRAP) {
                    double factor = -0.8;
                    newX = cx + dx * factor;
                    newY = cy + dy * factor;
                    newZ = cz + dz * factor;
                } else { // CLAMP
                    double factor = radius / (dist > 0 ? dist : 1.0);
                    newX = cx + dx * factor;
                    newY = cy + dy * factor;
                    newZ = cz + dz * factor;
                }
            }
        } else if (shape3DType == Shape3DType.CONE) {
            double baseZ = minPoint.z;
            double topZ = minPoint.z + shape3DHeight;
            double zMin = Math.min(baseZ, topZ);
            double zMax = Math.max(baseZ, topZ);
            newZ = Math.max(zMin, Math.min(zMax, z));

            double height = Math.abs(shape3DHeight) > 0.001 ? Math.abs(shape3DHeight) : 100.0;
            double normZ = shape3DHeight >= 0 
                ? Math.max(0.0, Math.min(1.0, (newZ - baseZ) / height))
                : Math.max(0.0, Math.min(1.0, (baseZ - newZ) / height));
            double radiusAtZ = (shape3DRadius > 0 ? shape3DRadius : 50.0) * (1.0 - normZ);

            double cx = (minPoint.x + maxPoint.x) / 2.0;
            double cy = (minPoint.y + maxPoint.y) / 2.0;
            double dx = x - cx;
            double dy = y - cy;
            double distXY = Math.sqrt(dx * dx + dy * dy);

            if (distXY > radiusAtZ) {
                if (boundaryBehavior == BoundaryBehavior.BOUNCE) {
                    newVx = -vx;
                    newVy = -vy;
                }
                double factor = radiusAtZ / (distXY > 0 ? distXY : 1.0);
                newX = cx + dx * factor;
                newY = cy + dy * factor;
            }
        } else if (shape3DType == Shape3DType.PYRAMID) {
            double baseZ = minPoint.z;
            double topZ = minPoint.z + shape3DHeight;
            double zMin = Math.min(baseZ, topZ);
            double zMax = Math.max(baseZ, topZ);
            newZ = Math.max(zMin, Math.min(zMax, z));

            double height = Math.abs(shape3DHeight) > 0.001 ? Math.abs(shape3DHeight) : 100.0;
            double normZ = shape3DHeight >= 0 
                ? Math.max(0.0, Math.min(1.0, (newZ - baseZ) / height))
                : Math.max(0.0, Math.min(1.0, (baseZ - newZ) / height));
            double scale = 1.0 - normZ;

            double cx = (minPoint.x + maxPoint.x) / 2.0;
            double cy = (minPoint.y + maxPoint.y) / 2.0;
            double halfX = (shape3DWidth > 0 ? shape3DWidth : 100.0) / 2.0 * scale;
            double halfY = (shape3DLength > 0 ? shape3DLength : 100.0) / 2.0 * scale;

            newX = Math.max(cx - halfX, Math.min(cx + halfX, x));
            newY = Math.max(cy - halfY, Math.min(cy + halfY, y));
            if (boundaryBehavior == BoundaryBehavior.BOUNCE && (x != newX || y != newY)) {
                newVx = -vx;
                newVy = -vy;
            }
        } else {
            // CUBE / BOX
            double halfX = (shape3DWidth > 0 ? shape3DWidth : Math.abs(maxPoint.x - minPoint.x)) / 2.0;
            double halfY = (shape3DLength > 0 ? shape3DLength : Math.abs(maxPoint.y - minPoint.y)) / 2.0;
            double cx = (minPoint.x + maxPoint.x) / 2.0;
            double cy = (minPoint.y + maxPoint.y) / 2.0;
            double bZ1 = minPoint.z;
            double bZ2 = minPoint.z + shape3DHeight;
            double boundMinZ = Math.min(bZ1, bZ2);
            double boundMaxZ = Math.max(bZ1, bZ2);

            double boundMinX = cx - halfX;
            double boundMaxX = cx + halfX;
            double boundMinY = cy - halfY;
            double boundMaxY = cy + halfY;

            switch (boundaryBehavior) {
                case CLAMP:
                    newX = Math.max(boundMinX, Math.min(boundMaxX, x));
                    newY = Math.max(boundMinY, Math.min(boundMaxY, y));
                    newZ = Math.max(boundMinZ, Math.min(boundMaxZ, z));
                    break;

                case WRAP:
                    newX = wrapValue(x, boundMinX, boundMaxX);
                    newY = wrapValue(y, boundMinY, boundMaxY);
                    newZ = wrapValue(z, boundMinZ, boundMaxZ);
                    break;

                case BOUNCE:
                    if (x < boundMinX || x > boundMaxX) {
                        newVx = -vx;
                        newX = Math.max(boundMinX, Math.min(boundMaxX, x < boundMinX ? boundMinX + (boundMinX - x) : boundMaxX - (x - boundMaxX)));
                    }
                    if (y < boundMinY || y > boundMaxY) {
                        newVy = -vy;
                        newY = Math.max(boundMinY, Math.min(boundMaxY, y < boundMinY ? boundMinY + (boundMinY - y) : boundMaxY - (y - boundMaxY)));
                    }
                    if (z < boundMinZ || z > boundMaxZ) {
                        newVz = -vz;
                        newZ = Math.max(boundMinZ, Math.min(boundMaxZ, z < boundMinZ ? boundMinZ + (boundMinZ - z) : boundMaxZ - (z - boundMaxZ)));
                    }
                    break;
            }
        }

        if (boundaryPolygon != null && boundaryPolygon.size() >= 3 && !isPointInsidePolygon(newX, newY)) {
            Point3D center = getCenterPoint();
            if (boundaryBehavior == BoundaryBehavior.BOUNCE) {
                newVx = -newVx;
                newVy = -newVy;
            }
            newX = lerp(newX, center.x, 0.5);
            newY = lerp(newY, center.y, 0.5);
        }

        lastVelocity = new Point3D(newVx, newVy, newVz);
        return new Point3D(newX, newY, newZ);
    }

    private double wrapValue(double val, double min, double max) {
        double range = max - min;
        if (range <= 0) return min;
        while (val < min) val += range;
        while (val > max) val -= range;
        return val;
    }

    private Point3D applyJitter(Point3D p) {
        if (!gpsNoiseEnabled && jitterRadius <= 0) {
            return p;
        }
        double jx = ThreadLocalRandom.current().nextGaussian() * jitterRadius;
        double jy = ThreadLocalRandom.current().nextGaussian() * jitterRadius;
        double jz = ThreadLocalRandom.current().nextGaussian() * jitterRadius;
        return new Point3D(p.x + jx, p.y + jy, p.z + jz);
    }

    private Map<String, Object> formatPointOutput(Point3D p) {
        Map<String, Object> map = new HashMap<>(6);
        switch (coordinateSystem) {
            case CARTESIAN_2D:
                map.put("x", p.x);
                map.put("y", p.y);
                break;

            case CARTESIAN_3D:
                map.put("x", p.x);
                map.put("y", p.y);
                map.put("z", p.z);
                break;

            case GEOSPATIAL:
                if (geospatialFormat == GeospatialFormat.DEGREES_MINUTES_SECONDS) {
                    map.put("latitude", convertToDMS(p.x, true));
                    map.put("longitude", convertToDMS(p.y, false));
                    map.put("altitude", p.z);
                    map.put("latitudeDecimal", p.x);
                    map.put("longitudeDecimal", p.y);
                } else {
                    map.put("latitude", p.x);
                    map.put("longitude", p.y);
                    map.put("altitude", p.z);
                }
                if (altitudeUnit != null) {
                    map.put("altitudeUnit", altitudeUnit.toString());
                }
                if (altitudeReference != null) {
                    map.put("altitudeReference", altitudeReference.toString());
                }
                break;
        }
        return map;
    }

    /**
     * Converts decimal degrees coordinate to formatted Degrees, Minutes, Seconds (DMS) string.
     */
    public static String convertToDMS(double val, boolean isLatitude) {
        char direction;
        if (isLatitude) {
            direction = val >= 0 ? 'N' : 'S';
        } else {
            direction = val >= 0 ? 'E' : 'W';
        }

        double absVal = Math.abs(val);
        int degrees = (int) absVal;
        double minutesRemainder = (absVal - degrees) * 60.0;
        int minutes = (int) minutesRemainder;
        double seconds = (minutesRemainder - minutes) * 60.0;

        return String.format("%d° %d' %.2f\" %c", degrees, minutes, seconds, direction);
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
        lastPoint = null;
        lastZ = null;
        lastVelocity = new Point3D(0.0, 0.0, 0.0);
        currentAngle = 0.0;
        currentAltitudeAngle = 0.0;
        currentRadius = -1.0;
        isAnomalous = false;
        anomalyStartTick = 0;
        cachedWhenTicks = -1;
    }

    @Override
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>(22);
        map.put("identifier", identifier);
        map.put("type", type.toString());
        map.put("pattern", pattern.toString());
        map.put("coordinateSystem", coordinateSystem.toString());
        map.put("geospatialFormat", geospatialFormat.toString());
        map.put("boundaryBehavior", boundaryBehavior.toString());
        map.put("fixedPoint", fixedPoint.toString());
        map.put("pathSize", path.size());
        map.put("interpolationSteps", interpolationSteps);
        map.put("navigationSpeed", navigationSpeed);
        map.put("maxStepDistance", maxStepDistance);
        map.put("inertia", inertia);
        map.put("orbitRadius", orbitRadius);
        map.put("angularSpeed", angularSpeed);
        map.put("spiralRate", spiralRate);
        map.put("gpsNoiseEnabled", gpsNoiseEnabled);
        map.put("jitterRadius", jitterRadius);
        map.put("altitudeUnit", altitudeUnit != null ? altitudeUnit.toString() : "METERS");
        map.put("altitudeReference", altitudeReference != null ? altitudeReference.toString() : "MSL");
        map.put("altitudePattern", altitudePattern != null ? altitudePattern.toString() : "FOLLOW_XY");
        if (initialAltitude != null) {
            map.put("initialAltitude", initialAltitude);
        }
        map.put("maxVerticalStep", maxVerticalStep);
        map.put("altitudeOscillationSpeed", altitudeOscillationSpeed);
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

    public double getNavigationSpeed() {
        return navigationSpeed;
    }

    public PointVariableConfig maxStepDistance(double maxStepDistance) {
        this.maxStepDistance = maxStepDistance;
        return this;
    }

    public double getMaxStepDistance() {
        return maxStepDistance;
    }

    public Point3D getFixedPoint() {
        return fixedPoint;
    }

    public Point3D getMinPoint() {
        return minPoint;
    }

    public Point3D getMaxPoint() {
        return maxPoint;
    }

    public Point3D getOrbitCenter() {
        return orbitCenter;
    }

    public double getOrbitRadius() {
        return orbitRadius;
    }

    public double getAngularSpeed() {
        return angularSpeed;
    }

    public double getSpiralRate() {
        return spiralRate;
    }

    public List<Point3D> getPath() {
        return path;
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
