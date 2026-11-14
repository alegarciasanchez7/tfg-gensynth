package com.gensynth.core.desktop;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.Transferable;
import java.awt.dnd.DropTargetDropEvent;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class NativeDropHandlerTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static DropTargetDropEvent dropOf(Object data) throws Exception {
        DropTargetDropEvent event = mock(DropTargetDropEvent.class);
        Transferable transferable = mock(Transferable.class);
        when(event.getTransferable()).thenReturn(transferable);
        when(transferable.getTransferData(DataFlavor.javaFileListFlavor)).thenReturn(data);
        return event;
    }

    @Test
    public void completesTheDropOfAPluginJar() throws Exception {
        File jar = folder.newFile("plugin.jar");
        Files.write(jar.toPath(), new byte[] {1, 2, 3});
        DropTargetDropEvent event = dropOf(List.of("not a file", jar, folder.newFile("second.jar")));

        new NativeDropHandler().drop(event);

        verify(event).dropComplete(true);
        verify(event, never()).rejectDrop();
    }

    @Test
    public void completesTheDropOfOtherFilesWithoutSendingThem() throws Exception {
        DropTargetDropEvent event = dropOf(List.of(folder.newFile("notes.txt")));

        new NativeDropHandler().drop(event);

        verify(event).dropComplete(true);
    }

    @Test
    public void rejectsTheDropWhenTheFileCannotBeRead() throws Exception {
        File missing = new File(folder.getRoot(), "missing.jar");
        DropTargetDropEvent event = dropOf(List.of(missing));

        new NativeDropHandler().drop(event);

        verify(event).rejectDrop();
    }

    @Test
    public void rejectsTheDropWhenItsDataCannotBeRead() throws Exception {
        DropTargetDropEvent event = mock(DropTargetDropEvent.class);
        Transferable transferable = mock(Transferable.class);
        when(event.getTransferable()).thenReturn(transferable);
        when(transferable.getTransferData(DataFlavor.javaFileListFlavor)).thenThrow(new IOException("gone"));

        new NativeDropHandler().drop(event);

        verify(event).rejectDrop();
    }
}
