import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  DicomInstance,
  DicomSeries,
  DicomStudy,
  Measurement,
  Point2D,
  ToolType,
  ViewportState
} from '../types/dicom';
import { getOrDecodeInstancePixels } from '../services/dicomParser';
import { getLutTable, classifyTissueFromHu } from '../services/lutService';

interface DicomViewportProps {
  viewportState: ViewportState;
  series: DicomSeries | null;
  study: DicomStudy | null;
  activeTool: ToolType;
  isActive: boolean;
  onActivate: () => void;
  onUpdateState: (updates: Partial<ViewportState>) => void;
  onAddMeasurement: (m: Measurement) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const DicomViewport: React.FC<DicomViewportProps> = ({
  viewportState,
  series,
  study,
  activeTool,
  isActive,
  onActivate,
  onUpdateState,
  onAddMeasurement,
  onDragOver,
  onDrop
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });
  const [dragButton, setDragButton] = useState<number | null>(null);
  const [initialWc, setInitialWc] = useState(viewportState.windowCenter);
  const [initialWw, setInitialWw] = useState(viewportState.windowWidth);
  const [initialPan, setInitialPan] = useState<Point2D>(viewportState.pan);
  const [initialZoom, setInitialZoom] = useState(viewportState.zoom);

  // Measurements drawing state
  const [drawingPoints, setDrawingPoints] = useState<Point2D[]>([]);
  const [mousePos, setMousePos] = useState<Point2D>({ x: 0, y: 0 });

  // Hover HU probe
  const [hoveredHu, setHoveredHu] = useState<number | null>(null);
  const [hoveredPixelCoord, setHoveredPixelCoord] = useState<{ x: number; y: number } | null>(null);

  const instanceIndex = viewportState.instanceIndex || 0;
  const currentInstance: DicomInstance | undefined = series?.instances[instanceIndex] || series?.instances[0];

  // Cine Playback Loop
  useEffect(() => {
    if (!viewportState.cinePlaying || !series || series.instances.length <= 1) return;

    const interval = setInterval(() => {
      onUpdateState({
        instanceIndex: (viewportState.instanceIndex + 1) % series.instances.length
      });
    }, 1000 / (viewportState.cineFps || 15));

    return () => clearInterval(interval);
  }, [viewportState.cinePlaying, viewportState.cineFps, viewportState.instanceIndex, series]);

  // Convert screen coordinates to DICOM image pixel coordinates
  const screenToImageCoord = useCallback(
    (screenX: number, screenY: number): Point2D => {
      if (!canvasRef.current || !currentInstance) return { x: 0, y: 0 };
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      const cx = rect.width / 2 + viewportState.pan.x;
      const cy = rect.height / 2 + viewportState.pan.y;

      const scale = viewportState.zoom * Math.min(rect.width / currentInstance.columns, rect.height / currentInstance.rows);

      const imgX = (screenX - rect.left - cx) / scale + currentInstance.columns / 2;
      const imgY = (screenY - rect.top - cy) / scale + currentInstance.rows / 2;

      return { x: imgX, y: imgY };
    },
    [currentInstance, viewportState.pan, viewportState.zoom]
  );

  // Convert DICOM image pixel coordinates to screen coordinates
  const imageToScreenCoord = useCallback(
    (imgX: number, imgY: number): Point2D => {
      if (!canvasRef.current || !currentInstance) return { x: 0, y: 0 };
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      const cx = rect.width / 2 + viewportState.pan.x;
      const cy = rect.height / 2 + viewportState.pan.y;

      const scale = viewportState.zoom * Math.min(rect.width / currentInstance.columns, rect.height / currentInstance.rows);

      const screenX = (imgX - currentInstance.columns / 2) * scale + cx;
      const screenY = (imgY - currentInstance.rows / 2) * scale + cy;

      return { x: screenX, y: screenY };
    },
    [currentInstance, viewportState.pan, viewportState.zoom]
  );

