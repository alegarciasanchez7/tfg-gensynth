package com.gensynth.core.ws;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * Decides which web pages may connect to the Core WebSocket.
 *
 * <p>Browsers let any web page open a WebSocket to {@code localhost} and send the page's
 * {@code Origin}. Without this check, a page the user visits while GenSynth runs could send it
 * commands (install a plugin, write files...). Only the GenSynth UI is accepted: the desktop
 * app ({@code http://gensynth.local}) and the development server on this computer
 * ({@code localhost} / {@code 127.0.0.1}). Clients that are not browsers send no Origin
 * and are accepted: they already run on this computer.
 */
public final class AllowedOrigins {

    private static final Set<String> ALLOWED_HOSTS = Set.of("gensynth.local", "localhost", "127.0.0.1", "[::1]");

    private AllowedOrigins() {
    }

    /**
     * Tells whether a WebSocket connection with this {@code Origin} header is accepted.
     *
     * @param origin value of the {@code Origin} header; null or empty when the client is not a browser
     * @return true for the GenSynth UI and for clients without an Origin
     */
    public static boolean isAllowed(String origin) {
        if (origin == null || origin.isBlank()) {
            return true;
        }
        // "null" is the Origin of sandboxed frames and local files: never trusted
        if ("null".equals(origin.trim())) {
            return false;
        }
        try {
            URI uri = new URI(origin.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            return (scheme.equals("http") || scheme.equals("https"))
                && uri.getRawUserInfo() == null
                && ALLOWED_HOSTS.contains(host);
        } catch (Exception e) {
            return false;
        }
    }
}
