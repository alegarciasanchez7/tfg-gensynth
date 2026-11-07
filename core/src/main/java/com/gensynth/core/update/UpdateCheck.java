package com.gensynth.core.update;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Result of checking the latest release.
 *
 * @param currentVersion version of the running application
 * @param latestVersion  version of the latest release, without the "v"
 * @param available      true if the release is newer and has an installer for this system
 * @param releaseUrl     page of the release, to read its notes
 * @param assetName      file name of the installer for this system, or null if there is none
 * @param assetUrl       download URL of the installer, or null
 * @param assetSize      size of the installer in bytes, or 0
 * @param checksumsUrl   download URL of the release's SHA256SUMS.txt
 */
public record UpdateCheck(String currentVersion, String latestVersion, boolean available, String releaseUrl,
                          String assetName, String assetUrl, long assetSize, String checksumsUrl) {

    /**
     * Serializes the fields the UI needs (download URLs stay in the Core).
     *
     * @return map for the bridge
     */
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("currentVersion", currentVersion);
        payload.put("latestVersion", latestVersion);
        payload.put("available", available);
        payload.put("releaseUrl", releaseUrl);
        payload.put("assetName", assetName);
        payload.put("assetSize", assetSize);
        return payload;
    }
}