  // Render DICOM image on HTML5 Canvas
  const renderDicom = useCallback(() => {
    if (!canvasRef.current || !currentInstance) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = currentInstance.columns;
    const height = currentInstance.rows;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const { pixelData, huData } = getOrDecodeInstancePixels(currentInstance);
    const numPixels = width * height;

    const isRgb = currentInstance.samplesPerPixel === 3 || currentInstance.photometricInterpretation.includes('RGB');
    const isMonochrome1 = currentInstance.photometricInterpretation === 'MONOCHROME1';
    const effectiveInvert = isMonochrome1 ? !viewportState.invert : viewportState.invert;

    const isCt = currentInstance.rescaleIntercept < -100 || 
                 currentInstance.rawTags['(0008,0060)']?.value === 'CT' || 
                 series?.modality === 'CT';

    // Use currentInstance calibrated window levels when viewportState has generic default or mismatched modality
    let wc = viewportState.windowCenter;
    let ww = Math.max(1, viewportState.windowWidth);

    if (isCt && (wc > 800 || wc < -900 || ww > 2500 || (wc === 2048 && ww === 4096))) {
      wc = currentInstance.windowCenter !== undefined ? currentInstance.windowCenter : 40;
      ww = currentInstance.windowWidth !== undefined ? currentInstance.windowWidth : 400;
    } else if (!isCt && (wc === 40 && ww === 400) && (currentInstance.windowCenter !== 40 || currentInstance.windowWidth !== 400)) {
      wc = currentInstance.windowCenter;
      ww = currentInstance.windowWidth;
    }

    const low = wc - 0.5 - (ww - 1) / 2;
    const high = wc - 0.5 + (ww - 1) / 2;

    const lutTable = getLutTable(viewportState.lut || 'grayscale');

    // Handle MIP / MinIP Slab Projection if enabled
    let effectiveHuData: Int16Array | Float32Array | null = huData;
    if (viewportState.mipMode && viewportState.mipMode !== 'none' && series && series.instances.length > 1) {
      const slab = Math.max(1, viewportState.mipSlabThickness || 1);
      if (slab > 1) {
        const halfSlab = Math.floor(slab / 2);
        const startIdx = Math.max(0, instanceIndex - halfSlab);
        const endIdx = Math.min(series.instances.length - 1, instanceIndex + halfSlab);

        const slabBuffer = new Int16Array(numPixels);
        if (viewportState.mipMode === 'mip') {
          slabBuffer.fill(-3000);
          for (let s = startIdx; s <= endIdx; s++) {
            const sInst = series.instances[s];
            const { huData: sHu } = getOrDecodeInstancePixels(sInst);
            if (sHu) {
              for (let i = 0; i < numPixels; i++) {
                if (sHu[i] > slabBuffer[i]) slabBuffer[i] = sHu[i];
              }
            }
          }
        } else if (viewportState.mipMode === 'minip') {
          slabBuffer.fill(3000);
          for (let s = startIdx; s <= endIdx; s++) {
            const sInst = series.instances[s];
            const { huData: sHu } = getOrDecodeInstancePixels(sInst);
            if (sHu) {
              for (let i = 0; i < numPixels; i++) {
                if (sHu[i] < slabBuffer[i]) slabBuffer[i] = sHu[i];
              }
            }
          }
        }
        effectiveHuData = slabBuffer;
      }
    }

    if (isRgb && pixelData) {
      for (let i = 0; i < numPixels; i++) {
        const srcIdx = i * 3;
        const pIdx = i * 4;
        data[pIdx] = pixelData[srcIdx] || 0;
        data[pIdx + 1] = pixelData[srcIdx + 1] || 0;
        data[pIdx + 2] = pixelData[srcIdx + 2] || 0;
        data[pIdx + 3] = 255;
      }
    } else {
      for (let i = 0; i < numPixels; i++) {
        const val = effectiveHuData ? effectiveHuData[i] : (pixelData ? pixelData[i] : 0);
        let gray: number;

        if (val <= low) {
          gray = 0;
        } else if (val >= high) {
          gray = 255;
        } else {
          gray = Math.round(((val - low) / ww) * 255);
        }

        if (effectiveInvert) {
          gray = 255 - gray;
        }

        // Apply Color Look-Up Table (LUT)
        const pIdx = i * 4;
        const lutIdx = gray * 3;
        data[pIdx] = lutTable[lutIdx];         // R
        data[pIdx + 1] = lutTable[lutIdx + 1]; // G
        data[pIdx + 2] = lutTable[lutIdx + 2]; // B
        data[pIdx + 3] = 255;                  // A
      }
    }

    const container = containerRef.current;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    ctx.translate(displayWidth / 2 + viewportState.pan.x, displayHeight / 2 + viewportState.pan.y);
    ctx.rotate((viewportState.rotation * Math.PI) / 180);
    ctx.scale(
      (viewportState.flipH ? -1 : 1) * viewportState.zoom,
      (viewportState.flipV ? -1 : 1) * viewportState.zoom
    );

    const fitScale = Math.min(displayWidth / width, displayHeight / height);
    ctx.scale(fitScale, fitScale);

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const tempCanvas = offscreenCanvasRef.current;
    if (tempCanvas.width !== width || tempCanvas.height !== height) {
      tempCanvas.width = width;
      tempCanvas.height = height;
    }
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: false });
    if (tempCtx) {
      tempCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = viewportState.zoom < 2.5;
      ctx.drawImage(tempCanvas, -width / 2, -height / 2);
    }

