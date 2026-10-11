package com.gensynth.core.cli;

import org.jline.terminal.Terminal;
import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStyle;
import org.jline.utils.InfoCmp.Capability;

/**
 * Colors of the command line, taken from the desktop application (see {@code DESIGN_SYSTEM.md}):
 * the status colors are the same in its light and dark themes. A plain theme renders the same
 * text without any escape code, for pipes, files and the tests.
 */
final class CliTheme {

    /** Main accent (cyan-500): commands, borders and the prompt. */
    static final AttributedStyle PRIMARY = rgb(0x06b6d4);
    /** Secondary accent (violet-500): simulation ids. */
    static final AttributedStyle ACCENT = rgb(0x8b5cf6);
    /** Running and success (emerald-400), also a valid project file. */
    static final AttributedStyle SUCCESS = rgb(0x34d399);
    /** Warnings (amber-400). */
    static final AttributedStyle WARNING = rgb(0xfbbf24);
    /** Errors (red-500). */
    static final AttributedStyle ERROR = rgb(0xef4444);
    /** Stopped and secondary text (slate-400). */
    static final AttributedStyle MUTED = rgb(0x94a3b8);
    /** Folders and information (sky-500). */
    static final AttributedStyle INFO = rgb(0x0ea5e9);
    /** Rates in the status panel (amber-500, as MSG/S in the resource bar). */
    static final AttributedStyle RATE = rgb(0xf59e0b);
    /** Ticks in the status panel (fuchsia-500, as TICK in the resource bar). */
    static final AttributedStyle TICK = rgb(0xd946ef);
    /** Default text. */
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
     * @param terminal terminal the text is written to; its capabilities decide how many colors
     *                 are used (true color, 256 or 16)
     * @return a theme with colors
     */
    static CliTheme colored(Terminal terminal) {
        return new CliTheme(terminal);
    }

    /**
     * @return whether the theme writes colors
     */
    boolean isColored() {
        return terminal != null;
    }

    /**
     * @return columns of the terminal (80 in a plain theme)
     */
    int width() {
        return terminal == null || terminal.getWidth() <= 0 ? 80 : terminal.getWidth();
    }

    /**
     * Clears the screen and the scrollback, as the {@code clear} command of the shells does, and
     * moves the cursor to the top; does nothing in a plain theme.
     */
    void clearScreen() {
        if (terminal != null) {
            terminal.puts(Capability.clear_screen);
            // E3 (erase the scrollback): not in the terminfo of every terminal, but widely supported
            terminal.writer().write("\u001b[3J");
            terminal.flush();
        }
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

    /**
     * @param rgb color as {@code 0xRRGGBB}
     * @return a style with that foreground color
     */
    static AttributedStyle rgb(int rgb) {
        return AttributedStyle.DEFAULT.foreground((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
    }
}
