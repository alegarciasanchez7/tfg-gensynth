import type { Group, Variable, LogEntry } from '../types';
import type { ConnectorPluginDescriptor } from '../core/types';

export const mockGroups: Group[] = [
  {
    id: 'g1',
    name: 'Alpha · IoT Sensors',
    status: 'running',
    throughput: '1.24K msg/s',
    description: 'Simulación de sensores industriales de temperatura y presión.',
    threads: 4,
    outputMode: 'parallel',
    expanded: true,
    flows: [
      {
        id: 'f1',
        name: 'Kafka · sensor.temp',
        technology: 'Kafka',
        connectionStatus: 'connected',
        throughput: '450 msg/s',
        hasError: false,
        interval: 100,
        burst: 1,
        topic: 'sensor.temperature',
        host: 'broker.local',
        port: 9092,
      },
      {
        id: 'f2',
        name: 'HTTP · telemetry push',
        technology: 'HTTP',
        connectionStatus: 'connected',
        throughput: '320 msg/s',
        hasError: false,
        interval: 200,
        burst: 5,
        topic: '/api/v2/telemetry',
        host: 'ingest.srv',
        port: 443,
      },
      {
        id: 'f3',
        name: 'MQTT · pressure feed',
        technology: 'MQTT',
        connectionStatus: 'error',
        throughput: '0 msg/s',
        hasError: true,
        errorMessage: 'Connection refused: broker unreachable (timeout 5000ms)',
        interval: 500,
        burst: 1,
        topic: 'sensors/pressure',
        host: 'mqtt.local',
        port: 1883,
      },
    ],
  },
  {
    id: 'g2',
    name: 'Beta · Financial',
    status: 'stopped',
    throughput: '0 msg/s',
    description: 'Generación de transacciones financieras sintéticas.',
    threads: 2,
    outputMode: 'sequential',
    expanded: false,
    flows: [
      {
        id: 'f4',
        name: 'WebSocket · order book',
        technology: 'WebSocket',
        connectionStatus: 'disconnected',
        throughput: '0 msg/s',
        hasError: false,
        interval: 50,
        burst: 10,
        topic: 'ws://exchange.local/orderbook',
        host: 'exchange.local',
        port: 8080,
      },
      {
        id: 'f5',
        name: 'gRPC · trade events',
        technology: 'gRPC',
        connectionStatus: 'disconnected',
        throughput: '0 msg/s',
        hasError: false,
        interval: 100,
        burst: 1,
        topic: 'TradeService/Push',
        host: 'grpc.trade.local',
        port: 50051,
      },
    ],
  },
  {
    id: 'g3',
    name: 'Gamma · Access Logs',
    status: 'running',
    throughput: '3.71K msg/s',
    description: 'Simulación de logs de acceso web y autenticación.',
    threads: 8,
    outputMode: 'parallel',
    expanded: false,
    flows: [
      {
        id: 'f6',
        name: 'Kafka · access.raw',
        technology: 'Kafka',
        connectionStatus: 'connected',
        throughput: '1.2K msg/s',
        hasError: false,
        interval: 10,
        burst: 20,
        topic: 'logs.access.raw',
        host: 'broker.local',
        port: 9092,
      },
      {
        id: 'f7',
        name: 'Kafka · auth.events',
        technology: 'Kafka',
        connectionStatus: 'connected',
        throughput: '980 msg/s',
        hasError: false,
        interval: 20,
        burst: 10,
        topic: 'logs.auth.events',
        host: 'broker.local',
        port: 9092,
      },
      {
        id: 'f8',
        name: 'HTTP · SIEM ingest',
        technology: 'HTTP',
        connectionStatus: 'connected',
        throughput: '750 msg/s',
        hasError: false,
        interval: 100,
        burst: 5,
        topic: '/siem/ingest',
        host: 'siem.corp',
        port: 8514,
      },
      {
        id: 'f9',
        name: 'TCP · syslog',
        technology: 'TCP',
        connectionStatus: 'warning',
        throughput: '770 msg/s',
        hasError: true,
        errorMessage: 'High latency detected: avg 230ms (threshold: 100ms)',
        interval: 50,
        burst: 1,
        topic: 'syslog',
        host: '10.0.0.45',
        port: 514,
      },
    ],
  },
];

