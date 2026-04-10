import { Header } from './components/Header';
import { ResourceBar } from './components/ResourceBar';
import { LeftPanel } from './components/LeftPanel';
import { Workspace } from './components/Workspace';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { useApp } from './context';
import { defaultTemplates } from './data/mockData';

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
  } = state;

  // Combinar templates por defecto con los del estado
  const mergedTemplates = {
    f1: defaultTemplates.json,
    f2: defaultTemplates.json,
    f3: defaultTemplates.json,
    f4: defaultTemplates.json,
    f5: defaultTemplates.json,
    f6: defaultTemplates.plain,
    f7: defaultTemplates.plain,
    f8: defaultTemplates.json,
    f9: defaultTemplates.plain,
    ...formatTemplates,
  };

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
        projectName={projectName}
        onProjectNameChange={actions.setProjectName}
        isDark={isDark}
        onThemeToggle={actions.toggleTheme}
      />

      {/* ── Resource monitor bar ────────────────────── */}
      <ResourceBar systemStatus={systemStatus} />

      {/* ── Main 3-column layout ────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Groups & Flows */}
        <LeftPanel
          groups={groups}
          selection={selection}
          variables={variables}
          formatTemplate={mergedTemplates}
          connectorCatalog={connectorCatalog}
          latestConnectors={latestConnectors}
          onSelectGroup={actions.selectGroup}
          onSelectFlow={actions.selectFlow}
          onToggleGroup={actions.toggleGroupExpanded}
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
    </div>
  );
}