    ctx.restore();
  }, [currentInstance, viewportState, series, instanceIndex]);

  // Render Measurements & HUD Overlay Canvas
  const renderOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !containerRef.current) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (!currentInstance) {
      ctx.restore();
      return;
    }

    const measurements = viewportState.measurements.filter(
      m => m.instanceIndex === instanceIndex || m.instanceIndex === undefined
    );

    const allMeasurements = [...measurements];

    if (drawingPoints.length > 0) {
      allMeasurements.push({
        id: 'in_progress',
        instanceIndex,
        type: activeTool as any,
        points: [...drawingPoints, mousePos],
        isFinished: false
      });
    }

    for (const m of allMeasurements) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = m.color || '#38bdf8';
      ctx.fillStyle = m.color || '#38bdf8';
      ctx.font = '12px "JetBrains Mono", monospace';

      if (m.type === 'distance' && m.points.length >= 2) {
        const p1 = imageToScreenCoord(m.points[0].x, m.points[0].y);
        const p2 = imageToScreenCoord(m.points[1].x, m.points[1].y);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        drawCaliper(ctx, p1.x, p1.y);
        drawCaliper(ctx, p2.x, p2.y);

        const dx = (m.points[1].x - m.points[0].x) * currentInstance.pixelSpacing[1];
        const dy = (m.points[1].y - m.points[0].y) * currentInstance.pixelSpacing[0];
        const distMm = Math.sqrt(dx * dx + dy * dy);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2 - 8;
        drawTextBadge(ctx, `${distMm.toFixed(2)} mm`, midX, midY);
      } else if (m.type === 'angle' && m.points.length >= 2) {
        const pts = m.points.map(p => imageToScreenCoord(p.x, p.y));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        if (pts[2]) {
          ctx.lineTo(pts[2].x, pts[2].y);
        }
        ctx.stroke();

        if (m.points.length >= 3) {
          const v1x = m.points[0].x - m.points[1].x;
          const v1y = m.points[0].y - m.points[1].y;
          const v2x = m.points[2].x - m.points[1].x;
          const v2y = m.points[2].y - m.points[1].y;

          const dot = v1x * v2x + v1y * v2y;
          const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
          const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
          const angleRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
          const angleDeg = (angleRad * 180) / Math.PI;

          drawTextBadge(ctx, `${angleDeg.toFixed(1)}°`, pts[1].x + 10, pts[1].y - 10);
        }
      } else if (m.type === 'cobb_angle' && m.points.length >= 2) {
        const pts = m.points.map(p => imageToScreenCoord(p.x, p.y));
        
        // Line 1: Superior Endplate (P0 -> P1)
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        drawCaliper(ctx, pts[0].x, pts[0].y);
        drawCaliper(ctx, pts[1].x, pts[1].y);

        // Line 2: Inferior Endplate (P2 -> P3)
        if (pts.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.stroke();
          drawCaliper(ctx, pts[2].x, pts[2].y);
          drawCaliper(ctx, pts[3].x, pts[3].y);

          // Calculate Cobb Angle
          const theta1 = Math.atan2(m.points[1].y - m.points[0].y, m.points[1].x - m.points[0].x);
          const theta2 = Math.atan2(m.points[3].y - m.points[2].y, m.points[3].x - m.points[2].x);
          let diffRad = Math.abs(theta1 - theta2);
          if (diffRad > Math.PI) diffRad = 2 * Math.PI - diffRad;
          const cobbDeg = (diffRad * 180) / Math.PI;
          const acuteCobb = cobbDeg > 90 ? 180 - cobbDeg : cobbDeg;

          // Draw dashed extension guide lines
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(pts[1].x, pts[1].y);
          ctx.lineTo((pts[1].x + pts[3].x) / 2 + 50, (pts[1].y + pts[3].y) / 2);
          ctx.moveTo(pts[3].x, pts[3].y);
          ctx.lineTo((pts[1].x + pts[3].x) / 2 + 50, (pts[1].y + pts[3].y) / 2);
          ctx.stroke();
          ctx.restore();

          const labelX = (pts[1].x + pts[3].x) / 2 + 15;
          const labelY = (pts[1].y + pts[3].y) / 2;
          drawTextBadge(ctx, `Cobb: ${acuteCobb.toFixed(1)}°`, labelX, labelY);
        } else if (pts.length === 3) {
          ctx.beginPath();
          ctx.moveTo(pts[2].x, pts[2].y);
          ctx.lineTo(mousePos.x ? imageToScreenCoord(mousePos.x, mousePos.y).x : pts[2].x, mousePos.y ? imageToScreenCoord(mousePos.x, mousePos.y).y : pts[2].y);
          ctx.stroke();
        }
      } else if (m.type === 'rectangle_roi' && m.points.length >= 2) {
        const p1 = imageToScreenCoord(m.points[0].x, m.points[0].y);
        const p2 = imageToScreenCoord(m.points[1].x, m.points[1].y);

        const left = Math.min(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const w = Math.abs(p1.x - p2.x);
        const h = Math.abs(p1.y - p2.y);

        ctx.strokeRect(left, top, w, h);

        const roi = calculateRectangleRoi(m.points[0], m.points[1], currentInstance);
        if (roi) {
          const badge = `Area: ${roi.areaCm2.toFixed(2)} cm²\nMean: ${roi.meanHu.toFixed(1)} HU\nStdDev: ${roi.stdDevHu.toFixed(1)}\n[Min: ${roi.minHu} | Max: ${roi.maxHu}]`;
          drawMultiLineBadge(ctx, badge, left + w + 5, top + 15);
        }
      } else if (m.type === 'ellipse_roi' && m.points.length >= 2) {
        const p1 = imageToScreenCoord(m.points[0].x, m.points[0].y);
        const p2 = imageToScreenCoord(m.points[1].x, m.points[1].y);

        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p1.x - p2.x) / 2;
        const ry = Math.abs(p1.y - p2.y) / 2;

        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, 2 * Math.PI);
        ctx.stroke();

        const roi = calculateEllipseRoi(m.points[0], m.points[1], currentInstance);
        if (roi) {
          const badge = `Area: ${roi.areaCm2.toFixed(2)} cm²\nMean: ${roi.meanHu.toFixed(1)} HU\nStdDev: ${roi.stdDevHu.toFixed(1)}\n[Min: ${roi.minHu} | Max: ${roi.maxHu}]`;
          drawMultiLineBadge(ctx, badge, cx + rx + 5, cy);
        }
      } else if (m.type === 'hu_probe' && m.points.length >= 1) {
        const p = imageToScreenCoord(m.points[0].x, m.points[0].y);
        drawCrosshairMark(ctx, p.x, p.y);
        if (m.probeHu !== undefined) {
          const tissue = classifyTissueFromHu(m.probeHu);
          const badge = `${m.probeHu >= 0 ? '+' : ''}${m.probeHu} HU\n${tissue.name} (${tissue.arabic})`;
          drawMultiLineBadge(ctx, badge, p.x + 12, p.y - 12);
        }
      }
    }

    // Live HU Hover Probe Tooltip when active or hovering
    if (hoveredHu !== null && hoveredPixelCoord && activeTool === 'hu_probe') {
      const scr = imageToScreenCoord(hoveredPixelCoord.x, hoveredPixelCoord.y);
      drawCrosshairMark(ctx, scr.x, scr.y);
      const tissue = classifyTissueFromHu(hoveredHu);
      const liveBadge = `HU: ${hoveredHu >= 0 ? '+' : ''}${hoveredHu} [X:${hoveredPixelCoord.x}, Y:${hoveredPixelCoord.y}]\n${tissue.name} (${tissue.arabic})`;
      drawMultiLineBadge(ctx, liveBadge, scr.x + 15, scr.y - 15);
    }

    ctx.restore();
  }, [currentInstance, viewportState, drawingPoints, mousePos, instanceIndex, activeTool, imageToScreenCoord, hoveredHu, hoveredPixelCoord]);

  useEffect(() => {
    renderDicom();
    renderOverlay();
  }, [renderDicom, renderOverlay]);

  const handleMouseDown = (e: React.MouseEvent) => {
    onActivate();
    e.preventDefault();

    const screenX = e.clientX;
    const screenY = e.clientY;
    const btn = e.button;

    setIsDragging(true);
    setDragButton(btn);
    setDragStart({ x: screenX, y: screenY });
    setInitialPan({ ...viewportState.pan });
    setInitialWc(viewportState.windowCenter);
    setInitialWw(viewportState.windowWidth);
    setInitialZoom(viewportState.zoom);

    const imgCoord = screenToImageCoord(screenX, screenY);

    if (btn === 0) {
      if (activeTool === 'distance' || activeTool === 'rectangle_roi' || activeTool === 'ellipse_roi') {
        setDrawingPoints([imgCoord]);
        setMousePos(imgCoord);
      } else if (activeTool === 'angle') {
        if (drawingPoints.length === 0) {
          setDrawingPoints([imgCoord]);
        } else if (drawingPoints.length === 1) {
          setDrawingPoints([drawingPoints[0], imgCoord]);
        } else if (drawingPoints.length === 2) {
          const finalPts = [drawingPoints[0], drawingPoints[1], imgCoord];
          onAddMeasurement({
            id: `angle_${Date.now()}`,
            instanceIndex,
            type: 'angle',
            points: finalPts,
            isFinished: true
          });
          setDrawingPoints([]);
        }
      } else if (activeTool === 'cobb_angle') {
        if (drawingPoints.length === 0) {
          setDrawingPoints([imgCoord]);
        } else if (drawingPoints.length === 1) {
          setDrawingPoints([drawingPoints[0], imgCoord]);
        } else if (drawingPoints.length === 2) {
          setDrawingPoints([drawingPoints[0], drawingPoints[1], imgCoord]);
        } else if (drawingPoints.length === 3) {
          const finalPts = [drawingPoints[0], drawingPoints[1], drawingPoints[2], imgCoord];
          onAddMeasurement({
            id: `cobb_${Date.now()}`,
            instanceIndex,
            type: 'cobb_angle',
            points: finalPts,
            isFinished: true
          });
          setDrawingPoints([]);
        }
      } else if (activeTool === 'hu_probe') {
        const hu = getHuAtCoord(imgCoord.x, imgCoord.y, currentInstance);
        const tissue = classifyTissueFromHu(hu);
        onAddMeasurement({
          id: `probe_${Date.now()}`,
          instanceIndex,
          type: 'hu_probe',
          points: [imgCoord],
          probeHu: hu,
          probeCoord: { x: Math.round(imgCoord.x), y: Math.round(imgCoord.y) },
          tissueName: `${tissue.name} (${tissue.arabic})`,
          isFinished: true
        });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const screenX = e.clientX;
    const screenY = e.clientY;
    const imgCoord = screenToImageCoord(screenX, screenY);

    setMousePos(imgCoord);

    if (currentInstance) {
      const hu = getHuAtCoord(imgCoord.x, imgCoord.y, currentInstance);
      setHoveredHu(hu);
      setHoveredPixelCoord({ x: Math.round(imgCoord.x), y: Math.round(imgCoord.y) });
    }

    if (!isDragging) {
      renderOverlay();
      return;
    }

    const dx = screenX - dragStart.x;
    const dy = screenY - dragStart.y;

    if (dragButton === 2 || (dragButton === 0 && activeTool === 'ww_wl')) {
      const sensitivity = Math.max(1, viewportState.windowWidth / 200);
      const newWw = Math.max(1, Math.round(initialWw + dx * sensitivity));
      const newWc = Math.round(initialWc - dy * sensitivity);
      onUpdateState({ windowWidth: newWw, windowCenter: newWc });
    } else if (dragButton === 1 || (dragButton === 0 && activeTool === 'pan')) {
      onUpdateState({
        pan: {
          x: initialPan.x + dx,
          y: initialPan.y + dy
        }
      });
    } else if (dragButton === 0 && activeTool === 'zoom') {
      const factor = Math.exp(-dy * 0.01);
      const newZoom = Math.max(0.2, Math.min(20, initialZoom * factor));
      onUpdateState({ zoom: newZoom });
    } else if (dragButton === 0 && drawingPoints.length > 0) {
      renderOverlay();
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const screenX = e.clientX;
    const screenY = e.clientY;
    const imgCoord = screenToImageCoord(screenX, screenY);

    if (dragButton === 0) {
      if ((activeTool === 'distance' || activeTool === 'rectangle_roi' || activeTool === 'ellipse_roi') && drawingPoints.length === 1) {
        const p1 = drawingPoints[0];
        const p2 = imgCoord;

        if (Math.abs(p1.x - p2.x) > 2 || Math.abs(p1.y - p2.y) > 2) {
          const measurement: Measurement = {
            id: `m_${Date.now()}`,
            instanceIndex,
            type: activeTool,
            points: [p1, p2],
            isFinished: true
          };

          if (activeTool === 'rectangle_roi' || activeTool === 'ellipse_roi') {
            measurement.roiValues = calculateRectangleRoi(p1, p2, currentInstance);
          }

          onAddMeasurement(measurement);
        }
        setDrawingPoints([]);
      }
    }

    setDragButton(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!series || series.instances.length <= 1) return;

    const delta = e.deltaY > 0 ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(series.instances.length - 1, viewportState.instanceIndex + delta));

    if (nextIdx !== viewportState.instanceIndex) {
      onUpdateState({ instanceIndex: nextIdx });
    }
  };

  const getCursorClass = () => {
    switch (activeTool) {
      case 'ww_wl': return 'cursor-ww-wl';
      case 'pan': return 'cursor-pan-medical';
      case 'zoom': return 'cursor-zoom-medical';
      case 'distance':
      case 'angle':
      case 'rectangle_roi':
      case 'ellipse_roi':
      case 'cobb_angle': return 'cursor-crosshair-medical';
      case 'hu_probe': return 'cursor-probe-medical';
      default: return 'cursor-default';
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative w-full h-full bg-black overflow-hidden select-none flex flex-col ${
        isActive ? 'viewport-active-border' : 'viewport-inactive-border'
      } ${getCursorClass()}`}
    >
      {/* 1. Underlying DICOM Render Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 2. Overlay Canvas for Measurements */}
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* 3. RadiAnt HUD Corner Text Overlays */}
      {currentInstance && (
        <>
          {/* Top-Left: Patient Metadata */}
          <div className="absolute top-2.5 left-3 text-left radiant-overlay-text text-slate-100 z-10">
            <div className="font-bold text-amber-300 text-xs">
              {(study?.patientName || 'Anonymous').replace(/\^/g, ' ')}
            </div>
            <div>ID: {study?.patientId || 'NO_ID'}</div>
            <div className="text-slate-300">
              {study?.patientSex || 'N/A'} {study?.patientAge ? `(${study.patientAge})` : ''}
            </div>
            <div className="text-[10.5px] text-cyan-300 mt-0.5">
              {study?.studyDescription || 'Medical Study'}
            </div>
          </div>

          {/* Top-Right: Hospital & Acquisition */}
          <div className="absolute top-2.5 right-3 text-right radiant-overlay-text text-slate-100 z-10">
            <div className="font-bold text-cyan-400">
              {series?.modality || 'OT'} | {series?.seriesDescription || `Series ${series?.seriesNumber || 1}`}
            </div>
            <div>{study?.studyDate ? formatDisplayDate(study.studyDate) : '2026-08-19'}</div>
            <div className="text-slate-400 font-mono">
              FOV: {(currentInstance.columns * currentInstance.pixelSpacing[1]).toFixed(0)}mm
            </div>
          </div>

          {/* Bottom-Left: Slice Position & Zoom */}
          <div className="absolute bottom-2.5 left-3 text-left radiant-overlay-text text-slate-100 z-10">
            <div className="radiant-overlay-yellow font-bold">
              Im: {instanceIndex + 1} / {series?.instances?.length || 1}
            </div>
            <div>
              Loc: {currentInstance.sliceLocation !== undefined ? `${currentInstance.sliceLocation.toFixed(1)} mm` : '-'}
            </div>
            <div>
              Thick: {currentInstance.sliceThickness ? `${currentInstance.sliceThickness.toFixed(1)} mm` : '-'}
            </div>
            <div className="text-cyan-300 font-mono">
              Zoom: {Math.round(viewportState.zoom * 100)}%
            </div>
          </div>

          {/* Bottom-Right: Window Center / Width & Live HU Probe */}
          <div className="absolute bottom-2.5 right-3 text-right radiant-overlay-text text-slate-100 z-10">
            <div className="radiant-overlay-green font-mono font-bold">
              WL: {viewportState.windowCenter} WW: {viewportState.windowWidth}
            </div>
            {hoveredHu !== null && hoveredPixelCoord && (
              <div className="text-rose-400 font-mono font-semibold">
                HU: {hoveredHu} (X:{hoveredPixelCoord.x}, Y:{hoveredPixelCoord.y})
              </div>
            )}
            <div className="text-[10px] text-slate-400 font-mono">
              Matrix: {currentInstance.columns}x{currentInstance.rows} (16-bit)
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Canvas drawing helper primitives
function drawCaliper(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 4);
  ctx.lineTo(x + 4, y + 4);
  ctx.moveTo(x + 4, y - 4);
  ctx.lineTo(x - 4, y + 4);
  ctx.stroke();
  ctx.restore();
}

function drawCrosshairMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x + 9, y);
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x, y + 9);
  ctx.stroke();
  ctx.restore();
}

function drawTextBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.font = '11px "JetBrains Mono", monospace';
  const width = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(x - 4, y - 11, width + 8, 16);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, y - 11, width + 8, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawMultiLineBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.font = '11px "JetBrains Mono", monospace';
  const lines = text.split('\n');
  const lineHeight = 14;
  const padding = 6;

  let maxW = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(x - padding, y - padding, maxW + padding * 2, lines.length * lineHeight + padding * 2);

  ctx.strokeStyle = '#0284c7';
  ctx.strokeRect(x - padding, y - padding, maxW + padding * 2, lines.length * lineHeight + padding * 2);

  ctx.fillStyle = '#e2e8f0';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + (i + 1) * lineHeight - 2);
  }
  ctx.restore();
}

function getHuAtCoord(x: number, y: number, instance?: DicomInstance): number {
  if (!instance) return 0;
  const { huData } = getOrDecodeInstancePixels(instance);
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= instance.columns || iy < 0 || iy >= instance.rows) return -1000;
  return huData[iy * instance.columns + ix] || 0;
}

function calculateRectangleRoi(p1: Point2D, p2: Point2D, instance?: DicomInstance) {
  if (!instance) return null;
  const { huData } = getOrDecodeInstancePixels(instance);
  if (!huData) return null;

  const minX = Math.max(0, Math.min(instance.columns - 1, Math.floor(Math.min(p1.x, p2.x))));
  const maxX = Math.max(0, Math.min(instance.columns - 1, Math.floor(Math.max(p1.x, p2.x))));
  const minY = Math.max(0, Math.min(instance.rows - 1, Math.floor(Math.min(p1.y, p2.y))));
  const maxY = Math.max(0, Math.min(instance.rows - 1, Math.floor(Math.max(p1.y, p2.y))));

  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * instance.columns;
    for (let x = minX; x <= maxX; x++) {
      const hu = huData[rowOffset + x];
      sum += hu;
      count++;
      if (hu < min) min = hu;
      if (hu > max) max = hu;
    }
  }

  if (count === 0) return null;

  const mean = sum / count;

  let varSum = 0;
  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * instance.columns;
    for (let x = minX; x <= maxX; x++) {
      const hu = huData[rowOffset + x];
      varSum += Math.pow(hu - mean, 2);
    }
  }
  const stdDev = Math.sqrt(varSum / count);

  const rowSpacing = instance.pixelSpacing?.[0] || 1;
  const colSpacing = instance.pixelSpacing?.[1] || 1;
  const areaMm2 = count * rowSpacing * colSpacing;
  const areaCm2 = areaMm2 / 100;

  return {
    areaMm2,
    areaCm2,
    meanHu: mean,
    minHu: min === Infinity ? 0 : min,
    maxHu: max === -Infinity ? 0 : max,
    stdDevHu: stdDev
  };
}

function calculateEllipseRoi(p1: Point2D, p2: Point2D, instance?: DicomInstance) {
  if (!instance) return null;
  const { huData } = getOrDecodeInstancePixels(instance);
  if (!huData) return null;

  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const rx = Math.max(0.5, Math.abs(p1.x - p2.x) / 2);
  const ry = Math.max(0.5, Math.abs(p1.y - p2.y) / 2);

  const minX = Math.max(0, Math.min(instance.columns - 1, Math.floor(cx - rx)));
  const maxX = Math.max(0, Math.min(instance.columns - 1, Math.ceil(cx + rx)));
  const minY = Math.max(0, Math.min(instance.rows - 1, Math.floor(cy - ry)));
  const maxY = Math.max(0, Math.min(instance.rows - 1, Math.ceil(cy + ry)));

  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * instance.columns;
    const dy = (y - cy) / ry;
    const dySq = dy * dy;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dySq <= 1.0) {
        const hu = huData[rowOffset + x];
        sum += hu;
        count++;
        if (hu < min) min = hu;
        if (hu > max) max = hu;
      }
    }
  }

  if (count === 0) return null;

  const mean = sum / count;

  let varSum = 0;
  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * instance.columns;
    const dy = (y - cy) / ry;
    const dySq = dy * dy;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dySq <= 1.0) {
        const hu = huData[rowOffset + x];
        varSum += Math.pow(hu - mean, 2);
      }
    }
  }
  const stdDev = Math.sqrt(varSum / count);

  const rowSpacing = instance.pixelSpacing?.[0] || 1;
  const colSpacing = instance.pixelSpacing?.[1] || 1;
  const areaMm2 = count * rowSpacing * colSpacing;
  const areaCm2 = areaMm2 / 100;

  return {
    areaMm2,
    areaCm2,
    meanHu: mean,
    minHu: min === Infinity ? 0 : min,
    maxHu: max === -Infinity ? 0 : max,
    stdDevHu: stdDev
  };
}

function formatDisplayDate(d: string): string {
  if (d.length === 8) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return d;
}
