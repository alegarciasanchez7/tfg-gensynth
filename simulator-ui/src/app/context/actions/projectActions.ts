import type React from 'react';
import { toast } from 'sonner';
import type { AppAction } from '../reducer';
import type { Selection, Group, Variable } from '../../types';
import type { ConnectorPluginDescriptor } from '../../core/types';
import { CoreCommands } from '../../core/bridge';
import {
  triggerFileSelection,
  loadProjectSnapshotFromFile,
  normalizeGroupFromSnapshot,
  normalizeVariableFromSnapshot,
  createProjectSnapshot,
  downloadProjectSnapshot,
} from '../../core/fileStorage';

export const loadProjectState = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  connectorCatalog: ConnectorPluginDescriptor[],
  selection: Selection,
  preserveLocalSnapshotRef: React.MutableRefObject<boolean>,
) => async () => {
  try {
    if (connectionMode === 'jcef') {
      const response = await CoreCommands.loadState();
      if (response && (response as any).status === 'cancelled') {
        return;
      }
      return;
    }

    // Open file selector
    const file = await triggerFileSelection();
    if (!file) {
      // User cancelled the file selection
      return;
    }

    // Load and parse the snapshot
    const snapshot = await loadProjectSnapshotFromFile(file);

    // Normalize all data to ensure valid structure
    const normalizedGroups = snapshot.groups.map(normalizeGroupFromSnapshot);
    const normalizedVariables = snapshot.variables.map(normalizeVariableFromSnapshot);

    // Dispatch state update
    dispatch({
      type: 'LOAD_INITIAL_STATE',
      payload: {
        groups: normalizedGroups,
        variables: normalizedVariables,
        connectorCatalog,
      },
    });
    preserveLocalSnapshotRef.current = true;

    // Sincronizar con el backend
    import('../../core/bridge').then(({ CoreCommands }) => {
      CoreCommands.importState(normalizedGroups, normalizedVariables)
        .catch((err: any) => console.error('[loadProjectState] Error sincronizando backend:', err));
    });

    const selectionStillExists =
      selection.type === 'group'
        ? normalizedGroups.some((group) => group.id === selection.groupId)
        : selection.type === 'flow'
          ? normalizedGroups.some((group) =>
              group.id === selection.groupId && group.flows.some((flow) => flow.id === selection.flowId),
            )
          : selection.type === 'variable'
            ? normalizedVariables.some((variable) => variable.id === selection.variableId)
            : true;

    if (!selectionStillExists) {
      dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
    }

    // Log success with details
    const totalFlows = normalizedGroups.reduce((acc, g) => acc + g.flows.length, 0);
    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `load_success_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'info',
        source: 'SYSTEM',
        message: `Proyecto cargado: ${normalizedGroups.length} grupos, ${totalFlows} flows, ${normalizedVariables.length} variables`,
      },
    });
    // Log success
    toast.success(`Proyecto cargado desde: ${file.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al cargar proyecto';
    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `load_error_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'error',
        source: 'SYSTEM',
        message: `Error al cargar proyecto: ${message}`,
      },
    });
    toast.error(message);
  }
};

export const saveProjectState = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  groups: Group[],
  variables: Variable[],
) => async () => {
  try {
    if (connectionMode === 'jcef') {
      // In Desktop mode, let the backend handle the Save As dialog
      const response = await CoreCommands.saveState();
      if (response.status === 'cancelled') {
        return; // User cancelled the dialog
      }
      // Success notification is handled by the server via logs or separate response
      return;
    }

    // Standard web browser behavior (Download snapshot)
    const snapshot = createProjectSnapshot(groups, variables);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `gen-synth-${timestamp}.json`;

    downloadProjectSnapshot(snapshot, filename);

    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `save_success_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'info',
        source: 'SYSTEM',
        message: `Proyecto guardado en: ${filename}`,
      },
    });

    toast.success(`Proyecto guardado: ${filename}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al guardar proyecto';
    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `save_error_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'error',
        source: 'SYSTEM',
        message: `Error al guardar proyecto: ${message}`,
      },
    });
    toast.error(message);
  }
};
