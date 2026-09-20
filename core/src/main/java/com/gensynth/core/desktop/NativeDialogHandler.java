package com.gensynth.core.desktop;

import org.cef.browser.CefBrowser;
import org.cef.callback.CefFileDialogCallback;
import org.cef.handler.CefDialogHandler;

import java.awt.FileDialog;
import java.awt.Frame;
import java.io.File;
import java.util.Vector;
import javax.swing.SwingUtilities;

public class NativeDialogHandler implements CefDialogHandler {
    
    private final Frame parentFrame;
    
    public NativeDialogHandler(Frame parentFrame) {
        this.parentFrame = parentFrame;
    }

    @Override
    public boolean onFileDialog(CefBrowser browser, FileDialogMode mode, String title, String defaultFilePath, 
                                Vector<String> acceptFilters, Vector<String> acceptExtensions, Vector<String> acceptDescriptions, 
                                CefFileDialogCallback callback) {
        // We handle it manually using java.awt.FileDialog to guarantee native OS look & feel
        SwingUtilities.invokeLater(() -> {
            int fileDialogMode = (mode == FileDialogMode.FILE_DIALOG_SAVE) ? FileDialog.SAVE : FileDialog.LOAD;
            FileDialog dialog = new FileDialog(parentFrame, title != null ? title : "Select File", fileDialogMode);
            
            if (defaultFilePath != null && !defaultFilePath.isEmpty()) {
                dialog.setFile(defaultFilePath);
            }
            
            // Note: FileDialog filters are very OS-dependent and often ignored on some platforms (e.g., Linux GTK), 
            // but we can still set a basic extension filter if needed. However, since the user usually just wants the picker,
            // we will keep it simple.
            
            dialog.setVisible(true);
            
            String selectedFile = dialog.getFile();
            String selectedDirectory = dialog.getDirectory();
            
            if (selectedFile != null && selectedDirectory != null) {
                Vector<String> files = new Vector<>();
                files.add(new File(selectedDirectory, selectedFile).getAbsolutePath());
                callback.Continue(files);
            } else {
                callback.Cancel();
            }
        });
        
        return true; // Return true to indicate we are handling it
    }
}
