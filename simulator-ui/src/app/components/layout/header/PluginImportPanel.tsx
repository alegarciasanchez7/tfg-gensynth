import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Check, AlertTriangle, Loader2, FileArchive } from 'lucide-react';
import { CoreCommands } from '../../../core/bridge';
import bridge from '../../../core/bridge';
import type { PluginValidationResultPayload } from '../../../core/types';

type ValidationState = 'idle' | 'validating' | 'success' | 'error';

interface PluginImportPanelProps {
  onClose: () => void;
}

/**
 * Panel for importing external connector plugins (.jar files).
 *
 * Provides a form for plugin name/version, a drag-and-drop zone for
 * JAR file upload, automatic validation on file drop, and installation
 * with restart confirmation.
 */
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
  const [isRestarting, setIsRestarting] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !showRestartConfirm && !isRestarting) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, showRestartConfirm, isRestarting]);

  // Listen for restart-required events
  useEffect(() => {
    const unsub = bridge.on('restart-required', () => {
      setIsRestarting(true);
    });
    return unsub;
  }, []);

  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (data:application/java-archive;base64,)
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

      const response = await CoreCommands.validatePlugin(base64, name, version) as PluginValidationResultPayload;

      setValidationResult(response);
      setValidationState(response.valid ? 'success' : 'error');

      // Auto-fill name from descriptor if user didn't provide one
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  }, [handleFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  }, [handleFileSelected]);

  const handleInstall = useCallback(async () => {
    if (!jarBase64 || !validationResult?.valid) return;

    setIsInstalling(true);
    try {
      const name = pluginName.trim() || validationResult.displayName || 'unknown';
      const version = pluginVersion.trim() || validationResult.pluginVersion || '1.0.0';

      await CoreCommands.installPlugin(jarBase64, name, version);
      // The restart-required event will trigger the restart overlay
    } catch (err) {
      setIsInstalling(false);
      setShowRestartConfirm(false);
    }
  }, [jarBase64, pluginName, pluginVersion, validationResult]);

  // Restart overlay
  if (isRestarting) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 size={40} className="text-cyan-400 animate-spin" />
          <span className="text-lg text-white font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Restarting application...
          </span>
          <span className="text-sm text-slate-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Loading new plugin. The UI will reconnect automatically.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 py-3 px-4"
      style={{ fontFamily: 'JetBrains Mono, monospace', width: 360 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase">Import Plugin</span>
        <button onClick={onClose} className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
          <X size={12} />
        </button>
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-2 mb-3">
        <div>
          <label className="text-[9px] text-[var(--c-tx4)] uppercase tracking-wider block mb-0.5">Plugin Name</label>
          <input
            id="plugin-name-input"
            type="text"
            value={pluginName}
            onChange={(e) => setPluginName(e.target.value)}
            placeholder="e.g. My MQTT Connector"
            className="w-full px-2 py-1.5 text-[11px] bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-[var(--c-tx2)] placeholder:text-[var(--c-tx5)] focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="text-[9px] text-[var(--c-tx4)] uppercase tracking-wider block mb-0.5">Version</label>
          <input
            id="plugin-version-input"
            type="text"
            value={pluginVersion}
            onChange={(e) => setPluginVersion(e.target.value)}
            placeholder="e.g. 1.0.0"
            className="w-full px-2 py-1.5 text-[11px] bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-[var(--c-tx2)] placeholder:text-[var(--c-tx5)] focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-[var(--c-br2)] mb-3" />

      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/10'
            : fileName
              ? 'border-[var(--c-br2)] bg-[var(--c-bg1)]'
              : 'border-[var(--c-br1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jar"
          className="hidden"
          onChange={handleFileInput}
        />
        {fileName ? (
          <>
            <FileArchive size={20} className="text-cyan-400" />
            <span className="text-[10px] text-[var(--c-tx2)] text-center">{fileName}</span>
          </>
        ) : (
          <>
            <Upload size={20} className={isDragging ? 'text-cyan-400' : 'text-[var(--c-tx4)]'} />
            <span className="text-[10px] text-[var(--c-tx4)] text-center">
              Drag & drop a .jar file here
            </span>
            <span className="text-[9px] text-[var(--c-tx5)]">or click to browse</span>
          </>
        )}
      </div>

      {/* Validation status */}
      {validationState !== 'idle' && (
        <div className="mt-3">
          {validationState === 'validating' && (
            <div className="flex items-center gap-2 text-[10px] text-amber-400">
              <Loader2 size={12} className="animate-spin" />
              <span>Validating plugin...</span>
            </div>
          )}

          {validationState === 'success' && validationResult && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                <Check size={12} />
                <span>Validation passed</span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1.5 text-[9px] text-[var(--c-tx3)]">
                <div><span className="text-[var(--c-tx4)]">ID:</span> {validationResult.pluginId}</div>
                <div><span className="text-[var(--c-tx4)]">Name:</span> {validationResult.displayName}</div>
                <div><span className="text-[var(--c-tx4)]">Version:</span> {validationResult.pluginVersion}</div>
                <div><span className="text-[var(--c-tx4)]">API:</span> {validationResult.coreApiVersion}</div>
              </div>
              {validationResult.warnings.length > 0 && (
                <div className="flex items-start gap-1.5 text-[9px] text-amber-400">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                  <div>{validationResult.warnings.join('; ')}</div>
                </div>
              )}
            </div>
          )}

          {validationState === 'error' && validationResult && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[10px] text-red-400">
                <X size={12} />
                <span>Validation failed</span>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 text-[9px] text-red-300">
                {validationResult.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Install button */}
      <div className="mt-3">
        {!showRestartConfirm ? (
          <button
            id="import-plugin-button"
            disabled={validationState !== 'success' || isInstalling}
            onClick={() => setShowRestartConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border text-[11px] transition-all disabled:opacity-30 disabled:cursor-not-allowed border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:hover:bg-cyan-500/10"
          >
            <Upload size={12} />
            Import Plugin
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-2 text-[10px] text-amber-300 flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>The application will restart to load the new plugin. All active flows will be stopped. Continue?</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRestartConfirm(false)}
                disabled={isInstalling}
                className="flex-1 px-3 py-1.5 rounded border border-[var(--c-br1)] text-[10px] text-[var(--c-tx3)] hover:bg-[var(--c-bg5)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-install-button"
                onClick={handleInstall}
                disabled={isInstalling}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-emerald-500/50 bg-emerald-500/10 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {isInstalling ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Check size={10} />
                    Confirm & Restart
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
