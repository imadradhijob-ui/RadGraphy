import React, { useState, useEffect } from 'react';
import {
  FileText,
  Copy,
  ExternalLink,
  Trash2,
  RefreshCw,
  X,
  AlertTriangle,
  Info,
  Check
} from 'lucide-react';
import { logger } from '../services/logger';

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogViewerModal: React.FC<LogViewerModalProps> = ({ isOpen, onClose }) => {
  const [logText, setLogText] = useState<string>('Loading error logs...');
  const [logPath, setLogPath] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const path = await logger.getLogPath();
      setLogPath(path);
      const content = await logger.readLogContent();
      setLogText(content || 'No error logs recorded yet. Application is running cleanly.');
    } catch (err: any) {
      setLogText(`Failed to read logs: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFile = async () => {
    await logger.openLogFile();
  };

  const handleClear = async () => {
    if (confirm('Are you sure you want to clear the error log?')) {
      await logger.clearLog();
      await fetchLogs();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in select-none">
      <div className="bg-radiant-dark border border-cyan-500/40 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>System Error Log & Crash Diagnostics</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono border border-cyan-800">
                  radnode_errors.log
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              title="Refresh Logs"
              className="p-1.5 rounded-lg bg-radiant-card border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Path Info Banner */}
        <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 truncate max-w-[70%]">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate font-mono text-[11px] text-slate-300" title={logPath}>
              {logPath || 'Initializing log path...'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenFile}
              className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-600/50 text-cyan-300 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Open log file in Windows Notepad"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open in Notepad</span>
            </button>

            <button
              onClick={handleCopy}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
              <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
            </button>

            <button
              onClick={handleClear}
              className="px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3 text-rose-400" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Log Content Area */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 bg-black/90 select-text leading-relaxed">
          <pre className="whitespace-pre-wrap break-all">{logText}</pre>
        </div>

        {/* Footer */}
        <div className="h-10 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>All exceptions, WebGL issues, and renderer halts are automatically written to disk.</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-semibold transition-colors cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
