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
import { NamingPatternFields } from '../../../common/NamingPatternFields';

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

  const handleConfirm = () => {
    const num = parseInt(count, 10);
    if (!isNaN(num) && num > 0) {
      onConfirm(num, namingPattern);
      onOpenChange(false);
      setCount('1');
      setNamingPattern('${name} (Clone ${index})');
    }
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

        <div className="py-4">
          <NamingPatternFields
            count={count}
            onCountChange={setCount}
            pattern={namingPattern}
            onPatternChange={setNamingPattern}
            itemName={itemName}
            countLabel="Number of clones"
            itemsNoun="copies"
            onSubmit={handleConfirm}
          />
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
