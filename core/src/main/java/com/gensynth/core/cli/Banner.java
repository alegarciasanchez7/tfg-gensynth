package com.gensynth.core.cli;

import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStringBuilder;
import org.jline.utils.AttributedStyle;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Header shown when the command line opens: the hexagon of the GenSynth icon with its pulse
 * line, in the blue to cyan gradient of the icon, next to the version, the current folder and
 * a short hint. Narrow terminals get the same box without the logo.
 */
final class Banner {

    /**
     * A terminal cell is about twice as tall as it is wide, so 18 columns by 9 rows look square,
     * like the icon.
     */
    private static final String[] LOGO = {
        "      ▄▄▀▀▄▄      ",
        "  ▄▄▀▀      ▀▀▄▄  ",
        "█▀▀            ▀▀█",
        "█      ╱╲        █",
        "█ ────╱  ╲  ╱─── █",
        "█         ╲╱     █",
        "█▄▄            ▄▄█",
        "  ▀▀▄▄      ▄▄▀▀  ",
        "      ▀▀▄▄▀▀      ",
    };
    private static final int LOGO_WIDTH = LOGO[0].length();
    /** Ends of the gradient of the hexagon: blue-600 and cyan-400. */
    private static final int GRADIENT_FROM = 0x2563eb;
    private static final int GRADIENT_TO = 0x22d3ee;
    /** Pulse line (cyan-100). */
    private static final AttributedStyle PULSE = CliTheme.rgb(0xcffafe).bold();
    private static final String SUBTITLE = "Synthetic data generator";
    private static final String HINT = "Type 'help' · Tab completes paths";
    private static final int GAP = 3;
    /** Border and padding of the box: "│ " and " │". */
    private static final int FRAME = 4;

    private Banner() {
    }

    /**
     * @param version    application version
     * @param folder     current folder, as shown to the user (see {@link #displayFolder})
     * @param width      columns of the terminal
     * @return the lines of the header
     */
    static List<AttributedString> lines(String version, String folder, int width) {
        boolean withLogo = width >= FRAME + LOGO_WIDTH + GAP + HINT.length();
        int infoWidth = width - FRAME - (withLogo ? LOGO_WIDTH + GAP : 0);
        if (infoWidth < HINT.length()) {
            // Too narrow for a box: the information alone
            return info(version, folder, Math.max(1, width));
        }
        List<AttributedString> info = info(version, folder, infoWidth);
        int contentWidth = (withLogo ? LOGO_WIDTH + GAP : 0)
            + info.stream().mapToInt(AttributedString::columnLength).max().orElse(0);
        int rows = withLogo ? LOGO.length : info.size();
        int firstInfoRow = (rows - info.size()) / 2;

        List<AttributedString> lines = new ArrayList<>();
        lines.add(border("╭", contentWidth, "╮"));
        for (int row = 0; row < rows; row++) {
            AttributedStringBuilder line = new AttributedStringBuilder();
            line.append("│ ", CliTheme.PRIMARY);
            if (withLogo) {
                appendLogoRow(line, LOGO[row]);
                line.append(" ".repeat(GAP));
            }
            int infoRow = row - firstInfoRow;
            AttributedString text = infoRow >= 0 && infoRow < info.size() ? info.get(infoRow) : AttributedString.EMPTY;
            line.append(text);
            int used = (withLogo ? LOGO_WIDTH + GAP : 0) + text.columnLength();
            line.append(" ".repeat(contentWidth - used));
            line.append(" │", CliTheme.PRIMARY);
            lines.add(line.toAttributedString());
        }
        lines.add(border("╰", contentWidth, "╯"));
        return lines;
    }

    /**
     * @param folder   a folder
     * @param userHome the user's home
     * @return the folder, with the home written as {@code ~}
     */
    static String displayFolder(Path folder, Path userHome) {
        Path normalized = folder.toAbsolutePath().normalize();
        Path home = userHome.toAbsolutePath().normalize();
        if (normalized.equals(home)) {
            return "~";
        }
        if (normalized.startsWith(home)) {
            return "~/" + home.relativize(normalized).toString().replace('\\', '/');
        }
        return normalized.toString();
    }

    private static List<AttributedString> info(String version, String folder, int width) {
        List<AttributedString> info = new ArrayList<>();
        info.add(new AttributedStringBuilder()
            .append("GenSynth", AttributedStyle.BOLD)
            .append(" " + version, CliTheme.MUTED)
            .toAttributedString());
        info.add(new AttributedString(fit(SUBTITLE, width), CliTheme.MUTED));
        info.add(new AttributedString(fit(folder, width), CliTheme.MUTED));
        info.add(new AttributedStringBuilder()
            .append("Type ", CliTheme.MUTED)
            .append("'help'", CliTheme.PRIMARY)
            .append(" · ", CliTheme.MUTED)
            .append("Tab", CliTheme.PRIMARY)
            .append(" completes paths", CliTheme.MUTED)
            .toAttributedString()
            .columnSubSequence(0, width));
        return info;
    }

    /** Keeps the end of a text that does not fit, which for a folder is the useful part. */
    private static String fit(String text, int width) {
        if (text.length() <= width) {
            return text;
        }
        return width <= 1 ? "…" : "…" + text.substring(text.length() - (width - 1));
    }

    private static void appendLogoRow(AttributedStringBuilder line, String row) {
        for (int column = 0; column < row.length(); column++) {
            char c = row.charAt(column);
            if (c == ' ') {
                line.append(' ');
            } else if (c == '▄' || c == '▀' || c == '█') {
                line.append(String.valueOf(c), CliTheme.rgb(gradient(column / (double) (LOGO_WIDTH - 1))));
            } else {
                line.append(String.valueOf(c), PULSE);
            }
        }
    }

    private static int gradient(double t) {
        int r = mix(GRADIENT_FROM >> 16, GRADIENT_TO >> 16, t);
        int g = mix((GRADIENT_FROM >> 8) & 0xff, (GRADIENT_TO >> 8) & 0xff, t);
        int b = mix(GRADIENT_FROM & 0xff, GRADIENT_TO & 0xff, t);
        return (r << 16) | (g << 8) | b;
    }

    private static int mix(int from, int to, double t) {
        return (int) Math.round(from + (to - from) * t);
    }

    private static AttributedString border(String left, int contentWidth, String right) {
        return new AttributedString(left + "─".repeat(contentWidth + 2) + right, CliTheme.PRIMARY);
    }
}
