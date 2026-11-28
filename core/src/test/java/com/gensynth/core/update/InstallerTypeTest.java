package com.gensynth.core.update;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

import static org.junit.Assert.*;

public class InstallerTypeTest {

    private static Predicate<List<String>> succeeds(String program) {
        return command -> command.get(0).equals(program);
    }

    @Test
    public void detectsTheInstallerOfEachSystem() {
        Predicate<List<String>> none = command -> false;
        assertEquals(Optional.of(InstallerType.MSI), InstallerType.detect("Windows 11", "amd64", none));
        assertEquals(Optional.of(InstallerType.DMG), InstallerType.detect("Mac OS X", "aarch64", none));
        assertEquals("No Intel disk image is published", Optional.empty(), InstallerType.detect("Mac OS X", "x86_64", none));
        assertEquals(Optional.of(InstallerType.DEB), InstallerType.detect("Linux", "amd64", succeeds("/usr/bin/dpkg-query")));
        assertEquals(Optional.of(InstallerType.RPM), InstallerType.detect("Linux", "amd64", succeeds("/usr/bin/rpm")));
        assertEquals("Not installed from a package", Optional.empty(), InstallerType.detect("Linux", "amd64", none));
        assertEquals(Optional.empty(), InstallerType.detect("FreeBSD", "amd64", none));
    }

    @Test
    public void windowsReopensGenSynthWhenTheInstallerEnds() {
        List<String> install = List.of("D:\\Win\\System32\\msiexec.exe", "/i",
            "C:\\Users\\José O'Neil\\updates\\GenSynth-installer-0.7.0.msi", "/passive", "/norestart");

        List<String> command = InstallerType.reopeningAfterwards(install,
            "C:\\Program Files\\GenSynth\\GenSynth.exe", Map.of("SystemRoot", "D:\\Win"));

        assertEquals(Paths.get("D:\\Win", "System32", "WindowsPowerShell", "v1.0", "powershell.exe").toString(),
            command.get(0));
        assertEquals(List.of("-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand"),
            command.subList(1, 6));
        String script = new String(Base64.getDecoder().decode(command.get(6)), StandardCharsets.UTF_16LE);
        // Waits for the installer, quoting the path with spaces, and opens GenSynth even if it fails
        assertEquals("try { Start-Process -FilePath 'D:\\Win\\System32\\msiexec.exe' -ArgumentList '/i',"
                + "'\"C:\\Users\\José O''Neil\\updates\\GenSynth-installer-0.7.0.msi\"','/passive','/norestart' -Wait }"
                + " finally { Start-Process -FilePath 'C:\\Program Files\\GenSynth\\GenSynth.exe' }",
            script);
    }

    @Test
    public void buildsTheInstallCommandWithAbsolutePaths() {
        Path installer = Paths.get("updates", "GenSynth-installer-0.5.3.msi").toAbsolutePath();
        String file = installer.toString();

        assertEquals(List.of(Paths.get("D:\\Win", "System32", "msiexec.exe").toString(), "/i", file, "/passive", "/norestart"),
            InstallerType.MSI.installCommand(installer, Map.of("SystemRoot", "D:\\Win"), path -> true));
        assertEquals(List.of("/usr/bin/open", file), InstallerType.DMG.installCommand(installer, Map.of(), path -> true));
        assertEquals(List.of("/usr/bin/pkexec", "/usr/bin/apt-get", "install", "-y", file),
            InstallerType.DEB.installCommand(installer, Map.of(), path -> true));
        assertEquals(List.of("/usr/bin/pkexec", "/usr/bin/dnf", "install", "-y", file),
            InstallerType.RPM.installCommand(installer, Map.of(), path -> true));
        assertEquals(List.of("/usr/bin/pkexec", "/usr/bin/rpm", "-U", file),
            InstallerType.RPM.installCommand(installer, Map.of(), path -> false));
    }

    @Test
    public void windowsAndMacCloseTheAppBeforeInstalling() {
        assertTrue(InstallerType.MSI.closesAppFirst());
        assertTrue(InstallerType.DMG.closesAppFirst());
        assertFalse(InstallerType.DEB.closesAppFirst());
        assertFalse(InstallerType.RPM.closesAppFirst());
    }
}
