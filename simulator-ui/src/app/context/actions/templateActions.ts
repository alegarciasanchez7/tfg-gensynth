import type React from 'react';
import type { AppAction } from '../reducer';

export const setFormatTemplate = (dispatch: React.Dispatch<AppAction>) => (flowId: string, template: string) => {
  dispatch({ type: 'SET_FORMAT_TEMPLATE', payload: { flowId, template } });
};

export const setFlowConnectorSelection = (dispatch: React.Dispatch<AppAction>) => (flowId: string, pluginId: string, pluginVersion: string) => {
  dispatch({
    type: 'SET_FLOW_CONNECTOR_SELECTION',
    payload: { flowId, pluginId, pluginVersion },
  });
};

export const setFlowConnectorConfig = (dispatch: React.Dispatch<AppAction>) => (flowId: string, config: Record<string, unknown>) => {
  dispatch({
    type: 'SET_FLOW_CONNECTOR_CONFIG',
    payload: { flowId, config },
  });
};

export const registerTemplateEditor = (activeEditorRef: React.MutableRefObject<((name: string, scope?: string) => void) | null>) => (insertFn: ((name: string, scope?: string) => void) | null) => {
  activeEditorRef.current = insertFn;
};

export const insertVariable = (activeEditorRef: React.MutableRefObject<((name: string, scope?: string) => void) | null>) => (name: string, scope?: string) => {
  if (activeEditorRef.current) {
    activeEditorRef.current(name, scope);
  } else {
    // Fallback for when no editor is registered or for older implementation compatibility
    const varRef = `{{${scope ? scope + '.' : ''}${name}}}`;
    const insertFn = (window as unknown as Record<string, unknown>).__insertIntoFlow;
    if (typeof insertFn === 'function') {
      (insertFn as (ref: string) => void)(varRef);
    }
  }
};
