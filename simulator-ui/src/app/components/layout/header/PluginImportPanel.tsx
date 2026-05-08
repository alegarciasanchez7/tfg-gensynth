import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Check, AlertTriangle, Loader2, FileArchive, ArrowRight, ShieldCheck } from 'lucide-react';
import { CoreCommands } from '../../../core/bridge';
import type { PluginValidationResultPayload } from '../../../core/types';

type ValidationState = 'idle' | 'validating' | 'success' | 'error';

interface PluginImportPanelProps {
  onClose: () => void;
}

export function PluginImportPanel({ onClose }: PluginImportPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pluginName, setPluginName] = useState('');
  const [pluginVersion, setPluginVersion] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [jarBase64, setJarBase64] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [validationResult, setValidationResult] = useState<PluginValidationResultPayload | null>(null);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !showRestartConfirm) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, showRestartConfirm]);

  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    if (!file.name.endsWith('.jar')) {
      setValidationState('error');
      setValidationResult({
        status: 'error',
        valid: false,
        errors: ['Only .jar files are accepted.'],
        warnings: [],
      });
      return;
    }

    setFileName(file.name);
    setValidationState('validating');
    setValidationResult(null);

    try {
      const base64 = await readFileAsBase64(file);
      setJarBase64(base64);

      const name = pluginName.trim() || file.name.replace('.jar', '');
      const version = pluginVersion.trim() || '1.0.0';

      console.log('[PluginImportPanel] Validation request sent for:', name);
      const response = await CoreCommands.validatePlugin(base64, name, version);
      console.log('[PluginImportPanel] Received validation response:', response);

      setValidationResult(response);
      
      // Be more robust with boolean check
      const isValid = response.valid === true || (response.valid as unknown) === 'true';
      setValidationState(isValid ? 'success' : 'error');

      if (response.displayName && !pluginName.trim()) {
        setPluginName(response.displayName);
      }
      if (response.pluginVersion && !pluginVersion.trim()) {
        setPluginVersion(response.pluginVersion);
      }
    } catch (err) {
      setValidationState('error');
      setValidationResult({
        status: 'error',
        valid: false,
        errors: ['Validation request failed. Is the backend running?'],
        warnings: [],
      });
    }
  }, [pluginName, pluginVersion, readFileAsBase64]);

  const handleInstall = useCallback(async () => {
    if (!jarBase64 || !validationResult?.valid) return;

    setIsInstalling(true);
    try {
      const name = pluginName.trim() || validationResult.displayName || 'unknown';
      const version = pluginVersion.trim() || validationResult.pluginVersion || '1.0.0';

      await CoreCommands.installPlugin(jarBase64, name, version);
    } catch (err) {
      setIsInstalling(false);
      setShowRestartConfirm(false);
    }
  }, [jarBase64, pluginName, pluginVersion, validationResult]);

  return (
    <div
        ref={ref}
        className="absolute left-0 top-full mt-2 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded-lg shadow-2xl shadow-black/40 py-4 px-5 animate-in fade-in slide-in-from-top-2 duration-200"
        style={{ fontFamily: 'JetBrains Mono, monospace', width: 380 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase font-bold">Import Plugin</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--c-bg5)] rounded transition-colors text-[var(--c-tx4)] hover:text-[var(--c-tx2)]">
            <X size={14} />
          </button>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="col-span-2">
            <label className="text-[9px] text-[var(--c-tx4)] uppercase tracking-wider block mb-1 font-semibold">Plugin Name</label>
            <input
              type="text"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              placeholder="Display name"
              className="w-full px-2.5 py-1.5 text-[11px] bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-[var(--c-tx2)] placeholder:text-[var(--c-tx5)] focus:outline-none focus:border-cyan-500/50 transition-all"
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--c-tx4)] uppercase tracking-wider block mb-1 font-semibold">Version</label>
            <input
              type="text"
              value={pluginVersion}
              onChange={(e) => setPluginVersion(e.target.value)}
              placeholder="1.0.0"
              className="w-full px-2.5 py-1.5 text-[11px] bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-[var(--c-tx2)] placeholder:text-[var(--c-tx5)] focus:outline-none focus:border-cyan-500/50 transition-all"
            />
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-cyan-400 bg-cyan-400/5 scale-[1.02]'
              : validationState === 'validating'
                ? 'border-amber-400/50 bg-amber-400/5'
                : validationState === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : fileName
                    ? 'border-[var(--c-br2)] bg-[var(--c-bg1)]'
                    : 'border-[var(--c-br1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
          }`}
          onDragOver={validationState !== 'validating' ? (e) => { e.preventDefault(); setIsDragging(true); } : undefined}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) handleFileSelected(e.dataTransfer.files[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jar"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
          />
          
          {validationState === 'validating' ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 size={24} className="text-amber-400 animate-spin" />
              <span className="text-[11px] text-amber-300 font-medium animate-pulse">Verifying bytecode integrity...</span>
            </div>
          ) : validationState === 'success' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={24} />
              </div>
              <span className="text-[11px] text-emerald-300 font-bold">{fileName}</span>
              <span className="text-[9px] text-emerald-500/70 uppercase tracking-tighter">Integrity Verified</span>
            </div>
          ) : fileName ? (
            <>
              <FileArchive size={24} className="text-cyan-400" />
              <span className="text-[11px] text-[var(--c-tx2)] text-center font-medium">{fileName}</span>
              <span className="text-[9px] text-[var(--c-tx5)] uppercase">Ready to Validate</span>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-[var(--c-bg4)] flex items-center justify-center text-[var(--c-tx4)] mb-1">
                <Upload size={20} />
              </div>
              <div className="text-center">
                <span className="text-[11px] text-[var(--c-tx4)] block font-medium">Drop plugin .jar here</span>
                <span className="text-[9px] text-[var(--c-tx5)]">or click to browse filesystem</span>
              </div>
            </>
          )}
        </div>

        {/* Validation Feedback & Results */}
        {validationState === 'success' && validationResult && (
          <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-[10px]">
              <div className="grid grid-cols-2 gap-y-1.5">
                <span className="text-[var(--c-tx4)]">Plugin ID:</span>
                <span className="text-emerald-300 text-right">{validationResult.pluginId}</span>
                <span className="text-[var(--c-tx4)]">Core Version:</span>
                <span className="text-emerald-300 text-right">{validationResult.coreApiVersion}</span>
                <span className="text-[var(--c-tx4)]">Security:</span>
                <span className="text-emerald-300 text-right flex items-center justify-end gap-1">
                  <Check size={10} /> Passed
                </span>
              </div>
              {validationResult.warnings && validationResult.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-500/10 flex items-start gap-2 text-amber-400/80 italic text-[9px]">
                  <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                  <span>{(validationResult.warnings || []).join('. ')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {validationState === 'error' && validationResult && (
          <div className="mt-4 animate-in shake-1 duration-300">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 text-[10px] text-red-400 font-bold mb-2">
                <X size={14} />
                <span>Plugin Rejected</span>
              </div>
              <ul className="text-[9px] text-red-300/80 space-y-1 leading-relaxed">
                {(validationResult.errors || []).length > 0 ? (
                  (validationResult.errors || []).map((err, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 w-1 h-1 rounded-full bg-red-400 shrink-0" />
                      {err}
                    </li>
                  ))
                ) : (
                  <li className="flex items-start gap-1.5 text-red-300/60">
                    <span className="mt-1 w-1 h-1 rounded-full bg-red-500/40 shrink-0" />
                    Validation failed without specific error messages. Check core logs.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Action Button Section */}
        <div className="mt-5">
          {!showRestartConfirm ? (
            <button
              onClick={() => setShowRestartConfirm(true)}
              disabled={validationState !== 'success' || isInstalling}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all duration-300 transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale ${
                validationState === 'success'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 shadow-lg shadow-emerald-500/10'
                  : 'border-cyan-500/50 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/10'
              }`}
            >
              {validationState === 'success' ? (
                <>
                  <ArrowRight size={14} />
                  Import Validated Plugin
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Import Plugin
                </>
              )}
            </button>
          ) : (
            <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 text-[10px] text-amber-300 flex items-start gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span className="leading-relaxed">The system will restart to finalize installation. Active flows will be interrupted. Proceed?</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRestartConfirm(false)}
                  disabled={isInstalling}
                  className="flex-1 px-4 py-2 rounded-lg border border-[var(--c-br1)] text-[10px] font-bold text-[var(--c-tx4)] hover:bg-[var(--c-bg5)] hover:text-[var(--c-tx2)] transition-all disabled:opacity-50"
                >
                  ABORT
                </button>
                <button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-2 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-emerald-500 bg-emerald-500 text-black text-[10px] font-black hover:bg-emerald-400 transition-all disabled:opacity-50"
                >
                  {isInstalling ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={12} />
                      INSTALL & RESTART
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
}
