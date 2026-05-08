import { Header } from './components/layout/header/Header';
import { ResourceBar } from './components/layout/resource-bar/ResourceBar';
import { LeftPanel } from './components/layout/panels/left/LeftPanel';
import { Workspace } from './components/workspace/Workspace';
import { RightPanel } from './components/layout/panels/right/RightPanel';
import { BottomPanel } from './components/layout/panels/bottom/BottomPanel';
import { useApp } from './context';
import { Toaster } from 'sonner';

export default function App() {
  const { state, actions } = useApp();

  const {
    isDark,
    systemStatus,
    projectName,
    selection,
    groups,
    variables,
    bottomTab,
    formatTemplates,
    connectorCatalog,
    latestConnectors,
    connectorHealthSummary,
  } = state;

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
      {/* ── Header ─────────────────────────────────── */}
      <Header
        systemStatus={systemStatus}
        onStatusToggle={actions.toggleSystem}
        onLoadProject={actions.loadProjectState}
        onSaveProject={actions.saveProjectState}
        projectName={projectName}
        isDark={isDark}
        onThemeToggle={actions.toggleTheme}
        latestConnectors={latestConnectors}
        connectorHealthSummary={connectorHealthSummary}
      />

      {/* ── Resource monitor bar ────────────────────── */}
      <ResourceBar />

      {/* ── Main 3-column layout ────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Groups & Flows */}
        <LeftPanel
          groups={groups}
          selection={selection}
          formatTemplate={mergedTemplates}
          latestConnectors={latestConnectors}
          onSelectGroup={actions.selectGroup}
          onSelectFlow={actions.selectFlow}
          onToggleGroup={actions.toggleGroupExpanded}
          onCreateGroup={actions.createGroup}
          onDeleteGroup={actions.deleteGroup}
          onCreateFlow={actions.createFlow}
        />

        {/* Center: Dynamic Workspace */}
        <Workspace
          selection={selection}
          groups={groups}
          variables={variables}
          onSelectVariable={actions.selectVariable}
          formatTemplate={mergedTemplates}
          onFormatChange={actions.setFormatTemplate}
          onClearVariableSelection={actions.clearVariableSelection}
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
