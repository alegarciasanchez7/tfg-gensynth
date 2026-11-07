package com.gensynth.core.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.model.FlowDefinition;
import com.gensynth.core.model.GroupDefinition;
import com.gensynth.core.model.OutputMode;
import com.gensynth.core.model.ProjectReport;
import com.gensynth.core.model.ProjectSettings;
import com.gensynth.core.model.StartProblem;
import com.gensynth.core.model.Variable;
import org.jline.utils.AttributedString;
import org.jline.utils.AttributedStringBuilder;
import org.jline.utils.AttributedStyle;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The summary that {@code see} prints: a tree with the tick, the groups, their flows with the
 * connector they use, and the variables each flow sends, followed by the problems that would
 * stop the project from starting. Only ASCII characters are used, so it reads the same in any
 * terminal.
 */
final class ProjectSummary {

    /** Config keys that name how each type of variable generates its values. */
    private static final List<String> MODE_KEYS = List.of("pattern", "selectionStrategy", "temporalType");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TemplateEngine templateEngine = new TemplateEngine();
    private final List<AttributedString> lines = new ArrayList<>();

    private ProjectSummary() {
    }

    /**
     * @param report the project, its problems and its installed connectors
     * @return the lines of the summary, from top to bottom
     */
    static List<AttributedString> lines(ProjectReport report) {
        return new ProjectSummary().build(report);
    }

    @SuppressWarnings("unchecked")
    private List<AttributedString> build(ProjectReport report) {
        JsonNode project = report.project();
        Map<String, Variable> variables = new LinkedHashMap<>();
        for (JsonNode node : project.path("variables")) {
            Variable variable = Variable.fromPayload(objectMapper.convertValue(node, Map.class));
            variables.put(variable.getId(), variable);
        }
        List<GroupDefinition> groups = new ArrayList<>();
        for (JsonNode node : project.path("groups")) {
            groups.add(GroupDefinition.fromPayload(objectMapper.convertValue(node, Map.class)));
        }
        ProjectSettings settings = ProjectSettings.fromPayload(
            project.has("settings") ? objectMapper.convertValue(project.get("settings"), Map.class) : null);

        lines.add(new AttributedString(String.valueOf(report.file().getFileName()), AttributedStyle.BOLD));
        boolean hasProblems = !report.problems().isEmpty();
        add("", false, plain(tickText(settings)));
        if (groups.isEmpty()) {
            add("", !hasProblems, plain("(no groups)"));
        }
        for (int g = 0; g < groups.size(); g++) {
            boolean lastGroup = g == groups.size() - 1 && !hasProblems;
            addGroup(groups.get(g), variables, report.connectors(), lastGroup);
        }
        if (hasProblems) {
            addProblems(report.problems());
        }
        return lines;
    }

    private static String tickText(ProjectSettings settings) {
        String tick = CliFormat.tick(settings.getTick());
        return "Tick: " + (tick.startsWith("as fast") ? tick : "every " + tick);
    }

    private void addGroup(GroupDefinition group, Map<String, Variable> variables, Map<String, String> connectors,
                          boolean last) {
        List<FlowDefinition> flows = new ArrayList<>(group.getFlows().values());
        StringBuilder text = new StringBuilder("Group \"" + group.getName() + "\" (");
        text.append(OutputMode.SEQUENTIAL.wireValue().equals(group.getOutputMode()) ? "sequential" : "parallel");
        text.append(", ").append(flows.size()).append(flows.size() == 1 ? " flow" : " flows");
        text.append(group.isEnabled() ? ")" : ", disabled)");
        add("", last, plain(text.toString()));

        String indent = last ? "    " : "|   ";
        if (flows.isEmpty()) {
            add(indent, true, plain("(no flows)"));
        }
        for (int f = 0; f < flows.size(); f++) {
            addFlow(flows.get(f), group, variables, connectors, indent, f == flows.size() - 1);
        }
    }

    private void addFlow(FlowDefinition flow, GroupDefinition group, Map<String, Variable> variables,
                         Map<String, String> connectors, String indent, boolean last) {
        AttributedStringBuilder text = new AttributedStringBuilder()
            .append("Flow \"" + flow.getName() + "\"" + (flow.isEnabled() ? "" : " (disabled)") + " -> ");
        String connector = connectors.get(flow.getTechnology());
        if (connector != null) {
            text.append(connector);
        } else {
            text.append(flow.getTechnology() + " (not installed)", CliTheme.WARNING);
        }
        int every = flow.getEveryTicks();
        text.append(every <= 1 ? ", every tick" : ", every " + every + " ticks");
        add(indent, last, text.toAttributedString());

        String childIndent = indent + (last ? "    " : "|   ");
        List<TemplateEngine.VariableReference> references = templateEngine.findReferencedVariables(
            flow.getTemplate(), variables, flow.getFlowId(), group.getGroupId());
        if (references.isEmpty()) {
            add(childIndent, true, plain("(no variables)"));
        }
        for (int v = 0; v < references.size(); v++) {
            add(childIndent, v == references.size() - 1, variableText(references.get(v)));
        }
    }

    private static AttributedString variableText(TemplateEngine.VariableReference reference) {
        Variable variable = reference.variable();
        if (variable == null) {
            String written = reference.scope() == null ? reference.name() : reference.scope() + "." + reference.name();
            return new AttributedStringBuilder()
                .append(written + " ")
                .append("(no such variable: sent as written)", CliTheme.WARNING)
                .toAttributedString();
        }
        StringBuilder text = new StringBuilder(variable.getName())
            .append(" (").append(variable.getScope().toLowerCase(Locale.ROOT))
            .append(", ").append(variable.getType().toLowerCase(Locale.ROOT));
        Map<String, Object> config = variable.getConfig();
        if (config != null) {
            for (String key : MODE_KEYS) {
                Object mode = config.get(key);
                if (mode != null && !String.valueOf(mode).isBlank()) {
                    text.append(", ").append(mode);
                    break;
                }
            }
        }
        return plain(text.append(")").toString());
    }

    private void addProblems(List<StartProblem> problems) {
        add("", true, new AttributedString("Problems (" + problems.size() + ")", CliTheme.ERROR));
        for (int p = 0; p < problems.size(); p++) {
            StartProblem problem = problems.get(p);
            AttributedStyle style = problem.blocking() ? CliTheme.ERROR : CliTheme.WARNING;
            add("    ", p == problems.size() - 1, new AttributedString(describe(problem), style));
        }
    }

    /**
     * @param problem a problem of a project
     * @return the problem with where it is, e.g. {@code Group "Sensors" / flow "Temp": ...}
     */
    static String describe(StartProblem problem) {
        StringBuilder text = new StringBuilder();
        if (problem.group() != null) {
            text.append("Group \"").append(problem.group()).append('"');
            if (problem.flow() != null) {
                text.append(" / flow \"").append(problem.flow()).append('"');
            }
            text.append(": ");
        }
        return text.append(problem.message()).toString();
    }

    /** Adds a branch of the tree: {@code +-- } or, for the last child, {@code `-- }. */
    private void add(String indent, boolean last, AttributedString text) {
        lines.add(new AttributedStringBuilder()
            .append(indent + (last ? "`-- " : "+-- "))
            .append(text)
            .toAttributedString());
    }

    private static AttributedString plain(String text) {
        return new AttributedString(text);
    }
}
