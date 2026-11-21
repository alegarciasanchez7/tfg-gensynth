import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { reportUiErrorToCore } from '../../core/uiErrorReporter';

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Reloads the UI. Injectable for tests; defaults to reloading the page. */
  onReload?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary: a render error anywhere in the UI shows a recoverable message
 * with a Reload button instead of a blank page, and the error is logged (console and Core log).
 *
 * This is the only class component of the UI on purpose: React only supports error boundaries
 * as class components (there is no hook equivalent of componentDidCatch /
 * getDerivedStateFromError), and the project has no error boundary dependency.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[UI] Unhandled render error:', error, info.componentStack);
    void reportUiErrorToCore(`[UI RENDER ERROR] ${error.message}${info.componentStack ?? ''}`);
  }

  private readonly handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload();
    } else {
      window.location.reload();
    }
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="h-screen w-screen flex items-center justify-center p-6"
        style={{ background: 'var(--c-bg3)', color: 'var(--c-tx2)', fontFamily: 'JetBrains Mono, monospace' }}
      >
        <div className="max-w-md w-full rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle size={16} />
            <span className="text-sm tracking-wider">Something went wrong</span>
          </div>
          <p className="text-xs text-[var(--c-tx3)]">
            The interface hit an unexpected error. Reload it to continue: the configuration is loaded
            again from the simulation engine.
          </p>
          <pre className="text-[10px] text-[var(--c-tx4)] bg-[var(--c-bg1)] border border-[var(--c-br2)] rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-auto">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-xs text-cyan-500 hover:bg-cyan-500/20 transition-colors"
          >
            <RotateCw size={12} />
            Reload
          </button>
        </div>
      </div>
    );
  }
}
