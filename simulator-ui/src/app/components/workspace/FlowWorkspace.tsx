import { useRef, useState } from 'react';
import {
  Radio, Globe, Wifi, Zap, Cpu, Layers, AlertTriangle,
  CheckCircle, WifiOff, Code2, Settings2, Hash,
  AlignLeft, Copy, RotateCcw,
} from 'lucide-react';
import type { Flow, Group, ConnectionStatus } from '../../types';
import { defaultTemplates } from '../../data/mockData';

const connCfg: Record<ConnectionStatus, { color: string; bg: string; dot: string; label: string }> = {
  connected:    { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/40', dot: 'bg-emerald-400', label: 'CONNECTED' },
  disconnected: { color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-400/30',    dot: 'bg-slate-400',   label: 'DISCONNECTED' },
  error:        { color: 'text-red-500',     bg: 'bg-red-500/10 border-red-500/40',        dot: 'bg-red-400',     label: 'ERROR' },
  warning:      { color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/40',    dot: 'bg-amber-400',   label: 'WARNING' },
};

const techIcon: Record<string, React.ReactNode> = {
  Kafka: <Radio size={12} />, HTTP: <Globe size={12} />, MQTT: <Wifi size={12} />,
  WebSocket: <Zap size={12} />, gRPC: <Cpu size={12} />, TCP: <Layers size={12} />,
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>{label}</label>
      {children}
    </div>
  );
}

function TInput({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={e => { setV(e.target.value); onChange?.(e.target.value); }}
      className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    />
  );
}

function TNumber({ value, unit }: { value: number; unit?: string }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex">
      <input
        type="number"
        value={v}
        onChange={e => setV(Number(e.target.value))}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded-l px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      />
      {unit && (
        <span className="px-2 py-1.5 bg-[var(--c-bg4)] border border-l-0 border-[var(--c-br1)] rounded-r text-[10px] text-[var(--c-tx4)] shrink-0 flex items-center"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {unit}
        </span>
      )}
    </div>
  );
}

function TSelect({ options, value }: { options: string[]; value: string }) {
  const [v, setV] = useState(value);
  return (
    <select
      value={v}
      onChange={e => setV(e.target.value)}
      className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

interface FlowWorkspaceProps {
  flow: Flow;
  group: Group;
  template: string;
  onTemplateChange: (t: string) => void;
}

export function FlowWorkspace({ flow, group, template, onTemplateChange }: FlowWorkspaceProps) {
  const conn = connCfg[flow.connectionStatus];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [formatMode, setFormatMode] = useState<'json' | 'xml' | 'csv' | 'plain'>('json');
  const [activeTab, setActiveTab] = useState<'technical' | 'format'>('technical');

  const currentTemplate = template || defaultTemplates[formatMode];

  const handleFormatModeChange = (mode: 'json' | 'xml' | 'csv' | 'plain') => {
    setFormatMode(mode);
    onTemplateChange(defaultTemplates[mode]);
  };

  // Exposed globally for variable insertion
  (window as unknown as Record<string, unknown>).__insertIntoFlow = (varRef: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = currentTemplate.slice(0, start) + varRef + currentTemplate.slice(end);
    onTemplateChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + varRef.length, start + varRef.length);
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Flow header */}
      <div className="px-4 py-3 border-b border-[var(--c-br2)] flex items-center gap-3 shrink-0 bg-[var(--c-bg2)]">
        <div className="flex items-center gap-2">
          <span className="text-cyan-500">{techIcon[flow.technology] ?? <Layers size={12} />}</span>
          <span className="text-sm text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {flow.name}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] ${conn.bg} ${conn.color}`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <span className={`w-1.5 h-1.5 rounded-full ${conn.dot} ${flow.connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
          {conn.label}
        </div>
        <span className={`text-xs ${conn.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {flow.throughput}
        </span>
        {flow.hasError && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-[10px] text-red-500"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <AlertTriangle size={10} /> {flow.errorMessage}
          </div>
        )}
        {!flow.hasError && flow.connectionStatus === 'connected' && (
          <CheckCircle size={12} className="text-emerald-500 ml-auto" />
        )}
      </div>

      {/* Mobile tab switcher */}
      <div className="flex border-b border-[var(--c-br2)] shrink-0 md:hidden">
        {(['technical', 'format'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-[10px] tracking-widest uppercase border-b-2 transition-all ${
              activeTab === tab
                ? 'text-cyan-500 border-cyan-500 bg-[var(--c-bg4)]'
                : 'text-[var(--c-tx4)] border-transparent hover:text-[var(--c-tx2)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {tab === 'technical' ? 'Technical Config' : 'Message Format'}
          </button>
        ))}
      </div>

      {/* Main content: two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Technical config */}
        <div className={`flex flex-col border-r border-[var(--c-br1)] overflow-y-auto ${activeTab === 'format' ? 'hidden md:flex' : 'flex'}`}
          style={{ width: '46%', minWidth: 280 }}>
          <div className="px-4 py-3 border-b border-[var(--c-br2)] shrink-0">
            <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <Settings2 size={10} /> Technical Configuration · {flow.technology}
            </span>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Connection */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>CONNECTION</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Host / Broker"><TInput value={flow.host} /></FieldRow>
                <FieldRow label="Port"><TNumber value={flow.port} /></FieldRow>
              </div>
              <FieldRow label="Topic / Endpoint"><TInput value={flow.topic} /></FieldRow>
              {(flow.technology === 'Kafka') && (
                <>
                  <FieldRow label="Ack Mode"><TSelect options={['all', 'leader', 'none']} value="all" /></FieldRow>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldRow label="Compression"><TSelect options={['none', 'gzip', 'snappy', 'lz4']} value="none" /></FieldRow>
                    <FieldRow label="Batch Size"><TNumber value={1000} unit="records" /></FieldRow>
                  </div>
                </>
              )}
              {(flow.technology === 'HTTP') && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldRow label="Method"><TSelect options={['POST', 'PUT', 'PATCH']} value="POST" /></FieldRow>
                    <FieldRow label="Auth"><TSelect options={['none', 'bearer', 'basic', 'apikey']} value="none" /></FieldRow>
                  </div>
                </>
              )}
              {(flow.technology === 'MQTT') && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldRow label="QoS"><TSelect options={['0 — at most once', '1 — at least once', '2 — exactly once']} value="1 — at least once" /></FieldRow>
                    <FieldRow label="Retain"><TSelect options={['false', 'true']} value="false" /></FieldRow>
                  </div>
                </>
              )}
              {(flow.technology === 'TCP') && (
                <>
                  <FieldRow label="Delimiter"><TSelect options={['\\n', '\\r\\n', 'null byte', 'none']} value="\\n" /></FieldRow>
                </>
              )}
            </div>

            {/* Generation */}
            <div className="h-px bg-[var(--c-br2)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>GENERATION</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Interval"><TNumber value={flow.interval} unit="ms" /></FieldRow>
                <FieldRow label="Burst"><TNumber value={flow.burst} unit="msg" /></FieldRow>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Pattern"><TSelect options={['random', 'sequential', 'gaussian', 'spike']} value="random" /></FieldRow>
                <FieldRow label="Jitter"><TNumber value={0} unit="ms" /></FieldRow>
              </div>
              <FieldRow label="Rate Limit"><TNumber value={0} unit="msg/s (0=unlimited)" /></FieldRow>
            </div>

            {/* Error handling */}
            <div className="h-px bg-[var(--c-br2)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>ERROR HANDLING</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="On Error"><TSelect options={['retry', 'skip', 'stop', 'log']} value="retry" /></FieldRow>
                <FieldRow label="Max Retries"><TNumber value={3} /></FieldRow>
              </div>
              <FieldRow label="Retry Backoff"><TSelect options={['linear', 'exponential', 'fixed']} value="exponential" /></FieldRow>
            </div>
          </div>
        </div>

        {/* RIGHT: Format editor */}
        <div className={`flex flex-col overflow-hidden ${activeTab === 'technical' ? 'hidden md:flex' : 'flex'} flex-1`}>
          <div className="px-4 py-2.5 border-b border-[var(--c-br2)] flex items-center gap-3 shrink-0">
            <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <Code2 size={10} /> Message Format
            </span>
            <div className="flex items-center gap-1 ml-auto">
              {(['json', 'xml', 'csv', 'plain'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleFormatModeChange(mode)}
                  className={`px-2 py-0.5 rounded text-[10px] tracking-wider transition-all ${
                    formatMode === mode
                      ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-500'
                      : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)] border border-transparent'
                  }`}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button className="p-1.5 rounded border border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all">
                <Copy size={10} />
              </button>
              <button
                onClick={() => onTemplateChange(defaultTemplates[formatMode])}
                className="p-1.5 rounded border border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all"
              >
                <RotateCcw size={10} />
              </button>
            </div>
          </div>

          {/* Variable hint bar */}
          <div className="px-3 py-1.5 bg-[var(--c-bg1)] border-b border-[var(--c-br2)] flex items-center gap-2 shrink-0">
            <Hash size={9} className="text-cyan-500" />
            <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Variables: use{' '}
              <code className="text-cyan-500">{'{{scope.name}}'}</code>
              {' · click '}
              <span className="text-cyan-500">→</span>
              {' on any variable to insert'}
            </span>
            <AlignLeft size={9} className="text-[var(--c-tx4)] ml-auto" />
          </div>

          {/* Textarea */}
          <div className="flex-1 overflow-hidden relative">
            <textarea
              ref={textareaRef}
              value={currentTemplate}
              onChange={e => onTemplateChange(e.target.value)}
              spellCheck={false}
              className="absolute inset-0 w-full h-full bg-[var(--c-bg1)] text-[var(--c-tx2)] text-[11px] p-3 outline-none resize-none border-0 leading-relaxed"
              style={{ fontFamily: 'JetBrains Mono, monospace', tabSize: 2 }}
            />
          </div>

          {/* Preview label */}
          <div className="px-3 py-1.5 border-t border-[var(--c-br2)] bg-[var(--c-bg2)] flex items-center gap-2 shrink-0">
            <span className="text-[9px] text-[var(--c-tx5)] tracking-widest" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              LIVE PREVIEW ↓ see bottom panel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
