import React, { useState, createContext, useContext } from 'react';
import { Button } from '../../../ui/button';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../ui/tooltip';

export interface BoundaryModalContextType {
  isFullScreen: boolean;
  setIsFullScreen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleFullScreen: () => void;
}

export const BoundaryModalContext = createContext<BoundaryModalContextType>({
  isFullScreen: false,
  setIsFullScreen: () => {},
  toggleFullScreen: () => {},
});

export const useBoundaryModalContext = () => useContext(BoundaryModalContext);

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
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (!isOpen) return null;

  const toggleFullScreen = () => setIsFullScreen((prev) => !prev);

  return (
    <BoundaryModalContext.Provider value={{ isFullScreen, setIsFullScreen, toggleFullScreen }}>
      <div className={`fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md transition-all duration-200 ${isFullScreen ? 'p-0' : 'p-3 sm:p-4'}`}>
        <div className={`relative bg-[var(--c-bg2)] border-[var(--c-br1)] shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullScreen
            ? 'w-screen h-screen max-w-none max-h-none rounded-none border-0'
            : 'w-full max-w-5xl max-h-[92vh] border rounded-xl'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--c-br1)] bg-[var(--c-bg4)] shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--c-tx1)]">
              <Maximize2 size={16} className="text-violet-400" />
              <span>{title} — High-Precision Visual Boundary Editor</span>
              {isFullScreen && (
                <span className="ml-2 px-2 py-0.5 text-[10px] font-mono uppercase bg-cyan-950 text-cyan-300 border border-cyan-500/40 rounded">
                  Full Screen Window Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleFullScreen}
                    className="p-1.5 rounded text-[var(--c-tx4)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    aria-label={isFullScreen ? 'Restore Standard Window' : 'Expand to Full Screen Window'}
                  >
                    {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] px-2.5 py-1">
                  {isFullScreen ? 'Restore standard windowed editor' : 'Expand editor to full application window'}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded text-[var(--c-tx4)] hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                    aria-label="Close Editor Modal"
                  >
                    <X size={18} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] px-2.5 py-1">
                  Close Editor Modal
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Modal Content */}
          <div className={`flex-1 min-h-0 ${isFullScreen ? 'p-3 flex flex-col overflow-hidden' : 'p-6 overflow-y-auto space-y-4'}`}>
            {children}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[var(--c-br1)] bg-[var(--c-bg4)] flex justify-between items-center text-xs text-[var(--c-tx4)] shrink-0">
            <span>Tip: Right-click edges to insert points. Right-click vertices to delete points (Min 3 required).</span>
            <Button size="sm" onClick={onClose} className="bg-violet-600 hover:bg-violet-500 text-white font-medium cursor-pointer">
              Done & Apply
            </Button>
          </div>
        </div>
      </div>
    </BoundaryModalContext.Provider>
  );
};
