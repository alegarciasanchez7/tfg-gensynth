import { useState } from 'react';
import { Copy } from 'lucide-react';
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

interface CloneDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (count: number) => void;
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

  const handleConfirm = () => {
    const num = parseInt(count, 10);
    if (!isNaN(num) && num > 0) {
      onConfirm(num);
      onOpenChange(false);
      setCount('1');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
              <Copy size={18} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>
            Enter the number of copies you want to create for <span className="font-semibold text-[var(--c-tx1)]">{itemName}</span>.
            Each copy will have its own flows and associated variables.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
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
              className="bg-[var(--c-bg1)] border-[var(--c-br1)]"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
            <p className="text-[10px] text-[var(--c-tx4)]">
              It is recommended not to create more than 50 clones at once to maintain stability.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleConfirm}
            disabled={!count || parseInt(count, 10) <= 0}
          >
            Clone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
