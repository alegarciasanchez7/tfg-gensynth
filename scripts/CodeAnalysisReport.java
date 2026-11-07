import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Lists the findings of the local code analysis (scripts/unix/analyze.sh, scripts\windows\analyze.bat)
 * for each part of the project (core, plugin-api, ui), grouped by file and sorted by line:
 * the files with the most severe findings come first. It reads the reports that the analysis
 * leaves behind (SpotBugs, PMD and CPD of the Java modules, ESLint of the UI). The console shows
 * the HIGH and MEDIUM findings ({@code --all} also the LOW and INFO ones), and
 * {@code target/code-analysis.txt} always gets every finding.
 *
 * <p>Run with the source launcher of the JDK, without compiling it first:
 * {@code java scripts/CodeAnalysisReport.java <repository> [core] [plugin-api] [ui] [--all]}.
 * Only the JDK is used (its XML parser, and a small JSON reader for the ESLint report).
 */
public final class CodeAnalysisReport {

    /** Parts of the project that can be analysed, in the order they are listed. */
    private static final List<String> TARGETS = List.of("core", "plugin-api", "ui");
    private static final String ESLINT_REPORT = "ui/reports/eslint-sonar.json";
    private static final String FULL_LIST = "target/code-analysis.txt";
    private static final String[] LEVELS = {"", "HIGH", "MEDIUM", "LOW", "INFO"};
    /** Findings up to this severity are shown without --all (HIGH and MEDIUM). */
    private static final int SHOWN_BY_DEFAULT = 2;
    /** Width of "  1234  MEDIUM  SpotBugs  ": the message goes below the rule, at this column. */
    private static final int INDENT = 27;

    /**
     * One finding of a tool.
     *
     * @param severity 1 (HIGH), 2 (MEDIUM), 3 (LOW) or 4 (INFO)
     * @param tool     the tool that found it
     * @param path     file, relative to the repository when it is inside it
     * @param line     line of the file (0 when unknown)
     * @param rule     identifier of the rule or bug pattern
     * @param message  what is wrong, on one line
     */
    record Finding(int severity, String tool, String path, int line, String rule, String message) {
    }

    /**
     * The findings of one part of the project.
     *
     * @param target   core, plugin-api or ui
     * @param findings what the tools found
     * @param reports  reports of the tools with the details (HTML pages, JSON)
     */
    record Section(String target, List<Finding> findings, List<String> reports) {
    }

    private CodeAnalysisReport() {
    }

