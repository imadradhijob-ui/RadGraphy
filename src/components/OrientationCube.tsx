import React from 'react';
import { getOrientationCubeTransform } from '../services/orientationService';

interface OrientationCubeProps {
  plane?: 'AXIAL' | 'CORONAL' | 'SAGITTAL' | null;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  onResetOrientation?: () => void;
  size?: number;
}

export const OrientationCube: React.FC<OrientationCubeProps> = ({
  plane = 'AXIAL',
  rotation = 0,
  flipH = false,
  flipV = false,
  onResetOrientation,
  size = 38
}) => {
  const transform = getOrientationCubeTransform(plane, rotation, flipH, flipV);
  const half = size / 2;

  const faceStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${size}px`,
    height: `${size}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${Math.round(size * 0.32)}px`,
    fontFamily: 'monospace',
    fontWeight: 700,
    border: '1px solid rgba(6, 182, 212, 0.65)',
    boxShadow: 'inset 0 0 6px rgba(6, 182, 212, 0.3)',
    userSelect: 'none',
    backfaceVisibility: 'hidden',
  };

  return (
    <div
      onClick={onResetOrientation}
      title={`Anatomical Orientation (${plane || 'AXIAL'})\nRotation: ${rotation}°${flipH ? ' (Flip H)' : ''}${flipV ? ' (Flip V)' : ''}\nClick to reset`}
      className="relative flex items-center justify-center cursor-pointer p-1 rounded-lg bg-slate-950/60 hover:bg-slate-900/80 border border-slate-700/50 backdrop-blur-md shadow-lg transition-transform hover:scale-105 group select-none"
      style={{ width: `${size + 16}px`, height: `${size + 16}px`, perspective: '160px' }}
    >
      <div
        className="transition-transform duration-300 ease-out"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `scaleX(${transform.scaleX}) scaleY(${transform.scaleY}) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg) rotateZ(${transform.rotateZ}deg)`
        }}
      >
        {/* Front Face: Anterior (A) */}
        <div
          style={{
            ...faceStyle,
            transform: `translateZ(${half}px)`,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            color: '#38bdf8'
          }}
        >
          A
        </div>

        {/* Back Face: Posterior (P) */}
        <div
          style={{
            ...faceStyle,
            transform: `rotateY(180deg) translateZ(${half}px)`,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            color: '#38bdf8'
          }}
        >
          P
        </div>

        {/* Left Face: Right (R) */}
        <div
          style={{
            ...faceStyle,
            transform: `rotateY(-90deg) translateZ(${half}px)`,
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            color: '#facc15'
          }}
        >
          R
        </div>

        {/* Right Face: Left (L) */}
        <div
          style={{
            ...faceStyle,
            transform: `rotateY(90deg) translateZ(${half}px)`,
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            color: '#facc15'
          }}
        >
          L
        </div>

        {/* Top Face: Superior (S) */}
        <div
          style={{
            ...faceStyle,
            transform: `rotateX(90deg) translateZ(${half}px)`,
            backgroundColor: 'rgba(2, 44, 34, 0.8)',
            color: '#4ade80'
          }}
        >
          S
        </div>

        {/* Bottom Face: Inferior (I) */}
        <div
          style={{
            ...faceStyle,
            transform: `rotateX(-90deg) translateZ(${half}px)`,
            backgroundColor: 'rgba(2, 44, 34, 0.8)',
            color: '#4ade80'
          }}
        >
          I
        </div>
      </div>
    </div>
  );
};
