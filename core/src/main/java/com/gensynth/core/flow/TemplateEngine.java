package com.gensynth.core.flow;

import com.gensynth.core.model.Variable;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TemplateEngine {

    private final DataGenerator dataGenerator;
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{([^}]+)\\}\\}");

    public TemplateEngine() {
        this.dataGenerator = new DataGenerator();
    }

    public String evaluate(String template, long sequenceNumber, Map<String, Variable> variables) {
        if (template == null || template.isEmpty()) {
            return "";
        }

        // Replace built-in system variables
        String currentTs = Instant.now().toString();
        String currentUuid = UUID.randomUUID().toString();
        String currentSeq = String.valueOf(sequenceNumber);

        // We do a manual loop to handle user variables safely without breaking JSON syntax
        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        StringBuilder result = new StringBuilder();

        while (matcher.find()) {
            String varName = matcher.group(1).trim();
            String replacement = "";

            // Built-in checks
            if (varName.equals("uuid")) {
                replacement = currentUuid;
            } else if (varName.equals("ts")) {
                replacement = currentTs;
            } else if (varName.equals("n")) {
                replacement = currentSeq;
            } else {
                // User variable (find by name since map is keyed by ID)
                Variable variable = null;
                for (Variable v : variables.values()) {
                    if (v.getName().equals(varName) || 
                        (varName.contains(".") && varName.substring(varName.lastIndexOf('.') + 1).equals(v.getName()))) {
                        variable = v;
                        break;
                    }
                }

                if (variable != null) {
                    Object generatedValue = dataGenerator.generateValue(variable);
                    // Convert value to string representation
                    replacement = String.valueOf(generatedValue);
                } else {
                    // Unknown variable, leave it as is or replace with empty
                    replacement = matcher.group(0);
                }
            }

            // Matcher.appendReplacement has issues with literal $ and \, so we quote replacement
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);

        return result.toString();
    }
}
