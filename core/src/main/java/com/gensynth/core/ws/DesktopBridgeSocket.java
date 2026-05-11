package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.cef.callback.CefQueryCallback;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.enums.Opcode;
import org.java_websocket.enums.ReadyState;
import org.java_websocket.framing.Framedata;
import org.java_websocket.protocols.IProtocol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.util.Collection;

/**
 * A virtual WebSocket implementation that routes messages back to JCEF (Desktop
 * UI).
 */
public class DesktopBridgeSocket implements WebSocket {
    private static final Logger logger = LoggerFactory.getLogger(DesktopBridgeSocket.class);
    private CefQueryCallback jcefCallback;
    private final org.cef.browser.CefBrowser browser;

    public DesktopBridgeSocket(UiBridgeWebSocketServer server, CefQueryCallback callback, ObjectMapper mapper, org.cef.browser.CefBrowser browser) {
        this.jcefCallback = callback;
        this.browser = browser;
    }

    public void setCallback(CefQueryCallback callback) {
        this.jcefCallback = callback;
    }

    @Override
    public void send(String text) {
        logger.debug("[DESKTOP-SOCKET] Sending message: {}", text);
        
        // Push message to UI via JavaScript function
        if (browser != null) {
            String escaped = text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
            browser.executeJavaScript("window.onGensynthMessage('" + escaped + "')", "", 0);
        }

        // Fulfill the JCEF query callback (can only be done once per query)
        try {
            jcefCallback.success(text);
        } catch (Exception ignored) {
            // Callback already used, ignore for asynchronous push messages
        }
    }

    @Override
    public void close(int code, String message) {
    }

    @Override
    public void close(int code) {
    }

    @Override
    public void close() {
    }

    @Override
    public void closeConnection(int code, String message) {
    }

    @Override
    public void send(ByteBuffer bytes) {
    }

    @Override
    public void send(byte[] bytes) {
    }

    @Override
    public InetSocketAddress getRemoteSocketAddress() {
        return new InetSocketAddress("127.0.0.1", 0);
    }

    @Override
    public InetSocketAddress getLocalSocketAddress() {
        return new InetSocketAddress("127.0.0.1", 0);
    }

    @Override
    public boolean isOpen() {
        return true;
    }

    @Override
    public boolean isClosing() {
        return false;
    }

    @Override
    public boolean isFlushAndClose() {
        return false;
    }

    @Override
    public boolean isClosed() {
        return false;
    }

    @Override
    public ReadyState getReadyState() {
        return ReadyState.OPEN;
    }

    @Override
    public String getResourceDescriptor() {
        return "/desktop";
    }

    @Override
    public <T> void setAttachment(T attachment) {
    }

    @Override
    public <T> T getAttachment() {
        return null;
    }

    @Override
    public void sendFragmentedFrame(Opcode op, ByteBuffer buffer, boolean fin) {
    }

    @Override
    public void sendFrame(Framedata framedata) {
    }

    @Override
    public void sendFrame(Collection<Framedata> frames) {
    }

    @Override
    public void sendPing() {
    }

    @Override
    public boolean hasBufferedData() {
        return false;
    }

    @Override
    public Draft getDraft() {
        return null;
    }

    // Missing methods for compatibility
    @Override
    public IProtocol getProtocol() {
        return null;
    }

    @Override
    public javax.net.ssl.SSLSession getSSLSession() {
        return null;
    }

    @Override
    public boolean hasSSLSupport() {
        return false;
    }
}
