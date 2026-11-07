package com.gensynth.core.cli;

import org.jline.terminal.Terminal;
import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStyle;
import org.jline.utils.InfoCmp.Capability;

/**
 * Colors of the command line. Only the 8 standard ANSI colors are used, which every color
 * terminal shows, including the text console of a Linux server ({@code TERM=linux}); their hue
 * follows the desktop application (cyan accent, green running, amber warning, red error).
 * Secondary text has no color: a dark grey can be invisible on 8-color consoles. A plain theme
 * renders the same text without any escape code, for pipes, files, terminals without colors and
 * the tests.
 */
final class CliTheme {

    /** Main accent: commands. */
    static final AttributedStyle PRIMARY = AttributedStyle.DEFAULT.foreground(AttributedStyle.CYAN);
    /** Simulation ids. */
    static final AttributedStyle ACCENT = AttributedStyle.DEFAULT.foreground(AttributedStyle.MAGENTA);
    /** Running and success, also a valid project file. */
    static final AttributedStyle SUCCESS = AttributedStyle.DEFAULT.foreground(AttributedStyle.GREEN);
    /** Warnings. */
    static final AttributedStyle WARNING = AttributedStyle.DEFAULT.foreground(AttributedStyle.YELLOW);
    /** Errors. */
    static final AttributedStyle ERROR = AttributedStyle.DEFAULT.foreground(AttributedStyle.RED);
    /** Folders, as {@code ls} shows them. */
    static final AttributedStyle INFO = AttributedStyle.DEFAULT.foreground(AttributedStyle.BLUE);
    /** Default text, also used for secondary text. */
    static final AttributedStyle PLAIN = AttributedStyle.DEFAULT;

    private final Terminal terminal;

    private CliTheme(Terminal terminal) {
        this.terminal = terminal;
    }

    /**
     * @return a theme that writes no escape codes
     */
    static CliTheme plain() {
        return new CliTheme(null);
    }

    /**
     * @param terminal terminal the text is written to
     * @return a theme with colors, or a plain one when the terminal does not show at least the 8
     *         standard colors (a {@code dumb} terminal, or one that declares no colors)
     */
    static CliTheme forTerminal(Terminal terminal) {
        Integer colors = terminal.getNumericCapability(Capability.max_colors);
        boolean supported = !Terminal.TYPE_DUMB.equals(terminal.getType()) && colors != null && colors >= 8;
        return supported ? new CliTheme(terminal) : plain();
    }

    /**
     * @return whether the theme writes colors
     */
    boolean isColored() {
        return terminal != null;
    }

    /**
     * @param text styled text
     * @return the text with the escape codes of its styles, or without them in a plain theme
     */
    String paint(AttributedString text) {
        return terminal == null ? text.toString() : text.toAnsi(terminal);
    }

    /**
     * @param text  the text
     * @param style its style
     * @return the styled text, ready to print
     */
    String paint(String text, AttributedStyle style) {
        return paint(new AttributedString(text, style));
    }
}
