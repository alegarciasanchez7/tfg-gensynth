package com.gensynth.core.flow.serialization;

import com.gensynth.core.flow.DataEvent;
import java.util.List;

/**
 * Serializer contract for DataEvent payloads.
 */
public interface EventSerializer {

    /**
     * Serialize a single event.
     *
     * @param event Event to serialize
     * @return Serialized bytes
     */
    byte[] serialize(DataEvent event);

    /**
     * Serialize a batch of events.
     *
     * @param events Events to serialize
     * @return Serialized bytes
     */
    byte[] serializeBatch(List<DataEvent> events);

    /**
     * MIME content type of serialized payload.
     *
     * @return Content type string
     */
    String contentType();
}
