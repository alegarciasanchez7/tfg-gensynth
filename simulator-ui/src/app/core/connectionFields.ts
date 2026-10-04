/**
 * Derives the legacy flow connection fields (host, port, topic) from a connector config.
 * The Core still publishes to `flow.topic` and passes host/port to connectors that do not
 * define them, so these fields are kept in sync with the connector config.
 */

export interface ConnectionFields {
  host?: string;
  port?: number;
  topic?: string;
}

function firstPresent(config: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = config[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Returns only the fields the connector config defines, so existing values are not overwritten.
 */
export function deriveConnectionFields(config: Record<string, unknown>): ConnectionFields {
  const fields: ConnectionFields = {};
  const host = firstPresent(config, ['host', 'bootstrapServers', 'endpoint']);
  if (host !== undefined) fields.host = String(host);
  const port = Number(firstPresent(config, ['port']));
  if (Number.isFinite(port) && port > 0) fields.port = port;
  const topic = firstPresent(config, ['topic', 'exchange', 'queue']);
  if (topic !== undefined) fields.topic = String(topic);
  return fields;
}
