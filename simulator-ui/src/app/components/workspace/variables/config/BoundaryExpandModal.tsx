import React, { useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../ui/tooltip';

export interface BoundaryModalContextType {
  /** True inside the fullscreen editor: the boundary editors switch to their fill layout. */
  isFullScreen: boolean;
}

export const BoundaryModalContext = createContext<BoundaryModalContextType>({ isFullScreen: false });

export const useBoundaryModalContext = () => useContext(BoundaryModalContext);

const FULLSCREEN_CONTEXT: BoundaryModalContextType = { isFullScreen: true };

interface BoundaryExpandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/** Fullscreen boundary editor, closed with Exit Fullscreen, Done or Escape. */
export const BoundaryExpandModal: React.FC<BoundaryExpandModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  // Escape closes the editor, unless a confirmation dialog inside it is open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="alertdialog"]')) return;
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const editor = (
    <BoundaryModalContext.Provider value={FULLSCREEN_CONTEXT}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[99999] bg-[var(--c-bg2)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--c-br1)] bg-[var(--c-bg4)] shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--c-tx1)] min-w-0">
            <Maximize2 size={16} className="text-violet-400 shrink-0" />
            <span className="truncate">{title} — Fullscreen Boundary Editor</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-xs gap-1" onClick={onClose}>
                  <Minimize2 size={12} />
                  <span>Exit Fullscreen</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">
              Exit fullscreen editor view (Esc)
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 p-3 flex flex-col overflow-auto">
          {children}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--c-br1)] bg-[var(--c-bg4)] flex justify-between items-center gap-3 text-xs text-[var(--c-tx4)] shrink-0">
          <span>Tip: Right-click edges to insert points. Right-click vertices to delete points (Min 3 required).</span>
          <Button size="sm" onClick={onClose} className="bg-violet-600 hover:bg-violet-500 text-white font-medium cursor-pointer">
            Done
          </Button>
        </div>
      </div>
    </BoundaryModalContext.Provider>
  );

  // Rendered in <body>: inside the panel it would stay in the stacking context of its ancestors
  // and the app bars and side panels would cover it
  return createPortal(editor, document.body);
};
