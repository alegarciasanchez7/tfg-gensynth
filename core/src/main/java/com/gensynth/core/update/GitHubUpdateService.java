package com.gensynth.core.update;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.api.IUpdateService;
import com.gensynth.core.config.AppPaths;
import com.gensynth.core.util.RestartUtil;
import com.gensynth.core.util.Versions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Updates the installed application from the GitHub releases of GenSynth.
 *
 * Only installers of the official repository are accepted: the download URL must be exactly
 * {@code <prefix>v<version>/GenSynth-installer-<version>.<extension>}, and the file must match
 * the SHA-256 listed in the release's {@code SHA256SUMS.txt}.
 */
public class GitHubUpdateService implements IUpdateService {

    private static final Logger logger = LoggerFactory.getLogger(GitHubUpdateService.class);

    /** Latest published release (drafts and pre-releases are skipped by GitHub). */
    public static final String LATEST_RELEASE_API = "https://api.github.com/repos/alegarciasanchez7/tfg-gensynth/releases/latest";
    /** Every installer must be downloaded from here. */
    public static final String DOWNLOAD_PREFIX = "https://github.com/alegarciasanchez7/tfg-gensynth/releases/download/";
    /** Release pages, to read the notes. */
    public static final String RELEASE_PAGE_PREFIX = "https://github.com/alegarciasanchez7/tfg-gensynth/releases/tag/";

    private static final Pattern TAG = Pattern.compile("v(\\d+\\.\\d+\\.\\d+)");
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private static final long MAX_INSTALLER_BYTES = 1024L * 1024 * 1024;
    private static final long PROGRESS_INTERVAL_NANOS = TimeUnit.MILLISECONDS.toNanos(250);

    private final URI latestReleaseApi;
    private final String downloadPrefix;
    private final String currentVersion;
    private final boolean installed;
    private final Supplier<Optional<InstallerType>> installerTypeSupplier;
    private final Supplier<Boolean> pkexecAvailable;
    private final Path downloadDir;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile Optional<InstallerType> installerType;

    /**
     * Creates the service.
     *
     * @param latestReleaseApi URL of the "latest release" API
     * @param downloadPrefix   prefix every installer URL must start with
     * @param currentVersion   version of the running application, or null if unknown
     * @param installed        true if this is an installed application (not a development build)
     * @param installerType    finds the installer type of this system; called once, when first needed
     * @param pkexecAvailable  tells whether {@code pkexec} exists (needed by the Linux packages)
     * @param downloadDir      folder for the downloaded installer
     * @param http             HTTP client
     */
    public GitHubUpdateService(URI latestReleaseApi, String downloadPrefix, String currentVersion, boolean installed,
                               Supplier<Optional<InstallerType>> installerType, Supplier<Boolean> pkexecAvailable,
                               Path downloadDir, HttpClient http) {
        this.latestReleaseApi = latestReleaseApi;
        this.downloadPrefix = downloadPrefix;
        this.currentVersion = currentVersion;
        this.installed = installed;
        this.installerTypeSupplier = installerType;
        this.pkexecAvailable = pkexecAvailable;
        this.downloadDir = downloadDir;
        this.http = http;
    }

    /**
     * Creates the service for this installation, using the official release URLs.
     *
     * @return the service
     */
    public static GitHubUpdateService forCurrentInstallation() {
        AppPaths paths = AppPaths.current();
        HttpClient http = HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            // Release assets redirect to githubusercontent; NORMAL never goes from https to http
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
        return new GitHubUpdateService(URI.create(LATEST_RELEASE_API), DOWNLOAD_PREFIX, Versions.current(),
            paths.isInstalled(),
            () -> InstallerType.detect(System.getProperty("os.name"), System.getProperty("os.arch"),
                GitHubUpdateService::exitsWithZero),
            () -> Files.isExecutable(Path.of(InstallerType.PKEXEC)),
            paths.dataHome().resolve("updates"), http);
    }

    @Override
    public String currentVersion() {
        return currentVersion;
    }

    @Override
    public String unsupportedReason() {
        if (!installed) {
            return "Updates are only available in the installed application.";
        }
        if (currentVersion == null) {
            return "The version of this build is unknown.";
        }
        Optional<InstallerType> type = installerType();
        if (type.isEmpty()) {
            return "Automatic updates are not available for this system. Download new versions from the Releases page.";
        }
        if ((type.get() == InstallerType.DEB || type.get() == InstallerType.RPM) && !pkexecAvailable.get()) {
            return "Automatic updates need pkexec (polkit). Download new versions from the Releases page.";
        }
        return null;
    }

