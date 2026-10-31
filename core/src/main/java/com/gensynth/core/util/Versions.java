package com.gensynth.core.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Version numbers: comparing them and reading the version of this build.
 */
public final class Versions {

    private static final Logger logger = LoggerFactory.getLogger(Versions.class);
    private static final String VERSION_RESOURCE = "/gensynth-version.properties";

    private Versions() {
    }

    /**
     * Compares two dotted version numbers part by part, as numbers ("0.5.10" &gt; "0.5.9").
     * Missing or non-numeric parts count as 0; versions equal by number are ordered as text.
     *
     * @param a first version
     * @param b second version
     * @return a negative number, zero or a positive number when {@code a} is lower, equal or higher
     */
    public static int compare(String a, String b) {
        int cmp = compareNumbers(a, b);
        return cmp == 0 ? a.compareTo(b) : cmp;
    }

    /**
     * Tells whether a release is newer than the running version. A leading "v" and any
     * pre-release or build suffix ("-rc1", "+build") are ignored.
     *
     * @param candidate version of the release, e.g. "v0.5.3"
     * @param current   running version, e.g. "0.5.2"
     * @return true if {@code candidate} is strictly newer
     */
    public static boolean isNewer(String candidate, String current) {
        return compareNumbers(core(candidate), core(current)) > 0;
    }

    /**
     * Reads the version of this build, written by Maven into {@value #VERSION_RESOURCE}.
     *
     * @return the version, or null if it is unknown (resource missing or not filtered)
     */
    public static String current() {
        try (InputStream in = Versions.class.getResourceAsStream(VERSION_RESOURCE)) {
            if (in == null) {
                return null;
            }
            Properties properties = new Properties();
            properties.load(in);
            String version = properties.getProperty("version", "").trim();
            return version.isEmpty() || version.contains("${") ? null : version;
        } catch (IOException e) {
            logger.warn("Could not read the application version: {}", e.getMessage());
            return null;
        }
    }

    private static String core(String version) {
        String value = version == null ? "" : version.trim();
        if (value.startsWith("v") || value.startsWith("V")) {
            value = value.substring(1);
        }
        int suffix = indexOfAny(value, '-', '+');
        return suffix >= 0 ? value.substring(0, suffix) : value;
    }

    private static int indexOfAny(String value, char first, char second) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == first || c == second) {
                return i;
            }
        }
        return -1;
    }

    /** Numeric part-by-part comparison, without the textual tie-break of {@link #compare}. */
    private static int compareNumbers(String a, String b) {
        String[] left = a.split("\\.");
        String[] right = b.split("\\.");
        int length = Math.max(left.length, right.length);
        for (int i = 0; i < length; i++) {
            int cmp = Integer.compare(parsePart(left, i), parsePart(right, i));
            if (cmp != 0) {
                return cmp;
            }
        }
        return 0;
    }

    private static int parsePart(String[] parts, int index) {
        if (index >= parts.length) {
            return 0;
        }
        try {
            return Integer.parseInt(parts[index]);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
