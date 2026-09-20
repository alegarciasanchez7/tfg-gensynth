import { useState, useMemo, useEffect } from 'react';
import { ArrowRightLeft, RefreshCw } from 'lucide-react';
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

export interface FormatConverterModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentContent: string;
  currentFormat: 'json' | 'xml' | 'csv' | 'plain';
  initialTargetFormat?: 'json' | 'xml' | 'csv' | 'plain';
  onApplyConversion: (convertedContent: string, newFormat: 'json' | 'xml' | 'csv' | 'plain') => void;
}

/**
 * Client-side conversion fallback utility for instant preview in UI.
 */
export function convertFormatClientSide(content: string, src: string, tgt: string): string {
  if (!content || !content.trim()) return content || '';
  const s = src.toLowerCase();
  const t = tgt.toLowerCase();
  if (s === t) return content;

  try {
    let parsed: any;

    if (s === 'json') {
      parsed = JSON.parse(content);
    } else if (s === 'csv') {
      const lines = content.trim().split('\n');
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim());
        parsed = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim());
          const obj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            const v = vals[idx] !== undefined ? vals[idx] : '';
            if (v.toLowerCase() === 'true' || v.toLowerCase() === 'false') {
              obj[h] = v.toLowerCase() === 'true';
            } else if (!isNaN(Number(v)) && v !== '') {
              obj[h] = Number(v);
            } else {
              obj[h] = v;
            }
          });
          return obj;
        });
        if (parsed.length === 1) parsed = parsed[0];
      }
    } else {
      // Basic text / XML fallback parsing
      parsed = { message: content.trim() };
    }

    if (t === 'json') {
      return JSON.stringify(parsed, null, 2);
    }

    if (t === 'xml') {
      const toXmlNode = (key: string, val: any, indent = '  '): string => {
        if (val === null || val === undefined) return `${indent}<${key}/>\n`;
        if (typeof val === 'object' && !Array.isArray(val)) {
          let inner = ``;
          Object.keys(val).forEach(k => {
            inner += toXmlNode(k, val[k], indent + '  ');
          });
          return `${indent}<${key}>\n${inner}${indent}</${key}>\n`;
        }
        if (Array.isArray(val)) {
          let inner = ``;
          val.forEach(item => {
            inner += toXmlNode('item', item, indent + '  ');
          });
          return `${indent}<${key}>\n${inner}${indent}</${key}>\n`;
        }
        return `${indent}<${key}>${val}</${key}>\n`;
      };

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n`;
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach(k => {
          xml += toXmlNode(k, parsed[k]);
        });
      } else if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          xml += toXmlNode('item', item);
        });
      } else {
        xml += `  <value>${parsed}</value>\n`;
      }
      xml += `</root>`;
      return xml;
    }

    if (t === 'csv') {
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      if (rows.length === 0 || typeof rows[0] !== 'object') {
        return `value\n${content}`;
      }
      const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
      let csv = headers.join(',') + '\n';
      rows.forEach(r => {
        const line = headers.map(h => {
          const v = r[h] !== undefined ? r[h] : '';
          return typeof v === 'object' ? JSON.stringify(v) : String(v);
        }).join(',');
        csv += line + '\n';
      });
      return csv.trim();
    }

    return String(content);
  } catch (err) {
    return content;
  }
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
  const [targetFormat, setTargetFormat] = useState<'json' | 'xml' | 'csv' | 'plain'>(
    initialTargetFormat || (sourceFormat === 'xml' ? 'json' : 'xml')
  );

  useEffect(() => {
    if (isOpen) {
      setTargetFormat(
        initialTargetFormat || (sourceFormat === 'xml' ? 'json' : 'xml')
      );
    }
  }, [isOpen, sourceFormat, initialTargetFormat]);

  const convertedPreview = useMemo(() => {
    return convertFormatClientSide(currentContent, sourceFormat, targetFormat);
  }, [currentContent, sourceFormat, targetFormat]);

  const handleApply = () => {
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
              <label className="text-[10px] text-[var(--c-tx4)] font-mono uppercase tracking-wider">Source Format</label>
              <div className="flex items-center h-9 px-3 bg-[var(--c-bg2)]/80 border border-[var(--c-br1)] rounded text-xs font-mono text-[var(--c-tx2)] select-none">
                <span className="font-bold text-cyan-400">{sourceFormat.toUpperCase()}</span>
                <span className="ml-auto text-[9px] text-[var(--c-tx4)] uppercase tracking-wider">(Current)</span>
              </div>
            </div>

            <div className="flex items-center justify-center pt-4 text-violet-400">
              <ArrowRightLeft size={20} />
            </div>

            <div className="space-y-1 flex-1">
              <label className="text-[10px] text-[var(--c-tx4)] font-mono uppercase tracking-wider">Target Format</label>
              <Select value={targetFormat} onValueChange={(val: any) => setTargetFormat(val)}>
                <SelectTrigger className="bg-[var(--c-bg2)] border-[var(--c-br1)] text-xs font-mono">
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
              <pre className="h-48 p-2.5 bg-[var(--c-bg1)] border border-emerald-500/30 rounded font-mono text-xs text-emerald-300 overflow-auto whitespace-pre-wrap break-all">
                {convertedPreview || '(Empty)'}
              </pre>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[var(--c-tx3)]">
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            className="bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
          >
            Apply to Flow Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
