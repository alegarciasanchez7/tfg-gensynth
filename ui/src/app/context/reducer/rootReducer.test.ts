import { describe, it, expect } from 'vitest';
import { rootReducer, initialState, type AppState } from './index';
import type { Flow, Group, Variable } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

const flow = (id: string, topic = 't'): Flow => ({
  id,
  name: id,
  technology: 'file',
  connectionStatus: 'disconnected',
  throughput: '0 msg/s',
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 1,
  topic,
  host: 'localhost',
  port: 0,
  latency: 0,
  enabled: true,
});

const group = (id: string, flows: Flow[]): Group => ({
  id,
  name: id,
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  sequentialOrder: 'flow',
  expanded: false,
  enabled: true,
  flows,
});

const variable = (id: string, description = ''): Variable => ({
  id,
  name: id,
  type: 'numeric',
  scope: 'global',
  config: {},
  description,
});

function withBaseline(saved: { groups: Group[]; variables: Variable[] }, current: { groups: Group[]; variables: Variable[] }): AppState {
  return {
    ...initialState,
    ...current,
    savedState: { ...saved, settings: DEFAULT_PROJECT_SETTINGS },
    settings: DEFAULT_PROJECT_SETTINGS,
  };
}

describe('rootReducer', () => {
  it('stores the open file info', () => {
    const next = rootReducer(initialState, {
      type: 'SET_FILE_INFO',
      payload: { fileName: 'a.gsynth', filePath: '/a.gsynth', fileHandle: null },
    });
    expect([next.currentFileName, next.currentFilePath, next.currentFileHandle]).toEqual(['a.gsynth', '/a.gsynth', null]);
  });

  it('remembers the auto-save choice and the clamped interval', () => {
    const enabled = rootReducer(initialState, { type: 'SET_AUTO_SAVE', payload: false });
    expect(enabled.autoSaveEnabled).toBe(false);
    expect(localStorage.getItem('gensynth-autosave')).toBe('false');

    const interval = rootReducer(initialState, { type: 'SET_AUTO_SAVE_INTERVAL', payload: 1 });
    expect(interval.autoSaveIntervalSeconds).toBe(5);
    expect(localStorage.getItem('gensynth-autosave-interval')).toBe('5');
  });

  it('discarding a new flow removes it and a changed flow reverts it', () => {
    const saved = { groups: [group('g1', [flow('f1')])], variables: [] };
    const state = withBaseline(saved, { groups: [group('g1', [flow('f1', 'edited'), flow('f2')])], variables: [] });

    const withoutNew = rootReducer(state, { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'flow', id: 'f2' } });
    expect(withoutNew.groups[0].flows.map((f) => f.id)).toEqual(['f1']);
    expect(withoutNew.isDirty).toBe(true);

    const reverted = rootReducer(withoutNew, { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'flow', id: 'f1' } });
    expect(reverted.groups[0].flows[0].topic).toBe('t');
    expect(reverted.isDirty).toBe(false);
  });

  it('discarding a new group removes it', () => {
    const saved = { groups: [group('g1', [])], variables: [] };
    const state = withBaseline(saved, { groups: [group('g1', []), group('g2', [flow('f9')])], variables: [] });

    const next = rootReducer(state, { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'group', id: 'g2' } });

    expect(next.groups.map((g) => g.id)).toEqual(['g1']);
    expect(next.isDirty).toBe(false);
  });

  it('discarding a variable reverts it, or removes it when it is new', () => {
    const saved = { groups: [], variables: [variable('v1')] };
    const state = withBaseline(saved, { groups: [], variables: [variable('v1', 'edited'), variable('v2')] });

    const reverted = rootReducer(state, { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'variable', id: 'v1' } });
    expect(reverted.variables.map((v) => v.description)).toEqual(['', '']);

    const removed = rootReducer(reverted, { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'variable', id: 'v2' } });
    expect(removed.variables.map((v) => v.id)).toEqual(['v1']);
    expect(removed.isDirty).toBe(false);
  });

  it('ignores a discard without a saved baseline', () => {
    const state = { ...initialState, savedState: null };
    expect(rootReducer(state, { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'variable', id: 'v1' } })).toBe(state);
    expect(rootReducer(state, { type: 'DISCARD_ALL_CHANGES' })).toBe(state);
  });

  it('logs a plugin rollback reported in the initial state', () => {
    const next = rootReducer({ ...initialState, logs: [] }, {
      type: 'LOAD_INITIAL_STATE',
      payload: {
        groups: [],
        variables: [],
        rollbackReport: { pluginId: 'kafka', message: 'restored 1.0.0', timestamp: 0 },
      },
    });
    expect(next.logs).toHaveLength(1);
    expect(next.logs[0]).toMatchObject({
      level: 'error',
      source: 'SYSTEM',
      message: 'CRITICAL RECOVERY: restored 1.0.0 (Plugin ID: kafka)',
    });
  });

  it('keeps the templates of the loaded flows in the editor buffers', () => {
    const loaded = { ...flow('f1'), template: '{"a":1}' };
    const next = rootReducer({ ...initialState, formatTemplates: { other: 'x' } }, {
      type: 'LOAD_INITIAL_STATE',
      payload: { groups: [group('g1', [loaded, flow('f2')])], variables: [] },
    });
    expect(next.formatTemplates).toEqual({ other: 'x', f1: '{"a":1}' });
  });

  it('keeps the session folder reported by the Core', () => {
    const started = rootReducer(initialState, { type: 'SET_SESSION_OUTPUT_DIR', payload: '/out/OUTPUT_FILES_1' });
    expect(started.sessionOutputDir).toBe('/out/OUTPUT_FILES_1');
    expect(rootReducer(started, { type: 'SET_SESSION_OUTPUT_DIR', payload: '/out/OUTPUT_FILES_1' })).toBe(started);

    const keptByOlderCore = rootReducer(started, { type: 'LOAD_INITIAL_STATE', payload: { groups: [], variables: [] } });
    expect(keptByOlderCore.sessionOutputDir).toBe('/out/OUTPUT_FILES_1');

    const reconnected = rootReducer(started, {
      type: 'LOAD_INITIAL_STATE',
      payload: { groups: [], variables: [], sessionOutputDir: '/out/OUTPUT_FILES_2' },
    });
    expect(reconnected.sessionOutputDir).toBe('/out/OUTPUT_FILES_2');
  });

  describe('connector editors on load', () => {
    const catalog = [
      { pluginId: 'file', displayName: 'File Output', pluginVersion: '1.0.0', description: '', apiVersion: '1.1', external: false, fields: [] },
      { pluginId: 'rabbitmq', displayName: 'RabbitMQ', pluginVersion: '1.0.0', description: '', apiVersion: '1.1', external: false, fields: [] },
    ];
    const rabbitFlow = { ...flow('f1'), technology: 'rabbitmq', connectorConfig: { exchange: 'old' } };
    const fileFlow = { ...flow('f1'), technology: 'file', connectorConfig: { format: 'json' } };
    const opened = rootReducer({ ...initialState, connectorCatalog: catalog }, {
      type: 'LOAD_INITIAL_STATE',
      payload: { groups: [group('g1', [rabbitFlow])], variables: [], file: { fileName: 'a.gsynth', filePath: null, fileHandle: null } },
    });

    it('opening another file with the same flow ids shows that file\'s connector', () => {
      const reopened = rootReducer(opened, {
        type: 'LOAD_INITIAL_STATE',
        payload: { groups: [group('g1', [fileFlow])], variables: [], file: { fileName: 'b.gsynth', filePath: null, fileHandle: null } },
      });

      expect(reopened.flowConnectorSelections.f1.pluginId).toBe('file');
      expect(reopened.flowConnectorConfigs.f1).toEqual({ format: 'json' });
    });

    it('a resync of the same project keeps the connector being edited', () => {
      const edited = { ...opened, flowConnectorConfigs: { f1: { exchange: 'typing…' } } };
      const resynced = rootReducer(edited, {
        type: 'LOAD_INITIAL_STATE',
        payload: { groups: [group('g1', [rabbitFlow])], variables: [] },
      });

      expect(resynced.flowConnectorConfigs.f1).toEqual({ exchange: 'typing…' });
    });
  });
});
