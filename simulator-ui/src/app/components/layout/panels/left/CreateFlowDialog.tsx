import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import type { Group, Flow } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';
import { ConnectorSchemaField, getDefaultValue } from '../../../common/ConnectorSchemaField';

interface CreateFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups?: Group[]; // If provided, shows group selector
  groupId?: string; // If provided, binds directly to this group
  latestConnectors: ConnectorPluginDescriptor[];
  onCreateFlow: (
    groupId: string,
    name: string,
    technology: string,
    host: string,
    port: number,
    topic?: string,
    interval?: number,
    burst?: number,
    template?: string,
    connectorConfig?: Record<string, unknown>,
  ) => Promise<Flow>;
  onSelectFlow?: (groupId: string, flowId: string) => void;
}

export function CreateFlowDialog({
  open,
  onOpenChange,
  groups,
  groupId,
  latestConnectors,
  onCreateFlow,
  onSelectFlow,
}: CreateFlowDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState(groupId || '');
  const [flowName, setFlowName] = useState('');
  const [flowTechnology, setFlowTechnology] = useState('');
  const [flowHost, setFlowHost] = useState('localhost');
  const [flowPort, setFlowPort] = useState('8080');
  const [flowTopic, setFlowTopic] = useState('');
  const [flowInterval, setFlowInterval] = useState('1000');
  const [flowBurst, setFlowBurst] = useState('1');
  const [connectorConfig, setConnectorConfig] = useState<Record<string, unknown>>({});

  const selectedConnector = latestConnectors.find((c) => c.pluginId === flowTechnology);

  useEffect(() => {
    if (groupId) {
      setSelectedGroupId(groupId);
    }
  }, [groupId]);

  useEffect(() => {
    if (!open) {
      // Reset form on close
      setFlowName('');
      setFlowTechnology('');
      setConnectorConfig({});
      setFlowHost('localhost');
      setFlowPort('8080');
      setFlowTopic('');
      setFlowInterval('1000');
      setFlowBurst('1');
      if (!groupId) {
        setSelectedGroupId('');
      }
    }
  }, [open, groupId]);

  useEffect(() => {
    if (!flowTechnology) {
      setConnectorConfig({});
      return;
    }
    const descriptor = latestConnectors.find((c) => c.pluginId === flowTechnology);
    if (descriptor) {
      const defaults = getDefaultConfigFromSchema(descriptor.configSchema);
      setConnectorConfig(defaults);
    } else {
      setConnectorConfig({});
    }
  }, [flowTechnology, latestConnectors]);

  // Helper to extract properties and construct defaults
  function getDefaultConfigFromSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!schema) return {};
    const properties = (schema.properties as Record<string, any> | undefined) ?? {};
    const defaults: Record<string, unknown> = {};

    for (const [name, definition] of Object.entries(properties)) {
      defaults[name] = getDefaultValue(definition);
    }
    return defaults;
  }

  const handleCreateFlow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetGroupId = groupId || selectedGroupId;
    if (!targetGroupId) {
      toast.error('Please select a group first');
      return;
    }

    const host = selectedConnector
      ? String(connectorConfig['host'] || connectorConfig['bootstrapServers'] || connectorConfig['endpoint'] || 'localhost')
      : flowHost.trim();
    const port = selectedConnector
      ? Number(connectorConfig['port'] || 8080)
      : Number(flowPort);
    const topic = selectedConnector
      ? String(connectorConfig['topic'] || connectorConfig['exchange'] || connectorConfig['queue'] || '')
      : flowTopic.trim();

    const interval = flowInterval.trim() ? Number(flowInterval) : undefined;
    const burst = flowBurst.trim() ? Number(flowBurst) : undefined;

    try {
      const createdFlow = await onCreateFlow(
        targetGroupId,
        flowName.trim(),
        flowTechnology.trim(),
        host,
        port,
        topic || undefined,
        Number.isNaN(interval) ? undefined : interval,
        Number.isNaN(burst) ? undefined : burst,
        '{}',
        selectedConnector ? connectorConfig : undefined,
      );

      toast.success(`Flow "${createdFlow.name}" created`);
      if (onSelectFlow) {
        onSelectFlow(targetGroupId, createdFlow.id);
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create flow';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[75vh] flex flex-col bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
        <form onSubmit={handleCreateFlow} className="flex-1 flex flex-col min-h-0">
          <DialogHeader className="shrink-0 mb-4">
            <DialogTitle className="text-[var(--c-tx1)]">Add flow</DialogTitle>
            <DialogDescription className="text-[var(--c-tx4)]">
              {groupId ? 'Create a new flow inside this group.' : 'Create a new flow. Select a group first.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-4">
            {groups && !groupId && (
              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-group-select">
                  Group
                </label>
                <select
                  id="flow-group-select"
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                  required
                >
                  <option value="">Select a group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-name">
                  Name
                </label>
                <Input
                  id="flow-name"
                  value={flowName}
                  onChange={(event) => setFlowName(event.target.value)}
                  placeholder="Orders → Kafka"
                  className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-connector">
                  Connector
                </label>
                {latestConnectors.length > 0 ? (
                  <select
                    id="flow-connector"
                    value={flowTechnology}
                    onChange={(event) => setFlowTechnology(event.target.value)}
                    className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                    required
                  >
                    <option value="">Select a connector...</option>
                    {latestConnectors.map((connector) => (
                      <option key={connector.pluginId} value={connector.pluginId}>
                        {connector.displayName} ({connector.pluginId}@{connector.pluginVersion})
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="flow-connector"
                    value={flowTechnology}
                    onChange={(event) => setFlowTechnology(event.target.value)}
                    placeholder="HTTP"
                    className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                    required
                  />
                )}
              </div>

              {selectedConnector ? (
                Object.entries(
                  (selectedConnector.configSchema?.properties as Record<string, any> | undefined) ?? {}
                ).map(([key, def]) => (
                  <ConnectorSchemaField
                    key={key}
                    name={key}
                    definition={def}
                    value={connectorConfig[key]}
                    onChange={(name, nextValue) =>
                      setConnectorConfig((prev) => ({ ...prev, [name]: nextValue }))
                    }
                  />
                ))
              ) : flowTechnology ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-host">
                      Host
                    </label>
                    <Input
                      id="flow-host"
                      value={flowHost}
                      onChange={(event) => setFlowHost(event.target.value)}
                      placeholder="localhost"
                      className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-port">
                      Port
                    </label>
                    <Input
                      id="flow-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={flowPort}
                      onChange={(event) => setFlowPort(event.target.value)}
                      placeholder="8080"
                      className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-topic">
                      Topic
                    </label>
                    <Input
                      id="flow-topic"
                      value={flowTopic}
                      onChange={(event) => setFlowTopic(event.target.value)}
                      placeholder="orders.events"
                      className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-interval">
                  Interval (ms)
                </label>
                <Input
                  id="flow-interval"
                  type="number"
                  min={1}
                  value={flowInterval}
                  onChange={(event) => setFlowInterval(event.target.value)}
                  placeholder="1000"
                  className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-burst">
                  Burst
                </label>
                <Input
                  id="flow-burst"
                  type="number"
                  min={1}
                  value={flowBurst}
                  onChange={(event) => setFlowBurst(event.target.value)}
                  placeholder="1"
                  className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t border-[var(--c-br2)] mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[var(--c-br1)] hover:bg-[var(--c-bg5)] text-[var(--c-tx2)]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={(!groupId && !selectedGroupId) || !flowName.trim() || !flowTechnology.trim()}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              Create flow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
