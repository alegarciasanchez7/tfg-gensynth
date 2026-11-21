package com.gensynth.core.config;

import java.util.Locale;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

/**
 * Which edition of GenSynth is running.
 *
 * <ul>
 *   <li><b>Full</b>: the desktop application and the {@code gensynth} command line.</li>
 *   <li><b>CLI</b>: only the command line, installed without the desktop window or the JCEF
 *       libraries. Its launcher sets {@code -Dgensynth.edition=cli}, and commands that need the
 *       desktop application (such as {@code edit}) are not available.</li>
 * </ul>
 */
public final class AppEdition {

    /** System property that names the edition; {@code cli} for the command line edition. */
    public static final String EDITION_PROPERTY = "gensynth.edition";
    /** Value of {@link #EDITION_PROPERTY} in the command line edition. */
    public static final String CLI = "cli";
    /** Class of the embedded browser: without it the desktop window cannot open. */
    static final String BROWSER_CLASS = "org.cef.CefApp";

    private AppEdition() {
    }

    /**
     * @return whether this process is the command line edition, without the desktop application
     */
    public static boolean isCliOnly() {
        return isCliOnly(System::getProperty, AppEdition::isOnClasspath);
    }

    /**
     * Exposed for tests, which cannot change the real system properties or classpath.
     *
     * @param properties   system property lookup (returns null when unset)
     * @param classPresent tells whether a class is on the classpath
     * @return true when the edition property says {@code cli}, or when the embedded browser is
     *         missing (a classpath without the JCEF libraries cannot open the desktop window)
     */
    static boolean isCliOnly(UnaryOperator<String> properties, Predicate<String> classPresent) {
        String edition = properties.apply(EDITION_PROPERTY);
        boolean cliLauncher = edition != null && CLI.equals(edition.trim().toLowerCase(Locale.ROOT));
        return cliLauncher || !classPresent.test(BROWSER_CLASS);
    }

    private static boolean isOnClasspath(String className) {
        try {
            // Not initialized: only checks that the class can be found
            Class.forName(className, false, AppEdition.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException | LinkageError e) {
            return false;
        }
    }
}
