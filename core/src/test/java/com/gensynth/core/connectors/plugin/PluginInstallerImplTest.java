package com.gensynth.core.connectors.plugin;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.junit.Assert.*;

/**
 * Unit tests for the PluginInstallerImpl.
 *
 * Uses a temporary directory for plugin storage to avoid side effects.
 */
public class PluginInstallerImplTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private PluginInstallerImpl installer;
    private Path tempDir;

    @Before
    public void setUp() throws Exception {
        tempDir = tempFolder.newFolder("plugins").toPath();
        installer = new PluginInstallerImpl(tempDir);
    }

    @Test
    public void testPluginsDirectoryIsCreated() {
        Path subDir = tempDir.resolve("sub-plugins");
        PluginInstallerImpl subInstaller = new PluginInstallerImpl(subDir);

        assertTrue(Files.isDirectory(subDir));
        assertNotNull(subInstaller.listInstalledPlugins());
    }

    @Test
    public void testListInstalledPluginsEmptyDirectory() {
        assertTrue(installer.listInstalledPlugins().isEmpty());
    }

    @Test
    public void testValidateInvalidJar() {
        byte[] invalidBytes = {1, 2, 3, 4, 5};
        PluginValidationResult result = installer.validate(invalidBytes, "test", "1.0.0");

        assertFalse(result.isValid());
        assertFalse(result.getErrors().isEmpty());
    }

    @Test
    public void testValidateJarWithoutSpi() throws IOException {
        byte[] jar = createMinimalJar();
        PluginValidationResult result = installer.validate(jar, "test", "1.0.0");

        assertFalse(result.isValid());
        // Should fail because no SPI file
        assertTrue(result.getErrors().stream()
                .anyMatch(e -> e.contains("service registration")));
    }

    @Test
    public void testInstallInvalidJarFails() {
        byte[] invalidBytes = {1, 2, 3, 4, 5};
        PluginInstallResult result = installer.install(invalidBytes, "test", "1.0.0");

        assertFalse(result.isSuccess());
        assertFalse(result.isRestartRequired());
    }

    @Test
    public void testUninstallNonExistentPlugin() {
        PluginInstallResult result = installer.uninstall("nonexistent", "1.0.0");

        assertFalse(result.isSuccess());
        assertFalse(result.isRestartRequired());
    }

    @Test
    public void testUninstallWithNullInputs() {
        PluginInstallResult result = installer.uninstall(null, null);

        assertFalse(result.isSuccess());
    }

    @Test
    public void testUninstallWithBlankInputs() {
        PluginInstallResult result = installer.uninstall("", "");

        assertFalse(result.isSuccess());
    }

    // ─── Helper methods ─────────────────────────────────────────

    private byte[] createMinimalJar() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (JarOutputStream jos = new JarOutputStream(baos)) {
            jos.putNextEntry(new JarEntry("META-INF/MANIFEST.MF"));
            jos.write("Manifest-Version: 1.0\n".getBytes());
            jos.closeEntry();

            // Add dummy file
            jos.putNextEntry(new JarEntry("dummy.txt"));
            jos.write("dummy".getBytes());
            jos.closeEntry();
        }
        return baos.toByteArray();
    }
}
