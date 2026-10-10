package com.gensynth.core.desktop;

import org.cef.browser.CefBrowser;
import org.cef.callback.CefFileDialogCallback;
import org.cef.handler.CefDialogHandler;

import java.awt.Frame;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Vector;
import javax.swing.SwingUtilities;
import javax.swing.filechooser.FileNameExtensionFilter;

/**
 * Handles file dialogs requested by the browser (e.g. {@code <input type="file">}) with
 * {@link DesktopFileChooser}, so they are owned by the main window and respect the
 * {@code accept} attribute of the input.
 */
public class NativeDialogHandler implements CefDialogHandler {

    private final Frame parentFrame;

    public NativeDialogHandler(Frame parentFrame) {
        this.parentFrame = parentFrame;
    }

    @Override
    public boolean onFileDialog(CefBrowser browser, FileDialogMode mode, String title, String defaultFilePath,
                                Vector<String> acceptFilters, Vector<String> acceptExtensions, Vector<String> acceptDescriptions,
                                CefFileDialogCallback callback) {
        SwingUtilities.invokeLater(() -> {
            String dialogTitle = title != null && !title.isBlank() ? title : "Select File";
            FileNameExtensionFilter filter = DesktopFileChooser.filterFromAccept(
                    mergeAcceptValues(acceptFilters, acceptExtensions), firstNonBlank(acceptDescriptions));

            List<File> selected = switch (mode) {
                case FILE_DIALOG_OPEN_MULTIPLE -> DesktopFileChooser.openFiles(parentFrame, dialogTitle, filter);
                case FILE_DIALOG_OPEN_FOLDER -> toList(DesktopFileChooser.chooseDirectory(parentFrame, dialogTitle));
                case FILE_DIALOG_SAVE -> toList(DesktopFileChooser.saveFile(parentFrame, dialogTitle, filter,
                        defaultFilePath != null && !defaultFilePath.isBlank() ? new File(defaultFilePath) : null));
                default -> toList(DesktopFileChooser.openFile(parentFrame, dialogTitle, filter));
            };

            if (selected.isEmpty()) {
                callback.Cancel();
            } else {
                Vector<String> paths = new Vector<>();
                selected.forEach(file -> paths.add(file.getAbsolutePath()));
                callback.Continue(paths);
            }
        });

        return true; // The dialog is handled here instead of by CEF
    }

    private static List<String> mergeAcceptValues(Vector<String> acceptFilters, Vector<String> acceptExtensions) {
        List<String> values = new ArrayList<>();
        if (acceptFilters != null) values.addAll(acceptFilters);
        if (acceptExtensions != null) values.addAll(acceptExtensions);
        return values;
    }

    private static String firstNonBlank(Vector<String> values) {
        if (values == null) return null;
        return values.stream().filter(value -> value != null && !value.isBlank()).findFirst().orElse(null);
    }

    private static List<File> toList(Optional<File> file) {
        return file.map(List::of).orElse(List.of());
    }
}
