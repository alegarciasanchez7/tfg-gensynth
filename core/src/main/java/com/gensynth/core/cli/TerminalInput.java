package com.gensynth.core.cli;

import org.jline.reader.Completer;
import org.jline.reader.EndOfFileException;
import org.jline.reader.Highlighter;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.UserInterruptException;
import org.jline.reader.impl.DefaultParser;
import org.jline.terminal.Attributes;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.jline.utils.InfoCmp.Capability;
import org.jline.utils.NonBlockingReader;

import java.io.Closeable;
import java.io.IOError;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;
import java.util.function.Supplier;

/**
 * Reads the commands from the terminal with line editing: Tab completion, the arrow keys and
 * the history of the session (kept in memory only).
 */
final class TerminalInput implements CliShell.LineSource, CliShell.Screen, Closeable {

    private static final String HINT = "  (press any key)";
    private static final long REFRESH_MILLIS = 1000;

    private final Terminal terminal;
    private final LineReader reader;

    /**
     * @param terminal  terminal to read from; closed by {@link #close()}
     * @param completer completion of the word under the cursor when Tab is pressed
     */
    TerminalInput(Terminal terminal, Completer completer) {
        this(terminal, newReader(terminal, completer, null));
    }

    /**
     * @param terminal    terminal to read from; closed by {@link #close()}
     * @param completer   completion of the word under the cursor when Tab is pressed
     * @param highlighter colors of the line while it is typed
     */
    TerminalInput(Terminal terminal, Completer completer, Highlighter highlighter) {
        this(terminal, newReader(terminal, completer, highlighter));
    }

    /**
     * @param terminal terminal to read from; closed by {@link #close()}
     * @param reader   line reader of that terminal
     */
    TerminalInput(Terminal terminal, LineReader reader) {
        this.terminal = terminal;
        this.reader = reader;
    }

    private static LineReader newReader(Terminal terminal, Completer completer, Highlighter highlighter) {
        DefaultParser parser = new DefaultParser();
        // No backslash escapes: the shell only understands quotes, and the backslash is the
        // Windows separator. Completed names with spaces are wrapped in quotes instead
        parser.setEscapeChars(null);
        LineReaderBuilder builder = LineReaderBuilder.builder()
            .terminal(terminal)
            .appName("gensynth")
            .parser(parser)
            .completer(completer)
            // "!" is a valid file name character, not a history reference
            .option(LineReader.Option.DISABLE_EVENT_EXPANSION, true);
        if (highlighter != null) {
            builder.highlighter(highlighter);
        }
        return builder.build();
    }

    /**
     * Opens the terminal the process runs in.
     *
     * @return the terminal
     * @throws IOException           if the terminal cannot be opened
     * @throws IllegalStateException if the process has no terminal
     */
    static Terminal openSystemTerminal() throws IOException {
        return TerminalBuilder.builder().system(true).dumb(false).build();
    }

    /**
     * @return the line reader, for the status panel
     */
    LineReader reader() {
        return reader;
    }

    /**
     * Reads one line. {@code Ctrl + C} discards the text typed so far; on an empty line it
     * ends the input, as {@code Ctrl + D} does.
     *
     * @param prompt text shown before the line
     * @return the line, or null at the end of the input
     */
    @Override
    public String readLine(String prompt) {
        while (true) {
            try {
                return reader.readLine(prompt);
            } catch (UserInterruptException e) {
                if (e.getPartialLine().isEmpty()) {
                    return null;
                }
            } catch (EndOfFileException e) {
                return null;
            } catch (IOError e) {
                // The terminal went away (window closed, connection lost): end as with Ctrl + D
                return null;
            }
        }
    }

    /**
     * Shows a block of lines in place, refreshed every second, until a key is pressed. Only a
     * carriage return, "cursor up" and "clear to end of line" are used, which every terminal
     * understands; each line is cut to the width of the terminal so it never wraps. While it is
     * shown, {@code Ctrl + C} is read as one more key instead of ending the program.
     * <p>
     * A dumb terminal only delivers keys after Enter, so there the lines are printed once; so
     * are several lines on a terminal that cannot move the cursor up.
     *
     * @param lines builds the lines each time they are drawn
     * @throws IOException if the keyboard cannot be read
     */
    @Override
    public void showLive(Supplier<List<String>> lines) throws IOException {
        List<String> first = lines.get();
        boolean dumb = terminal.getType() != null && terminal.getType().startsWith(Terminal.TYPE_DUMB);
        if (dumb || first.size() > 1 && terminal.getStringCapability(Capability.cursor_up) == null) {
            first.forEach(terminal.writer()::println);
            terminal.flush();
            return;
        }
        Attributes previous = terminal.enterRawMode();
        Attributes keysOnly = new Attributes(terminal.getAttributes());
        keysOnly.setLocalFlag(Attributes.LocalFlag.ISIG, false);
        terminal.setAttributes(keysOnly);
        try {
            NonBlockingReader keys = terminal.reader();
            int rows = draw(first, 0);
            while (keys.read(REFRESH_MILLIS) == NonBlockingReader.READ_EXPIRED) {
                rows = draw(lines.get(), rows);
            }
            // Keys such as the arrows send several characters: drop the rest so they are not
            // typed at the next prompt
            while (keys.peek(50) >= 0) {
                keys.read();
            }
        } finally {
            terminal.setAttributes(previous);
            terminal.writer().println();
            terminal.flush();
        }
    }

    /**
     * Draws the block over the previous one, with the hint at the end of its last line. The
     * block never shrinks while it is shown: rows left over are cleared.
     *
     * @param lines        the lines to draw
     * @param previousRows rows drawn the previous time (0 the first time)
     * @return rows drawn; the cursor is left on the last one
     */
    private int draw(List<String> lines, int previousRows) {
        int width = terminal.getWidth() > 1 ? terminal.getWidth() - 1 : 79;
        int rows = Math.max(lines.size(), previousRows);
        PrintWriter writer = terminal.writer();
        writer.print('\r');
        for (int i = 1; i < previousRows; i++) {
            terminal.puts(Capability.cursor_up);
        }
        for (int row = 0; row < rows; row++) {
            String text = row < lines.size() ? lines.get(row) : "";
            if (row == lines.size() - 1) {
                text += HINT;
            }
            String shown = text.length() > width ? text.substring(0, width) : text;
            writer.print(shown);
            if (!terminal.puts(Capability.clr_eol)) {
                // No "clear to end of line": overwrite what was there with spaces
                writer.print(" ".repeat(width - shown.length()));
            }
            if (row < rows - 1) {
                writer.print("\r\n");
            }
        }
        terminal.flush();
        return rows;
    }

    /**
     * Clears the screen and the scrollback, as the {@code clear} command of the shells does.
     * A dumb terminal cannot clear it, so nothing is done there.
     */
    @Override
    public void clearScreen() {
        if (terminal.getType() != null && terminal.getType().startsWith(Terminal.TYPE_DUMB)) {
            return;
        }
        if (terminal.puts(Capability.clear_screen)) {
            // E3 (erase the scrollback): not in every terminfo, but widely supported
            terminal.writer().print("\u001b[3J");
        }
        terminal.flush();
    }

    /**
     * Gives the terminal back in the state it had before the shell.
     *
     * @throws IOException if the terminal cannot be closed
     */
    @Override
    public void close() throws IOException {
        terminal.close();
    }
}
