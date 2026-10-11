package com.gensynth.core.monitoring;

import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;

/**
 * CPU and memory used by the GenSynth process, as shown in the resource bar of the desktop
 * application and in the status panel of the command line.
 *
 * @param cpuPercent   CPU load of the process, from 0 to 100 (0 when the JVM cannot measure it)
 * @param usedMemoryMb heap in use, in MB (at least 1)
 * @param heapMb       heap reserved by the JVM, in MB (at least 1)
 * @param threads      live threads
 */
public record ResourceUsage(double cpuPercent, int usedMemoryMb, int heapMb, int threads) {

    /**
     * @return the usage at this moment
     */
    public static ResourceUsage sample() {
        Runtime runtime = Runtime.getRuntime();
        long usedMemory = runtime.totalMemory() - runtime.freeMemory();
        return new ResourceUsage(processCpuLoad() * 100.0, bytesToMb(usedMemory),
            bytesToMb(runtime.totalMemory()), Thread.activeCount());
    }

    private static double processCpuLoad() {
        try {
            OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunOsBean) {
                return Math.max(0.0, sunOsBean.getProcessCpuLoad());
            }
        } catch (Exception ignored) {
            // Not available on this JVM: report 0
        }
        return 0.0;
    }

    private static int bytesToMb(long bytes) {
        return (int) Math.max(1L, bytes / (1024 * 1024));
    }
}
