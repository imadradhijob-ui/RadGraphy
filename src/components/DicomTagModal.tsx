import React, { useState } from 'react';
import { Tag, Search, X, Copy, Check } from 'lucide-react';
import { DicomInstance } from '../types/dicom';

interface DicomTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance?: DicomInstance;
}

export const DicomTagModal: React.FC<DicomTagModalProps> = ({
  isOpen,
  onClose,
  instance
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  if (!isOpen) return null;

  const rawTags = instance?.rawTags ? Object.values(instance.rawTags) : [];

  const filteredTags = rawTags.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      t.tag.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      String(t.value).toLowerCase().includes(q) ||
      t.vr.toLowerCase().includes(q)
    );
  });

  const handleCopy = (tagKey: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedTag(tagKey);
    setTimeout(() => setCopiedTag(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
            <Tag className="w-5 h-5 text-cyan-300" />
            <span>DICOM Metadata Tag Browser</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 bg-radiant-card border-b border-radiant-border flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tag (e.g. 0010,0010), attribute name (e.g. PatientName), or value..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-radiant-darkest border border-radiant-border rounded-lg pr-3 pl-9 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
            Displayed Tags: <strong>{filteredTags.length}</strong> / {rawTags.length}
          </span>
        </div>

        {/* Table Header */}
        <div className="h-8 bg-radiant-darkest border-b border-radiant-border grid grid-cols-12 px-4 items-center text-[11px] font-bold text-slate-400">
          <div className="col-span-2 font-mono">Tag</div>
          <div className="col-span-1 font-mono">VR</div>
          <div className="col-span-4">Attribute Name</div>
          <div className="col-span-4">Value</div>
          <div className="col-span-1 text-right">Copy</div>
        </div>

        {/* Tags List */}
        <div className="flex-1 overflow-y-auto divide-y divide-radiant-border/60 font-mono text-xs">
          {filteredTags.length > 0 ? (
            filteredTags.map((t) => (
              <div
                key={t.tag}
                className="grid grid-cols-12 px-4 py-2 items-center hover:bg-radiant-hover transition-colors"
              >
                <div className="col-span-2 font-bold text-cyan-400">{t.tag}</div>
                <div className="col-span-1 text-slate-400">{t.vr}</div>
                <div className="col-span-4 text-slate-200 font-sans font-medium">{t.name}</div>
                <div className="col-span-4 text-amber-300 truncate" title={String(t.value)}>
                  {String(t.value)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => handleCopy(t.tag, String(t.value))}
                    title="Copy Value"
                    className="p-1 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 rounded transition-colors"
                  >
                    {copiedTag === t.tag ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8">
              <p>No matching tags found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-10 bg-radiant-darkest border-t border-radiant-border px-4 flex items-center justify-between text-[11px] text-slate-400">
          <span>DICOM Part 6 Data Dictionary Compliant</span>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-radiant-card hover:bg-radiant-hover text-slate-200 rounded font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
