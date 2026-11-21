import React from 'react';

interface DynamicScaleRulerProps {
  zoom: number;
  pixelSpacing?: [number, number];
}

const CANDIDATE_DISTANCES_MM = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

export const DynamicScaleRuler: React.FC<DynamicScaleRulerProps> = ({ zoom, pixelSpacing }) => {
  const colSpacing = pixelSpacing?.[1] || pixelSpacing?.[0] || 1;
  const pixelsPerMm = (zoom || 1) / (colSpacing || 1);

  if (pixelsPerMm <= 0 || !isFinite(pixelsPerMm)) return null;

  // Find candidate distance that yields ruler width between 50px and 140px
  let bestDistanceMm = CANDIDATE_DISTANCES_MM[0];
  let bestWidthPx = bestDistanceMm * pixelsPerMm;

  for (const d of CANDIDATE_DISTANCES_MM) {
    const w = d * pixelsPerMm;
    if (w >= 45 && w <= 140) {
      bestDistanceMm = d;
      bestWidthPx = w;
      break;
    }
    if (w > 140) {
      // previous was closest
      break;
    }
    bestDistanceMm = d;
    bestWidthPx = w;
  }

  const label =
    bestDistanceMm >= 10
      ? `${bestDistanceMm / 10} cm`
      : `${bestDistanceMm} mm`;

  return (
    <div
      title={`Dynamic Calibration Scale: ${label} (${Math.round(bestWidthPx)}px at ${Math.round(zoom * 100)}% zoom)`}
      className="pointer-events-none select-none flex flex-col items-center px-2 py-1 rounded bg-slate-950/60 backdrop-blur-md border border-slate-700/40 shadow-lg"
    >
      <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-wider mb-0.5">
        {label}
      </span>
      <div
        style={{ width: `${Math.round(bestWidthPx)}px` }}
        className="relative h-2 flex items-center justify-between"
      >
        {/* Left End Tick */}
        <div className="w-[1.5px] h-2.5 bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />

        {/* Center Mid Tick */}
        <div className="absolute left-1/2 -translate-x-1/2 w-[1px] h-1.5 bg-cyan-400/80" />

        {/* Horizontal Connecting Bar */}
        <div className="absolute left-0 right-0 h-[1.5px] bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />

        {/* Right End Tick */}
        <div className="w-[1.5px] h-2.5 bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
      </div>
    </div>
  );
};