export const mockVariables: Variable[] = [
  // Local
  {
    id: 'v1',
    name: 'sensor_id',
    type: 'string',
    scope: 'local',
    description: 'Identificador único del sensor',
    config: { pattern: 'SEN-####', minLen: 8, maxLen: 8 },
  },
  {
    id: 'v2',
    name: 'temperature',
    type: 'numeric',
    scope: 'local',
    description: 'Temperatura en grados Celsius',
    config: { min: -20, max: 150, decimals: 2, distribution: 'gaussian', mean: 65, stddev: 15 },
  },
  {
    id: 'v3',
    name: 'active',
    type: 'boolean',
    scope: 'local',
    description: 'Estado activo del sensor',
    config: { probabilityTrue: 0.85 },
  },
  // Group
  {
    id: 'v4',
    name: 'device_location',
    type: 'point',
    scope: 'group',
    groupId: 'g1',
    description: 'Coordenadas GPS del dispositivo',
    config: { latMin: 40.0, latMax: 41.5, lngMin: -4.0, lngMax: -3.5, precision: 4, format: '[lat, lng]' },
  },
  {
    id: 'v5',
    name: 'event_time',
    type: 'temporal',
    scope: 'group',
    groupId: 'g1',
    description: 'Marca temporal del evento (rango)',
    config: { start: '2024-01-01T00:00:00Z', end: '2026-12-31T23:59:59Z', format: 'ISO8601', timezone: 'UTC', mode: 'random in range' },
  },
  {
    id: 'v6',
    name: 'status_code',
    type: 'list',
    scope: 'group',
    description: 'Código de estado HTTP',
    config: { values: ['200', '201', '400', '401', '403', '404', '500'], mode: 'weighted', weights: [50, 10, 15, 8, 5, 8, 4] },
  },
  // Global
  {
    id: 'v7',
    name: 'trace_id',
    type: 'string',
    scope: 'global',
    description: 'Identificador de traza distribuida',
    config: { pattern: '########-####-4###-####-############', minLen: 36, maxLen: 36 },
  },
  {
    id: 'v8',
    name: 'user_agent',
    type: 'list',
    scope: 'global',
    description: 'User-Agent del cliente HTTP',
    config: { values: ['Mozilla/5.0 (Chrome)', 'curl/7.88.1', 'Python-requests/2.28', 'okhttp/4.10.0'], mode: 'weighted', weights: [60, 15, 15, 10] },
  },
  {
    id: 'v9',
    name: 'created_at',
    type: 'temporal',
    scope: 'global',
    description: 'Rango de fechas de creación del registro',
    config: { start: '2024-01-01T00:00:00Z', end: '2026-03-08T00:00:00Z', format: 'ISO8601', timezone: 'UTC', mode: 'random in range' },
  },
  {
    id: 'v10',
    name: 'payload_size',
    type: 'numeric',
    scope: 'global',
    description: 'Tamaño del payload en bytes',
    config: { min: 64, max: 65535, decimals: 0, distribution: 'exponential' },
  },
];

export const defaultTemplates: Record<string, string> = {
  json: `{
  "id": "{{local.sensor_id}}",
  "timestamp": "{{group.event_time}}",
  "value": {{local.temperature}},
  "active": {{local.active}},
  "location": {{group.device_location}},
  "trace": "{{global.trace_id}}"
}`,
  xml: `<event>
  <id>{{local.sensor_id}}</id>
  <timestamp>{{group.event_time}}</timestamp>
  <value>{{local.temperature}}</value>
  <active>{{local.active}}</active>
  <trace>{{global.trace_id}}</trace>
</event>`,
  csv: `{{local.sensor_id}},{{group.event_time}},{{local.temperature}},{{local.active}},{{group.device_location}}`,
  plain: `[{{group.event_time}}] SENSOR {{local.sensor_id}} — temp={{local.temperature}}°C active={{local.active}} loc={{group.device_location}}`,
};

