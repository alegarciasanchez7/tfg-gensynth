package com.gensynth.core.desktop;

import javax.swing.BorderFactory;
import javax.swing.ImageIcon;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JProgressBar;
import javax.swing.SwingUtilities;
import javax.swing.WindowConstants;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.lang.reflect.InvocationTargetException;
import java.net.URL;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Window shown while the embedded browser is downloaded on the first start. It tells the user
 * why the start takes longer, that an internet connection is needed and where the data is kept,
 * and shows the real download progress.
 */
final class FirstRunWindow {

    private final JFrame frame;
    private final JLabel statusLabel = new JLabel(" ");
    private final JProgressBar progressBar = new JProgressBar(0, 100);

    private FirstRunWindow(Path dataHome) {
        frame = new JFrame("GenSynth - First start");
        frame.setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
        URL iconUrl = FirstRunWindow.class.getResource("/img/logo_azul.png");
        if (iconUrl != null) {
            frame.setIconImage(new ImageIcon(iconUrl).getImage());
        }

        JLabel explanation = new JLabel("<html><body style='width:380px'>"
            + "<b>Setting up GenSynth for the first time</b><br><br>"
            + "GenSynth is downloading its embedded browser (Chromium, about 150&nbsp;MB). "
            + "This needs an <b>internet connection</b> and only happens once: later starts are immediate.<br><br>"
            + "Data folder: " + escape(dataHome.toString())
            + "</body></html>");

        progressBar.setIndeterminate(true);
        progressBar.setPreferredSize(new Dimension(380, 18));

        JPanel content = new JPanel(new BorderLayout(0, 12));
        content.setBorder(BorderFactory.createEmptyBorder(18, 18, 18, 18));
        content.add(explanation, BorderLayout.NORTH);
        content.add(progressBar, BorderLayout.CENTER);
        content.add(statusLabel, BorderLayout.SOUTH);

        frame.setContentPane(content);
        frame.pack();
        frame.setResizable(false);
        frame.setLocationRelativeTo(null);
        frame.setVisible(true);
    }

    /**
     * Opens the window on the Swing thread.
     *
     * @param dataHome folder where GenSynth keeps its data, shown to the user
     * @return the open window
     */
    static FirstRunWindow open(Path dataHome) {
        FirstRunWindow[] window = new FirstRunWindow[1];
        runOnSwingThread(() -> window[0] = new FirstRunWindow(dataHome));
        return window[0];
    }

    /**
     * Shows a setup step. Safe to call from any thread.
     *
     * @param status the step to show
     */
    void update(JcefSetupStatus status) {
        SwingUtilities.invokeLater(() -> {
            statusLabel.setText(status.message());
            boolean indeterminate = status.percent() == JcefSetupStatus.INDETERMINATE;
            progressBar.setIndeterminate(indeterminate);
            if (!indeterminate) {
                progressBar.setValue(status.percent());
            }
        });
    }

    /** Closes the window. Safe to call from any thread. */
    void close() {
        SwingUtilities.invokeLater(frame::dispose);
    }

    /**
     * Tells the user that the embedded browser could not be set up and asks whether to retry.
     *
     * @param reason technical cause of the failure
     * @return true to retry, false to exit
     */
    static boolean askRetry(String reason) {
        AtomicBoolean retry = new AtomicBoolean();
        runOnSwingThread(() -> {
            Object[] options = {"Retry", "Exit"};
            int choice = JOptionPane.showOptionDialog(null,
                "GenSynth could not set up its embedded browser.\n\n"
                    + "Check your internet connection and try again.\n\n"
                    + "Details: " + reason,
                "GenSynth - First start", JOptionPane.YES_NO_OPTION, JOptionPane.ERROR_MESSAGE,
                null, options, options[0]);
            retry.set(choice == 0);
        });
        return retry.get();
    }

    private static void runOnSwingThread(Runnable action) {
        if (SwingUtilities.isEventDispatchThread()) {
            action.run();
            return;
        }
        try {
            SwingUtilities.invokeAndWait(action);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (InvocationTargetException e) {
            throw new IllegalStateException("First-run window failed", e.getCause());
        }
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
