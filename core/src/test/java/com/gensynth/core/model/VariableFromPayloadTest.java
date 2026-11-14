package com.gensynth.core.model;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class VariableFromPayloadTest {

    private static Map<String, Object> payload(String scope) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("id", "v1");
        payload.put("name", "temp");
        payload.put("type", "numeric");
        payload.put("scope", scope);
        return payload;
    }

    @Test
    public void readsTheFlowAndGroupIdsWrittenWithOtherNamingConventions() {
        Map<String, Object> local = payload("local");
        local.put("flow_id", "f1");
        assertEquals("f1", Variable.fromPayload(local).getFlowId());

        Map<String, Object> lowerCase = payload("local");
        lowerCase.put("flowid", "f2");
        lowerCase.put("flow_id", "ignored");
        assertEquals("f2", Variable.fromPayload(lowerCase).getFlowId());

        Map<String, Object> group = payload("group");
        group.put("group_id", "g1");
        Variable variable = Variable.fromPayload(group);
        assertEquals("GROUP", variable.getScope());
        assertEquals("g1", variable.getGroupId());
    }

    @Test
    public void downgradesToGlobalWhenTheScopeOwnerIsMissing() {
        assertEquals("GLOBAL", Variable.fromPayload(payload("local")).getScope());
        assertEquals("GLOBAL", Variable.fromPayload(payload("group")).getScope());
        assertNull(Variable.fromPayload(payload("group")).getGroupId());
    }

    @Test
    public void recoversTheConfigurationKeptInTheDefaultValue() {
        Map<String, Object> payload = payload("global");
        payload.put("defaultValue", " {\"min\": 1, \"max\": 5} ");
        Map<String, Object> config = Variable.fromPayload(payload).getConfig();
        assertEquals(1, config.get("min"));
        assertEquals(5, config.get("max"));
    }

    @Test
    public void keepsAnEmptyConfigurationWhenTheDefaultValueIsNotJson() {
        Map<String, Object> plain = payload("global");
        plain.put("defaultValue", "42");
        assertTrue(Variable.fromPayload(plain).getConfig().isEmpty());

        Map<String, Object> broken = payload("global");
        broken.put("defaultValue", "{not json}");
        assertTrue(Variable.fromPayload(broken).getConfig().isEmpty());
    }
}
