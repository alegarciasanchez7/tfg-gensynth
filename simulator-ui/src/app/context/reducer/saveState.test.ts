import { describe, it, expect } from 'vitest';
import { rootReducer, initialState, type AppState, type AppAction, type ProjectFileInfo } from './index';
import type { Group, ProjectSettings, Variable } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

const file: ProjectFileInfo = { fileName: 'demo.json', filePath: null, fileHandle: null };

// Shape produced when reading a configuration file (normalizeGroupFromSnapshot)
const fileGroup: Group = {
  id: 'g1',
  name: 'Group 1',
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  expanded: false,
  enabled: true,
  flows: [
    {
      id: 'f1',
      name: 'Flow 1',
      technology: 'rabbitmq',
      connectionStatus: 'disconnected',
      throughput: '0 msg/s',
      hasError: false,
      interval: 1000,
      burst: 1,
      everyTicks: 1,
      topic: 'demo',
      host: 'localhost',
      port: 5672,
      latency: 0,
      enabled: true,
      template: '{"v":1}',
      connectorVersion: '1.0.0',
    },
  ],
};

// Same group as echoed back by the Core (mapGroupFromCore): different defaults, no connectorVersion
const coreGroup: Group = {
  ...fileGroup,
  outputMode: 'parallel',
  expanded: true,
  flows: [
    {
      ...fileGroup.flows[0],
      connectorVersion: undefined,
      format: 'json',
      connectorConfig: {},
    },
  ],
};

const fileVariable: Variable = {
  id: 'v1',
  name: 'counter',
  type: 'numeric',
  scope: 'global',
  config: { min: 0, max: 10 },
};

function run(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(rootReducer, state);
}

function loadFile(state: AppState = initialState): AppState {
  return run(state, {
    type: 'LOAD_INITIAL_STATE',
    payload: { groups: [fileGroup], variables: [fileVariable], file },
  });
}

