package com.gensynth.core.connectors.file;

import com.gensynth.core.connectors.spi.ConnectorPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * File connector plugin supporting TXT and JSON output formats.
 *
 * Configuration:
 * - outputDir: base directory for output files (required)
 * - format: "txt" or "json" (default: "json")
 * - fileName: base filename without extension (auto-generated if not provided)
 */
public class FileConnectorPlugin implements ConnectorPlugin {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileConnectorPlugin.class);

    private Path outputDir;
    private String format = "json";  // "json" or "txt"
    private String fileName;
    private File outputFile;
    private FileOutputStream fileStream;
    private boolean healthy = false;
    private boolean isFirstMessage = true;

    @Override
    public void initialize(Map<String, Object> config) {
        try {
            // Read configuration
            Object outputDirObj = config.get("outputDir");
            if (outputDirObj == null) {
                throw new IllegalArgumentException("outputDir configuration is required");
            }

            outputDir = Paths.get(outputDirObj.toString());
            
            Object groupNameObj = config.get("groupName");
            if (groupNameObj != null) {
                String safeGroupName = groupNameObj.toString().replaceAll("[^a-zA-Z0-9_\\-]", "_");
                outputDir = outputDir.resolve(safeGroupName);
            }

            // Create directory if it doesn't exist
            Files.createDirectories(outputDir);
            LOGGER.info("File connector initialized with output directory: {}", outputDir.toAbsolutePath());

            // Optional: format override
            if (config.containsKey("format")) {
                format = config.get("format").toString().toLowerCase();
            }

            // Optional: custom filename
            if (config.containsKey("fileName")) {
                fileName = config.get("fileName").toString();
            }


            healthy = true;
        } catch (IOException e) {
            LOGGER.error("Failed to initialize FileConnectorPlugin", e);
            healthy = false;
            throw new RuntimeException("FileConnectorPlugin initialization failed", e);
        }
    }

    @Override
    public void start() {
        try {
            // Resolve filename at start time if not provided
            if (fileName == null) {
                fileName = "output_" + System.currentTimeMillis();
            }

            String fileExtension = switch (format) {
                case "xml" -> ".xml";
                case "csv" -> ".csv";
                case "txt", "plain" -> ".txt";
                default -> ".json";
            };
            outputFile = outputDir.resolve(fileName + fileExtension).toFile();

            // Open file in append mode
            fileStream = new FileOutputStream(outputFile, true);
            isFirstMessage = true;
            LOGGER.info("FileConnectorPlugin started: {}", outputFile.getAbsolutePath());
            healthy = true;
        } catch (IOException e) {
            LOGGER.error("Failed to start FileConnectorPlugin", e);
            healthy = false;
            throw new RuntimeException("FileConnectorPlugin startup failed", e);
        }
    }

    @Override
    public void publish(String destination, byte[] payload, Map<String, String> headers) {
        if (!healthy || fileStream == null) {
            LOGGER.warn("FileConnectorPlugin is not healthy or started");
            return;
        }

        try {
            synchronized (this) {
                if (isFirstMessage) {
                    if ("json".equals(format)) {
                        fileStream.write("[\n".getBytes());
                    } else if ("xml".equals(format)) {
                        fileStream.write("<dataset>\n".getBytes());
                    }
                } else {
                    if ("json".equals(format)) {
                        fileStream.write(",\n".getBytes());
                    } else {
                        fileStream.write('\n');
                    }
                }
                isFirstMessage = false;
                
                fileStream.write(payload);
                fileStream.flush();
            }
        } catch (IOException e) {
            LOGGER.error("Failed to write to output file: {}", outputFile.getAbsolutePath(), e);
            healthy = false;
        }
    }

    @Override
    public void stop() {
        try {
            if (fileStream != null) {
                synchronized (this) {
                    if (!isFirstMessage) {
                        if ("json".equals(format)) {
                            fileStream.write("\n]".getBytes());
                        } else if ("xml".equals(format)) {
                            fileStream.write("\n</dataset>".getBytes());
                        } else {
                            fileStream.write('\n');
                        }
                    } else {
                        if ("json".equals(format)) {
                            fileStream.write("[]".getBytes());
                        } else if ("xml".equals(format)) {
                            fileStream.write("<dataset></dataset>".getBytes());
                        }
                    }
                }
                fileStream.close();
                fileStream = null;
                LOGGER.info("FileConnectorPlugin stopped");
            }
            healthy = false;
        } catch (IOException e) {
            LOGGER.error("Error closing file stream", e);
        }
    }

    @Override
    public boolean isHealthy() {
        return healthy && fileStream != null;
    }
}
