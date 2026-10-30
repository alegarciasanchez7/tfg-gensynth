package com.gensynth.core.update;

import com.gensynth.core.api.IUpdateService;
import com.sun.net.httpserver.HttpServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.*;

public class GitHubUpdateServiceTest {

    private static final String ASSET = "GenSynth-installer-0.5.3.deb";

    private HttpServer server;
    private String base;
    private Path downloadDir;
    private final byte[] installer = "fake installer bytes".repeat(5000).getBytes(StandardCharsets.UTF_8);
    private volatile int latestStatus = 200;
    private volatile String latestJson;
    private volatile String sums;

    @Before
    public void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        base = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/api/latest", exchange -> respond(exchange, latestStatus, latestJson.getBytes(StandardCharsets.UTF_8)));
        server.createContext("/download/v0.5.3/" + ASSET, exchange -> respond(exchange, 200, installer));
        server.createContext("/download/v0.5.3/SHA256SUMS.txt", exchange -> respond(exchange, 200, sums.getBytes(StandardCharsets.UTF_8)));
        server.start();
        latestJson = release(base + "/download/v0.5.3/" + ASSET);
        sums = sha256(installer) + "  " + ASSET + "\n" + "0".repeat(64) + "  GenSynth-installer-0.5.3.msi\n";
        downloadDir = Files.createTempDirectory("gensynth-updates-");
    }

    @After
    public void tearDown() {
        server.stop(0);
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, byte[] body) throws IOException {
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    private String release(String assetUrl) {
        return "{\"tag_name\":\"v0.5.3\",\"html_url\":\"https://example.org/whatever\",\"assets\":["
            + "{\"name\":\"" + ASSET + "\",\"size\":" + installer.length + ",\"browser_download_url\":\"" + assetUrl + "\"},"
            + "{\"name\":\"SHA256SUMS.txt\",\"size\":10,\"browser_download_url\":\"" + base + "/download/v0.5.3/SHA256SUMS.txt\"}]}";
    }

    private static String sha256(byte[] data) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
    }

    private GitHubUpdateService service(String currentVersion, Optional<InstallerType> type) {
        return service(URI.create(base + "/api/latest"), currentVersion, true, type, true);
    }

    private GitHubUpdateService service(URI api, String currentVersion, boolean installed, Optional<InstallerType> type,
                                        boolean pkexec) {
        return new GitHubUpdateService(api, base + "/download/", currentVersion, installed, () -> type, () -> pkexec,
            downloadDir, HttpClient.newHttpClient());
    }

    @Test
    public void aNewerReleaseWithAnInstallerForThisSystemIsAvailable() throws Exception {
        UpdateCheck check = service("0.5.2", Optional.of(InstallerType.DEB)).check();

        assertTrue(check.available());
        assertEquals("0.5.2", check.currentVersion());
        assertEquals("0.5.3", check.latestVersion());
        assertEquals(ASSET, check.assetName());
        assertEquals(installer.length, check.assetSize());
        assertEquals("The notes link always points to the official releases page",
            GitHubUpdateService.RELEASE_PAGE_PREFIX + "v0.5.3", check.releaseUrl());
        assertFalse("Download URLs stay in the Core", check.toPayload().containsKey("assetUrl"));
    }

    @Test
    public void theSameVersionIsNotAnUpdate() throws Exception {
        assertFalse(service("0.5.3", Optional.of(InstallerType.DEB)).check().available());
    }

    @Test
    public void aReleaseWithoutAnInstallerForThisSystemIsNotAvailable() throws Exception {
        UpdateCheck check = service("0.5.2", Optional.of(InstallerType.RPM)).check();

        assertFalse(check.available());
        assertNull(check.assetName());
        assertEquals("0.5.3", check.latestVersion());
    }

    @Test
    public void anInstallerOutsideTheOfficialLocationIsRejected() {
        latestJson = release("https://evil.example.org/" + ASSET);

        IOException error = assertThrows(IOException.class, () -> service("0.5.2", Optional.of(InstallerType.DEB)).check());
        assertTrue(error.getMessage(), error.getMessage().contains("Unexpected download location"));
    }

    @Test
    public void downloadVerifiesTheChecksumReportsProgressAndReplacesOldDownloads() throws Exception {
        Path old = Files.writeString(downloadDir.resolve("GenSynth-installer-0.5.1.deb"), "old");
        GitHubUpdateService service = service("0.5.2", Optional.of(InstallerType.DEB));
        List<long[]> progress = new CopyOnWriteArrayList<>();
        AtomicBoolean verifying = new AtomicBoolean();

        Path file = service.download(service.check(), new IUpdateService.DownloadProgress() {
            @Override
            public void onProgress(long receivedBytes, long totalBytes) {
                progress.add(new long[] { receivedBytes, totalBytes });
            }

            @Override
            public void onVerifying() {
                verifying.set(true);
            }
        });

        assertArrayEquals(installer, Files.readAllBytes(file));
        assertEquals(ASSET, file.getFileName().toString());
        assertFalse("Previous downloads are deleted", Files.exists(old));
        assertTrue(verifying.get());
        long[] last = progress.get(progress.size() - 1);
        assertEquals(installer.length, last[0]);
        assertEquals(installer.length, last[1]);
    }

    @Test
    public void aDamagedDownloadLeavesNothingOnDisk() throws Exception {
        sums = "f".repeat(64) + "  " + ASSET + "\n";
        GitHubUpdateService service = service("0.5.2", Optional.of(InstallerType.DEB));
        UpdateCheck check = service.check();

        IOException error = assertThrows(IOException.class, () -> service.download(check, (received, total) -> { }));
        assertTrue(error.getMessage(), error.getMessage().contains("SHA-256"));
        try (var files = Files.list(downloadDir)) {
            assertEquals(0, files.count());
        }
    }

    @Test
    public void aReleaseWithoutTheChecksumOfTheInstallerIsRejected() throws Exception {
        sums = "0".repeat(64) + "  GenSynth-installer-0.5.3.msi\n";
        GitHubUpdateService service = service("0.5.2", Optional.of(InstallerType.DEB));
        UpdateCheck check = service.check();

        IOException error = assertThrows(IOException.class, () -> service.download(check, (received, total) -> { }));
        assertTrue(error.getMessage(), error.getMessage().contains("checksum"));
    }

    @Test
    public void aRateLimitedOrUnreachableServerFails() throws Exception {
        latestStatus = 403;
        IOException limited = assertThrows(IOException.class, () -> service("0.5.2", Optional.of(InstallerType.DEB)).check());
        assertTrue(limited.getMessage(), limited.getMessage().contains("403"));

        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        GitHubUpdateService unreachable = service(URI.create("http://127.0.0.1:" + closedPort + "/api/latest"), "0.5.2",
            true, Optional.of(InstallerType.DEB), true);
        assertThrows(IOException.class, unreachable::check);
    }

    @Test
    public void explainsWhyThisInstallationCannotUpdateItself() {
        URI api = URI.create(base + "/api/latest");
        Optional<InstallerType> deb = Optional.of(InstallerType.DEB);

        assertNull(service(api, "0.5.2", true, deb, true).unsupportedReason());
        assertTrue(service(api, "0.5.2", false, deb, true).unsupportedReason().contains("installed application"));
        assertTrue(service(api, null, true, deb, true).unsupportedReason().contains("version"));
        assertTrue(service(api, "0.5.2", true, Optional.empty(), true).unsupportedReason().contains("not available"));
        assertTrue(service(api, "0.5.2", true, deb, false).unsupportedReason().contains("pkexec"));
        assertNull("pkexec is only needed on Linux", service(api, "0.5.2", true, Optional.of(InstallerType.MSI), false).unsupportedReason());
    }
}
