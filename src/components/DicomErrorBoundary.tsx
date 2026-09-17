import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DicomErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CRASH SHIELD] DicomErrorBoundary caught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-radiant-darkest text-slate-200 p-4 select-none">
          <div className="bg-radiant-card/90 border border-amber-500/60 rounded-xl p-5 max-w-md shadow-2xl backdrop-blur-md flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-300">
                {this.props.fallbackMessage || 'Medical Display Protection Active'}
              </h3>
              <p className="text-xs text-slate-400">
                An unexpected image parsing or rendering condition was intercepted safely to prevent application crash.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="w-full bg-black/50 border border-slate-800 rounded p-2 text-[10px] font-mono text-slate-400 max-h-20 overflow-y-auto text-left">
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleRetry}
              className="mt-2 flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restore Viewport</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
