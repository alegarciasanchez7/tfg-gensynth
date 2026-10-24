package com.gensynth.core.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gensynth.core.connectors.plugin.PluginInstallerImpl;
import com.gensynth.core.connectors.runtime.ConnectorCatalogService;
import com.gensynth.core.flow.TemplateEngine;
import com.gensynth.core.model.Variable;
import com.gensynth.core.persistence.JsonStateRepositoryImpl;
import org.java_websocket.WebSocket;
import org.junit.Before;
import org.junit.Test;

import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Temporal sub-properties ({@code .hour}, {@code .year}...) created the way the UI creates them:
 * CREATE_VARIABLE with type "temporal", which the Core stores as "date". They must read the
 * instant generated for the message whatever the output format.
 */
public class TemporalSubPropertiesBridgeTest {

    private static final String FLOW_ID = "flow-1";
    private static final String GROUP_ID = "group-1";
    /** 2026-03-15T13:45:30Z = 1773582330000 ms, a Sunday. */
    private static final String START = "2026-03-15T13:45:30Z";
    private static final String START_MILLIS = "1773582330000";

    private final ObjectMapper mapper = new ObjectMapper();
    private UiBridgeWebSocketServer server;
    private WebSocket conn;

    @Before
    public void setUp() throws Exception {
        Path tempDir = Files.createTempDirectory("gensynth-temporal-props-");
        server = new UiBridgeWebSocketServer(
                new InetSocketAddress("localhost", 0),
                new ConnectorCatalogService(),
                new JsonStateRepositoryImpl(tempDir.toString()),
                new PluginInstallerImpl(tempDir));
        conn = mock(WebSocket.class);
        when(conn.isOpen()).thenReturn(true);
    }

    @Test
    public void unixTimestampFormatKeepsSubPropertiesOnTheInstant() throws Exception {
        Variable tu = createTemporal("tu", "UNIX_TIMESTAMP", "UTC");
        assertEquals("the Core stores the UI 'temporal' type as 'date'", "date", tu.getType());

        String out = render("{{tu}}|{{tu.hour}}|{{tu.monthText}}|{{local.tu.year}}|{{tu.timestamp}}|{{tu.timezone}}|{{tu.dayOfWeek}}");

        assertEquals(START_MILLIS + "|13|March|2026|" + START_MILLIS + "|UTC|Sunday", out);
    }

    @Test
    public void dateOnlyFormatKeepsTheTimeOfTheInstant() throws Exception {
        createTemporal("tDate", "yyyy-MM-dd", "UTC");

        String out = render("{{tDate}}|{{tDate.hour}}|{{tDate.minute}}|{{tDate.second}}|{{tDate.timestamp}}");

        assertEquals("2026-03-15|13|45|30|" + START_MILLIS, out);
    }

    @Test
    public void timeOnlyFormatKeepsTheDateAndZoneOfTheInstant() throws Exception {
        createTemporal("tFix", "HH:mm:ss", "Europe/Madrid");

        String out = render("{{tFix}}|{{tFix.year}}|{{tFix.monthText}}|{{tFix.day}}|{{tFix.hour}}|{{tFix.timezone}}|{{tFix.timestamp}}");

        // Madrid is UTC+1 on 15 March 2026
        assertEquals("14:45:30|2026|March|15|14|Europe/Madrid|" + START_MILLIS, out);
    }

    @Test
    public void emptyTimeZoneUsesTheComputerZoneForValueAndSubProperties() throws Exception {
        java.util.TimeZone previous = java.util.TimeZone.getDefault();
        // A zone with a half-hour offset, so UTC can never be mistaken for it
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
        try {
            createTemporal("tLocal", "HH:mm", "");

            String out = render("{{tLocal}}|{{tLocal.hour}}|{{tLocal.minute}}|{{tLocal.timezone}}");

            java.time.ZonedDateTime local = java.time.Instant.parse(START).atZone(java.time.ZoneId.systemDefault());
            String expected = String.format(java.util.Locale.ROOT, "%02d:%02d|%d|%d|%s",
                    local.getHour(), local.getMinute(), local.getHour(), local.getMinute(),
                    java.time.ZoneId.systemDefault().getId());
            assertEquals(expected, out);
            assertEquals("19:15|19|15|Asia/Kolkata", out);
        } finally {
            java.util.TimeZone.setDefault(previous);
        }
    }

    /** Sends CREATE_VARIABLE exactly as the UI does (type "temporal", Simulated Step) and returns the stored variable. */
    private Variable createTemporal(String name, String dateFormat, String timeZone) throws Exception {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("pattern", "START_PLUS_INCREMENT");
        config.put("timeAdvanceMode", "SIMULATED_STEP");
        config.put("startDate", START);
        config.put("incrementMs", 1000);
        config.put("dateFormat", dateFormat);
        config.put("timeZone", timeZone);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("variableId", "var-" + name);
        payload.put("name", name);
        payload.put("type", "temporal");
        payload.put("scope", "local");
        payload.put("flowId", FLOW_ID);
        payload.put("config", config);

        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", "CREATE_VARIABLE");
        command.put("commandId", "cmd-" + name);
        command.put("protocolVersion", "1.0.0");
        command.put("payload", payload);
        server.onMessage(conn, mapper.writeValueAsString(command));

        Variable stored = variables().get("var-" + name);
        assertNotNull("CREATE_VARIABLE must store the variable", stored);
        return stored;
    }

    private String render(String template) throws Exception {
        return new TemplateEngine().evaluate(template, 1, variables(), FLOW_ID, GROUP_ID, new java.util.HashMap<>());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Variable> variables() throws Exception {
        Field field = UiBridgeWebSocketServer.class.getDeclaredField("variablesById");
        field.setAccessible(true);
        return (Map<String, Variable>) field.get(server);
    }
}
