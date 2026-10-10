package com.gensynth.core.connectors.file;

import com.gensynth.plugin.api.ConnectorConfig;
import com.gensynth.plugin.api.ConnectorContext;
import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.ConnectorInfo;
import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.ConnectorSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

/**
 * Built-in connector that writes the messages of a flow to a file
 * (a JSON array, an XML dataset, or one message per line for TXT and CSV).
 *
 * The file is written to {@code <outputDir>/<group>/<fileName>.<ext>}. By default the output
 * directory is the folder of the current simulation session and the file name is the flow name.
 */
public class FileConnectorPlugin implements ConnectorPlugin {

    private static final Logger LOGGER = LoggerFactory.getLogger(FileConnectorPlugin.class);

    private static final ConnectorInfo INFO = new ConnectorInfo(
        "file", "File Output", "1.0.0", "Writes the messages of the flow to a local file.");

    private static final List<ConnectorField> FIELDS = List.of(
        ConnectorField.select("format",
                ConnectorField.Option.of("json", "JSON array"),
                ConnectorField.Option.of("txt", "Text (one message per line)"),
                ConnectorField.Option.of("xml", "XML dataset"),
                ConnectorField.Option.of("csv", "CSV (one message per line)"))
            .label("File format")
            .tooltip("How messages are written: a JSON array, an XML <dataset>, or one message per line."),
        ConnectorField.text("outputDir")
            .label("Output directory")
            .placeholder("Session folder")
            .tooltip("Folder for the file. Leave empty to use the folder of the current simulation session "
                + "(OUTPUT_FILES_<date>). A sub-folder with the group name is always added."),
        ConnectorField.text("fileName")
            .label("File name")
            .placeholder("Flow name")
            .tooltip("File name without extension. Leave empty to use the flow name.")
    );

    @Override
    public ConnectorInfo info() {
        return INFO;
    }

    @Override
    public List<ConnectorField> fields() {
        return FIELDS;
    }

    @Override
    public ConnectorSession connect(ConnectorConfig config, ConnectorContext context) throws IOException {
        String format = config.getString("format", "json");
        String baseDir = config.getString("outputDir",
            context.outputDirectory() == null || context.outputDirectory().isBlank() ? "OUTPUT_FILES" : context.outputDirectory());
        Path directory = Paths.get(baseDir).resolve(sanitize(context.groupName(), "group"));
        Files.createDirectories(directory);

        String fileName = sanitize(config.getString("fileName", context.flowName()), "flow");
        Path file = directory.resolve(fileName + extension(format));
        LOGGER.info("File connector writing to {}", file.toAbsolutePath());
        return new FileSession(new FileOutputStream(file.toFile(), true), format);
    }

    private static String extension(String format) {
        return switch (format) {
            case "xml" -> ".xml";
            case "csv" -> ".csv";
            case "txt" -> ".txt";
            default -> ".json";
        };
    }

    private static String sanitize(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    /**
     * Appends messages to an open file, keeping it a valid JSON array or XML document.
     */
    static final class FileSession implements ConnectorSession {
        private final FileOutputStream stream;
        private final String format;
        private boolean first = true;
        private boolean closed;

        FileSession(FileOutputStream stream, String format) {
            this.stream = stream;
            this.format = format;
        }

        @Override
        public void send(byte[] payload, Map<String, String> headers) throws IOException {
            if (closed) {
                throw new IOException("File is closed");
            }
            if (first) {
                if ("json".equals(format)) write("[\n");
                else if ("xml".equals(format)) write("<dataset>\n");
            } else {
                write("json".equals(format) ? ",\n" : "\n");
            }
            first = false;
            stream.write(payload);
            stream.flush();
        }

        @Override
        public boolean isHealthy() {
            return !closed;
        }

        @Override
        public void close() throws IOException {
            if (closed) {
                return;
            }
            closed = true;
            try {
                if (first) {
                    if ("json".equals(format)) write("[]");
                    else if ("xml".equals(format)) write("<dataset></dataset>");
                } else {
                    if ("json".equals(format)) write("\n]");
                    else if ("xml".equals(format)) write("\n</dataset>");
                    else write("\n");
                }
            } finally {
                stream.close();
            }
        }

        private void write(String text) throws IOException {
            stream.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }
}
