import { Layers, MousePointer2 } from 'lucide-react';

export function EmptyWorkspace() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--c-tx5)]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 border-2 border-dashed border-[var(--c-br1)] rounded-xl flex items-center justify-center">
          <Layers size={24} className="text-[var(--c-tx5)]" />
        </div>
        <div className="text-center">
          <p className="text-sm text-[var(--c-tx5)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            No selection
          </p>
          <p className="text-xs text-[var(--c-tx6)] mt-1 flex items-center gap-1.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <MousePointer2 size={10} /> Select a group or flow from the left panel
          </p>
        </div>
      </div>
      <div className="flex gap-3 mt-2">
        {['group config', 'flow editor', 'variable editor'].map(hint => (
          <div
            key={hint}
            className="px-3 py-1.5 border border-dashed border-[var(--c-br2)] rounded text-[10px] text-[var(--c-tx6)]"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {hint}
          </div>
        ))}
      </div>
    </div>
  );
}
