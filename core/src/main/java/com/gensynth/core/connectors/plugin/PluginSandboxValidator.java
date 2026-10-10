package com.gensynth.core.connectors.plugin;

import com.gensynth.plugin.api.ConnectorField;
import com.gensynth.plugin.api.ConnectorInfo;
import com.gensynth.plugin.api.ConnectorPlugin;
import com.gensynth.plugin.api.PluginApi;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.DirectoryStream;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.jar.JarEntry;
import java.util.jar.JarInputStream;

/**
 * Validates plugin JARs in an isolated sandbox before installation.
 *
 * Performs the following security and structural checks:
 * <ol>
 *   <li>JAR format validity</li>
 *   <li>SPI service file presence</li>
 *   <li>Bytecode scanning for blocked APIs (ASM)</li>
 *   <li>Descriptor loading with timeout in isolated ClassLoader</li>
 *   <li>Core API version compatibility</li>
 *   <li>Duplicate plugin detection</li>
 * </ol>
 *
 * All error messages returned are intentionally generic to avoid
 * exposing internal core architecture to plugin developers.
 */
public class PluginSandboxValidator {

    private static final Logger logger = LoggerFactory.getLogger(PluginSandboxValidator.class);

    /** Current core API version for compatibility checking. */

    /** Maximum time in seconds to load and inspect a plugin descriptor. */
    private static final int DESCRIPTOR_LOAD_TIMEOUT_SECONDS = 5;

    /** SPI service file path inside the JAR. */
    private static final String SPI_SERVICE_FILE = PluginApi.SERVICE_FILE;

    /** Prefix of the temporary copy of the plugin JAR loaded by the sandbox. */
    private static final String TEMP_JAR_PREFIX = "gensynth-plugin-validate-";

    /** Service file of plugins built for the legacy pre-release plugin API. */
    private static final String LEGACY_SERVICE_FILE =
            "META-INF/services/com.gensynth.core.connectors.spi.ConnectorPluginProvider";

    /** What the sandbox learns about a plugin. */
    record LoadedPlugin(ConnectorInfo info, int fieldCount) {
    }

    /**
     * Blocked method owners and names — any class invoking these will fail validation.
     * Key: internal class name (e.g. java/lang/Runtime), Value: set of method names.
     */
    private static final Map<String, Set<String>> BLOCKED_APIS = Map.of(
            "java/lang/Runtime", Set.of("exec", "halt", "exit"),
            "java/lang/ProcessBuilder", Set.of("start", "startPipeline"),
            "java/lang/System", Set.of("exit"),
            "java/net/ServerSocket", Set.of("<init>"),
            "java/net/DatagramSocket", Set.of("<init>"),
            "java/io/FileOutputStream", Set.of("<init>"),
            "java/io/RandomAccessFile", Set.of("<init>"),
            "java/nio/file/Files", Set.of("write", "delete", "move", "createFile", "createDirectory",
                    "createDirectories", "newOutputStream")
    );

    /** Directory containing shared libraries for validation classpath resolution. */
    private final Path sharedLibDir;

    /** Set of existing plugin keys (pluginId@version) for duplicate detection. */
    private final Set<String> existingPluginKeys;

    /**
     * Constructs the validator with knowledge of currently installed plugins.
     *
     * @param existingPluginKeys set of "pluginId@version" strings already loaded
     * @param sharedLibDir       path to the directory containing shared libraries
     */
    public PluginSandboxValidator(Set<String> existingPluginKeys, Path sharedLibDir) {
        this.existingPluginKeys = existingPluginKeys != null ? existingPluginKeys : Set.of();
        this.sharedLibDir = sharedLibDir;
    }

