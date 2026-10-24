package com.gensynth.core.util;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

/**
 * Name uniqueness rules shared by groups and flows. Two names are the same when they are equal
 * after trimming, ignoring case (so "Sensor" and " sensor " collide: on Windows they would also
 * map to the same output file).
 */
public final class UniqueNames {

    private UniqueNames() {
    }

    /**
     * Whether two names are the same name.
     *
     * @param a first name, may be {@code null}
     * @param b second name, may be {@code null}
     * @return {@code true} if both are non-null and equal after trimming, ignoring case
     */
    public static boolean sameName(String a, String b) {
        return a != null && b != null && key(a).equals(key(b));
    }

    /**
     * Whether a name is already taken.
     *
     * @param takenNames names in use
     * @param candidate  name to check
     * @return {@code true} if any taken name is the same name as {@code candidate}
     */
    public static boolean isTaken(Collection<String> takenNames, String candidate) {
        for (String taken : takenNames) {
            if (sameName(taken, candidate)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Makes a name unique: returns it unchanged when it is free, otherwise appends the first free
     * suffix {@code " (2)"}, {@code " (3)"}... The result is deterministic for the same inputs.
     *
     * @param desired    wanted name (trimmed)
     * @param takenNames names in use
     * @return {@code desired} or {@code desired + " (k)"} with the smallest free {@code k >= 2}
     */
    public static String makeUnique(String desired, Collection<String> takenNames) {
        String base = desired == null ? "" : desired.trim();
        if (!isTaken(takenNames, base)) {
            return base;
        }
        int suffix = 2;
        while (isTaken(takenNames, base + " (" + suffix + ")")) {
            suffix++;
        }
        return base + " (" + suffix + ")";
    }

    /**
     * Finds the names that appear more than once.
     *
     * @param names names to inspect
     * @return the repeated occurrences (trimmed), sorted
     */
    public static Set<String> duplicates(Collection<String> names) {
        Set<String> seen = new LinkedHashSet<>();
        Set<String> repeated = new TreeSet<>();
        for (String name : names) {
            if (name == null) {
                continue;
            }
            if (!seen.add(key(name))) {
                repeated.add(name.trim());
            }
        }
        return repeated;
    }

    private static String key(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }
}