export const mockLogs: LogEntry[] = [
  { id: 'l1', timestamp: '14:32:01.441', level: 'info', source: 'f1·Kafka', message: 'Producer connected. Partitions: [0,1,2,3]. Leader: broker-0.' },
  { id: 'l2', timestamp: '14:32:01.553', level: 'info', source: 'f2·HTTP', message: 'HTTP client initialized. TLS: enabled. Target: ingest.srv:443.' },
  { id: 'l3', timestamp: '14:32:02.001', level: 'warn', source: 'f3·MQTT', message: 'Connection attempt 1/3 failed. Retrying in 2000ms…' },
  { id: 'l4', timestamp: '14:32:03.881', level: 'error', source: 'f3·MQTT', message: 'Connection refused: broker unreachable (timeout 5000ms). Flow halted.' },
  { id: 'l5', timestamp: '14:32:04.002', level: 'info', source: 'g3·Gamma', message: 'Group started. Threads: 8. Mode: parallel.' },
  { id: 'l6', timestamp: '14:32:04.110', level: 'debug', source: 'f9·TCP', message: 'Socket connected to 10.0.0.45:514. Buffer size: 65536.' },
  { id: 'l7', timestamp: '14:32:06.330', level: 'warn', source: 'f9·TCP', message: 'High latency: avg 230ms > threshold 100ms. Consider reducing burst.' },
  { id: 'l8', timestamp: '14:32:08.001', level: 'info', source: 'g1·Alpha', message: 'Throughput: 1.24K msg/s. Errors: 0. Dropped: 0.' },
  { id: 'l9', timestamp: '14:32:10.500', level: 'debug', source: 'f6·Kafka', message: 'Batch sent: 240 records in 12ms. Ack: all.' },
  { id: 'l10', timestamp: '14:32:12.001', level: 'info', source: 'SYS', message: 'Resource usage — CPU: 14.2% | RAM: 312MB | Net↑: 4.8MB/s' },
];

export const mockPreviewSamples: Record<string, string> = {
  f1: `{
  "id": "SEN-4821",
  "timestamp": "2025-07-14T14:32:08.441Z",
  "value": 67.34,
  "active": true,
  "location": [40.7128, -3.8921],
  "trace": "550e8400-e29b-41d4-a716-446655440000"
}`,
  f2: `POST /api/v2/telemetry HTTP/1.1
Content-Type: application/json
X-Trace-Id: 550e8400-e29b-41d4-a716-446655440000

{
  "sensor_id": "SEN-7732",
  "temperature": 71.09,
  "active": true
}`,
  f6: `192.168.1.104 - jsmith [04/Mar/2026:14:32:08 +0000] "GET /api/metrics HTTP/1.1" 200 2048 "-" "Mozilla/5.0"`,
  f9: `Mar  4 14:32:08 host-42 sshd[4821]: Accepted publickey for jsmith from 192.168.1.104 port 54321 ssh2`,
};

export const mockConnectorCatalog: ConnectorPluginDescriptor[] = [
  {
    pluginId: 'rabbitmq',
    displayName: 'RabbitMQ Connector',
    pluginVersion: '1.0.0',
    coreApiVersion: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        exchange: { type: 'string' },
        queue: { type: 'string' },
      },
    },
  },
  {
    pluginId: 'rabbitmq',
    displayName: 'RabbitMQ Connector',
    pluginVersion: '1.1.0',
    coreApiVersion: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        exchange: { type: 'string' },
        queue: { type: 'string' },
        reconnectAttempts: { type: 'number' },
      },
    },
  },
  {
    pluginId: 'kafka',
    displayName: 'Kafka Connector',
    pluginVersion: '2.0.0',
    coreApiVersion: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        bootstrapServers: { type: 'string' },
        topic: { type: 'string' },
        compressionType: { type: 'string' },
      },
    },
  },
  {
    pluginId: 'mqtt',
    displayName: 'MQTT Connector',
    pluginVersion: '1.0.0',
    coreApiVersion: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        topic: { type: 'string' },
        qos: { type: 'number' },
      },
    },
  },
  {
    pluginId: 'http',
    displayName: 'HTTP Connector',
    pluginVersion: '1.0.0',
    coreApiVersion: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string' },
        method: { type: 'string' },
        authType: { type: 'string' },
      },
    },
  },
];