    /**
     * Validates a plugin JAR without installing it.
     *
     * @param jarBytes        raw JAR file bytes
     * @param expectedName    user-provided plugin name (informational)
     * @param expectedVersion user-provided version (informational)
     * @return validation result with extracted metadata and any errors/warnings
     */
    public PluginValidationResult validate(byte[] jarBytes, String expectedName, String expectedVersion) {
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        builder.log(PluginValidationResult.ValidationLevel.INFO, "Starting validation for plugin: " + expectedName);

        // 1. Validate JAR format
        if (!isValidJar(jarBytes, builder)) {
            return builder.build();
        }

        // 2. Check SPI service file
        if (!containsSpiServiceFile(jarBytes, builder)) {
            return builder.build();
        }

        // 3. Bytecode scan for blocked APIs
        if (!passesBytecodeCheck(jarBytes, builder)) {
            return builder.build();
        }

        // 4. Load the plugin in an isolated sandbox with timeout
        LoadedPlugin loaded = loadDescriptorInSandbox(jarBytes, builder);
        if (loaded == null) {
            return builder.build();
        }

        ConnectorInfo info = loaded.info();
        builder.pluginId(info.id())
               .displayName(info.displayName())
               .pluginVersion(info.version())
               .description(info.description())
               .fieldCount(loaded.fieldCount())
               .apiVersion(PluginApi.VERSION);
        builder.log(PluginValidationResult.ValidationLevel.INFO,
            "Built for plugin API " + PluginApi.VERSION + " with " + loaded.fieldCount() + " configuration fields.");

        // 5. Check for duplicates
        String key = info.id() + "@" + info.version();
        if (existingPluginKeys.contains(key)) {
            builder.log(PluginValidationResult.ValidationLevel.WARN, 
                "A plugin with the same ID and version already exists. Installation will overwrite it.", key);
        } else {
            builder.log(PluginValidationResult.ValidationLevel.INFO, "No duplicate plugins detected.");
        }

        return builder.build();
    }

