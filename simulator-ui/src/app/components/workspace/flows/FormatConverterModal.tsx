import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, ArrowRightLeft, Info, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { isTemplateInFormat, resolveTemplateFormat, type TemplateFormat } from './templateFormat';
import { convertTemplate } from './templateConversion';

export interface FormatConverterModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentContent: string;
  currentFormat: TemplateFormat;
  initialTargetFormat?: TemplateFormat;
  onApplyConversion: (convertedContent: string, newFormat: TemplateFormat) => void;
}

/** What applying the selected target format does to the template. */
type ConversionKind = 'convert' | 'label-only' | 'unchanged';

/**
 * Why a label-only change does not apply: the editor label follows the content (see
 * resolveTemplateFormat), so JSON or XML content keeps its label whatever is stored.
 */
function labelLockedReason(source: TemplateFormat, target: TemplateFormat): string {
  const src = source.toUpperCase();
  return `${src} content always keeps the ${src} label. ${target.toUpperCase()} would send the template exactly as it is now, so there is nothing to convert.`;
}

interface ConversionPreview {
  convertedPreview: string;
  kind: ConversionKind;
  /** Why the conversion cannot be applied, or null when it can. */
  blockedReason: string | null;
}

/**
 * Works out what applying the target format does: nothing (same format), only the label (the
 * content already is valid in the target), or a conversion. A conversion that would lose content
 * or produce invalid text, or a label that the content would override, is blocked with a reason.
 */
function previewConversion(content: string, source: TemplateFormat, target: TemplateFormat): ConversionPreview {
  if (source === target) return { convertedPreview: content, kind: 'unchanged', blockedReason: null };
  if (isTemplateInFormat(content, target)) {
    const labelApplies = resolveTemplateFormat(target, content) === target;
    return {
      convertedPreview: content,
      kind: 'label-only',
      blockedReason: labelApplies ? null : labelLockedReason(source, target),
    };
  }
  const result = convertTemplate(content, source, target);
  if (!result.ok) return { convertedPreview: '', kind: 'convert', blockedReason: result.reason };
  // The label follows the content: a result the editor would not label as the target is useless
  const labelApplies = resolveTemplateFormat(target, result.content) === target;
  return {
    convertedPreview: result.content,
    kind: 'convert',
    blockedReason: labelApplies ? null : `The result would not be recognised as ${target.toUpperCase()}.`,
  };
}

export function FormatConverterModal({
  isOpen,
  onOpenChange,
  currentContent,
  currentFormat,
  initialTargetFormat,
  onApplyConversion,
}: FormatConverterModalProps) {
  const sourceFormat = currentFormat || 'json';
  const [targetFormat, setTargetFormat] = useState<TemplateFormat>(
    initialTargetFormat || (sourceFormat === 'xml' ? 'json' : 'xml')
  );

  useEffect(() => {
    if (isOpen) {
      setTargetFormat(
        initialTargetFormat || (sourceFormat === 'xml' ? 'json' : 'xml')
      );
    }
  }, [isOpen, sourceFormat, initialTargetFormat]);

  const { convertedPreview, kind, blockedReason } = useMemo(
    () => previewConversion(currentContent, sourceFormat, targetFormat),
    [currentContent, sourceFormat, targetFormat],
  );
  const blocked = blockedReason !== null;

  const handleApply = () => {
    if (blocked) return;
    onApplyConversion(convertedPreview, targetFormat);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[var(--c-bg2)] border-[var(--c-br1)]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
              <ArrowRightLeft size={18} />
            </div>
            <DialogTitle className="text-[var(--c-tx1)]">Convert Message Format</DialogTitle>
          </div>
          <DialogDescription className="text-[var(--c-tx3)]">
            Transform message payload structure between standard formats (JSON, XML, CSV).
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* Format Selectors */}
          <div className="flex items-center justify-between gap-4 p-3 bg-[var(--c-bg1)] rounded-lg border border-[var(--c-br1)]">
            <div className="space-y-1 flex-1">
              <span className="text-[10px] text-[var(--c-tx4)] font-mono uppercase tracking-wider">Source Format</span>
              <div className="flex items-center h-9 px-3 bg-[var(--c-bg2)]/80 border border-[var(--c-br1)] rounded text-xs font-mono text-[var(--c-tx2)] select-none">
                <span className="font-bold text-cyan-400">{sourceFormat.toUpperCase()}</span>
                <span className="ml-auto text-[9px] text-[var(--c-tx4)] uppercase tracking-wider">(Current)</span>
              </div>
            </div>

            <div className="flex items-center justify-center pt-4 text-violet-400">
              <ArrowRightLeft size={20} />
            </div>

            <div className="space-y-1 flex-1">
              <label htmlFor="format-converter-target" className="text-[10px] text-[var(--c-tx4)] font-mono uppercase tracking-wider">Target Format</label>
              <Select value={targetFormat} onValueChange={(val) => setTargetFormat(val as TemplateFormat)}>
                <SelectTrigger id="format-converter-target" className="bg-[var(--c-bg2)] border-[var(--c-br1)] text-xs font-mono">
                  <SelectValue placeholder="Target Format" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)] text-xs">
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="plain">PLAIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Side by side Preview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[10px] text-[var(--c-tx3)] font-mono uppercase tracking-wider">Current Template ({sourceFormat.toUpperCase()})</span>
              <pre className="h-48 p-2.5 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded font-mono text-xs text-[var(--c-tx2)] overflow-auto whitespace-pre-wrap break-all">
                {currentContent || '(Empty)'}
              </pre>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> Converted Preview ({targetFormat.toUpperCase()})
              </span>
              <pre className="h-48 p-2.5 bg-[var(--c-bg1)] border border-emerald-500/30 rounded font-mono text-xs text-emerald-600 dark:text-emerald-300 overflow-auto whitespace-pre-wrap break-all">
                {blocked ? '(Not converted)' : convertedPreview || '(Empty)'}
              </pre>
            </div>
          </div>

          {blocked && (
            <p role="alert" className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {blockedReason}
            </p>
          )}
          {!blocked && kind === 'label-only' && (
            <p role="status" className="flex items-start gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-500">
              <Info size={12} className="shrink-0 mt-0.5" />
              The template is already valid {targetFormat.toUpperCase()}: applying only changes the format label, the text stays the same.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[var(--c-tx3)]">
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={blocked}
            className="bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
          >
            {kind === 'label-only' && !blocked ? `Set format to ${targetFormat.toUpperCase()}` : 'Apply to Flow Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
