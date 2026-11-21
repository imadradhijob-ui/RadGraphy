import React, { useState } from 'react';
import { Sliders, Sun, Pin, PinOff } from 'lucide-react';

interface PresetItem {
  id: string;
  name: string;
  shortName: string;
  wc: number;
  ww: number;
  badgeColor: string;
}

const PRESETS: PresetItem[] = [
  { id: 'brain', name: 'Brain', shortName: 'BRN', wc: 40, ww: 80, badgeColor: 'hover:border-cyan-400 hover:text-cyan-300' },
  { id: 'subdural', name: 'Subdural', shortName: 'SUB', wc: 50, ww: 130, badgeColor: 'hover:border-blue-400 hover:text-blue-300' },
  { id: 'bone', name: 'Bone', shortName: 'BNE', wc: 500, ww: 2000, badgeColor: 'hover:border-amber-400 hover:text-amber-300' },
  { id: 'lung', name: 'Lung', shortName: 'LNG', wc: -600, ww: 1500, badgeColor: 'hover:border-emerald-400 hover:text-emerald-300' },
  { id: 'soft', name: 'Abdomen / Soft Tissue', shortName: 'SFT', wc: 50, ww: 400, badgeColor: 'hover:border-indigo-400 hover:text-indigo-300' },
  { id: 'mediastinum', name: 'Mediastinum', shortName: 'MED', wc: 50, ww: 350, badgeColor: 'hover:border-purple-400 hover:text-purple-300' },
];

interface FloatingWindowPresetsProps {
  currentWc: number;
  currentWw: number;
  defaultWc?: number;
  defaultWw?: number;
  onApplyPreset: (wc: number, ww: number) => void;
  onInvert?: () => void;
}

export const FloatingWindowPresets: React.FC<FloatingWindowPresetsProps> = ({
  currentWc,
  currentWw,
  defaultWc = 40,
  defaultWw = 400,
  onApplyPreset,
  onInvert
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const isVisible = isExpanded || isPinned;

  return (
    <div
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => !isPinned && setIsExpanded(false)}
      className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 select-none transition-all duration-200"
    >
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border shadow-2xl transition-all ${
          isVisible ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : 'border-slate-800/80 opacity-70 hover:opacity-100'
        }`}
      >
        {/* Toggle / Quick Indicator Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          title="Quick Window Presets (Brain, Bone, Lung, Abdomen)"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono text-cyan-400 hover:text-white transition-colors"
        >
          <Sliders className="w-3 h-3 text-cyan-400" />
          <span className="font-semibold hidden sm:inline">WL: {currentWc}</span>
        </button>

        {/* Collapsed / Expanded Content */}
        {isVisible && (
          <div className="flex items-center gap-1 animate-fade-in pl-1 border-l border-slate-700/60">
            {/* Auto/Default Button */}
            <button
              type="button"
              onClick={() => onApplyPreset(defaultWc, defaultWw)}
              title={`Original/Default (W:${defaultWw}, L:${defaultWc})`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all border ${
                currentWc === defaultWc && currentWw === defaultWw
                  ? 'bg-cyan-500 text-black border-cyan-400 shadow-sm'
                  : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              AUTO
            </button>

            {/* Presets List */}
            {PRESETS.map((p) => {
              const isActive = currentWc === p.wc && currentWw === p.ww;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onApplyPreset(p.wc, p.ww)}
                  title={`${p.name} (WL: ${p.wc}, WW: ${p.ww})`}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all border ${
                    isActive
                      ? 'bg-cyan-500 text-black border-cyan-400 shadow-sm'
                      : `bg-slate-900/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 ${p.badgeColor}`
                  }`}
                >
                  {p.shortName}
                </button>
              );
            })}

            {/* Invert Button */}
            {onInvert && (
              <button
                type="button"
                onClick={onInvert}
                title="Invert Grayscale (Negative)"
                className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
              >
                <Sun className="w-3 h-3" />
              </button>
            )}

            {/* Pin Toggle */}
            <button
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              title={isPinned ? 'Unpin Floating Presets Bar' : 'Pin Floating Presets Bar'}
              className={`p-1 rounded transition-colors ${
                isPinned ? 'text-cyan-400 bg-cyan-950/60' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
