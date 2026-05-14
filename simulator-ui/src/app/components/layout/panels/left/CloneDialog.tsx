import { useState, useMemo } from 'react';
import { Copy, Info } from 'lucide-react';
import { Button } from '../../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Badge } from '../../../ui/badge';

interface CloneDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (count: number, namingPattern: string) => void;
  title: string;
  itemName: string;
}

export function CloneDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  title,
  itemName,
}: CloneDialogProps) {
  const [count, setCount] = useState('1');
  const [namingPattern, setNamingPattern] = useState('${name} (Clone ${index})');

  const previews = useMemo(() => {
    const num = parseInt(count, 10);
    if (isNaN(num) || num <= 0) return [];
    
    return Array.from({ length: Math.min(num, 3) }, (_, i) => {
      return namingPattern
        .replace('${name}', itemName)
        .replace('${index}', (i + 1).toString());
    });
  }, [count, namingPattern, itemName]);

  const handleConfirm = () => {
    const num = parseInt(count, 10);
    if (!isNaN(num) && num > 0) {
      onConfirm(num, namingPattern);
      onOpenChange(false);
      setCount('1');
      setNamingPattern('${name} (Clone ${index})');
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    setNamingPattern(prev => prev + placeholder);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[var(--c-bg2)] border-[var(--c-br1)]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
              <Copy size={18} />
            </div>
            <DialogTitle className="text-[var(--c-tx1)]">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-[var(--c-tx3)]">
            Configure how you want to clone <span className="font-semibold text-[var(--c-tx1)]">{itemName}</span>.
            You can customize the naming pattern using placeholders.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Number of clones */}
          <div className="space-y-2">
            <label className="text-xs text-[var(--c-tx3)] font-mono uppercase tracking-wider">
              Number of clones
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] focus:ring-violet-500"
              autoFocus
            />
            <p className="text-[10px] text-[var(--c-tx4)] flex items-center gap-1">
              <Info size={10} /> Max recommended: 50 clones to ensure system stability.
            </p>
          </div>

          {/* Naming Pattern */}
          <div className="space-y-2">
            <label className="text-xs text-[var(--c-tx3)] font-mono uppercase tracking-wider">
              Naming Pattern
            </label>
            <Input
              value={namingPattern}
              onChange={(e) => setNamingPattern(e.target.value)}
              placeholder="${name} (Clone ${index})"
              className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] font-mono text-sm focus:ring-violet-500"
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
            <div className="flex gap-2 pt-1">
              <Badge 
                variant="outline" 
                className="cursor-pointer hover:bg-violet-500/10 border-dashed border-violet-500/30 text-violet-400 text-[10px]"
                onClick={() => insertPlaceholder('${name}')}
              >
                + {'${name}'}
              </Badge>
              <Badge 
                variant="outline" 
                className="cursor-pointer hover:bg-violet-500/10 border-dashed border-violet-500/30 text-violet-400 text-[10px]"
                onClick={() => insertPlaceholder('${index}')}
              >
                + {'${index}'}
              </Badge>
            </div>
          </div>

          {/* Live Preview */}
          {previews.length > 0 && (
            <div className="p-3 bg-[var(--c-bg1)] rounded-lg border border-[var(--c-br1)] space-y-1.5">
              <span className="text-[10px] text-[var(--c-tx4)] font-mono uppercase tracking-widest">Live Preview</span>
              <div className="space-y-1">
                {previews.map((name, i) => (
                  <div key={i} className="text-xs text-[var(--c-tx2)] font-mono flex items-center gap-2">
                    <span className="w-4 h-4 flex items-center justify-center bg-violet-500/10 text-violet-500 rounded text-[9px]">{i + 1}</span>
                    {name}
                  </div>
                ))}
                {parseInt(count, 10) > 3 && (
                  <div className="text-[10px] text-[var(--c-tx4)] italic pl-6">
                    ... and {parseInt(count, 10) - 3} more copies
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[var(--c-tx3)] hover:text-[var(--c-tx1)]">
            Cancel
          </Button>
          <Button 
            className="bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
            onClick={handleConfirm}
            disabled={!count || parseInt(count, 10) <= 0 || !namingPattern.trim()}
          >
            Create {count} Clones
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
