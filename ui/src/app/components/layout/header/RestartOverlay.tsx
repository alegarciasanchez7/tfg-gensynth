import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface RestartOverlayProps {
  isVisible: boolean;
}

/**
 * Full-screen overlay shown during system restart.
 * Uses a Portal to ensure it renders above all other content.
 */
export function RestartOverlay({ isVisible }: RestartOverlayProps) {
  if (!isVisible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm px-6">
        <div className="relative">
          <Loader2 size={48} className="text-cyan-400 animate-spin" />
          <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full animate-pulse" />
        </div>
        
        <div className="flex flex-col gap-2">
          <span className="text-xl text-white font-bold tracking-tight" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            System Restarting
          </span>
          <p className="text-sm text-slate-400 leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Applying changes and loading plugins. The UI will reconnect automatically in a few seconds.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Connection Lost
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