    @Override
    public UpdateCheck check() throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(latestReleaseApi)
            .timeout(REQUEST_TIMEOUT)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "GenSynth/" + (currentVersion == null ? "unknown" : currentVersion))
            .GET()
            .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() != 200) {
            throw new IOException("The release server answered HTTP " + response.statusCode());
        }

        JsonNode release = mapper.readTree(response.body());
        String tag = release.path("tag_name").asText("");
        Matcher matcher = TAG.matcher(tag);
        if (!matcher.matches()) {
            throw new IOException("Unexpected release tag: " + tag);
        }
        String latest = matcher.group(1);
        String releaseBase = downloadPrefix + tag + "/";

        String assetName = null;
        String assetUrl = null;
        long assetSize = 0;
        Optional<InstallerType> type = installerType();
        if (type.isPresent()) {
            String expectedName = "GenSynth-installer-" + latest + "." + type.get().extension();
            for (JsonNode asset : release.path("assets")) {
                if (expectedName.equals(asset.path("name").asText())) {
                    String url = asset.path("browser_download_url").asText("");
                    // Only the official location is accepted, whatever the API says
                    if (!url.equals(releaseBase + expectedName)) {
                        throw new IOException("Unexpected download location for " + expectedName);
                    }
                    assetName = expectedName;
                    assetUrl = url;
                    assetSize = asset.path("size").asLong(0);
                }
            }
        }

        boolean available = assetUrl != null && currentVersion != null && Versions.isNewer(latest, currentVersion);
        return new UpdateCheck(currentVersion, latest, available, RELEASE_PAGE_PREFIX + tag,
            assetName, assetUrl, assetSize, releaseBase + "SHA256SUMS.txt");
    }

    @Override
    public Path download(UpdateCheck update, DownloadProgress progress) throws IOException, InterruptedException {
        if (!update.available() || update.assetUrl() == null) {
            throw new IOException("There is no update to download.");
        }
        if (update.assetSize() <= 0 || update.assetSize() > MAX_INSTALLER_BYTES) {
            throw new IOException("Unexpected installer size: " + update.assetSize() + " bytes");
        }
        Files.createDirectories(downloadDir);
        deletePreviousDownloads();

        Path partial = downloadDir.resolve(update.assetName() + ".part");
        Path installer = downloadDir.resolve(update.assetName());
        try {
            String digest = downloadTo(update, partial, progress);
            progress.onVerifying();
            String expected = expectedChecksum(update);
            if (!expected.equalsIgnoreCase(digest)) {
                throw new IOException("The downloaded installer is damaged (its SHA-256 does not match). Try again.");
            }
            Files.move(partial, installer, StandardCopyOption.REPLACE_EXISTING);
            return installer;
        } finally {
            Files.deleteIfExists(partial);
        }
    }

    /** Streams the installer to a file and returns its SHA-256 in hex. */
    private String downloadTo(UpdateCheck update, Path target, DownloadProgress progress)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(update.assetUrl()))
            .timeout(REQUEST_TIMEOUT)
            .header("User-Agent", "GenSynth/" + currentVersion)
            .GET()
            .build();
        HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        MessageDigest sha256 = sha256();
        long total = update.assetSize();
        long received = 0;
        long lastReport = 0;
        try (InputStream in = response.body(); OutputStream out = Files.newOutputStream(target)) {
            if (response.statusCode() != 200) {
                throw new IOException("The download server answered HTTP " + response.statusCode());
            }
            byte[] buffer = new byte[64 * 1024];
            progress.onProgress(0, total);
            int read;
            while ((read = in.read(buffer)) != -1) {
                // Cancelling the update interrupts this thread
                if (Thread.currentThread().isInterrupted()) {
                    throw new InterruptedException("Download cancelled");
                }
                received += read;
                if (received > total) {
                    throw new IOException("The installer is larger than announced.");
                }
                out.write(buffer, 0, read);
                sha256.update(buffer, 0, read);
                long now = System.nanoTime();
                if (now - lastReport >= PROGRESS_INTERVAL_NANOS) {
                    progress.onProgress(received, total);
                    lastReport = now;
                }
            }
        }
        if (received != total) {
            throw new IOException("The download was incomplete (" + received + " of " + total + " bytes).");
        }
        progress.onProgress(received, total);
        return HexFormat.of().formatHex(sha256.digest());
    }

    /** Reads the checksum of the installer from the release's SHA256SUMS.txt. */
    private String expectedChecksum(UpdateCheck update) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(update.checksumsUrl()))
            .timeout(REQUEST_TIMEOUT)
            .header("User-Agent", "GenSynth/" + currentVersion)
            .GET()
            .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() != 200) {
            throw new IOException("Could not read the checksums of the release (HTTP " + response.statusCode() + ")");
        }
        Pattern line = Pattern.compile("^([0-9a-fA-F]{64})\\s+\\*?" + Pattern.quote(update.assetName()) + "\\s*$");
        for (String entry : response.body().split("\\R")) {
            Matcher matcher = line.matcher(entry.trim());
            if (matcher.matches()) {
                return matcher.group(1).toLowerCase(Locale.ROOT);
            }
        }
        throw new IOException("The release does not list a checksum for " + update.assetName());
    }

    @Override
    public void install(Path installer) throws IOException, InterruptedException {
        InstallerType type = installerType().orElseThrow(() -> new IOException(unsupportedReason()));
        List<String> command = type.installCommand(installer);
        logger.info("Installing update: {}", String.join(" ", command));
        if (type.closesAppFirst()) {
            RestartUtil.exitAndLaunch(new ProcessBuilder(command));
            return;
        }
        Process process = new ProcessBuilder(command).inheritIO().start();
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new IOException("The installation was cancelled or failed (code " + exitCode
                + "). The installer is at " + installer.toAbsolutePath());
        }
        RestartUtil.restart();
    }

    @Override
    public boolean closesAppToInstall() {
        return installerType().map(InstallerType::closesAppFirst).orElse(false);
    }

    private Optional<InstallerType> installerType() {
        Optional<InstallerType> type = installerType;
        if (type == null) {
            type = installerTypeSupplier.get();
            installerType = type;
        }
        return type;
    }

    private void deletePreviousDownloads() throws IOException {
        try (DirectoryStream<Path> files = Files.newDirectoryStream(downloadDir)) {
            for (Path file : files) {
                if (Files.isRegularFile(file)) {
                    Files.deleteIfExists(file);
                }
            }
        }
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    /** Runs a short command and tells whether it exited with 0 (used to find the Linux package manager). */
    static boolean exitsWithZero(List<String> command) {
        if (!Files.isExecutable(Path.of(command.get(0)))) {
            return false;
        }
        try {
            Process process = new ProcessBuilder(command).redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
