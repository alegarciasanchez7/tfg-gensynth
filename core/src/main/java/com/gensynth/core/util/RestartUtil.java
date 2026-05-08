package com.gensynth.core.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.List;

/**
 * Utility to handle self-restarting of the Gen-Synth Core process.
 * Essential for applying plugin changes without manual intervention.
 */
public class RestartUtil {

    private static final Logger logger = LoggerFactory.getLogger(RestartUtil.class);

    /**
     * Spawns a new instance of the current application and then terminates the current one.
     */
    public static void restart() {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            boolean isWindows = os.contains("win");
            
            // Detect if we are running under Maven (common in dev)
            String classpath = System.getProperty("java.class.path");
            boolean isMaven = classpath.contains("plexus-classworlds") || System.getProperty("maven.home") != null;

            List<String> command = new ArrayList<>();
            
            if (isMaven) {
                logger.info("Detected Maven environment. Restarting via Maven...");
                command.add(isWindows ? "mvn.cmd" : "mvn");
                command.add("exec:java");
                command.add("-Dexec.mainClass=com.gensynth.core.App");
            } else {
                logger.info("Detected standard Java environment. Restarting via Java...");
                String javaHome = System.getProperty("java.home");
                String javaBin = javaHome + File.separator + "bin" + File.separator + "java";
                
                command.add(javaBin);
                command.addAll(ManagementFactory.getRuntimeMXBean().getInputArguments());
                command.add("-cp");
                command.add(classpath);
                command.add("com.gensynth.core.App");
            }

            logger.info("Spawning new process: {}", String.join(" ", command));

            ProcessBuilder builder = new ProcessBuilder(command);
            // On Windows, if running Maven, we might need shell execution
            if (isMaven && isWindows) {
                // Use cmd /c to ensure mvn.cmd is found and executed correctly
                List<String> winCommand = new ArrayList<>();
                winCommand.add("cmd");
                winCommand.add("/c");
                winCommand.addAll(command);
                builder = new ProcessBuilder(winCommand);
            }
            
            builder.inheritIO();
            builder.start();
            
            logger.info("New process started. Terminating current process...");
            System.exit(0);
            
        } catch (IOException e) {
            logger.error("Failed to self-restart Gen-Synth Core: {}", e.getMessage(), e);
            // If restart fails, at least we exit so the user knows something happened
            System.exit(1);
        }
    }
}
