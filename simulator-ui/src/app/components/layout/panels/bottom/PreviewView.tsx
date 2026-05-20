import { useState, useEffect } from 'react';
import { useApp } from '../../../../context';

interface PreviewViewProps {
  running: boolean;
}

export function PreviewView({ running }: PreviewViewProps) {
  const { state } = useApp();
  const { groups, logs } = state;
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  const allFlows = groups.flatMap(g => g.flows.map(f => ({ ...f, groupName: g.name })));
  
  useEffect(() => {
    if (!selectedFlowId && allFlows.length > 0) {
      setSelectedFlowId(allFlows[0].id);
    }
  }, [allFlows, selectedFlowId]);

  const currentFlow = allFlows.find(f => f.id === selectedFlowId);
  
  // Find the latest 'data' log for this flow
  const latestDataLog = logs
    .filter(l => l.source === selectedFlowId && l.level === 'data')
    .slice(-1)[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--c-br2)] shrink-0 overflow-x-auto">
        <span className="text-[10px] text-[var(--c-tx4)] whitespace-nowrap" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Flow:
        </span>
        <div className="flex gap-1">
          {allFlows.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFlowId(f.id)}
              className={`px-2 py-0.5 rounded text-[10px] transition-all whitespace-nowrap ${
                selectedFlowId === f.id
                  ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-500'
                  : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'
              }`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {running && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            live
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Template */}
        <div className="flex-1 border-r border-[var(--c-br2)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--c-bg1)] border-b border-[var(--c-br2)]">
            <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Template
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3 bg-[var(--c-bg3)]">
            <pre className="text-[11px] text-violet-400 leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {currentFlow?.template || '// no template defined'}
            </pre>
          </div>
        </div>

        {/* Right: Last Payload */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--c-bg1)] border-b border-[var(--c-br2)] flex justify-between items-center">
            <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Last Payload
            </span>
            {latestDataLog && (
              <span className="text-[9px] text-[var(--c-tx5)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {latestDataLog.timestamp}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {running ? (
              <pre className="text-[11px] text-emerald-400 leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {latestDataLog ? latestDataLog.message.split('==> ')[1] || latestDataLog.message : '// waiting for data...'}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--c-tx5)] text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Start the system to see live preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
