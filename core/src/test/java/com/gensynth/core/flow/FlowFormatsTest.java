package com.gensynth.core.flow;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class FlowFormatsTest {

    @Test
    public void aCompleteJsonDocumentOrXmlIsAlwaysSentAsSuch() {
        assertEquals("json", FlowFormats.effectiveFormat("plain", "{\"id\": \"{{uuid}}\", \"t\": {{temperature}}}"));
        assertEquals("json", FlowFormats.effectiveFormat("csv", "[{{n}}]"));
        assertEquals("xml", FlowFormats.effectiveFormat("json", "  <root>{{n}}</root>"));
    }

    @Test
    public void otherTextKeepsTheStoredFormat() {
        // JSON still being written, CSV and plain text keep the chosen format
        assertEquals("json", FlowFormats.effectiveFormat("json", "{\"id\": "));
        assertEquals("plain", FlowFormats.effectiveFormat("plain", "{\"id\": 1} trailing"));
        assertEquals("csv", FlowFormats.effectiveFormat("CSV", "id,t\n{{uuid}},{{t}}"));
        assertEquals("xml", FlowFormats.effectiveFormat("xml", ""));
    }

    @Test
    public void withoutAStoredFormatEmptyIsJsonAndTextIsPlain() {
        assertEquals("json", FlowFormats.effectiveFormat(null, null));
        assertEquals("plain", FlowFormats.effectiveFormat(" ", "value {{n}}"));
    }

    @Test
    public void plainTextIsWrittenToATxtFile() {
        assertEquals("txt", FlowFormats.fileFormat("plain", "value {{n}}"));
        assertEquals("json", FlowFormats.fileFormat("plain", "{\"value\": {{n}}}"));
        assertEquals("csv", FlowFormats.fileFormat("csv", "id\n{{n}}"));
        assertEquals("xml", FlowFormats.fileFormat("json", "<v>{{n}}</v>"));
    }
}
