import type React from 'react';
import type { AppAction } from '../reducer';
import type { Selection } from '../../types';

export const selectGroup = (dispatch: React.Dispatch<AppAction>) => (groupId: string) => {
  dispatch({ type: 'SET_SELECTION', payload: { type: 'group', groupId } });
};

export const selectFlow = (dispatch: React.Dispatch<AppAction>) => (groupId: string, flowId: string) => {
  dispatch({ type: 'SET_SELECTION', payload: { type: 'flow', groupId, flowId } });
};

export const selectVariable = (dispatch: React.Dispatch<AppAction>, selection: Selection) => (variableId: string) => {
  dispatch({
    type: 'SET_SELECTION',
    payload: { ...selection, type: 'variable', variableId },
  });
};

export const clearVariableSelection = (dispatch: React.Dispatch<AppAction>, selection: Selection) => () => {
  if (selection.flowId) {
    dispatch({
      type: 'SET_SELECTION',
      payload: { type: 'flow', groupId: selection.groupId, flowId: selection.flowId },
    });
  } else if (selection.groupId) {
    dispatch({
      type: 'SET_SELECTION',
      payload: { type: 'group', groupId: selection.groupId },
    });
  } else {
    dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
  }
};

export const clearSelection = (dispatch: React.Dispatch<AppAction>) => () => {
  dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
};
