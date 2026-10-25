import { useState, useEffect } from 'react';
import { Pause, Play } from 'lucide-react';
import { useApp } from '../../../../context';

interface PreviewViewProps {
  running: boolean;
}

/** A message kept on screen while new ones keep arriving. */
interface CapturedPayload {
  payload: string;
  timestamp: string;
}

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
/** Separator between the flow label and the message in a DATA log. */
const PAYLOAD_SEPARATOR = '==> ';

/** The message part of a DATA log (`[group - flow] ==> message`). */
function payloadOf(logMessage: string): string {
  const at = logMessage.indexOf(PAYLOAD_SEPARATOR);
  return at === -1 ? logMessage : logMessage.slice(at + PAYLOAD_SEPARATOR.length);
}

export function PreviewView({ running }: PreviewViewProps) {
  const { state } = useApp();
  const { groups, logs } = state;
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  // One captured message per flow, so switching flows does not lose it
  const [captures, setCaptures] = useState<Record<string, CapturedPayload>>({});

  const allFlows = groups.flatMap(g => g.flows.map(f => ({ ...f, groupName: g.name })));

  useEffect(() => {
    if (!selectedFlowId && allFlows.length > 0) {
      setSelectedFlowId(allFlows[0].id);
    }
  }, [allFlows, selectedFlowId]);

  const currentFlow = allFlows.find(f => f.id === selectedFlowId);

  // Find the latest 'data' log for this flow: it stays after the simulation stops
  const latestDataLog = logs
    .filter(l => l.source === selectedFlowId && l.level === 'data')
    .slice(-1)[0];
  const latest: CapturedPayload | null = latestDataLog
    ? { payload: payloadOf(latestDataLog.message), timestamp: latestDataLog.timestamp }
    : null;
  const captured = selectedFlowId ? captures[selectedFlowId] ?? null : null;
  const shown = captured ?? latest;

  const capture = () => {
    if (!selectedFlowId || !latest) return;
    setCaptures(prev => ({ ...prev, [selectedFlowId]: latest }));
  };
  const followLive = () => {
    if (!selectedFlowId) return;
    setCaptures(prev => {
      const { [selectedFlowId]: _released, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--c-br2)] shrink-0 overflow-x-auto">
        <span className="text-[10px] text-[var(--c-tx4)] whitespace-nowrap" style={MONO}>
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
              style={MONO}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {running && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-500" style={MONO}>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />{' '}
            live
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Template */}
        <div className="flex-1 border-r border-[var(--c-br2)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--c-bg1)] border-b border-[var(--c-br2)]">
            <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={MONO}>
              Template
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3 bg-[var(--c-bg3)]">
            <pre className="text-[11px] text-violet-600 dark:text-violet-400 leading-relaxed" style={MONO}>
              {currentFlow?.template || '// no template defined'}
            </pre>
          </div>
        </div>

        {/* Right: Last Payload */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--c-bg1)] border-b border-[var(--c-br2)] flex justify-between items-center gap-2">
            <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={MONO}>
              {captured ? 'Captured Payload' : 'Last Payload'}
            </span>
            <div className="flex items-center gap-2">
              {shown && (
                <span className="text-[9px] text-[var(--c-tx5)]" style={MONO}>
                  {shown.timestamp}
                </span>
              )}
              {captured ? (
                <button
                  type="button"
                  onClick={followLive}
                  title="Show the last message again as new ones arrive"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-[9px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  style={MONO}
                >
                  <Play size={9} />
                  Live
                </button>
              ) : (
                <button
                  type="button"
                  onClick={capture}
                  disabled={!latest}
                  title="Keep this message on screen to read it while new ones arrive"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--c-br2)] text-[9px] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg4)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  style={MONO}
                >
                  <Pause size={9} />
                  Capture
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {shown ? (
              <pre
                data-testid="preview-payload"
                className={`text-[11px] leading-relaxed select-text ${captured ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400'}`}
                style={MONO}
              >
                {shown.payload}
              </pre>
            ) : running ? (
              <pre className="text-[11px] text-[var(--c-tx5)] leading-relaxed" style={MONO}>
                // waiting for data...
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-center text-[var(--c-tx5)] text-[11px]" style={MONO}>
                No message from this flow yet. Start the system or its group to see its last message.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
