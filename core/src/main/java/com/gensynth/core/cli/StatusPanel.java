package com.gensynth.core.cli;

import com.gensynth.core.api.ISimulationManager;
import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.monitoring.ResourceUsage;
import org.jline.reader.LineReader;
import org.jline.terminal.Terminal;
import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStringBuilder;
import org.jline.utils.AttributedStyle;
import org.jline.utils.InfoCmp.Capability;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Closeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Lines kept at the bottom of the terminal and refreshed every second: the resources of the
 * process and the totals, as in the resource bar of the desktop application, and one line per
 * running simulation.
 * <p>
 * The terminal's scroll region is limited to the rows above the panel, so the commands scroll
 * without touching it. Each refresh draws every line at its absolute row and never fills the
 * last column, so the result does not depend on how a terminal wraps lines.
 */
final class StatusPanel implements Closeable {

    private static final Logger logger = LoggerFactory.getLogger(StatusPanel.class);
    private static final String WIDGET = "gensynth-status";
    /** Simulations listed at most; the rest are summed up in one line. */
    static final int MAX_SIMULATION_LINES = 5;
    /** Rows the terminal needs for the panel and a few lines of commands above it. */
    private static final int MIN_ROWS = 12;
    private static final int MAX_NAME = 24;

    private final Terminal terminal;
    private final LineReader reader;
    private final ISimulationManager manager;
    /** Taken by the shell while a command prints, so the panel is not drawn in the middle. */
    private final ReentrantLock outputLock = new ReentrantLock();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "gensynth-cli-status");
        thread.setDaemon(true);
        return thread;
    });
    private volatile List<AttributedString> pending = List.of();
    private boolean closed;
    /** Rows taken at the bottom of the screen, and the screen size they were taken for. */
    private int reserved;
    private int screenRows;
    private int screenColumns;

    private StatusPanel(Terminal terminal, LineReader reader, ISimulationManager manager) {
        this.terminal = terminal;
        this.reader = reader;
        this.manager = manager;
    }

    /**
     * Shows the panel and refreshes it every second.
     *
     * @param terminal the terminal of the shell
     * @param reader   the line reader of the shell: while it reads, the panel is drawn under
     *                 its lock so it never mixes with the line being edited
     * @param manager  source of the simulations
     * @return the panel, or null when the terminal cannot keep lines at the bottom or is too short
     */
    static StatusPanel open(Terminal terminal, LineReader reader, ISimulationManager manager) {
        if (terminal.getHeight() < MIN_ROWS
                || terminal.getStringCapability(Capability.change_scroll_region) == null
                || terminal.getStringCapability(Capability.cursor_address) == null
                || terminal.getStringCapability(Capability.save_cursor) == null
                || terminal.getStringCapability(Capability.restore_cursor) == null
                || terminal.getStringCapability(Capability.clr_eol) == null
                || terminal.getStringCapability(Capability.clr_eos) == null
                || terminal.getStringCapability(Capability.parm_down_cursor) == null) {
            return null;
        }
        StatusPanel panel = new StatusPanel(terminal, reader, manager);
        reader.getWidgets().put(WIDGET, () -> {
            panel.draw();
            return true;
        });
        // Drawn for the first time by the shell, right after it clears the screen
        panel.pending = panel.currentLines();
        panel.scheduler.scheduleWithFixedDelay(panel::refresh, 1, 1, TimeUnit.SECONDS);
        return panel;
    }

    /**
     * Runs a command of the shell without the panel being drawn while it prints.
     *
     * @param command what the shell does
     * @param <T>     result type
     * @return the result of the command
     */
    <T> T whilePrinting(Supplier<T> command) {
        outputLock.lock();
        try {
            return command.get();
        } finally {
            outputLock.unlock();
        }
    }

    /**
     * Draws the panel right after the screen has been cleared: its rows are empty, so it takes
     * them without scrolling anything.
     */
    void redrawAfterClear() {
        outputLock.lock();
        try {
            if (!closed) {
                screenRows = terminal.getHeight();
                screenColumns = terminal.getWidth();
                reserved = pending.size();
                setScrollRegion(screenRows - 1 - reserved);
                draw();
            }
        } finally {
            outputLock.unlock();
        }
    }

    /**
     * Stops the refresh, removes the panel and gives the whole screen back to the shell.
     */
    @Override
    public void close() {
        scheduler.shutdownNow();
        outputLock.lock();
        try {
            if (!closed) {
                closed = true;
                resize(0);
                terminal.flush();
            }
        } finally {
            outputLock.unlock();
        }
    }

    private void refresh() {
        try {
            pending = currentLines();
            if (reader.isReading()) {
                try {
                    reader.callWidget(WIDGET);
                    return;
                } catch (IllegalStateException e) {
                    // The line was accepted in the meantime: draw as when a command runs
                }
            }
            outputLock.lock();
            try {
                draw();
            } finally {
                outputLock.unlock();
            }
        } catch (RuntimeException e) {
            // Never let a drawing problem stop the refresh
            logger.warn("Could not refresh the status panel", e);
        }
    }

    private List<AttributedString> currentLines() {
        return lines(manager.list(), ResourceUsage.sample(), System.currentTimeMillis(),
            terminal.getWidth(), maxSimulationLines());
    }

    private void draw() {
        if (closed) {
            return;
        }
        List<AttributedString> lines = pending;
        if (terminal.getHeight() != screenRows || terminal.getWidth() != screenColumns) {
            onResize(terminal.getHeight(), terminal.getWidth());
        }
        resize(lines.size());
        int columns = Math.max(1, terminal.getWidth() - 1);
        terminal.puts(Capability.save_cursor);
        for (int i = 0; i < lines.size(); i++) {
            terminal.puts(Capability.cursor_address, screenRows - lines.size() + i, 0);
            terminal.writer().write(cut(lines.get(i), columns).toAnsi(terminal));
            terminal.puts(Capability.clr_eol);
        }
        terminal.puts(Capability.restore_cursor);
        terminal.flush();
    }

    /**
     * The terminal changed size: erases what is left of the old panel and takes the space again
     * from the new bottom. The cursor is always above the panel, so whatever is below its line is
     * the old panel, wherever the terminal moved it (some also wrap it again when they get
     * narrower).
     */
    private void onResize(int rows, int columns) {
        if (reserved > 0) {
            terminal.puts(Capability.save_cursor);
            // Moving down never scrolls, unlike a line feed
            terminal.puts(Capability.parm_down_cursor, 1);
            terminal.puts(Capability.carriage_return);
            terminal.puts(Capability.clr_eos);
            terminal.puts(Capability.restore_cursor);
        }
        screenRows = rows;
        screenColumns = columns;
        reserved = 0;
        setScrollRegion(rows - 1);
    }

    /**
     * Changes the rows taken at the bottom. Growing scrolls the text above up, so the line being
     * typed is never covered; shrinking clears the rows given back.
     */
    private void resize(int rows) {
        if (rows > reserved) {
            int grow = rows - reserved;
            terminal.puts(Capability.save_cursor);
            terminal.puts(Capability.cursor_address, screenRows - 1 - reserved, 0);
            for (int i = 0; i < grow; i++) {
                // A line feed on the last row of the scroll region scrolls it up
                terminal.writer().write('\n');
            }
            terminal.puts(Capability.restore_cursor);
            setScrollRegion(screenRows - 1 - rows);
            for (int i = 0; i < grow; i++) {
                terminal.puts(Capability.cursor_up);
            }
        } else if (rows < reserved) {
            terminal.puts(Capability.save_cursor);
            for (int row = screenRows - reserved; row < screenRows - rows; row++) {
                terminal.puts(Capability.cursor_address, row, 0);
                terminal.puts(Capability.clr_eol);
            }
            terminal.puts(Capability.restore_cursor);
            setScrollRegion(screenRows - 1 - rows);
        }
        reserved = rows;
    }

    /** Limits the scrolling to rows 0 to {@code lastRow}; the cursor does not move. */
    private void setScrollRegion(int lastRow) {
        terminal.puts(Capability.save_cursor);
        // Setting the region moves the cursor to the top on most terminals
        terminal.puts(Capability.change_scroll_region, 0, lastRow);
        terminal.puts(Capability.restore_cursor);
    }

    private int maxSimulationLines() {
        // Leave at least half of the screen to the commands
        return Math.max(0, Math.min(MAX_SIMULATION_LINES, terminal.getHeight() / 2 - 3));
    }

    /**
     * Builds the lines of the panel.
     *
     * @param simulations        the simulations of the session (only the running ones are shown)
     * @param usage              resources of the process
     * @param now                current time in epoch milliseconds
     * @param width              columns of the terminal; longer lines are cut
     * @param maxSimulationLines simulations listed at most
     * @return the lines, from top to bottom
     */
    static List<AttributedString> lines(List<SimulationSnapshot> simulations, ResourceUsage usage, long now,
                                        int width, int maxSimulationLines) {
        List<SimulationSnapshot> running = simulations.stream()
            .filter(s -> s.status() == SimulationSnapshot.Status.RUNNING)
            .toList();
        int columns = Math.max(1, width - 1);
        List<AttributedString> lines = new ArrayList<>();
        lines.add(new AttributedString("─".repeat(columns), CliTheme.PRIMARY));
        lines.add(cut(summary(running, usage), columns));

        int nameWidth = Math.min(MAX_NAME, running.stream()
            .mapToInt(s -> fileName(s).length()).max().orElse(0));
        int shown = running.size() > maxSimulationLines ? Math.max(0, maxSimulationLines - 1) : running.size();
        for (SimulationSnapshot simulation : running.subList(0, shown)) {
            lines.add(cut(simulationLine(simulation, now, nameWidth), columns));
        }
        if (shown < running.size()) {
            lines.add(cut(new AttributedString("   +" + (running.size() - shown) + " more · type 'list' to see them all",
                CliTheme.MUTED), columns));
        }
        return lines;
    }

    private static AttributedString summary(List<SimulationSnapshot> running, ResourceUsage usage) {
        boolean active = !running.isEmpty();
        AttributedStringBuilder line = new AttributedStringBuilder().append(" ");
        if (active) {
            line.append("● ", CliTheme.SUCCESS).append(running.size() + " running", CliTheme.SUCCESS);
        } else {
            line.append("○ No simulations running", CliTheme.MUTED);
        }
        double rate = running.stream().mapToDouble(SimulationSnapshot::messagesPerSecond).sum();
        double network = running.stream().mapToDouble(SimulationSnapshot::networkUpPerSecond).sum();
        long sent = running.stream().mapToLong(SimulationSnapshot::messagesSent).sum();
        long errors = running.stream().mapToLong(SimulationSnapshot::errors).sum();
        line.append("  │ ", CliTheme.MUTED);
        metric(line, "CPU", String.format(Locale.ROOT, "%.1f%%", usage.cpuPercent()), CliTheme.PRIMARY, true);
        metric(line, "RAM", usage.usedMemoryMb() + " MB", CliTheme.ACCENT, true);
        metric(line, "NET↑", CliFormat.bytes(network), CliTheme.SUCCESS, active);
        metric(line, "MSG/S", CliFormat.rate(rate), CliTheme.RATE, active);
        metric(line, "SENT", CliFormat.count(sent), CliTheme.PLAIN, active);
        metric(line, "ERR", CliFormat.count(errors), errors > 0 ? CliTheme.ERROR : CliTheme.MUTED, active);
        return line.toAttributedString();
    }

    private static void metric(AttributedStringBuilder line, String label, String value, AttributedStyle style,
                               boolean active) {
        line.append(label + " ", CliTheme.MUTED)
            .append(value, active ? style : CliTheme.MUTED)
            .append("  ");
    }

    private static AttributedString simulationLine(SimulationSnapshot simulation, long now, int nameWidth) {
        String name = fileName(simulation);
        if (name.length() > nameWidth) {
            name = name.substring(0, nameWidth - 1) + "…";
        }
        AttributedStyle errorStyle = simulation.errors() > 0 ? CliTheme.ERROR : CliTheme.MUTED;
        return new AttributedStringBuilder()
            .append(" ")
            .append("● ", simulation.errors() > 0 ? CliTheme.WARNING : CliTheme.SUCCESS)
            .append(String.format(Locale.ROOT, "%-3d", simulation.id()), CliTheme.ACCENT)
            .append(pad(name, nameWidth) + "  ")
            .append(CliFormat.duration(simulation.uptimeMillis(now)) + "  ", CliTheme.MUTED)
            .append(String.format(Locale.ROOT, "%6s", CliFormat.rate(simulation.messagesPerSecond())), CliTheme.RATE)
            .append(" msg/s  ", CliTheme.MUTED)
            .append(String.format(Locale.ROOT, "%6s", CliFormat.count(simulation.messagesSent())))
            .append(" sent  ", CliTheme.MUTED)
            .append(String.format(Locale.ROOT, "%4s", CliFormat.count(simulation.errors())), errorStyle)
            .append(" err  ", CliTheme.MUTED)
            .append(String.format(Locale.ROOT, "%5s", CliFormat.rate(simulation.ticksPerSecond())), CliTheme.TICK)
            .append(" tick/s", CliTheme.MUTED)
            .toAttributedString();
    }

    private static String fileName(SimulationSnapshot simulation) {
        return String.valueOf(simulation.configFile().getFileName());
    }

    private static String pad(String text, int width) {
        return text.length() >= width ? text : text + " ".repeat(width - text.length());
    }

    private static AttributedString cut(AttributedString line, int columns) {
        return line.columnLength() <= columns ? line : line.columnSubSequence(0, columns);
    }
}
