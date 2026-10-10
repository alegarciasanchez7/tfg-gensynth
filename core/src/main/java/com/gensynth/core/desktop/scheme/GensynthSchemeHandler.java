package com.gensynth.core.desktop.scheme;

import org.cef.callback.CefCallback;
import org.cef.handler.CefResourceHandlerAdapter;
import org.cef.misc.IntRef;
import org.cef.misc.StringRef;
import org.cef.network.CefRequest;
import org.cef.network.CefResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.net.URLConnection;

/**
 * Serves UI files from the classpath resources via the gensynth:// protocol.
 */
public class GensynthSchemeHandler extends CefResourceHandlerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(GensynthSchemeHandler.class);
    
    private byte[] data;
    private String mimeType;
    private int offset = 0;

    @Override
    public boolean processRequest(CefRequest request, CefCallback callback) {
        String url = request.getURL();
        logger.info("[SCHEME] Loading local asset: {}", url);

        // Normalize path: http://gensynth.local/index.html -> /ui/index.html
        String path = url.replace("http://gensynth.local/", "/ui/");
        if (url.equals("http://gensynth.local/") || url.equals("http://gensynth.local") || path.endsWith("/")) {
            path = "/ui/index.html";
        }

        try (InputStream is = getClass().getResourceAsStream(path)) {
            if (is == null) {
                logger.warn("[SCHEME] Resource not found: {}", path);
                return false;
            }

            this.data = is.readAllBytes();
            this.mimeType = URLConnection.guessContentTypeFromName(path);
            if (this.mimeType == null) {
                if (path.endsWith(".js")) this.mimeType = "application/javascript";
                else if (path.endsWith(".css")) this.mimeType = "text/css";
                else if (path.endsWith(".svg")) this.mimeType = "image/svg+xml";
                else this.mimeType = "text/html";
            }

            callback.Continue();
            return true;
        } catch (Exception e) {
            logger.error("[SCHEME] Error loading resource: {}", path, e);
            return false;
        }
    }

    @Override
    public void getResponseHeaders(CefResponse response, IntRef responseLength, StringRef redirectUrl) {
        response.setMimeType(mimeType);
        response.setStatus(200);
        responseLength.set(data.length);
    }

    @Override
    public boolean readResponse(byte[] dataOut, int bytesToRead, IntRef bytesRead, CefCallback callback) {
        int length = data.length - offset;
        if (length <= 0) return false;

        int toRead = Math.min(length, bytesToRead);
        System.arraycopy(data, offset, dataOut, 0, toRead);
        offset += toRead;
        bytesRead.set(toRead);
        return true;
    }
}