describe('rootReducer save state tracking', () => {
  it('is not dirty right after loading a file', () => {
    const state = loadFile();
    expect(state.isDirty).toBe(false);
    expect(state.currentFileName).toBe('demo.json');
  });

  it('adopts Core echoes during a load as the saved baseline instead of flagging changes', () => {
    const state = run(
      loadFile(),
      { type: 'SET_BASELINE_SYNC', payload: true },
      { type: 'SET_GROUPS', payload: [coreGroup] },
      { type: 'SET_VARIABLES', payload: [{ ...fileVariable, description: undefined }] },
      { type: 'LOAD_INITIAL_STATE', payload: { groups: [coreGroup], variables: [fileVariable] } },
      { type: 'SET_BASELINE_SYNC', payload: false },
    );

    expect(state.isDirty).toBe(false);
    expect(state.dirtyItems.groupIds.size).toBe(0);
    expect(state.dirtyItems.flowIds.size).toBe(0);
    expect(state.currentFileName).toBe('demo.json');
  });

  it('flags real user changes once the baseline is synchronized', () => {
    const state = run(
      loadFile(),
      { type: 'SET_BASELINE_SYNC', payload: true },
      { type: 'SET_GROUPS', payload: [coreGroup] },
      { type: 'SET_BASELINE_SYNC', payload: false },
      { type: 'SET_GROUPS', payload: [{ ...coreGroup, name: 'Renamed' }] },
    );

    expect(state.isDirty).toBe(true);
    expect(state.dirtyItems.groupIds.has('g1')).toBe(true);
  });

  it('keeps unsaved changes when the Core resyncs outside a load (e.g. reconnection)', () => {
    const edited = { ...coreGroup, name: 'Renamed' };
    const state = run(
      loadFile(),
      { type: 'SET_GROUPS', payload: [edited] },
      { type: 'LOAD_INITIAL_STATE', payload: { groups: [edited], variables: [fileVariable] } },
    );

    expect(state.isDirty).toBe(true);
  });

  it('ignores runtime metrics reported by the Core while a simulation is running', () => {
    const runningGroup: Group = {
      ...coreGroup,
      status: 'running',
      throughput: '1 msg/s',
      flows: [
        {
          ...coreGroup.flows[0],
          connectionStatus: 'connected',
          throughput: '1 msg/s',
          latency: 3,
          hasError: true,
          errorMessage: 'No connector found for rabbitmq',
        },
      ],
    };
    const state = run(
      loadFile(),
      { type: 'SET_BASELINE_SYNC', payload: true },
      { type: 'SET_GROUPS', payload: [coreGroup] },
      { type: 'SET_BASELINE_SYNC', payload: false },
      { type: 'SET_GROUPS', payload: [runningGroup] },
      { type: 'LOAD_INITIAL_STATE', payload: { groups: [runningGroup], variables: [fileVariable] } },
    );

    expect(state.isDirty).toBe(false);
    expect(state.dirtyItems.groupIds.size).toBe(0);
    expect(state.dirtyItems.flowIds.size).toBe(0);
  });

  it('ignores UI-only group changes such as expanding a group', () => {
    const state = run(loadFile(), { type: 'TOGGLE_GROUP_EXPANDED', payload: 'g1' });
    expect(state.isDirty).toBe(false);
  });

  it('clears everything for a new project', () => {
    const state = run(
      loadFile(),
      { type: 'SET_SELECTION', payload: { type: 'group', groupId: 'g1' } },
      { type: 'NEW_PROJECT' },
    );

    expect(state.groups).toEqual([]);
    expect(state.variables).toEqual([]);
    expect(state.formatTemplates).toEqual({});
    expect(state.selection).toEqual({ type: 'none' });
    expect(state.currentFileName).toBeNull();
    expect(state.isDirty).toBe(false);
  });

  it('marks the saved snapshot as baseline and keeps later edits dirty', () => {
    const loaded = loadFile();
    const edited = run(loaded, { type: 'SET_GROUPS', payload: [{ ...fileGroup, name: 'Renamed' }] });
    const savedSnapshot = { groups: edited.groups, variables: edited.variables, settings: edited.settings };

    const saved = run(edited, { type: 'MARK_SAVED', payload: { savedState: savedSnapshot, file } });
    expect(saved.isDirty).toBe(false);

    const editedDuringSave = run(
      edited,
      { type: 'SET_GROUPS', payload: [{ ...fileGroup, name: 'Renamed again' }] },
      { type: 'MARK_SAVED', payload: { savedState: savedSnapshot, file } },
    );
    expect(editedDuringSave.isDirty).toBe(true);
  });

  it('clamps the auto-save interval', () => {
    expect(run(initialState, { type: 'SET_AUTO_SAVE_INTERVAL', payload: 1 }).autoSaveIntervalSeconds).toBe(5);
    expect(run(initialState, { type: 'SET_AUTO_SAVE_INTERVAL', payload: 99999 }).autoSaveIntervalSeconds).toBe(3600);
    expect(run(initialState, { type: 'SET_AUTO_SAVE_INTERVAL', payload: 45 }).autoSaveIntervalSeconds).toBe(45);
  });

  it('discarding a flow also resets its template buffer', () => {
    const editedFlow = { ...fileGroup.flows[0], template: 'edited' };
    const state = run(
      loadFile(),
      { type: 'SET_GROUPS', payload: [{ ...fileGroup, flows: [editedFlow] }] },
      { type: 'SET_FORMAT_TEMPLATE', payload: { flowId: 'f1', template: 'edited' } },
      { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'flow', id: 'f1' } },
    );

    expect(state.groups[0].flows[0].template).toBe('{"v":1}');
    expect(state.formatTemplates.f1).toBe('{"v":1}');
    expect(state.isDirty).toBe(false);
  });

  it('discarding a group keeps its runtime status', () => {
    const state = run(
      loadFile(),
      { type: 'SET_GROUPS', payload: [{ ...fileGroup, name: 'Renamed', status: 'running' }] },
      { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'group', id: 'g1' } },
    );

    expect(state.groups[0].name).toBe('Group 1');
    expect(state.groups[0].status).toBe('running');
    expect(state.isDirty).toBe(false);
  });

  it('discarding a new item clears a selection pointing to it', () => {
    const newVariable: Variable = { ...fileVariable, id: 'v2', name: 'fresh' };
    const state = run(
      loadFile(),
      { type: 'SET_VARIABLES', payload: [fileVariable, newVariable] },
      { type: 'SET_SELECTION', payload: { type: 'variable', variableId: 'v2' } },
      { type: 'DISCARD_ITEM_CHANGES', payload: { type: 'variable', id: 'v2' } },
    );

    expect(state.variables.map((v) => v.id)).toEqual(['v1']);
    expect(state.selection).toEqual({ type: 'none' });
    expect(state.isDirty).toBe(false);
  });

  describe('project settings', () => {
    const fastTicks: ProjectSettings = { tick: { mode: 'FIXED_RATE', value: 100, unit: 'MILLISECONDS' } };

    it('marks the project dirty when the tick settings change', () => {
      const state = run(loadFile(), { type: 'SET_SETTINGS', payload: fastTicks });
      expect(state.settings).toEqual(fastTicks);
      expect(state.isDirty).toBe(true);
      // Settings are not tied to an entity, so no item is flagged
      expect(state.dirtyItems.groupIds.size).toBe(0);
    });

    it('is clean again when the settings return to the saved value', () => {
      const state = run(
        loadFile(),
        { type: 'SET_SETTINGS', payload: fastTicks },
        { type: 'SET_SETTINGS', payload: DEFAULT_PROJECT_SETTINGS },
      );
      expect(state.isDirty).toBe(false);
    });

    it('keeps the same state object when the Core echoes identical settings', () => {
      const loaded = loadFile();
      const echoed = run(loaded, { type: 'SET_SETTINGS', payload: { tick: { ...loaded.settings.tick } } });
      expect(echoed).toBe(loaded);
    });

    it('clears the dirty flag once the new settings are saved', () => {
      const edited = run(loadFile(), { type: 'SET_SETTINGS', payload: fastTicks });
      const saved = run(edited, {
        type: 'MARK_SAVED',
        payload: { savedState: { groups: edited.groups, variables: edited.variables, settings: edited.settings }, file },
      });
      expect(saved.isDirty).toBe(false);
    });

    it('adopts the settings of an opened file as the saved baseline', () => {
      const state = run(initialState, {
        type: 'LOAD_INITIAL_STATE',
        payload: { groups: [fileGroup], variables: [fileVariable], settings: fastTicks, file },
      });
      expect(state.settings).toEqual(fastTicks);
      expect(state.savedState?.settings).toEqual(fastTicks);
      expect(state.isDirty).toBe(false);
    });

    it('keeps the current settings when the Core sends none (older cores)', () => {
      const edited = run(loadFile(), { type: 'SET_SETTINGS', payload: fastTicks });
      const resynced = run(edited, { type: 'LOAD_INITIAL_STATE', payload: { groups: [fileGroup], variables: [fileVariable] } });
      expect(resynced.settings).toEqual(fastTicks);
      expect(resynced.isDirty).toBe(true);
    });

    it('adopts settings echoed by the Core during a load as the baseline', () => {
      const state = run(
        loadFile(),
        { type: 'SET_BASELINE_SYNC', payload: true },
        { type: 'SET_SETTINGS', payload: fastTicks },
        { type: 'SET_BASELINE_SYNC', payload: false },
      );
      expect(state.isDirty).toBe(false);
      expect(state.savedState?.settings).toEqual(fastTicks);
    });

    it('resets the settings to the defaults for a new project', () => {
      const state = run(loadFile(), { type: 'SET_SETTINGS', payload: fastTicks }, { type: 'NEW_PROJECT' });
      expect(state.settings).toEqual(DEFAULT_PROJECT_SETTINGS);
      expect(state.isDirty).toBe(false);
    });
  });
});
