package com.gensynth.core.connectors.plugin;

import com.gensynth.core.connectors.spi.ConnectorPluginDescriptor;
import com.gensynth.core.connectors.spi.ConnectorPluginProvider;
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
import java.nio.file.Files;
import java.nio.file.Path;
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
    private static final String CORE_API_VERSION = "1.x";

    /** Maximum time in seconds to load and inspect a plugin descriptor. */
    private static final int DESCRIPTOR_LOAD_TIMEOUT_SECONDS = 5;

    /** SPI service file path inside the JAR. */
    private static final String SPI_SERVICE_FILE =
            "META-INF/services/com.gensynth.core.connectors.spi.ConnectorPluginProvider";

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
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // 1. Validate JAR format
        if (!isValidJar(jarBytes, errors)) {
            return PluginValidationResult.failure(errors);
        }

        // 2. Check SPI service file
        if (!containsSpiServiceFile(jarBytes, errors)) {
            return PluginValidationResult.failure(errors);
        }

        // 3. Bytecode scan for blocked APIs
        if (!passesBytecodeCheck(jarBytes, errors)) {
            return PluginValidationResult.failure(errors);
        }

        // 4. Load descriptor in isolated sandbox with timeout
        ConnectorPluginDescriptor descriptor = loadDescriptorInSandbox(jarBytes, errors);
        if (descriptor == null) {
            return PluginValidationResult.failure(errors);
        }

        // 5. Check API version compatibility
        if (!isApiVersionCompatible(descriptor.getCoreApiVersion(), errors)) {
            return new PluginValidationResult.Builder()
                    .valid(false)
                    .pluginId(descriptor.getPluginId())
                    .displayName(descriptor.getDisplayName())
                    .pluginVersion(descriptor.getPluginVersion())
                    .coreApiVersion(descriptor.getCoreApiVersion())
                    .errors(errors)
                    .warnings(warnings)
                    .build();
        }

        // 6. Check for duplicates
        String key = descriptor.getPluginId() + "@" + descriptor.getPluginVersion();
        if (existingPluginKeys.contains(key)) {
            errors.add("A plugin with the same identifier and version is already installed.");
            return new PluginValidationResult.Builder()
                    .valid(false)
                    .pluginId(descriptor.getPluginId())
                    .displayName(descriptor.getDisplayName())
                    .pluginVersion(descriptor.getPluginVersion())
                    .coreApiVersion(descriptor.getCoreApiVersion())
                    .errors(errors)
                    .warnings(warnings)
                    .build();
        }

        // All checks passed
        return new PluginValidationResult.Builder()
                .valid(true)
                .pluginId(descriptor.getPluginId())
                .displayName(descriptor.getDisplayName())
                .pluginVersion(descriptor.getPluginVersion())
                .coreApiVersion(descriptor.getCoreApiVersion())
                .errors(errors)
                .warnings(warnings)
                .build();
    }

    /**
     * Checks that the bytes represent a valid JAR archive.
     */
    boolean isValidJar(byte[] jarBytes, List<String> errors) {
        if (jarBytes == null || jarBytes.length == 0) {
            errors.add("Plugin file is empty or null.");
            return false;
        }

        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            // Try reading at least one entry to confirm it's a valid JAR
            JarEntry entry = jis.getNextJarEntry();
            if (entry == null) {
                errors.add("The uploaded file is not a valid JAR archive.");
                return false;
            }
            return true;
        } catch (IOException e) {
            errors.add("The uploaded file is not a valid JAR archive.");
            return false;
        }
    }

    /**
     * Checks that the JAR contains the SPI service registration file.
     */
    boolean containsSpiServiceFile(byte[] jarBytes, List<String> errors) {
        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            JarEntry entry;
            while ((entry = jis.getNextJarEntry()) != null) {
                if (SPI_SERVICE_FILE.equals(entry.getName())) {
                    return true;
                }
            }
        } catch (IOException e) {
            logger.debug("Error scanning JAR for SPI file", e);
        }
        errors.add("Plugin does not contain the required service registration. See the plugin development guide.");
        return false;
    }

    /**
     * Scans all .class files in the JAR for invocations of blocked APIs.
     */
    boolean passesBytecodeCheck(byte[] jarBytes, List<String> errors) {
        try (JarInputStream jis = new JarInputStream(new ByteArrayInputStream(jarBytes))) {
            JarEntry entry;
            while ((entry = jis.getNextJarEntry()) != null) {
                if (!entry.getName().endsWith(".class")) {
                    continue;
                }

                byte[] classBytes = readEntryBytes(jis);
                List<String> violations = scanClassForBlockedApis(classBytes);
                if (!violations.isEmpty()) {
                    String className = entry.getName().replace("/", ".").replace(".class", "");
                    errors.add("Blocked API usage found in " + className + ": " + String.join(", ", violations));
                    logger.warn("Blocked API usage found in {}: {}", entry.getName(), violations);
                    return false;
                }
            }
            return true;
        } catch (IOException e) {
            errors.add("Failed to analyze plugin bytecode.");
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
                                
                                // No more whitelist. Validation is now 100% strict.
                                // Plugins should not contain their own copies of trusted libraries.

                            Set<String> blockedMethods = BLOCKED_APIS.get(owner);
                            if (blockedMethods != null && blockedMethods.contains(methodName)) {
                                violations.add(owner + "." + methodName);
                            }
                        }
                    };
                }
            }, ClassReader.SKIP_FRAMES | ClassReader.SKIP_DEBUG);
        } catch (Exception e) {
            violations.add("Unreadable class file");
        }

        return violations;
    }

    /**
     * Loads the ConnectorPluginProvider descriptor in an isolated ClassLoader with a timeout.
     *
     * @return the descriptor if successfully loaded, or null (with errors populated)
     */
    ConnectorPluginDescriptor loadDescriptorInSandbox(byte[] jarBytes, List<String> errors) {
        Path tempFile = null;
        try {
            // Write JAR to a temp file so URLClassLoader can load it
            tempFile = Files.createTempFile("gensynth-plugin-validate-", ".jar");
            Files.write(tempFile, jarBytes);

            List<URL> urls = new ArrayList<>();
            urls.add(tempFile.toUri().toURL());

            // Include shared libraries in the sandbox classpath for dependency resolution
            if (sharedLibDir != null && Files.isDirectory(sharedLibDir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(sharedLibDir, "*.jar")) {
                    for (Path sharedJar : stream) {
                        urls.add(sharedJar.toUri().toURL());
                    }
                }
            }

            // Parent is the system classloader so the plugin can see the SPI interfaces
            URLClassLoader sandboxLoader = new URLClassLoader(
                    urls.toArray(new URL[0]),
                    ConnectorPluginProvider.class.getClassLoader()
            );

            try {
                ConnectorPluginDescriptor descriptor = loadWithTimeout(sandboxLoader);
                if (descriptor == null) {
                    errors.add("No valid plugin provider found in the JAR.");
                }
                return descriptor;
            } finally {
                sandboxLoader.close();
            }
        } catch (TimeoutException e) {
            errors.add("Plugin took too long to load. It may contain blocking or infinite code.");
            return null;
        } catch (Exception e) {
            logger.debug("Error loading plugin descriptor in sandbox", e);
            String message = (e.getCause() != null) ? e.getCause().getMessage() : e.getMessage();
            errors.add("Failed to load plugin descriptor: " + message);
            return null;
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                    // Best-effort cleanup
                }
            }
        }
    }

    /**
     * Loads the first ConnectorPluginProvider's descriptor using ServiceLoader
     * within the given ClassLoader, with a timeout to prevent blocking code.
     */
    private ConnectorPluginDescriptor loadWithTimeout(URLClassLoader classLoader)
            throws TimeoutException, ExecutionException, InterruptedException {
        ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "plugin-sandbox-loader");
            t.setDaemon(true);
            return t;
        });

        try {
            Callable<ConnectorPluginDescriptor> task = () -> {
                ServiceLoader<ConnectorPluginProvider> loader =
                        ServiceLoader.load(ConnectorPluginProvider.class, classLoader);
                for (ConnectorPluginProvider provider : loader) {
                    // Ensure we only load the provider defined in the JAR being validated,
                    // not bundled providers from the parent classloader.
                    if (provider.getClass().getClassLoader() == classLoader) {
                        return provider.descriptor();
                    }
                }
                return null;
            };

            Future<ConnectorPluginDescriptor> future = executor.submit(task);
            return future.get(DESCRIPTOR_LOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
    }

    /**
     * Checks if the plugin's declared core API version is compatible with the current core.
     */
    boolean isApiVersionCompatible(String pluginApiVersion, List<String> errors) {
        if (pluginApiVersion == null || pluginApiVersion.isBlank()) {
            errors.add("Plugin does not declare a compatible API version.");
            return false;
        }

        // Simple compatibility: must match the major version pattern (e.g. "1.x" matches "1.x")
        String coreMajor = CORE_API_VERSION.split("\\.")[0];
        String pluginMajor = pluginApiVersion.split("\\.")[0];

        if (!coreMajor.equals(pluginMajor)) {
            errors.add("Plugin is not compatible with the current version of Gen-Synth.");
            return false;
        }

        return true;
    }

    /**
     * Reads all bytes from the current JAR entry stream.
     */
    private byte[] readEntryBytes(InputStream is) throws IOException {
        return is.readAllBytes();
    }
}