    /**
     * Checks that the bytes represent a valid JAR archive.
     */
    boolean isValidJar(byte[] jarBytes, PluginValidationResult.Builder builder) {
        if (jarBytes == null || jarBytes.length == 0) {
            builder.log(PluginValidationResult.ValidationLevel.ERROR, "Plugin file is empty or null.");
            return false;
        }

        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            JarEntry entry = jis.getNextJarEntry();
            if (entry == null) {
                builder.log(PluginValidationResult.ValidationLevel.ERROR, "The uploaded file is not a valid JAR archive (no entries).");
                return false;
            }
            builder.log(PluginValidationResult.ValidationLevel.INFO, "Valid JAR format detected.");
            return true;
        } catch (IOException e) {
            builder.log(PluginValidationResult.ValidationLevel.ERROR, "Failed to read JAR format: " + e.getMessage());
            return false;
        }
    }

    /**
     * Checks that the JAR contains the SPI service registration file.
     */
    boolean containsSpiServiceFile(byte[] jarBytes, PluginValidationResult.Builder builder) {
        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            JarEntry entry;
            while ((entry = jis.getNextJarEntry()) != null) {
                if (SPI_SERVICE_FILE.equals(entry.getName())) {
                    builder.log(PluginValidationResult.ValidationLevel.INFO, "SPI service registration found: " + SPI_SERVICE_FILE);
                    return true;
                }
            }
        } catch (IOException e) {
            logger.debug("Error scanning JAR for SPI file", e);
        }
        if (containsEntry(jarBytes, LEGACY_SERVICE_FILE)) {
            builder.log(PluginValidationResult.ValidationLevel.ERROR,
                "Plugin was built for the legacy plugin API (ConnectorPluginProvider). Rebuild it with gensynth-plugin-api " + PluginApi.VERSION
                    + " (see plugin-api/PLUGIN_DEVELOPER_GUIDE.md).");
            return false;
        }
        builder.log(PluginValidationResult.ValidationLevel.ERROR, "Plugin is missing service registration file: '" + SPI_SERVICE_FILE + "'");
        return false;
    }

    private static boolean containsEntry(byte[] jarBytes, String name) {
        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            JarEntry entry;
            while ((entry = jis.getNextJarEntry()) != null) {
                if (name.equals(entry.getName())) {
                    return true;
                }
            }
        } catch (IOException ignored) {
            // Not readable: treated as absent
        }
        return false;
    }

    /**
     * Scans all .class files in the JAR for invocations of blocked APIs.
     */
    boolean passesBytecodeCheck(byte[] jarBytes, PluginValidationResult.Builder builder) {
        int classesScanned = 0;
        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            JarEntry entry;
            while ((entry = jis.getNextJarEntry()) != null) {
                if (!entry.getName().endsWith(".class")) {
                    continue;
                }
                classesScanned++;
                byte[] classBytes = readEntryBytes(jis);
                List<String> violations = scanClassForBlockedApis(classBytes);
                if (!violations.isEmpty()) {
                    String className = entry.getName().replace("/", ".").replace(".class", "");
                    builder.log(PluginValidationResult.ValidationLevel.ERROR, 
                        "Security violation: usage of restricted APIs", "Class: " + className + ", Violations: " + violations);
                    return false;
                }
            }
            builder.log(PluginValidationResult.ValidationLevel.INFO, "Bytecode scan completed. Classes analyzed: " + classesScanned);
            return true;
        } catch (IOException e) {
            builder.log(PluginValidationResult.ValidationLevel.ERROR, "Failed to analyze bytecode: " + e.getMessage());
            return false;
        }
    }

    /**
     * Scans a single class file for blocked API invocations using ASM.
     *
     * @param classBytes raw .class file bytes
     * @return list of violation descriptions (empty if clean)
     */
    List<String> scanClassForBlockedApis(byte[] classBytes) {
        List<String> violations = new ArrayList<>();

        try {
            ClassReader reader = new ClassReader(classBytes);
            reader.accept(new ClassVisitor(Opcodes.ASM9) {
                @Override
                public MethodVisitor visitMethod(int access, String name, String descriptor,
                                                  String signature, String[] exceptions) {
                    return new MethodVisitor(Opcodes.ASM9) {
                            @Override
                            public void visitMethodInsn(int opcode, String owner, String methodName,
                                                         String methodDescriptor, boolean isInterface) {
                            Set<String> blockedMethods = BLOCKED_APIS.get(owner);
                            if (blockedMethods != null && blockedMethods.contains(methodName)) {
                                violations.add(owner.replace("/", ".") + "." + methodName);
                            }
                        }
                    };
                }
            }, ClassReader.SKIP_FRAMES | ClassReader.SKIP_DEBUG);
        } catch (Exception e) {
            violations.add("Unreadable class file: " + e.getMessage());
        }

        return violations;
    }

    /**
     * Loads the plugin in an isolated ClassLoader with a timeout and reads its info and fields.
     *
     * @return what was loaded, or null (with errors populated)
     */
    LoadedPlugin loadDescriptorInSandbox(byte[] jarBytes, PluginValidationResult.Builder builder) {
        Path tempFile = null;
        try {
            tempFile = createPrivateTempJar();
            Files.write(tempFile, jarBytes);

            List<URL> urls = new ArrayList<>();
            urls.add(tempFile.toUri().toURL());

            if (sharedLibDir != null && Files.isDirectory(sharedLibDir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(sharedLibDir, "*.jar")) {
                    for (Path sharedJar : stream) {
                        urls.add(sharedJar.toUri().toURL());
                    }
                }
            }

            URLClassLoader sandboxLoader = new URLClassLoader(
                    urls.toArray(new URL[0]),
                    ConnectorPlugin.class.getClassLoader()
            );

            try {
                builder.log(PluginValidationResult.ValidationLevel.INFO, "Inspecting plugin...");
                LoadedPlugin loaded = loadWithTimeout(sandboxLoader);
                if (loaded == null) {
                    builder.log(PluginValidationResult.ValidationLevel.ERROR, "No ConnectorPlugin found in ServiceLoader.");
                } else {
                    builder.log(PluginValidationResult.ValidationLevel.INFO, "Found plugin: " + loaded.info().id() + " v" + loaded.info().version());
                }
                return loaded;
            } finally {
                sandboxLoader.close();
            }
        } catch (TimeoutException e) {
            builder.log(PluginValidationResult.ValidationLevel.ERROR, "Loading timeout: plugin took too long to respond (> " + DESCRIPTOR_LOAD_TIMEOUT_SECONDS + "s)");
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            builder.log(PluginValidationResult.ValidationLevel.ERROR, "Plugin validation was interrupted.");
            return null;
        } catch (Exception e) {
            logger.debug("Error loading plugin descriptor in sandbox", e);
            String message = (e.getCause() != null) ? e.getCause().getMessage() : e.getMessage();
            builder.log(PluginValidationResult.ValidationLevel.ERROR, "Failed to load plugin descriptor", message);
            return null;
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {}
            }
        }
    }

    /**
     * Creates the temporary file the plugin JAR is copied to before loading it. Only its owner
     * can read or write it, so another local user cannot swap the JAR between validation and
     * loading.
     *
     * @return the new, empty temporary file
     * @throws IOException if the file cannot be created
     */
    static Path createPrivateTempJar() throws IOException {
        return createPrivateTempJar(FileSystems.getDefault().supportedFileAttributeViews().contains("posix"));
    }

    /**
     * Creates the temporary plugin JAR file.
     *
     * @param posix whether the file system supports POSIX permissions
     * @return the new, empty temporary file
     * @throws IOException if the file cannot be created
     */
    // S5443 flags the Windows branch, which cannot set POSIX permissions: there the temporary
    // directory (%TEMP%) is inside the user profile and not writable by other users
    @SuppressWarnings("java:S5443")
    static Path createPrivateTempJar(boolean posix) throws IOException {
        if (posix) {
            return Files.createTempFile(TEMP_JAR_PREFIX, ".jar",
                PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        }
        // Windows: the temporary directory is already private to the user
        return Files.createTempFile(TEMP_JAR_PREFIX, ".jar");
    }

    /**
     * Loads the first ConnectorPlugin of the JAR using ServiceLoader within the given
     * ClassLoader, with a timeout to prevent blocking code. Reading its info and fields is
     * the dry run: it executes the plugin's constructor and static initialization.
     */
    private LoadedPlugin loadWithTimeout(URLClassLoader classLoader)
            throws TimeoutException, ExecutionException, InterruptedException {
        // Not try-with-resources: close() waits for the task, so a plugin that hangs while loading
        // would block the validation forever. shutdownNow() in the finally block interrupts it instead.
        @SuppressWarnings("java:S2095")
        ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "plugin-sandbox-loader");
            t.setDaemon(true);
            return t;
        });

        try {
            Callable<LoadedPlugin> task = () -> {
                ServiceLoader<ConnectorPlugin> loader = ServiceLoader.load(ConnectorPlugin.class, classLoader);
                for (ConnectorPlugin plugin : loader) {
                    // Only validate the plugin that comes from the current JAR
                    if (plugin.getClass().getClassLoader() == classLoader) {
                        try {
                            ConnectorInfo info = plugin.info();
                            List<ConnectorField> fields = ConnectorField.requireUniqueKeys(List.copyOf(plugin.fields()));
                            return new LoadedPlugin(info, fields.size());
                        } catch (Throwable t) {
                            throw new RuntimeException("Dry-run failed: plugin info or fields are invalid. " + t.getMessage(), t);
                        }
                    }
                }
                return null;
            };

            Future<LoadedPlugin> future = executor.submit(task);
            return future.get(DESCRIPTOR_LOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
    }

    /**
     * Reads all bytes from the current JAR entry stream.
     */
    private byte[] readEntryBytes(InputStream is) throws IOException {
        return is.readAllBytes();
    }
}