    /**
     * Prints the findings of the reports found in the repository.
     *
     * @param args the repository folder, then the parts to list and the options
     * @throws Exception if a report cannot be read
     */
    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            usage();
        }
        Path root = Path.of(args[0]).toAbsolutePath().normalize();
        List<String> targets = new ArrayList<>();
        boolean all = false;
        for (int i = 1; i < args.length; i++) {
            if ("--all".equals(args[i])) {
                all = true;
            } else if (TARGETS.contains(args[i])) {
                targets.add(args[i]);
            } else {
                usage();
            }
        }
        if (targets.isEmpty()) {
            targets.addAll(TARGETS);
        }

        List<Section> sections = new ArrayList<>();
        for (String target : TARGETS) {
            if (targets.contains(target)) {
                sections.add("ui".equals(target) ? eslint(root) : javaModule(root, target));
            }
        }

        int shownUpTo = all ? LEVELS.length : SHOWN_BY_DEFAULT;
        sections.forEach(section -> print(section, shownUpTo, System.out));
        Path fullList = root.resolve(FULL_LIST);
        Files.createDirectories(fullList.getParent());
        try (PrintStream out = new PrintStream(Files.newOutputStream(fullList), true, StandardCharsets.UTF_8)) {
            sections.forEach(section -> print(section, LEVELS.length, out));
        }
        System.out.println();
        System.out.println("Every finding: " + fullList);
    }

    private static void usage() {
        System.err.println("Usage: java scripts/CodeAnalysisReport.java <repository> [core] [plugin-api] [ui] [--all]");
        System.exit(2);
    }

    /**
     * Prints a part of the project: its totals, then its files with the findings shown.
     *
     * @param shownUpTo the least severe level shown (findings below it are only counted)
     */
    static void print(Section section, int shownUpTo, PrintStream out) {
        List<Finding> findings = section.findings();
        out.println();
        out.println("== " + section.target() + ": " + findings.size() + (findings.size() == 1 ? " finding" : " findings")
            + (findings.isEmpty() ? "" : " | " + counts(findings, true) + " | " + counts(findings, false)));
        List<Finding> shown = findings.stream().filter(f -> f.severity() <= shownUpTo).toList();
        long hidden = findings.size() - shown.size();
        if (hidden > 0) {
            out.println("   Showing HIGH and MEDIUM (" + shown.size() + "); --all also shows the " + hidden
                + " LOW and INFO ones.");
        }

        Map<String, List<Finding>> byFile = new TreeMap<>();
        shown.forEach(finding -> byFile.computeIfAbsent(finding.path(), path -> new ArrayList<>()).add(finding));
        List<Map.Entry<String, List<Finding>>> files = new ArrayList<>(byFile.entrySet());
        // The most severe files first, then the ones with more findings
        files.sort(Comparator.<Map.Entry<String, List<Finding>>>comparingInt(e -> worst(e.getValue()))
            .thenComparing(e -> -e.getValue().size())
            .thenComparing(Map.Entry::getKey));
        for (Map.Entry<String, List<Finding>> file : files) {
            out.println();
            out.println(file.getKey() + "  (" + file.getValue().size() + ")");
            file.getValue().stream()
                .sorted(Comparator.comparingInt(Finding::line).thenComparingInt(Finding::severity))
                .forEach(finding -> {
                    out.println(String.format(Locale.ROOT, "  %4d  %-6s  %-8s  %s", finding.line(),
                        LEVELS[finding.severity()], finding.tool(), finding.rule()));
                    out.println(" ".repeat(INDENT) + finding.message());
                });
        }
        out.println();
        section.reports().forEach(report -> out.println("   Report: " + report));
    }

    private static int worst(List<Finding> findings) {
        return findings.stream().mapToInt(Finding::severity).min().orElse(LEVELS.length);
    }

    /** "HIGH 14, MEDIUM 236, LOW 429" (by level) or "SpotBugs 130, PMD 544, CPD 5" (by tool). */
    private static String counts(List<Finding> findings, boolean byLevel) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (byLevel) {
            for (int level = 1; level < LEVELS.length; level++) {
                counts.put(LEVELS[level], 0);
            }
        }
        findings.forEach(f -> counts.merge(byLevel ? LEVELS[f.severity()] : f.tool(), 1, Integer::sum));
        return counts.entrySet().stream()
            .filter(entry -> entry.getValue() > 0)
            .map(entry -> entry.getKey() + " " + entry.getValue())
            .reduce((a, b) -> a + ", " + b)
            .orElse("");
    }

    /** The findings of SpotBugs, PMD and CPD in a Java module. */
    static Section javaModule(Path root, String module) throws Exception {
        Path target = root.resolve(module).resolve("target");
        List<Finding> findings = new ArrayList<>();
        List<String> reports = new ArrayList<>();
        if (Files.exists(target.resolve("spotbugsXml.xml"))) {
            spotBugs(root, module, parse(target.resolve("spotbugsXml.xml")), findings);
            reports.add(target.resolve("reports/spotbugs.html").toString());
        }
        if (Files.exists(target.resolve("pmd.xml"))) {
            pmd(root, parse(target.resolve("pmd.xml")), findings);
            reports.add(target.resolve("reports/pmd.html").toString());
        }
        if (Files.exists(target.resolve("cpd.xml"))) {
            cpd(root, parse(target.resolve("cpd.xml")), findings);
            reports.add(target.resolve("reports/cpd.html").toString());
        }
        return new Section(module, findings, reports);
    }

    /** SpotBugs: priority 1 (HIGH) to 3 (LOW), at the primary source line of each bug. */
    private static void spotBugs(Path root, String module, Document xml, List<Finding> findings) {
        NodeList bugs = xml.getElementsByTagName("BugInstance");
        for (int i = 0; i < bugs.getLength(); i++) {
            Element bug = (Element) bugs.item(i);
            Element source = primarySourceLine(bug);
            String path = source == null ? module : module + "/src/main/java/" + source.getAttribute("sourcepath");
            findings.add(new Finding(Math.min(3, intAttribute(bug, "priority", 3)), "SpotBugs", relative(root, path),
                source == null ? 0 : intAttribute(source, "start", 0), bug.getAttribute("type"),
                withoutPackages(oneLine(childText(bug, "LongMessage")))));
        }
    }

    /** The line SpotBugs points at: the primary source line of the bug, else the first one. */
    private static Element primarySourceLine(Element bug) {
        Element first = null;
        for (Node child = bug.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element && "SourceLine".equals(element.getTagName())) {
                if ("true".equals(element.getAttribute("primary"))) {
                    return element;
                }
                first = first == null ? element : first;
            }
        }
        if (first == null) {
            NodeList lines = bug.getElementsByTagName("SourceLine");
            first = lines.getLength() > 0 ? (Element) lines.item(0) : null;
        }
        return first;
    }

    /** PMD: priority 1 is HIGH, 2 MEDIUM, 3 LOW and 4-5 INFO. */
    private static void pmd(Path root, Document xml, List<Finding> findings) {
        NodeList files = xml.getElementsByTagName("file");
        for (int i = 0; i < files.getLength(); i++) {
            Element file = (Element) files.item(i);
            String path = relative(root, file.getAttribute("name"));
            NodeList violations = file.getElementsByTagName("violation");
            for (int j = 0; j < violations.getLength(); j++) {
                Element violation = (Element) violations.item(j);
                findings.add(new Finding(Math.min(4, intAttribute(violation, "priority", 3)), "PMD", path,
                    intAttribute(violation, "beginline", 0), violation.getAttribute("rule"),
                    oneLine(violation.getTextContent())));
            }
        }
    }

    /** CPD: one MEDIUM finding per duplicated block, at its first copy, naming where the others are. */
    private static void cpd(Path root, Document xml, List<Finding> findings) {
        NodeList duplications = xml.getElementsByTagName("duplication");
        for (int i = 0; i < duplications.getLength(); i++) {
            Element duplication = (Element) duplications.item(i);
            NodeList copies = duplication.getElementsByTagName("file");
            if (copies.getLength() == 0) {
                continue;
            }
            Element first = (Element) copies.item(0);
            List<String> others = new ArrayList<>();
            for (int j = 1; j < copies.getLength(); j++) {
                Element copy = (Element) copies.item(j);
                others.add(relative(root, copy.getAttribute("path")) + ":" + copy.getAttribute("line"));
            }
            findings.add(new Finding(2, "CPD", relative(root, first.getAttribute("path")),
                intAttribute(first, "line", 0), "Duplication",
                duplication.getAttribute("lines") + " lines also in " + String.join(", ", others)));
        }
    }

    /**
     * ESLint: errors are HIGH; the warnings of the SonarJS rules MEDIUM; the other warnings LOW
     * (the debt that the normal lint already reports as warnings, such as no-explicit-any).
     */
    @SuppressWarnings("unchecked")
    static Section eslint(Path root) throws IOException {
        List<Finding> findings = new ArrayList<>();
        List<String> reports = new ArrayList<>();
        Path json = root.resolve(ESLINT_REPORT);
        if (Files.exists(json)) {
            reports.add(json.toString());
            List<Object> files = (List<Object>) new JsonReader(Files.readString(json)).read();
            for (Object entry : files) {
                Map<String, Object> file = (Map<String, Object>) entry;
                String path = relative(root, String.valueOf(file.get("filePath")));
                for (Object item : (List<Object>) file.getOrDefault("messages", List.of())) {
                    Map<String, Object> message = (Map<String, Object>) item;
                    String rule = message.get("ruleId") == null ? "eslint" : message.get("ruleId").toString();
                    boolean error = ((Number) message.getOrDefault("severity", 1)).intValue() == 2;
                    int severity = error ? 1 : rule.startsWith("sonarjs/") ? 2 : 3;
                    findings.add(new Finding(severity, "ESLint", path,
                        ((Number) message.getOrDefault("line", 0)).intValue(), rule,
                        oneLine(String.valueOf(message.get("message")))));
                }
            }
        }
        return new Section("ui", findings, reports);
    }

    private static Document parse(Path xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        // Local reports only: no external entities or DTDs are ever loaded
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(xml.toFile());
    }

    private static String childText(Element element, String tag) {
        NodeList nodes = element.getElementsByTagName(tag);
        return nodes.getLength() > 0 ? nodes.item(0).getTextContent() : "";
    }

    private static int intAttribute(Element element, String name, int fallback) {
        try {
            return Integer.parseInt(element.getAttribute(name).trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /** The path relative to the repository (short, and it opens from the terminal), else as is. */
    private static String relative(Path root, String path) {
        try {
            Path absolute = root.resolve(path).normalize();
            return absolute.startsWith(root) ? root.relativize(absolute).toString() : path;
        } catch (InvalidPathException e) {
            return path;
        }
    }

    /** The text on one line. */
    private static String oneLine(String text) {
        return text.strip().replaceAll("\\s+", " ");
    }

    /** "com.gensynth.core.App.run() returns java.util.List" becomes "App.run() returns List". */
    static String withoutPackages(String message) {
        return message.replaceAll("\\b(?:[a-z_][a-z0-9_]*\\.)+(?=[A-Z])", "");
    }

    /**
     * Minimal JSON reader for the ESLint report: objects become maps, arrays lists, numbers
     * doubles, and true, false and null their Java values.
     */
    static final class JsonReader {
        private final String text;
        private int pos;

        JsonReader(String text) {
            this.text = text;
        }

        /** @return the value of the whole text */
        Object read() {
            Object value = value();
            skipSpaces();
            if (pos != text.length()) {
                throw error("Unexpected text after the JSON value");
            }
            return value;
        }

        private Object value() {
            skipSpaces();
            if (pos >= text.length()) {
                throw error("Unexpected end of the JSON");
            }
            return switch (text.charAt(pos)) {
                case '{' -> object();
                case '[' -> array();
                case '"' -> string();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                default -> number();
            };
        }

        private Map<String, Object> object() {
            Map<String, Object> map = new LinkedHashMap<>();
            pos++;
            skipSpaces();
            if (peek() == '}') {
                pos++;
                return map;
            }
            while (true) {
                skipSpaces();
                String key = string();
                skipSpaces();
                expect(':');
                map.put(key, value());
                skipSpaces();
                if (peek() != ',') {
                    expect('}');
                    return map;
                }
                pos++;
            }
        }

        private List<Object> array() {
            List<Object> list = new ArrayList<>();
            pos++;
            skipSpaces();
            if (peek() == ']') {
                pos++;
                return list;
            }
            while (true) {
                list.add(value());
                skipSpaces();
                if (peek() != ',') {
                    expect(']');
                    return list;
                }
                pos++;
            }
        }

        private String string() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (pos < text.length()) {
                char c = text.charAt(pos++);
                if (c == '"') {
                    return out.toString();
                }
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                char escaped = text.charAt(pos++);
                switch (escaped) {
                    case 'n' -> out.append('\n');
                    case 't' -> out.append('\t');
                    case 'r' -> out.append('\r');
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'u' -> {
                        out.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
                        pos += 4;
                    }
                    default -> out.append(escaped);
                }
            }
            throw error("Unclosed JSON string");
        }

        private Object literal(String word, Object value) {
            if (!text.startsWith(word, pos)) {
                throw error("Invalid JSON value");
            }
            pos += word.length();
            return value;
        }

        private Double number() {
            int start = pos;
            while (pos < text.length() && "+-0123456789.eE".indexOf(text.charAt(pos)) >= 0) {
                pos++;
            }
            if (start == pos) {
                throw error("Invalid JSON value");
            }
            return Double.valueOf(text.substring(start, pos));
        }

        private void skipSpaces() {
            while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) {
                pos++;
            }
        }

        private char peek() {
            return pos < text.length() ? text.charAt(pos) : '\0';
        }

        private void expect(char c) {
            if (peek() != c) {
                throw error("Expected '" + c + "'");
            }
            pos++;
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at character " + pos + " of the ESLint report");
        }
    }
}
