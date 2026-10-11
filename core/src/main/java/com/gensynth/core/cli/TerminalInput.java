package com.gensynth.core.cli;

import org.jline.reader.Completer;
import org.jline.reader.EndOfFileException;
import org.jline.reader.Highlighter;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.UserInterruptException;
import org.jline.reader.impl.DefaultParser;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;

import java.io.Closeable;
import java.io.IOException;

/**
 * Reads the commands from the terminal with line editing: Tab completion, the arrow keys and
 * the history of the session (kept in memory only).
 */
final class TerminalInput implements CliShell.LineSource, Closeable {

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
            }
        }
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
