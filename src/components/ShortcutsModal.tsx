import React from 'react';
import { Keyboard, X, MousePointer, ZoomIn, Move, SunMedium, Eye, RotateCw, Sparkles, Layers, Sliders, Disc } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Mouse & Viewport Controls',
      icon: <MousePointer className="w-4 h-4 text-cyan-400" />,
      items: [
        { key: 'Left Click + Drag', desc: 'Active tool operation (Windowing / Pan / Measurement)' },
        { key: 'Right Click + Drag', desc: 'Instant interactive Zoom In / Out' },
        { key: 'Middle Click + Drag', desc: 'Pan image freely across viewport' },
        { key: 'Mouse Scroll Wheel', desc: 'Next / Previous slice scrolling' },
        { key: 'Double Click', desc: 'Maximize active viewport / return to grid' },
      ]
    },
    {
      title: 'Quick Tools & Measurements',
      icon: <Sliders className="w-4 h-4 text-amber-400" />,
      items: [
        { key: 'W', desc: 'Window Level & Window Width adjustment tool' },
        { key: 'P', desc: 'Pan tool' },
        { key: 'Z', desc: 'Zoom tool' },
        { key: 'M', desc: 'Magnifying Diagnostic Loupe' },
        { key: 'D', desc: 'Distance Caliper measurement (mm)' },
        { key: 'A', desc: '3-Point Angle measurement (°)' },
        { key: 'T', desc: 'Arrow & Text lesion annotation' },
        { key: 'R', desc: 'Rectangle ROI (Area, Mean HU, StdDev)' },
        { key: 'E', desc: 'Ellipse ROI' },
        { key: 'H', desc: 'Hounsfield Unit (HU) live probe' },
      ]
    },
    {
      title: 'Display & DICOM Transformations',
      icon: <RotateCw className="w-4 h-4 text-purple-400" />,
      items: [
        { key: 'O', desc: 'Toggle Medical HUD Overlays & text on/off (Clean view)' },
        { key: 'I', desc: 'Invert image polarity (Monochrome1 / 2)' },
        { key: 'F', desc: 'Flip image horizontally' },
        { key: 'Spacebar', desc: 'Play / Pause Cine Loop playback' },
        { key: 'F11', desc: 'Toggle Fullscreen workstation mode' },
        { key: 'Esc', desc: 'Cancel active measurement drawing' },
      ]
    },
    {
      title: 'CT Windowing Presets (Numeric Keys)',
      icon: <SunMedium className="w-4 h-4 text-emerald-400" />,
      items: [
        { key: '1', desc: 'Default / Original DICOM Window' },
        { key: '2', desc: 'Abdomen / Soft Tissue (WC: 40, WW: 350)' },
        { key: '3', desc: 'Bone Window (WC: 450, WW: 1800)' },
        { key: '4', desc: 'Lung Window (WC: -600, WW: 1500)' },
        { key: '5', desc: 'Brain Window (WC: 40, WW: 80)' },
        { key: '6', desc: 'Liver Window (WC: 60, WW: 150)' },
        { key: '7', desc: 'Mediastinum Window (WC: 50, WW: 350)' },
        { key: '8', desc: 'Spine Window (WC: 60, WW: 300)' },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-sm text-cyan-400">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <span>RadNode Viewer Diagnostic Workstation Keyboard Shortcuts</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shortcutGroups.map((group, idx) => (
              <div key={idx} className="bg-radiant-card border border-radiant-border rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-slate-200 border-b border-radiant-border pb-1.5 text-xs">
                  {group.icon}
                  <span>{group.title}</span>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item, iIdx) => (
                    <div key={iIdx} className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="text-slate-300 font-medium">{item.desc}</span>
                      <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/40 font-mono text-[10.5px] text-cyan-300 font-semibold shadow-sm whitespace-nowrap">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-lg p-3 text-[11px] text-cyan-200 flex items-center justify-between">
            <span>Tip: You can press <kbd className="px-1.5 py-0.5 rounded bg-cyan-900 border border-cyan-400/40 font-mono text-cyan-100 font-bold">?</kbd> anytime to toggle this cheat sheet.</span>
            <span className="font-semibold text-cyan-400">RadNode Viewer v0.0.6</span>
          </div>
        </div>

        {/* Footer */}
        <div className="h-11 bg-radiant-darkest border-t border-radiant-border px-5 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold transition-colors text-xs"
          >
            Got It (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
