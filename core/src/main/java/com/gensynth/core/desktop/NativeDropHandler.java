package com.gensynth.core.desktop;

import com.gensynth.core.App;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.datatransfer.DataFlavor;
import java.awt.dnd.*;
import java.io.File;
import java.nio.file.Files;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class NativeDropHandler extends DropTargetAdapter {
    private static final Logger logger = LoggerFactory.getLogger(NativeDropHandler.class);

    @Override
    public void drop(DropTargetDropEvent dtde) {
        try {
            dtde.acceptDrop(DnDConstants.ACTION_COPY);
            List<File> droppedFiles = (List<File>) dtde.getTransferable().getTransferData(DataFlavor.javaFileListFlavor);
            
            if (droppedFiles != null && !droppedFiles.isEmpty()) {
                File file = droppedFiles.get(0);
                logger.info("Native drop detected: {}", file.getAbsolutePath());
                
                if (file.getName().endsWith(".jar")) {
                    byte[] fileContent = Files.readAllBytes(file.toPath());
                    String base64 = Base64.getEncoder().encodeToString(fileContent);
                    
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("filename", file.getName());
                    payload.put("base64", base64);
                    
                    if (App.getWsServer() != null) {
                        App.getWsServer().broadcastMessage("NATIVE_FILE_DROPPED", payload);
                    }
                }
            }
            dtde.dropComplete(true);
        } catch (Exception ex) {
            logger.error("Error handling native drop: {}", ex.getMessage());
            dtde.rejectDrop();
        }
    }
}
