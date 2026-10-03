import { Header } from './components/layout/header/Header';
import { ResourceBar } from './components/layout/resource-bar/ResourceBar';
import { LeftPanel } from './components/layout/panels/left/LeftPanel';
import { Workspace } from './components/workspace/Workspace';
import { RightPanel } from './components/layout/panels/right/RightPanel';
import { BottomPanel } from './components/layout/panels/bottom/BottomPanel';
import { useApp } from './context';
import { Toaster } from 'sonner';
import { RestartOverlay } from './components/layout/header/RestartOverlay';
import {
  CloseConfigurationDialog,
  type CloseConfigurationReason,
} from './components/dialogs/CloseConfigurationDialog';
import { pickProjectFile, type PickedProjectFile } from './core/fileStorage';
import { useEffect, useState } from 'react';
import bridge from './core/bridge';

/** Project switch waiting for the user to confirm closing the current configuration. */
interface PendingProjectAction {
  reason: CloseConfigurationReason;
  /** File already picked for 'load' (browser mode). Desktop mode picks it after confirming. */
  file?: PickedProjectFile | null;
}

export default function App() {
  const { state, actions } = useApp();
  const [pendingAction, setPendingAction] = useState<PendingProjectAction | null>(null);

  const {
    isDark,
    systemStatus,
    currentFileName,
    isDirty,
    connectionMode,
    selection,
    groups,
    variables,
    bottomTab,
    formatTemplates,
    latestConnectors,
    connectorHealthSummary,
    isRestarting,
  } = state;

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMsg = `[UI CRASH] ${event.message} at ${event.filename}:${event.lineno}`;
      bridge.send('UI_LOG', {
        level: 'error',
        source: 'UI_RUNTIME',
        message: errorMsg
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const errorMsg = `[UI UNHANDLED REJECTION] ${event.reason}`;
      bridge.send('UI_LOG', {
        level: 'error',
        source: 'UI_RUNTIME',
        message: errorMsg
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Window unload guard against accidental tab closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // "New" always asks for confirmation since it closes the current configuration
  const handleNewProjectRequest = () => {
    setPendingAction({ reason: 'new' });
  };

  const handleLoadProjectRequest = async () => {
    if (!isDirty) {
      await actions.loadProjectState();
      return;
    }
    if (connectionMode === 'jcef') {
      setPendingAction({ reason: 'load' });
      return;
    }
    // Pick the file first, while the click still counts as a user gesture for the file picker
    const file = await pickProjectFile();
    if (file) {
      setPendingAction({ reason: 'load', file });
    }
  };

  const handleCloseConfirm = async (saveFirst: boolean) => {
    const action = pendingAction;
    if (!action) return;
    // Keep the dialog open if saving was cancelled or failed, so nothing is lost
    if (saveFirst && !(await actions.saveProjectState())) return;

    setPendingAction(null);
    if (action.reason === 'new') {
      await actions.newProjectState();
    } else {
      await actions.loadProjectState(action.file);
    }
  };

  // Usar templates del estado directamente
  const mergedTemplates = formatTemplates;

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden ${isDark ? 'dark' : ''}`}
      style={{
        background: 'var(--c-bg3)',
        color: 'var(--c-tx2)',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <RestartOverlay isVisible={isRestarting} />

      <CloseConfigurationDialog
        isOpen={Boolean(pendingAction)}
        reason={pendingAction?.reason ?? 'new'}
        fileName={currentFileName}
        hasUnsavedChanges={isDirty}
        onConfirm={handleCloseConfirm}
        onCancel={() => setPendingAction(null)}
      />

      {/* ── Header ────────────────────────────────── */}
      <Header
        systemStatus={systemStatus}
        onStatusToggle={actions.toggleSystem}
        onNewProject={handleNewProjectRequest}
        onLoadProject={handleLoadProjectRequest}
        onSaveProject={actions.saveProjectState}
        onSaveAsProject={actions.saveProjectStateAs}
        currentFileName={currentFileName}
        isDirty={isDirty}
        isDark={isDark}
        onThemeToggle={actions.toggleTheme}
        latestConnectors={latestConnectors}
        connectorHealthSummary={connectorHealthSummary}
        variables={variables}
      />

      {/* ── Compact telemetry bar ───────────────────── */}
      <ResourceBar />

      {/* ── Main 3-column layout ────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Groups & Flows */}
        <LeftPanel
          groups={groups}
          variables={variables}
          selection={selection}
          formatTemplate={mergedTemplates}
          latestConnectors={latestConnectors}
          onSelectGroup={actions.selectGroup}
          onSelectFlow={actions.selectFlow}
          onToggleGroup={actions.toggleGroupExpanded}
          onCreateGroup={actions.createGroup}
          onDeleteGroup={actions.deleteGroup}
          onCreateFlow={actions.createFlow}
          onUpdateGroupConfig={actions.updateGroupConfig}
          onUpdateFlowConfig={actions.updateFlowConfig}
          onCloneGroup={actions.cloneGroup}
          onCloneFlow={actions.cloneFlow}
          onDeleteFlow={actions.deleteFlow}
        />

        {/* Center: Dynamic Workspace */}
        <Workspace
          selection={selection}
          groups={groups}
          variables={variables}
          onSelectGroup={actions.selectGroup}
          onSelectFlow={actions.selectFlow}
          onSelectVariable={actions.selectVariable}
          formatTemplate={mergedTemplates}
          onFormatChange={actions.setFormatTemplate}
          onClearVariableSelection={actions.clearVariableSelection}
          onClearSelection={actions.clearSelection}
        />

        {/* Right: Variables */}
        <RightPanel
          variables={variables}
          selection={selection}
          onSelectVariable={actions.selectVariable}
          onInsertVariable={actions.insertVariable}
        />
      </div>

      {/* ── Bottom: Logs / Stats / Preview ─────────── */}
      <BottomPanel
        tab={bottomTab}
        onTabChange={actions.setBottomTab}
        systemStatus={systemStatus}
      />

      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
