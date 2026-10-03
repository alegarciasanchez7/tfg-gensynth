package com.gensynth.core.desktop;

import org.junit.Test;

import javax.swing.JFileChooser;
import javax.swing.filechooser.FileFilter;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.io.File;
import java.nio.file.Files;
import java.util.List;

import static org.junit.Assert.*;

public class DesktopFileChooserTest {

    private final FileNameExtensionFilter projectFilter = new FileNameExtensionFilter("GenSynth project", "gsynth");

    @Test
    public void chooserOnlyOffersTheGivenFilter() {
        JFileChooser chooser = DesktopFileChooser.createChooser("Load", JFileChooser.FILES_ONLY, projectFilter);

        assertEquals("Load", chooser.getDialogTitle());
        assertFalse("The 'All files' option must be hidden", chooser.isAcceptAllFileFilterUsed());
        FileFilter[] filters = chooser.getChoosableFileFilters();
        assertEquals(1, filters.length);
        assertSame(projectFilter, filters[0]);
        assertSame(projectFilter, chooser.getFileFilter());
    }

    @Test
    public void chooserWithoutFilterAcceptsAllFiles() {
        JFileChooser chooser = DesktopFileChooser.createChooser("Pick", JFileChooser.DIRECTORIES_ONLY, null);

        assertTrue(chooser.isAcceptAllFileFilterUsed());
        assertEquals(JFileChooser.DIRECTORIES_ONLY, chooser.getFileSelectionMode());
    }

    @Test
    public void savingAppendsTheMissingExtension() throws Exception {
        File dir = Files.createTempDirectory("gensynth-chooser-test-").toFile();
        JFileChooser chooser = DesktopFileChooser.createChooser("Save", JFileChooser.FILES_ONLY, projectFilter);
        chooser.setDialogType(JFileChooser.SAVE_DIALOG);
        chooser.setSelectedFile(new File(dir, "my-project"));

        chooser.approveSelection();

        assertEquals(new File(dir, "my-project.gsynth"), chooser.getSelectedFile());
    }

    @Test
    public void withExtensionKeepsMatchingFiles() {
        File file = new File("/tmp/project.GSYNTH");
        assertSame(file, DesktopFileChooser.withExtension(file, projectFilter));
        assertEquals(new File("/tmp/project.json.gsynth"),
                DesktopFileChooser.withExtension(new File("/tmp/project.json"), projectFilter));
        File any = new File("/tmp/anything");
        assertSame(any, DesktopFileChooser.withExtension(any, null));
    }

    @Test
    public void filterFromAcceptUsesExtensionsAndIgnoresMimeTypes() {
        FileNameExtensionFilter filter = DesktopFileChooser.filterFromAccept(
                List.of(".jar", "application/java-archive", ".JPG;.jpeg", ".jar"), null);

        assertNotNull(filter);
        assertArrayEquals(new String[]{"jar", "jpg", "jpeg"}, filter.getExtensions());
        assertEquals("Files (*.jar, *.jpg, *.jpeg)", filter.getDescription());
        assertTrue(filter.accept(new File("plugin.jar")));
        assertFalse(filter.accept(new File("plugin.zip")));
    }

    @Test
    public void filterFromAcceptKeepsGivenDescription() {
        FileNameExtensionFilter filter = DesktopFileChooser.filterFromAccept(List.of(".jar"), "Plugins");
        assertEquals("Plugins", filter.getDescription());
    }

    @Test
    public void filterFromAcceptWithoutExtensionsAllowsAnyFile() {
        assertNull(DesktopFileChooser.filterFromAccept(List.of("image/*"), null));
        assertNull(DesktopFileChooser.filterFromAccept(null, null));
    }
}
