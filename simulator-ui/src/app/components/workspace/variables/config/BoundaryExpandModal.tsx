import React from 'react';
import { Button } from '../../../ui/button';
import { X, Maximize2, Minimize2 } from 'lucide-react';

interface BoundaryExpandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BoundaryExpandModal: React.FC<BoundaryExpandModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--c-br1)] bg-[var(--c-bg4)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--c-tx1)]">
            <Maximize2 size={16} className="text-violet-400" />
            <span>{title} — High-Precision Visual Boundary Editor</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--c-tx4)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {children}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--c-br1)] bg-[var(--c-bg4)] flex justify-between items-center text-xs text-[var(--c-tx4)]">
          <span>Tip: Right-click edges to insert points. Right-click vertices to delete points (Min 3 required).</span>
          <Button size="sm" onClick={onClose} className="bg-violet-600 hover:bg-violet-500 text-white font-medium">
            Done & Apply
          </Button>
        </div>
      </div>
    </div>
  );
};
