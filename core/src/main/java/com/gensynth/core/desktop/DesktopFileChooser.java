package com.gensynth.core.desktop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.swing.JFileChooser;
import javax.swing.JOptionPane;
import javax.swing.UIManager;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.Component;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * File dialogs for desktop mode built on Swing's {@link JFileChooser}.
 *
 * Unlike {@link java.awt.FileDialog}, which on Linux opens a separate native GTK window with
 * its own window class and no icon, a {@link JFileChooser} dialog is a Java window owned by the
 * main frame: the taskbar keeps showing the GenSynth icon and extension filters behave the
 * same on every platform. All methods must be called on the Swing event dispatch thread.
 */
public final class DesktopFileChooser {

    private static final Logger logger = LoggerFactory.getLogger(DesktopFileChooser.class);

    /** Directory of the last selection, so consecutive dialogs open where the user left off. */
    private static File lastDirectory;

    private DesktopFileChooser() {
    }

    /**
     * Installs the platform look and feel so file dialogs match the operating system.
     * Must be called before any Swing component is created. On Linux the default cross-platform
     * look is kept, because the GTK look and feel uses an outdated file chooser layout.
     */
    public static void installNativeLookAndFeel() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("linux")) {
            return;
        }
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception e) {
            logger.warn("Could not install the system look and feel: {}", e.getMessage());
        }
    }

    /**
     * Shows an "open file" dialog.
     *
     * @param parent owner window of the dialog
     * @param title  dialog title
     * @param filter allowed extensions, or null to accept any file
     * @return the selected file, or empty if the dialog was cancelled
     */
    public static Optional<File> openFile(Component parent, String title, FileNameExtensionFilter filter) {
        JFileChooser chooser = createChooser(title, JFileChooser.FILES_ONLY, filter);
        return show(chooser, chooser.showOpenDialog(parent)).stream().findFirst();
    }

    /**
     * Shows an "open files" dialog that allows selecting several files.
     *
     * @param parent owner window of the dialog
     * @param title  dialog title
     * @param filter allowed extensions, or null to accept any file
     * @return the selected files, empty if the dialog was cancelled
     */
    public static List<File> openFiles(Component parent, String title, FileNameExtensionFilter filter) {
        JFileChooser chooser = createChooser(title, JFileChooser.FILES_ONLY, filter);
        chooser.setMultiSelectionEnabled(true);
        return show(chooser, chooser.showOpenDialog(parent));
    }

    /**
     * Shows a "save file" dialog. The first extension of the filter is appended when the user
     * omits it, and replacing an existing file asks for confirmation.
     *
     * @param parent        owner window of the dialog
     * @param title         dialog title
     * @param filter        allowed extensions, or null to accept any file
     * @param suggestedFile file preselected in the dialog, may be null
     * @return the chosen file, or empty if the dialog was cancelled
     */
    public static Optional<File> saveFile(Component parent, String title, FileNameExtensionFilter filter,
                                          File suggestedFile) {
        JFileChooser chooser = createChooser(title, JFileChooser.FILES_ONLY, filter);
        if (suggestedFile != null) {
            // A bare file name is placed in the directory the chooser opens in
            chooser.setSelectedFile(suggestedFile.getParentFile() == null
                    ? new File(chooser.getCurrentDirectory(), suggestedFile.getName())
                    : suggestedFile);
        }
        return show(chooser, chooser.showSaveDialog(parent)).stream().findFirst();
    }

    /**
     * Shows a dialog to choose a directory.
     *
     * @param parent owner window of the dialog
     * @param title  dialog title
     * @return the selected directory, or empty if the dialog was cancelled
     */
    public static Optional<File> chooseDirectory(Component parent, String title) {
        JFileChooser chooser = createChooser(title, JFileChooser.DIRECTORIES_ONLY, null);
        return show(chooser, chooser.showOpenDialog(parent)).stream().findFirst();
    }

    /**
     * Builds an extension filter from the {@code accept} values of an HTML file input as reported
     * by CEF (e.g. ".jar", "image/*" or ".jpg;.jpeg"). MIME types are ignored.
     *
     * @param acceptValues accept filters and/or extensions from CEF, may be null
     * @param description  label for the filter, may be null
     * @return the filter, or null when no extension is restricted
     */
    public static FileNameExtensionFilter filterFromAccept(List<String> acceptValues, String description) {
        Set<String> extensions = new LinkedHashSet<>();
        if (acceptValues != null) {
            for (String value : acceptValues) {
                if (value == null) continue;
                for (String token : value.split("[;,]")) {
                    String trimmed = token.trim();
                    if (trimmed.startsWith(".") && trimmed.length() > 1) {
                        extensions.add(trimmed.substring(1).toLowerCase(Locale.ROOT));
                    }
                }
            }
        }
        if (extensions.isEmpty()) {
            return null;
        }
        String[] array = extensions.toArray(new String[0]);
        String label = description != null && !description.isBlank()
                ? description
                : "Files (" + String.join(", ", Arrays.stream(array).map(e -> "*." + e).toList()) + ")";
        return new FileNameExtensionFilter(label, array);
    }

    /**
     * Creates a configured chooser. Package-private so tests can inspect it without showing it.
     */
    static JFileChooser createChooser(String title, int selectionMode, FileNameExtensionFilter filter) {
        JFileChooser chooser = new JFileChooser(lastDirectory) {
            @Override
            public void approveSelection() {
                if (getDialogType() == SAVE_DIALOG && getSelectedFile() != null) {
                    File target = withExtension(getSelectedFile(), filter);
                    setSelectedFile(target);
                    if (target.exists() && !confirmOverwrite(this, target)) {
                        return;
                    }
                }
                super.approveSelection();
            }
        };
        chooser.setDialogTitle(title);
        chooser.setFileSelectionMode(selectionMode);
        if (filter != null) {
            // Only offer the expected file type, without the "All files" option
            chooser.setAcceptAllFileFilterUsed(false);
            chooser.setFileFilter(filter);
        }
        return chooser;
    }

    /**
     * Appends the first extension of the filter when the file does not already match it.
     */
    static File withExtension(File file, FileNameExtensionFilter filter) {
        if (filter == null || filter.accept(file) || filter.getExtensions().length == 0) {
            return file;
        }
        return new File(file.getParentFile(), file.getName() + "." + filter.getExtensions()[0]);
    }

    private static boolean confirmOverwrite(Component parent, File target) {
        int answer = JOptionPane.showConfirmDialog(parent,
                "\"" + target.getName() + "\" already exists. Do you want to replace it?",
                "Confirm Save", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE);
        return answer == JOptionPane.YES_OPTION;
    }

    private static List<File> show(JFileChooser chooser, int result) {
        if (result != JFileChooser.APPROVE_OPTION) {
            return List.of();
        }
        List<File> selected = new ArrayList<>();
        if (chooser.isMultiSelectionEnabled()) {
            selected.addAll(Arrays.asList(chooser.getSelectedFiles()));
        } else if (chooser.getSelectedFile() != null) {
            selected.add(chooser.getSelectedFile());
        }
        if (!selected.isEmpty()) {
            File first = selected.get(0);
            lastDirectory = first.isDirectory() ? first : first.getParentFile();
        }
        return selected;
    }
}
