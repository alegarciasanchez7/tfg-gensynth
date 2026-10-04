package com.gensynth.core.clock;

import com.gensynth.core.api.ITickClock;
import com.gensynth.core.api.ITickListener;
import com.gensynth.core.model.TickSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;

/**
 * Default {@link ITickClock} implementation backed by a single dedicated thread.
 *
 * Because every schedule runs on the same thread, two ticks can never overlap, not even
 * while the clock is being rescheduled. In {@link TickSettings.Mode#FIXED_RATE} mode the
 * thread runs a fixed-rate schedule; in {@link TickSettings.Mode#AS_FAST_AS_POSSIBLE} mode
 * it runs a loop that starts the next tick as soon as the previous one returns, pausing
 * briefly only when the listener reports that there was nothing to do.
 */
public class TickClockImpl implements ITickClock {

    private static final Logger logger = LoggerFactory.getLogger(TickClockImpl.class);

    /** Pause used in as-fast-as-possible mode when a tick had no work to dispatch. */
    private static final long IDLE_BACKOFF_NANOS = TimeUnit.MILLISECONDS.toNanos(1);

    private final ITickListener listener;
    private final ScheduledExecutorService executor;
    private final Object lock = new Object();
    private final AtomicLong tickCount = new AtomicLong();

    private volatile TickSettings settings;
    /** Incremented on every stop/reschedule so a stale as-fast-as-possible loop exits. */
    private volatile long generation;
    private Future<?> task;
    private long lastSampleTicks;
    private long lastSampleNanos;

    /**
     * Creates a stopped clock with the default settings.
     *
     * @param listener receiver of every tick
     */
    public TickClockImpl(ITickListener listener) {
        this(listener, TickSettings.defaults());
    }

    /**
     * Creates a stopped clock.
     *
     * @param listener receiver of every tick
     * @param settings initial tick settings
     */
    public TickClockImpl(ITickListener listener, TickSettings settings) {
        this.listener = Objects.requireNonNull(listener, "listener cannot be null");
        this.settings = Objects.requireNonNull(settings, "settings cannot be null");
        this.executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "gensynth-tick-clock");
            thread.setDaemon(true);
            return thread;
        });
    }

    @Override
    public void start() {
        synchronized (lock) {
            if (task != null) {
                return;
            }
            tickCount.set(0);
            lastSampleTicks = 0;
            lastSampleNanos = System.nanoTime();
            schedule(0);
        }
    }

    @Override
    public void stop() {
        synchronized (lock) {
            cancelTask();
        }
    }

    @Override
    public boolean isRunning() {
        synchronized (lock) {
            return task != null;
        }
    }

    @Override
    public void applySettings(TickSettings newSettings) {
        Objects.requireNonNull(newSettings, "settings cannot be null");
        synchronized (lock) {
            settings = newSettings;
            if (task != null) {
                cancelTask();
                // Wait one period before the first tick so editing the settings does not emit an extra burst
                schedule(newSettings.getMode() == TickSettings.Mode.FIXED_RATE ? newSettings.periodNanos() : 0);
            }
        }
    }

    @Override
    public TickSettings getSettings() {
        return settings;
    }

    @Override
    public long getTickCount() {
        return tickCount.get();
    }

    @Override
    public double sampleTicksPerSecond() {
        synchronized (lock) {
            long now = System.nanoTime();
            long ticks = tickCount.get();
            long elapsed = now - lastSampleNanos;
            double rate = (task == null || elapsed <= 0) ? 0.0 : (ticks - lastSampleTicks) * 1e9 / elapsed;
            lastSampleTicks = ticks;
            lastSampleNanos = now;
            return Math.max(0.0, rate);
        }
    }

    @Override
    public void shutdown() {
        stop();
        executor.shutdownNow();
    }

    /** Must be called while holding {@code lock}. */
    private void schedule(long initialDelayNanos) {
        long gen = generation;
        TickSettings current = settings;
        if (current.getMode() == TickSettings.Mode.AS_FAST_AS_POSSIBLE) {
            task = executor.submit(() -> runAsFastAsPossible(gen));
        } else {
            task = executor.scheduleAtFixedRate(this::tickOnce, initialDelayNanos, current.periodNanos(), TimeUnit.NANOSECONDS);
        }
    }

    /** Must be called while holding {@code lock}. */
    private void cancelTask() {
        generation++;
        if (task != null) {
            task.cancel(false);
            task = null;
        }
    }

    private void runAsFastAsPossible(long gen) {
        while (generation == gen && !Thread.currentThread().isInterrupted()) {
            if (!tickOnce()) {
                LockSupport.parkNanos(IDLE_BACKOFF_NANOS);
            }
        }
    }

    /**
     * Emits one tick. Exceptions are caught because an exception escaping a fixed-rate task
     * would silently cancel every future tick.
     */
    private boolean tickOnce() {
        long tickNumber = tickCount.incrementAndGet();
        try {
            return listener.onTick(tickNumber);
        } catch (RuntimeException e) {
            logger.warn("Tick {} failed: {}", tickNumber, e.getMessage(), e);
            return false;
        }
    }
}
