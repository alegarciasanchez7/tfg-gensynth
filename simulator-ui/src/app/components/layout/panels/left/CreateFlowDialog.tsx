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
import { ConnectorConfigForm } from '../../../common/ConnectorConfigForm';
import { NamingPatternFields } from '../../../common/NamingPatternFields';
import { buildPatternNames } from '../../../../core/namingPattern';
import { defaultConnectorConfig, validateConnectorConfig } from '../../../../core/connectorFields';

const DEFAULT_REPEAT_COUNT = '2';
const DEFAULT_REPEAT_PATTERN = '${name} ${index}';

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isInteger(parsed) && parsed >= 1;
}

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
    everyTicks?: number,
  ) => Promise<Flow>;
  onSelectFlow?: (groupId: string, flowId: string) => void;
  /** Repeater mode: creates N flows with the same initial configuration and a naming pattern. */
  repeat?: boolean;
}

export function CreateFlowDialog({
  open,
  onOpenChange,
  groups,
  groupId,
  latestConnectors,
  onCreateFlow,
  onSelectFlow,
  repeat = false,
}: CreateFlowDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState(groupId || '');
  const [flowName, setFlowName] = useState('');
  const [flowTechnology, setFlowTechnology] = useState('');
  const [flowEveryTicks, setFlowEveryTicks] = useState('1');
  const [repeatCount, setRepeatCount] = useState(DEFAULT_REPEAT_COUNT);
  const [repeatPattern, setRepeatPattern] = useState(DEFAULT_REPEAT_PATTERN);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setFlowEveryTicks('1');
      setRepeatCount(DEFAULT_REPEAT_COUNT);
      setRepeatPattern(DEFAULT_REPEAT_PATTERN);
      setIsSubmitting(false);
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
    setConnectorConfig(descriptor ? defaultConnectorConfig(descriptor.fields) : {});
  }, [flowTechnology, latestConnectors]);

  const everyTicksValid = isPositiveInteger(flowEveryTicks);
  const repeatValid = !repeat || (isPositiveInteger(repeatCount) && repeatPattern.trim() !== '');
  const connectorValid = Boolean(selectedConnector)
    && Object.keys(validateConnectorConfig(selectedConnector?.fields ?? [], connectorConfig)).length === 0;

  const handleCreateFlow = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (isSubmitting || !everyTicksValid || !repeatValid || !connectorValid || !selectedConnector) return;
    const targetGroupId = groupId || selectedGroupId;
    if (!targetGroupId) {
      toast.error('Please select a group first');
      return;
    }

    const everyTicks = Number(flowEveryTicks);
    const names = repeat
      ? buildPatternNames(repeatPattern, flowName.trim(), Number(repeatCount))
      : [flowName.trim()];

    setIsSubmitting(true);
    const created: Flow[] = [];
    try {
      // One after another so the flows keep the order of their names
      for (const name of names) {
        created.push(await onCreateFlow(
          targetGroupId,
          name,
          flowTechnology.trim(),
          '', // Legacy host/port/topic: the destination is part of the connector configuration
          0,
          undefined,
          undefined, // Legacy interval: generation is paced by the global tick clock
          undefined, // Legacy burst: one message every N ticks
          '{}',
          connectorConfig,
          everyTicks,
        ));
      }
      toast.success(repeat ? `${created.length} flows created` : `Flow "${created[0].name}" created`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create flow';
      toast.error(repeat ? `Created ${created.length} of ${names.length} flows: ${message}` : message);
      if (created.length === 0) {
        setIsSubmitting(false);
        return;
      }
    }

    if (onSelectFlow) {
      onSelectFlow(targetGroupId, created[0].id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[75vh] flex flex-col bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
        <form onSubmit={handleCreateFlow} className="flex-1 flex flex-col min-h-0">
          <DialogHeader className="shrink-0 mb-4">
            <DialogTitle className="text-[var(--c-tx1)]">{repeat ? 'Repeater' : 'Add flow'}</DialogTitle>
            <DialogDescription className="text-[var(--c-tx4)]">
              {repeat
                ? 'Create several flows with the same initial configuration.'
                : groupId ? 'Create a new flow inside this group.' : 'Create a new flow. Select a group first.'}
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
                  {repeat ? 'Base name' : 'Name'}
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
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-every-ticks">
                  Every N ticks
                </label>
                <Input
                  id="flow-every-ticks"
                  type="number"
                  min={1}
                  step={1}
                  value={flowEveryTicks}
                  onChange={(event) => setFlowEveryTicks(event.target.value)}
                  placeholder="1"
                  aria-invalid={!everyTicksValid}
                  className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                />
                <p className="text-[10px] text-[var(--c-tx4)]">1 message every N ticks (whole number ≥ 1)</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-connector">
                  Connector
                </label>
                <select
                  id="flow-connector"
                  value={flowTechnology}
                  onChange={(event) => setFlowTechnology(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                  required
                  disabled={latestConnectors.length === 0}
                >
                  <option value="">{latestConnectors.length > 0 ? 'Select a connector...' : 'No connectors installed'}</option>
                  {latestConnectors.map((connector) => (
                    <option key={connector.pluginId} value={connector.pluginId}>
                      {connector.displayName} ({connector.pluginId}@{connector.pluginVersion})
                    </option>
                  ))}
                </select>
              </div>

              {selectedConnector && (
                <div className="sm:col-span-2 pt-1">
                  <ConnectorConfigForm
                    key={selectedConnector.pluginId}
                    connector={selectedConnector}
                    config={connectorConfig}
                    onChange={setConnectorConfig}
                  />
                </div>
              )}
            </div>

            {repeat && (
              <div className="pt-2 border-t border-[var(--c-br2)]">
                <NamingPatternFields
                  count={repeatCount}
                  onCountChange={setRepeatCount}
                  pattern={repeatPattern}
                  onPatternChange={setRepeatPattern}
                  itemName={flowName.trim() || 'Flow'}
                  countLabel="Number of flows"
                  itemsNoun="flows"
                  onSubmit={() => void handleCreateFlow()}
                />
              </div>
            )}
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
              disabled={
                isSubmitting
                || (!groupId && !selectedGroupId)
                || !flowName.trim()
                || !flowTechnology.trim()
                || !everyTicksValid
                || !repeatValid
                || !connectorValid
              }
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {repeat ? `Create ${repeatCount} flows` : 'Create flow'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
