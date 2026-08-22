import React, { useState } from 'react';
import { Bookmark, X, Trash2, Download, FileText, Calendar, User, Eye, Edit3, Check } from 'lucide-react';
import { KeyImageBookmark } from '../types/dicom';

interface KeyImagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: KeyImageBookmark[];
  onDeleteBookmark: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onOpenReport: () => void;
  onJumpToSlice?: (bookmark: KeyImageBookmark) => void;
}

export const KeyImagesModal: React.FC<KeyImagesModalProps> = ({
  isOpen,
  onClose,
  bookmarks,
  onDeleteBookmark,
  onUpdateNotes,
  onOpenReport,
  onJumpToSlice
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  if (!isOpen) return null;

  const handleStartEdit = (b: KeyImageBookmark) => {
    setEditingId(b.id);
    setTempNotes(b.notes);
  };

  const handleSaveNotes = (id: string) => {
    onUpdateNotes(id, tempNotes);
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
            <Bookmark className="w-5 h-5 text-cyan-300 fill-cyan-400" />
            <span>Key Image Notes & Bookmarks Gallery ({bookmarks.length})</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {bookmarks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center">
              <Bookmark className="w-12 h-12 text-slate-700 mb-2" />
              <p className="text-sm font-semibold">No Key Images Bookmarked Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Press the <strong className="text-cyan-300">Bookmark (B)</strong> hotkey in the viewer to capture key diagnostic findings, measurements, and pathology slices.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bookmarks.map((b, idx) => (
                <div
                  key={b.id}
                  className="bg-radiant-card border border-radiant-border rounded-xl overflow-hidden shadow-md flex flex-col group hover:border-cyan-500/60 transition-all"
                >
                  {/* Card Header */}
                  <div className="bg-radiant-darkest px-3 py-2 border-b border-radiant-border flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-cyan-400 font-mono">#{idx + 1}</span>
                      <span className="text-slate-300 font-semibold truncate max-w-[180px]">
                        {b.seriesDescription || 'Series'}
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="font-mono text-amber-300">Slice: {b.instanceIndex + 1}</span>
                    </div>

                    <button
                      onClick={() => onDeleteBookmark(b.id)}
                      title="Delete Bookmark"
                      className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Thumbnail & Info */}
                  <div className="p-3 flex gap-3 flex-1">
                    <div className="w-36 h-36 bg-black rounded-lg border border-radiant-border overflow-hidden shrink-0 relative group/thumb">
                      <img
                        src={b.snapshotDataUrl}
                        alt="Key Slice"
                        className="w-full h-full object-contain"
                      />
                      {onJumpToSlice && (
                        <button
                          onClick={() => {
                            onJumpToSlice(b);
                            onClose();
                          }}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center gap-1 text-cyan-300 font-bold text-[11px] backdrop-blur-[1px] transition-opacity"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View Slice</span>
                        </button>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div className="space-y-1 text-[11px]">
                        <div className="text-slate-200 font-bold">{b.patientName}</div>
                        <div className="text-slate-400 font-mono text-[10px]">ID: {b.patientId}</div>
                        <div className="text-cyan-400 text-[10px] truncate">{b.studyDescription}</div>
                        {b.sliceLocation !== undefined && (
                          <div className="text-slate-400 font-mono text-[10px]">Loc: {b.sliceLocation.toFixed(1)} mm</div>
                        )}
                        {b.measurementsCount > 0 && (
                          <span className="inline-block px-1.5 py-0.5 bg-blue-950/80 border border-blue-600/40 text-blue-300 rounded text-[9px] font-bold">
                            {b.measurementsCount} Calibrated Measurement{b.measurementsCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Notes Section */}
                      <div className="mt-2 bg-radiant-darkest border border-radiant-border/80 rounded-lg p-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-semibold">
                          <span>Radiologist Clinical Findings:</span>
                          {editingId === b.id ? (
                            <button
                              onClick={() => handleSaveNotes(b.id)}
                              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-0.5"
                            >
                              <Check className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartEdit(b)}
                              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>

                        {editingId === b.id ? (
                          <textarea
                            value={tempNotes}
                            onChange={(e) => setTempNotes(e.target.value)}
                            placeholder="Add diagnostic notes for this finding..."
                            className="w-full h-14 bg-black/50 border border-cyan-500 rounded p-1.5 text-[11px] text-slate-100 focus:outline-none resize-none font-sans"
                            autoFocus
                          />
                        ) : (
                          <p className="text-[11px] text-slate-300 italic min-h-[28px] line-clamp-2">
                            {b.notes || 'No specific notes entered for this finding.'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            {bookmarks.length} key images bookmarked for diagnostic reporting
          </span>

          <div className="flex items-center gap-2">
            {bookmarks.length > 0 && (
              <button
                onClick={() => {
                  onClose();
                  onOpenReport();
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all border border-emerald-400/40"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-200" />
                <span>Generate Diagnostic Report</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
