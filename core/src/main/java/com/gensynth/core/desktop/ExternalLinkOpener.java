package com.gensynth.core.desktop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.Desktop;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Opens web links from the desktop UI in the user's default browser.
 *
 * The embedded Chromium would open links in a bare popup window, so the UI asks Java to hand
 * them to the operating system instead. Only a short allow-list of https destinations is
 * accepted, so the UI cannot be used to launch arbitrary URLs or local files.
 */
public final class ExternalLinkOpener {

    private static final Logger logger = LoggerFactory.getLogger(ExternalLinkOpener.class);

    /**
     * Fixed, root-owned locations where {@code xdg-open} is looked up. The command is never
     * resolved through {@code PATH}, so a writable folder on it cannot shadow the opener.
     */
    static final List<String> XDG_OPEN_PATHS = List.of("/usr/bin/xdg-open", "/usr/local/bin/xdg-open");

    private ExternalLinkOpener() {
    }

    /**
     * Checks whether a URL may be opened: https only, without credentials or a custom port, and
     * pointing to Google Forms or to the GenSynth GitHub account.
     *
     * @param url the URL requested by the UI
     * @return {@code true} if the URL is on the allow-list
     */
    public static boolean isAllowed(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        URI uri;
        try {
            uri = new URI(url.trim());
        } catch (Exception e) {
            return false;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getPort() != -1
                || uri.getHost() == null) {
            return false;
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getPath() != null ? uri.getPath() : "";
        return ("docs.google.com".equals(host) && path.startsWith("/forms/"))
                || "forms.gle".equals(host)
                || ("github.com".equals(host) && path.startsWith("/alegarciasanchez7/"));
    }

    /**
     * Opens an allowed URL in the default browser on a background thread, so the UI thread never
     * waits for the browser to start. Falls back to {@code xdg-open} (from {@link #XDG_OPEN_PATHS})
     * where AWT cannot browse (some Linux desktops).
     *
     * @param url the URL to open; ignored with a warning if it is not allowed
     * @return {@code true} if the URL was allowed and handed to the operating system
     */
    public static boolean open(String url) {
        if (!isAllowed(url)) {
            logger.warn("Blocked external link: {}", url);
            return false;
        }
        Thread opener = new Thread(() -> browse(url.trim()), "gensynth-open-link");
        opener.setDaemon(true);
        opener.start();
        return true;
    }

    private static void browse(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                return;
            }
            if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux")) {
                Optional<Path> xdgOpen = findExecutable(XDG_OPEN_PATHS);
                if (xdgOpen.isPresent()) {
                    new ProcessBuilder(xdgOpen.get().toString(), url).start();
                    return;
                }
            }
            logger.warn("No way to open the browser on this system: {}", url);
        } catch (Exception e) {
            logger.warn("Could not open {} in the browser: {}", url, e.getMessage());
        }
    }

    /**
     * Returns the first candidate path that is an executable regular file.
     *
     * @param candidates absolute paths to check, in order of preference
     * @return the first executable candidate, or empty if none exists
     */
    static Optional<Path> findExecutable(List<String> candidates) {
        return candidates.stream()
                .map(Paths::get)
                .filter(path -> Files.isRegularFile(path) && Files.isExecutable(path))
                .findFirst();
    }
}
