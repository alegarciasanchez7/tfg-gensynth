package com.gensynth.core.api;

/**
 * Receives the ticks of the global simulation clock.
 */
@FunctionalInterface
public interface ITickListener {

    /**
     * Called once per tick, always from the clock thread and never concurrently.
     * The next tick does not start until this method returns.
     *
     * @param tickNumber sequential tick number, starting at 1 every time the clock starts
     * @return true if any work was dispatched on this tick; used by the
     *         as-fast-as-possible mode to back off while there is nothing to do
     */
    boolean onTick(long tickNumber);
}
