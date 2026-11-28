package com.gensynth.core.ws.handler;

import com.gensynth.core.ws.runtime.FlowRuntime;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;

public class FlowSessionConfigTest {

    private static FlowRuntime flow(String technology, String template, String format, Map<String, Object> config) {
        return new FlowRuntime("f1", "Flow", technology, "disconnected", 0, 0, false, null, 1000, 1,
            "topic", "", 0, template, format, true, config);
    }

    @Test
    public void fileOutputWritesTheFileInTheMessageFormat() {
        Map<String, Object> stored = Map.of("format", "txt", "fileName", "out");

        assertEquals(Map.of("format", "xml", "fileName", "out"),
            FlowCommandHandler.sessionConfig(flow("file", "<v>{{n}}</v>", "xml", stored)));
        assertEquals(Map.of("format", "csv", "fileName", "out"),
            FlowCommandHandler.sessionConfig(flow("file", "id\n{{n}}", "csv", stored)));
        assertEquals(Map.of("format", "txt", "fileName", "out"),
            FlowCommandHandler.sessionConfig(flow("file", "value {{n}}", "plain", stored)));
        // Up to 0.6.0 new File Output flows were stored as plain with a JSON template
        assertEquals(Map.of("format", "json", "fileName", "out"),
            FlowCommandHandler.sessionConfig(flow("file", "{\"v\": {{n}}}", "plain", stored)));
    }

    @Test
    public void otherConnectorsKeepTheirSettings() {
        FlowRuntime rabbit = flow("rabbitmq", "<v/>", "xml", Map.of("queue", "q"));
        assertSame(rabbit.connectorConfig, FlowCommandHandler.sessionConfig(rabbit));
    }
}
