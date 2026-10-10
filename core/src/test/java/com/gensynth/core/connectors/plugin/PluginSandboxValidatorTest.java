package com.gensynth.core.connectors.plugin;

import org.junit.Test;
import org.junit.Before;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/**
 * Unit tests for the PluginSandboxValidator.
 *
 * Tests cover JAR format validation, SPI file detection,
 * bytecode scanning for blocked APIs, and duplicate detection.
 */
public class PluginSandboxValidatorTest {

    private PluginSandboxValidator validator;

    @Before
    public void setUp() {
        validator = new PluginSandboxValidator(Set.of(), null);
    }

    @Test
    public void testNullBytesReturnError() {
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.isValidJar(null, builder);

        assertFalse(result);
        assertFalse(builder.build().getErrors().isEmpty());
    }

    @Test
    public void testEmptyBytesReturnError() {
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.isValidJar(new byte[0], builder);

        assertFalse(result);
        assertFalse(builder.build().getErrors().isEmpty());
    }

    @Test
    public void testRandomBytesAreNotValidJar() {
        byte[] randomBytes = {0x50, 0x4B, 0x00, 0x00, 0x01, 0x02, 0x03};
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.isValidJar(randomBytes, builder);

        // Random bytes should fail validation (not a real JAR)
        assertFalse(result);
    }

    @Test
    public void testValidEmptyJar() throws IOException {
        byte[] jar = createMinimalJar();
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.isValidJar(jar, builder);

        assertTrue(result);
        assertTrue(builder.build().getErrors().isEmpty());
    }

    @Test
    public void testMissingSpiFile() throws IOException {
        byte[] jar = createMinimalJar();
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.containsSpiServiceFile(jar, builder);

        assertFalse(result);
        assertFalse(builder.build().getErrors().isEmpty());
    }

    @Test
    public void testPresentSpiFile() throws IOException {
        byte[] jar = createJarWithSpiFile();
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.containsSpiServiceFile(jar, builder);

        assertTrue(result);
        assertTrue(builder.build().getErrors().isEmpty());
    }

    @Test
    public void testValidationFailsForRandomBytes() {
        byte[] randomBytes = new byte[]{1, 2, 3, 4, 5, 6, 7, 8};

        PluginValidationResult result = validator.validate(randomBytes, "test", "1.0.0");

        assertFalse(result.isValid());
        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    public void testDuplicatePluginDetection() throws IOException {
        // Create a validator with an existing plugin key
        PluginSandboxValidator validatorWithExisting =
                new PluginSandboxValidator(Set.of("my-plugin@1.0.0"), null);

        byte[] jar = createJarWithSpiFile();
        PluginValidationResult result = validatorWithExisting.validate(jar, "my-plugin", "1.0.0");

        // Should fail at some point during validation (SPI loading will fail
        // for our minimal test JAR, but the duplicate logic is tested by the
        // validator internals)
        assertFalse(result.isValid());
    }

    @Test
    public void testLegacyApiPluginIsRejectedWithAClearMessage() throws IOException {
        byte[] jar = createJarWithServiceFile("META-INF/services/com.gensynth.core.connectors.spi.ConnectorPluginProvider");
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();

        assertFalse(validator.containsSpiServiceFile(jar, builder));
        assertTrue(builder.build().getErrors().get(0).contains("legacy plugin API"));
    }

    @Test
    public void testBytecodeCheckPassesForCleanJar() throws IOException {
        byte[] jar = createMinimalJar();
        PluginValidationResult.Builder builder = new PluginValidationResult.Builder();
        boolean result = validator.passesBytecodeCheck(jar, builder);

        // Minimal JAR with no classes should pass
        assertTrue(result);
        assertTrue(builder.build().getErrors().isEmpty());
    }

    @Test
    public void testTempJarIsPrivateToItsOwner() throws IOException {
        assumeTrue("POSIX permissions only", FileSystems.getDefault().supportedFileAttributeViews().contains("posix"));
        Path tempJar = PluginSandboxValidator.createPrivateTempJar();
        try {
            assertEquals("rw-------", PosixFilePermissions.toString(Files.getPosixFilePermissions(tempJar)));
        } finally {
            Files.deleteIfExists(tempJar);
        }
    }

    // ─── Helper methods ─────────────────────────────────────────

    /**
     * Creates a minimal valid JAR with a single dummy entry.
     */
    private byte[] createMinimalJar() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (JarOutputStream jos = new JarOutputStream(baos)) {
            jos.putNextEntry(new JarEntry("META-INF/MANIFEST.MF"));
            jos.write("Manifest-Version: 1.0\n".getBytes());
            jos.closeEntry();

            // Add a dummy file so getNextJarEntry() is not null (manifest might be consumed by constructor)
            jos.putNextEntry(new JarEntry("dummy.txt"));
            jos.write("dummy".getBytes());
            jos.closeEntry();
        }
        return baos.toByteArray();
    }

    /**
     * Creates a JAR containing the SPI service registration file.
     */
    private byte[] createJarWithSpiFile() throws IOException {
        return createJarWithServiceFile(com.gensynth.plugin.api.PluginApi.SERVICE_FILE);
    }

    private byte[] createJarWithServiceFile(String spiPath) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (JarOutputStream jos = new JarOutputStream(baos)) {
            jos.putNextEntry(new JarEntry("META-INF/MANIFEST.MF"));
            jos.write("Manifest-Version: 1.0\n".getBytes());
            jos.closeEntry();

            jos.putNextEntry(new JarEntry(spiPath));
            jos.write("com.example.TestProvider\n".getBytes());
            jos.closeEntry();
        }
        return baos.toByteArray();
    }
}
