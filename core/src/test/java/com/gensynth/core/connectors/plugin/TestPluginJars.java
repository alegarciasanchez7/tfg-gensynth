package com.gensynth.core.connectors.plugin;

import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.PluginApi;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.stream.Stream;

/**
 * Builds real connector plugin JARs for the tests: the plugin class is compiled from source
 * against the plugin API, so it can only be loaded from the JAR (never from the test class path).
 * The plugin declares one text field and its sessions accept every message.
 */
public final class TestPluginJars {

    private TestPluginJars() {
    }

    /**
     * @param id          plugin id, also the package of its class (a valid Java identifier)
     * @param displayName name shown to the user
     * @param version     plugin version
     * @return the bytes of the plugin JAR
     * @throws IOException if the plugin cannot be compiled or packaged
     */
    public static byte[] connector(String id, String displayName, String version) throws IOException {
        Path work = Files.createTempDirectory("gensynth-test-plugin-");
        try {
            Path source = work.resolve("src").resolve(id).resolve("TestConnector.java");
            Files.createDirectories(source.getParent());
            Files.writeString(source, source(id, displayName, version), StandardCharsets.UTF_8);
            Path classes = Files.createDirectories(work.resolve("classes"));

            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
            if (compiler == null) {
                throw new IOException("The tests need a JDK to compile the test plugin");
            }
            int status = compiler.run(null, null, null, "-classpath", pluginApiLocation().toString(),
                "-d", classes.toString(), source.toString());
            if (status != 0) {
                throw new IOException("The test plugin did not compile");
            }
            return jar(classes, id + ".TestConnector");
        } finally {
            deleteRecursively(work);
        }
    }

    private static String source(String id, String displayName, String version) {
        return """
            package %1$s;

            import com.gensynth.plugin.api.*;
            import java.util.List;
            import java.util.Map;

            public class TestConnector implements ConnectorPlugin {
                public ConnectorInfo info() {
                    return new ConnectorInfo("%1$s", "%2$s", "%3$s", "Test connector that accepts every message.");
                }

                public List<ConnectorField> fields() {
                    return List.of(ConnectorField.text("target").label("Target").defaultValue("anywhere"));
                }

                public ConnectorSession connect(ConnectorConfig config, ConnectorContext context) {
                    return new ConnectorSession() {
                        public void send(byte[] payload, Map<String, String> headers) {
                            // Accepted
                        }

                        public void close() {
                            // Nothing to release
                        }
                    };
                }
            }
            """.formatted(id, displayName, version);
    }

    private static Path pluginApiLocation() throws IOException {
        try {
            return Path.of(ConnectorPlugin.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (URISyntaxException e) {
            throw new IOException(e);
        }
    }

    private static byte[] jar(Path classes, String pluginClass) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (JarOutputStream jar = new JarOutputStream(bytes); Stream<Path> files = Files.walk(classes)) {
            jar.putNextEntry(new JarEntry(PluginApi.SERVICE_FILE));
            jar.write((pluginClass + "\n").getBytes(StandardCharsets.UTF_8));
            jar.closeEntry();
            for (Path file : files.filter(Files::isRegularFile).toList()) {
                jar.putNextEntry(new JarEntry(classes.relativize(file).toString().replace('\\', '/')));
                jar.write(Files.readAllBytes(file));
                jar.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private static void deleteRecursively(Path folder) throws IOException {
        try (Stream<Path> paths = Files.walk(folder)) {
            for (Path path : paths.sorted((a, b) -> b.compareTo(a)).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    /**
     * @return the names of the files in a folder, sorted
     * @throws IOException if the folder cannot be read
     */
    public static List<String> fileNames(Path folder) throws IOException {
        try (Stream<Path> paths = Files.list(folder)) {
            return paths.map(path -> path.getFileName().toString()).sorted().toList();
        }
    }
}
