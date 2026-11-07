package com.gensynth.core.util;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Naming patterns used to create several items at once (Clone, Repeater).
 * {@code ${name}} is replaced by the base name and {@code ${index}} by the 1-based position.
 * An offset such as {@code ${index+1}} shifts the numbering (so clones of "H1" can be "H2", "H3").
 * Mirrors {@code simulator-ui/src/app/core/namingPattern.ts}.
 */
public final class NamingPattern {

    private static final Pattern INDEX_TOKEN = Pattern.compile("\\$\\{index(?:\\s*([+-])\\s*(\\d+))?\\}");

    private NamingPattern() {
    }

    /**
     * Builds the name of the item at a position.
     *
     * @param pattern naming pattern with {@code ${name}} and {@code ${index}} tokens
     * @param name    base name
     * @param index   1-based position of the item
     * @return the resolved name
     */
    public static String apply(String pattern, String name, int index) {
        String withName = pattern.replace("${name}", name);
        Matcher m = INDEX_TOKEN.matcher(withName);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            int value = index;
            if (m.group(1) != null) {
                int offset = Integer.parseInt(m.group(2));
                value = "+".equals(m.group(1)) ? index + offset : index - offset;
            }
            m.appendReplacement(out, String.valueOf(value));
        }
        m.appendTail(out);
        return out.toString();
    }
}
