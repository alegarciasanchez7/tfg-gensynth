import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import type { Variable } from '../../types';

interface DeleteVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variable: Variable | null;
  onDelete: () => void;
}

export function DeleteVariableDialog({
  open,
  onOpenChange,
  variable,
  onDelete,
}: DeleteVariableDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Delete variable
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--c-tx4)]">
            {variable ? `Delete "${variable.name}"? This action cannot be undone.` : 'Delete this variable? This action cannot be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
