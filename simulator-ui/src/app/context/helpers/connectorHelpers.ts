import type { ConnectorPluginDescriptor } from '../../core/types';
import type { Group, Flow, ConnectorHealthSummary, ConnectorHealthStatus } from '../../types';

export function compareVersions(leftVersion: string, rightVersion: string): number {
  const leftParts = leftVersion.split('.').map((part) => Number(part) || 0);
  const rightParts = rightVersion.split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return leftVersion.localeCompare(rightVersion);
}

export function latestConnectorsFromCatalog(catalog: ConnectorPluginDescriptor[]): ConnectorPluginDescriptor[] {
  const latestByPluginId = new Map<string, ConnectorPluginDescriptor>();

  for (const descriptor of catalog) {
    const current = latestByPluginId.get(descriptor.pluginId);
    if (!current || compareVersions(descriptor.pluginVersion, current.pluginVersion) > 0) {
      latestByPluginId.set(descriptor.pluginId, descriptor);
    }
  }

  return Array.from(latestByPluginId.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName) ||
    left.pluginId.localeCompare(right.pluginId)
  );
}

export function getConnectorProperties(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return ((schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {});
}

export function getDefaultConfigFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = getConnectorProperties(schema);
  const defaults: Record<string, unknown> = {};

  for (const [name, definition] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
      defaults[name] = definition.default;
      continue;
    }

    if (Array.isArray(definition.enum) && definition.enum.length > 0) {
      defaults[name] = definition.enum[0];
      continue;
    }

    switch (definition.type) {
      case 'number':
      case 'integer':
        defaults[name] = 0;
        break;
      case 'boolean':
        defaults[name] = false;
        break;
      case 'array':
        defaults[name] = [];
        break;
      case 'object':
        defaults[name] = {};
        break;
      default:
        defaults[name] = '';
        break;
    }
  }

  return defaults;
}

export function findDescriptor(
  catalog: ConnectorPluginDescriptor[],
  pluginId: string,
  pluginVersion?: string,
): ConnectorPluginDescriptor | null {
  if (pluginVersion) {
    return catalog.find((descriptor) => descriptor.pluginId === pluginId && descriptor.pluginVersion === pluginVersion) ?? null;
  }

  return catalog
    .filter((descriptor) => descriptor.pluginId === pluginId)
    .sort((left, right) => compareVersions(right.pluginVersion, left.pluginVersion))[0] ?? null;
}

export function findBestDescriptorForFlow(flow: Flow, catalog: ConnectorPluginDescriptor[]): ConnectorPluginDescriptor | null {
  const normalizedTechnology = flow.technology.toLowerCase();
  return findDescriptor(catalog, normalizedTechnology) ?? findDescriptor(catalog, flow.technology) ?? catalog[0] ?? null;
}

export function buildConnectorHealthSummary(
  groups: Group[],
  catalog: ConnectorPluginDescriptor[],
  selections: Record<string, { pluginId: string; pluginVersion: string }>,
): ConnectorHealthSummary[] {
  const summaryByKey = new Map<string, ConnectorHealthSummary>();

  for (const group of groups) {
    for (const flow of group.flows) {
      const selection = selections[flow.id];
      const descriptor = selection
        ? findDescriptor(catalog, selection.pluginId, selection.pluginVersion)
        : findBestDescriptorForFlow(flow, catalog);

      if (!descriptor) {
        continue;
      }

      const key = `${descriptor.pluginId}@${descriptor.pluginVersion}`;
      const entry = summaryByKey.get(key) ?? {
        pluginId: descriptor.pluginId,
        pluginVersion: descriptor.pluginVersion,
        displayName: descriptor.displayName,
        status: 'offline',
        flowCount: 0,
        connectedCount: 0,
        warningCount: 0,
        errorCount: 0,
        lastMessage: undefined,
      };

      entry.flowCount += 1;

      if (flow.hasError || flow.connectionStatus === 'error') {
        entry.errorCount += 1;
        entry.lastMessage = flow.errorMessage ?? entry.lastMessage ?? `Flow ${flow.name} is in error state`;
      } else if (flow.connectionStatus === 'warning') {
        entry.warningCount += 1;
        entry.lastMessage = flow.errorMessage ?? entry.lastMessage;
      } else if (flow.connectionStatus === 'connected') {
        entry.connectedCount += 1;
      }

      summaryByKey.set(key, entry);
    }
  }

  return Array.from(summaryByKey.values())
    .map((entry) => {
      const allConnected = entry.connectedCount === entry.flowCount && entry.flowCount > 0;
      const hasProblems = entry.errorCount > 0 || entry.warningCount > 0;
      const status: ConnectorHealthStatus = allConnected ? 'healthy' : hasProblems ? 'degraded' : 'offline';

      return {
        ...entry,
        status,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.pluginVersion.localeCompare(right.pluginVersion));
}

export function normalizeConnectorState(
  groups: Group[],
  catalog: ConnectorPluginDescriptor[],
  previousSelections: Record<string, { pluginId: string; pluginVersion: string }> = {},
  previousConfigs: Record<string, Record<string, unknown>> = {},
) {
  const selections: Record<string, { pluginId: string; pluginVersion: string }> = {};
  const configs: Record<string, Record<string, unknown>> = {};

  for (const group of (groups || [])) {
    if (!group?.flows) continue;
    for (const flow of group.flows) {
      if (!flow) continue;
      const existingSelection = previousSelections[flow.id];
      const existingDescriptor = existingSelection
        ? findDescriptor(catalog, existingSelection.pluginId, existingSelection.pluginVersion)
        : null;
      const selectedDescriptor = existingDescriptor ?? findBestDescriptorForFlow(flow, catalog);

      if (!selectedDescriptor) {
        continue;
      }

      selections[flow.id] = {
        pluginId: selectedDescriptor.pluginId,
        pluginVersion: selectedDescriptor.pluginVersion,
      };

      configs[flow.id] = previousConfigs[flow.id] ?? getDefaultConfigFromSchema(selectedDescriptor.configSchema);
    }
  }

  return { selections, configs, healthSummary: buildConnectorHealthSummary(groups, catalog, selections) };
}

export function formatConnectorHealthMessage(summary: ConnectorHealthSummary[]): string {
  if (summary.length === 0) {
    return 'Connector health unavailable';
  }

  return summary
    .map((entry) => `${entry.displayName}@${entry.pluginVersion}:${entry.status}`)
    .join(' | ');
}
