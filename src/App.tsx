import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { SeriesSidebar } from './components/SeriesSidebar';
import { ViewportGrid } from './components/ViewportGrid';
import { MprViewportView } from './components/MprViewportView';
import { PacsManagerModal } from './components/PacsManagerModal';
import { DicomDirModal } from './components/DicomDirModal';
import { DicomTagModal } from './components/DicomTagModal';
import { ExportModal } from './components/ExportModal';
import { AboutModal } from './components/AboutModal';
import { Volume3dModal } from './components/Volume3dModal';
import { KeyImagesModal } from './components/KeyImagesModal';
import { ReportGeneratorModal } from './components/ReportGeneratorModal';
import { SettingsModal } from './components/SettingsModal';
import { BottomStatusBar } from './components/BottomStatusBar';
import { ShortcutsModal } from './components/ShortcutsModal';
import JSZip from 'jszip';

import {
  DicomInstance,
  DicomSeries,
  DicomStudy,
  GridLayout,
  ImageFilterType,
  KeyImageBookmark,
  Measurement,
  Point2D,
  SyncMode,
  ToolType,
  ViewportState,
  PacsDownloadState,
  PacsSearchResult
} from './types/dicom';
import { parseDicomBufferFast, groupInstancesIntoStudies, isDicomBuffer } from './services/dicomParser';
import { detectAnatomicalPlane, findMainVolumetricSeries, isTopogramOrSingleSlice, isEligibleForMpr } from './services/mprEngine';
import { PacsService } from './services/pacsClient';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  // Studies and series collections
  const [studies, setStudies] = useState<DicomStudy[]>([]);
  const [activeStudyUid, setActiveStudyUid] = useState<string | null>(null);
  const [activeSeriesUid, setActiveSeriesUid] = useState<string | null>(null);
  const [pacsDownloadState, setPacsDownloadState] = useState<PacsDownloadState | null>(null);

  // Tool & layout states
  const [activeTool, setActiveTool] = useState<ToolType>('ww_wl');
  const [gridLayout, setGridLayout] = useState<GridLayout>('1x1');
  const [activeViewportId, setActiveViewportId] = useState<string>('vp_0');
  const [isMprActive, setIsMprActive] = useState<boolean>(false);
  const [mprInitialLayout, setMprInitialLayout] = useState<'2x2' | '3-view' | 'coronal-only' | 'axial-only' | 'sagittal-only'>('2x2');
  const [syncMode, setSyncMode] = useState<SyncMode>('location');

  // Key image bookmarks
  const [bookmarks, setBookmarks] = useState<KeyImageBookmark[]>([]);

  // UI Panels and Modals
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPacsModalOpen, setIsPacsModalOpen] = useState<boolean>(false);
  const [isDicomDirModalOpen, setIsDicomDirModalOpen] = useState<boolean>(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState<boolean>(false);
  const [isKeyImagesModalOpen, setIsKeyImagesModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [is3dModalOpen, setIs3dModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);

  // Streaming Background Loading State
  const [loadingStatus, setLoadingStatus] = useState<{
    loaded: number;
    total: number;
    percent: number;
    message: string;
  } | null>(null);

  // Status Notification Banner
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleToggleOverlays = () => {
    setShowOverlays(prev => {
      const next = !prev;
      setViewports(vps => vps.map(v => ({ ...v, showOverlays: next })));
      showNotification(next ? 'Medical HUD text overlays enabled' : 'Clean view enabled (HUD hidden)');
      return next;
    });
  };

  // Hidden File Inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Initialize 9 Viewport Slots
  const [viewports, setViewports] = useState<ViewportState[]>(() => {
    return Array.from({ length: 9 }, (_, i) => ({
      id: `vp_${i}`,
      studyUid: null,
      seriesUid: null,
      instanceIndex: 0,
      windowCenter: 40,
      windowWidth: 400,
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      rotation: 0,
      flipH: false,
      flipV: false,
      invert: false,
      lut: 'grayscale',
      mipMode: 'none',
      mipSlabThickness: 1,
      cinePlaying: false,
      cineFps: 15,
      measurements: [],
      isSyncLocked: true
    }));
  });

  const activeStudy = studies.find(s => s.studyInstanceUid === activeStudyUid) || studies[0] || null;
  const activeSeries = activeStudy?.series.find(s => s.seriesInstanceUid === activeSeriesUid) || activeStudy?.series[0] || null;

  const currentViewport = viewports.find(v => v.id === activeViewportId) || viewports[0];
  const activeInstanceIndex = currentViewport?.instanceIndex || 0;
  const activeInstance = activeSeries?.instances[activeInstanceIndex];

  const handleUpdateViewportState = useCallback((id: string, updates: Partial<ViewportState>) => {
    setViewports(prev => {
      const sourceVp = prev.find(v => v.id === id);
      if (!sourceVp) return prev;

      const isSourceSyncLocked = sourceVp.isSyncLocked ?? true;
      const isSyncActive = isSourceSyncLocked && syncMode !== 'none';

      // Helper to resolve study and series for any viewport
      const resolveViewport = (vp: ViewportState) => {
        let study = studies.find(s => s.studyInstanceUid === vp.studyUid);
        if (!study && vp.seriesUid) {
          study = studies.find(s => s.series.some(ser => ser.seriesInstanceUid === vp.seriesUid));
        }
        if (!study) {
          study = studies.find(s => s.studyInstanceUid === activeStudyUid) || studies[0] || null;
        }

        let series: DicomSeries | null = null;
        if (study) {
          series = study.series.find(s => s.seriesInstanceUid === vp.seriesUid) || null;
        }
        if (!series && vp.seriesUid) {
          for (const s of studies) {
            const found = s.series.find(ser => ser.seriesInstanceUid === vp.seriesUid);
            if (found) {
              study = s;
              series = found;
              break;
            }
          }
        }
        if (!series && study && study.series.length > 0) {
          series = study.series[0];
        }

        return { study, series };
      };

      // Multi-Viewport Cross-Series Synchronized Scrolling & Pan/Zoom for locked viewports
      if (isSyncActive) {
        // 1. Synchronized Scrolling
        if (updates.instanceIndex !== undefined && updates.instanceIndex !== sourceVp.instanceIndex) {
          const targetInstIdx = updates.instanceIndex;
          const { series: srcSeries } = resolveViewport(sourceVp);
          const srcInst = srcSeries?.instances[targetInstIdx] || srcSeries?.instances[0];

          return prev.map(vp => {
            if (vp.id === id) return { ...vp, ...updates };
            if ((vp.isSyncLocked ?? true) === false) return vp; // Exclude user-unlinked viewports

            const { series: vpSeries } = resolveViewport(vp);
            if (!vpSeries || vpSeries.instances.length <= 1) return vp;

            // Scout / Topogram / Single-slice series should NEVER scroll with volumetric series
            if (isTopogramOrSingleSlice(vpSeries)) return vp;

            // Case A: Identical Series in both viewports (e.g. Bone Window vs Soft Tissue Window)
            const vpSeriesUid = vp.seriesUid || vpSeries.seriesInstanceUid;
            const srcSeriesUid = sourceVp.seriesUid || srcSeries?.seriesInstanceUid;
            if (vpSeriesUid && srcSeriesUid && vpSeriesUid === srcSeriesUid) {
              const clampedIdx = Math.max(0, Math.min(vpSeries.instances.length - 1, targetInstIdx));
              return { ...vp, instanceIndex: clampedIdx };
            }

            // Case B: Cross-Series Sync
            if (!srcSeries || srcSeries.instances.length <= 1) return vp;

            const vpCurrentInst = vpSeries.instances[vp.instanceIndex || 0] || vpSeries.instances[0];

            // Compute slice normal vectors from Image Orientation Patient (0020,0037) or anatomical planes
            const getNormal = (inst?: DicomInstance, ser?: DicomSeries | null): [number, number, number] | null => {
              const iop = inst?.imageOrientationPatient || ser?.instances[0]?.imageOrientationPatient;
              if (iop && iop.length >= 6) {
                const [rx, ry, rz, cx, cy, cz] = iop;
                const nx = ry * cz - rz * cy;
                const ny = rz * cx - rx * cz;
                const nz = rx * cy - ry * cx;
                const len = Math.hypot(nx, ny, nz);
                if (len > 1e-5) return [nx / len, ny / len, nz / len];
              }

              // Fallback: estimate normal vector based on detected plane
              const plane = detectAnatomicalPlane(ser?.seriesDescription || '', iop);
              if (plane === 'AXIAL') return [0, 0, 1];
              if (plane === 'CORONAL') return [0, 1, 0];
              if (plane === 'SAGITTAL') return [1, 0, 0];

              return null;
            };

            const srcNormal = getNormal(srcInst, srcSeries);
            const vpNormal = getNormal(vpCurrentInst, vpSeries);

            const srcPlane = detectAnatomicalPlane(srcSeries?.seriesDescription, srcInst?.imageOrientationPatient || srcSeries?.instances[0]?.imageOrientationPatient);
            const vpPlane = detectAnatomicalPlane(vpSeries?.seriesDescription, vpCurrentInst?.imageOrientationPatient || vpSeries?.instances[0]?.imageOrientationPatient);

            let isParallel = false;
            if (srcNormal && vpNormal) {
              const dot = Math.abs(srcNormal[0] * vpNormal[0] + srcNormal[1] * vpNormal[1] + srcNormal[2] * vpNormal[2]);
              isParallel = dot >= 0.80; // Parallel planes (angle <= ~36 deg)
            } else if (srcPlane && vpPlane) {
              isParallel = srcPlane === vpPlane;
            }

            // CRITICAL: If planes are NOT parallel (e.g. Axial vs Sagittal, Axial vs Coronal),
            // they MUST NOT scroll together! Return vp unchanged so it NEVER jumps to slice 0 or last slice!
            if (!isParallel) {
              return vp;
            }

            // Parallel planes: synchronize slice position
            if (syncMode === 'index') {
              const srcTotal = srcSeries.instances.length;
              if (srcTotal <= 1) return vp;
              const ratio = targetInstIdx / Math.max(1, srcTotal - 1);
              const syncedIdx = Math.max(0, Math.min(vpSeries.instances.length - 1, Math.round(ratio * (vpSeries.instances.length - 1))));
              return { ...vp, instanceIndex: syncedIdx };
            } else {
              // Location Sync: Physical millimeter projection along slice normal
              if (srcInst?.imagePositionPatient && srcNormal) {
                const srcPosAlongNormal =
                  srcInst.imagePositionPatient[0] * srcNormal[0] +
                  srcInst.imagePositionPatient[1] * srcNormal[1] +
                  srcInst.imagePositionPatient[2] * srcNormal[2];

                let closestIdx = -1;
                let minDiff = Infinity;

                vpSeries.instances.forEach((inst, idx) => {
                  if (inst.imagePositionPatient) {
                    const posAlongNormal =
                      inst.imagePositionPatient[0] * srcNormal[0] +
                      inst.imagePositionPatient[1] * srcNormal[1] +
                      inst.imagePositionPatient[2] * srcNormal[2];
                    const diff = Math.abs(posAlongNormal - srcPosAlongNormal);
                    if (diff < minDiff) {
                      minDiff = diff;
                      closestIdx = idx;
                    }
                  }
                });

                if (closestIdx !== -1 && minDiff !== Infinity) {
                  return { ...vp, instanceIndex: closestIdx };
                }
              }

              // Fallback: sliceLocation tag
              const srcLoc = srcInst?.sliceLocation;
              if (srcLoc !== undefined) {
                let closestIdx = -1;
                let minDiff = Infinity;
                vpSeries.instances.forEach((inst, idx) => {
                  if (inst.sliceLocation !== undefined) {
                    const diff = Math.abs(inst.sliceLocation - srcLoc);
                    if (diff < minDiff) {
                      minDiff = diff;
                      closestIdx = idx;
                    }
                  }
                });

                if (closestIdx !== -1 && minDiff !== Infinity) {
                  return { ...vp, instanceIndex: closestIdx };
                }
              }

              // Fallback ONLY if parallel and srcSeries has multiple instances
              const srcTotal = srcSeries.instances.length;
              if (srcTotal > 1) {
                const ratio = targetInstIdx / (srcTotal - 1);
                const syncedIdx = Math.max(0, Math.min(vpSeries.instances.length - 1, Math.round(ratio * (vpSeries.instances.length - 1))));
                return { ...vp, instanceIndex: syncedIdx };
              }

              return vp;
            }
          });
        }

        // 2. Synchronized Zoom and Pan
        if (updates.zoom !== undefined || updates.pan !== undefined) {
          return prev.map(vp => {
            if (vp.id === id) return { ...vp, ...updates };
            if ((vp.isSyncLocked ?? true) === false) return vp;
            return {
              ...vp,
              ...(updates.zoom !== undefined ? { zoom: updates.zoom } : {}),
              ...(updates.pan !== undefined ? { pan: updates.pan } : {})
            };
          });
        }
      }

      return prev.map(vp => (vp.id === id ? { ...vp, ...updates } : vp));
    });
  }, [syncMode, studies, activeStudyUid]);

  const updateActiveViewport = useCallback((updates: Partial<ViewportState>) => {
    handleUpdateViewportState(activeViewportId, updates);
  }, [activeViewportId, handleUpdateViewportState]);

  const handleBookmarkCurrentSlice = useCallback(() => {
    if (!activeStudy || !activeSeries || !activeInstance) {
      showNotification('No active DICOM image to bookmark');
      return;
    }

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const snapshot = canvas ? canvas.toDataURL('image/jpeg', 0.85) : '';

    const newBookmark: KeyImageBookmark = {
      id: `bm_${Date.now()}`,
      studyInstanceUid: activeStudy.studyInstanceUid,
      seriesInstanceUid: activeSeries.seriesInstanceUid,
      instanceIndex: activeInstanceIndex,
      sopInstanceUid: activeInstance.sopInstanceUid,
      patientName: activeStudy.patientName.replace(/\^/g, ' '),
      patientId: activeStudy.patientId,
      studyDescription: activeStudy.studyDescription,
      seriesDescription: activeSeries.seriesDescription,
      sliceLocation: activeInstance.sliceLocation,
      timestamp: Date.now(),
      notes: '',
      snapshotDataUrl: snapshot,
      measurementsCount: currentViewport.measurements.filter(
        m => m.instanceIndex === activeInstanceIndex || m.instanceIndex === undefined
      ).length
    };

    setBookmarks(prev => [newBookmark, ...prev]);
    showNotification(`📌 Slice #${activeInstanceIndex + 1} bookmarked to Key Images.`);
  }, [activeStudy, activeSeries, activeInstance, activeInstanceIndex, currentViewport]);

  const handleDeleteBookmark = (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
    showNotification('Bookmark removed.');
  };

  const handleUpdateBookmarkNotes = (id: string, notes: string) => {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, notes } : b));
  };

  const handleSelectStudy = (study: DicomStudy) => {
    setActiveStudyUid(study.studyInstanceUid);
    const targetSer = findMainVolumetricSeries(study) || study.series[0];
    const targetSerUid = targetSer ? targetSer.seriesInstanceUid : null;
    setActiveSeriesUid(targetSerUid);

    // 1. Reset tool, layout & display modes to fresh application defaults
    setGridLayout('1x1');
    setActiveViewportId('vp_0');
    setIsMprActive(false);
    setActiveTool('ww_wl');
    setSyncMode('location');
    setShowOverlays(true);

    // 2. Clear old study bookmarks / key images
    setBookmarks(prev => prev.filter(b => b.studyInstanceUid === study.studyInstanceUid));

    // 3. Reset all 9 viewport slots cleanly:
    // Only vp_0 is loaded with the new study's main series; vp_1 through vp_8 are completely cleared
    const firstInst = targetSer?.instances[0];
    const isCt = targetSer?.modality === 'CT' || (firstInst?.rescaleIntercept !== undefined && firstInst.rescaleIntercept < -100);
    const defWc = firstInst?.windowCenter !== undefined ? firstInst.windowCenter : (isCt ? 40 : 128);
    const defWw = firstInst?.windowWidth !== undefined ? firstInst.windowWidth : (isCt ? 400 : 256);

    setViewports(() => {
      return Array.from({ length: 9 }, (_, i) => ({
        id: `vp_${i}`,
        studyUid: i === 0 ? study.studyInstanceUid : null,
        seriesUid: i === 0 ? targetSerUid : null,
        instanceIndex: 0,
        windowCenter: i === 0 ? defWc : 40,
        windowWidth: i === 0 ? defWw : 400,
        zoom: 1.0,
        pan: { x: 0, y: 0 },
        rotation: 0,
        flipH: false,
        flipV: false,
        invert: false,
        lut: 'grayscale',
        filter: 'none',
        mipMode: 'none',
        mipSlabThickness: 1,
        cinePlaying: false,
        cineFps: 15,
        measurements: [],
        isSyncLocked: true,
        showOverlays: true
      }));
    });
  };

  const handleSelectSeries = (series: DicomSeries) => {
    setActiveSeriesUid(series.seriesInstanceUid);
    // If user selects an SR (Structured Report), scout, or non-volumetric series while in MPR,
    // smoothly switch to 2D view so the report / image is displayed properly
    if (isMprActive && !isEligibleForMpr(series)) {
      setIsMprActive(false);
    }
    const firstInst = series.instances[0];
    const isCt = series.modality === 'CT' || (firstInst?.rescaleIntercept !== undefined && firstInst.rescaleIntercept < -100);
    const defWc = isCt ? 40 : 128;
    const defWw = isCt ? 400 : 256;

    updateActiveViewport({
      studyUid: series.studyInstanceUid || activeStudyUid,
      seriesUid: series.seriesInstanceUid,
      instanceIndex: 0,
      windowCenter: firstInst?.windowCenter !== undefined ? firstInst.windowCenter : defWc,
      windowWidth: firstInst?.windowWidth !== undefined ? firstInst.windowWidth : defWw,
      zoom: 1.0,
      pan: { x: 0, y: 0 }
    });
  };

  const handleDropSeriesOnViewport = (viewportId: string, series: DicomSeries, study: DicomStudy) => {
    const firstInst = series.instances[0];
    const isCt = series.modality === 'CT' || (firstInst?.rescaleIntercept !== undefined && firstInst.rescaleIntercept < -100);
    const defWc = isCt ? 40 : 128;
    const defWw = isCt ? 400 : 256;

    handleUpdateViewportState(viewportId, {
      studyUid: study.studyInstanceUid,
      seriesUid: series.seriesInstanceUid,
      instanceIndex: 0,
      windowCenter: firstInst?.windowCenter !== undefined ? firstInst.windowCenter : defWc,
      windowWidth: firstInst?.windowWidth !== undefined ? firstInst.windowWidth : defWw,
      zoom: 1.0,
      pan: { x: 0, y: 0 }
    });
    setActiveViewportId(viewportId);
    setActiveStudyUid(study.studyInstanceUid);
    setActiveSeriesUid(series.seriesInstanceUid);
  };

  const handleDragSeriesStart = (e: React.DragEvent, series: DicomSeries) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      studyUid: series.studyInstanceUid,
      seriesUid: series.seriesInstanceUid
    }));
  };

  const handleStartPacsRetrieve = async (result: PacsSearchResult) => {
    setPacsDownloadState({
      isDownloading: true,
      studyUid: result.studyInstanceUid,
      patientName: result.patientName,
      downloadedSlices: 0,
      totalSlices: result.numberOfInstances > 1 ? result.numberOfInstances : undefined,
      statusMessage: `Connecting to PACS for ${result.patientName}...`
    });

    try {
      const study = await PacsService.retrieveStudy(
        result,
        (progress, msg) => {
          setPacsDownloadState(prev => prev ? { ...prev, statusMessage: msg } : null);
        },
        (initialStudy) => {
          setStudies(prev => {
            const exists = prev.some(s => s.studyInstanceUid === initialStudy.studyInstanceUid);
            if (exists) {
              return prev.map(s => s.studyInstanceUid === initialStudy.studyInstanceUid ? initialStudy : s);
            }
            return [initialStudy, ...prev];
          });
          handleSelectStudy(initialStudy);
        },
        (updatedStudy) => {
          setStudies(prev => {
            const exists = prev.some(s => s.studyInstanceUid === updatedStudy.studyInstanceUid);
            if (exists) {
              return prev.map(s => s.studyInstanceUid === updatedStudy.studyInstanceUid ? updatedStudy : s);
            }
            return [updatedStudy, ...prev];
          });
        },
        true, // forceRefresh = true to ensure complete clean retrieval
        (current, total) => {
          setPacsDownloadState(prev => prev ? {
            ...prev,
            downloadedSlices: current,
            totalSlices: total || prev.totalSlices
          } : null);
        }
      );

      setStudies(prev => {
        const exists = prev.some(s => s.studyInstanceUid === study.studyInstanceUid);
        if (exists) {
          return prev.map(s => s.studyInstanceUid === study.studyInstanceUid ? study : s);
        }
        return [study, ...prev];
      });
      handleSelectStudy(study);

      const totalRetrieved = study.series.reduce((sum, s) => sum + s.instances.length, 0);
      setPacsDownloadState(prev => prev ? {
        ...prev,
        isDownloading: false,
        isComplete: true,
        downloadedSlices: totalRetrieved,
        totalSlices: totalRetrieved
      } : null);

      setTimeout(() => {
        setPacsDownloadState(prev => prev?.isComplete ? null : prev);
      }, 5000);
    } catch (err: any) {
      console.error('PACS retrieve error:', err);
      setPacsDownloadState(prev => prev ? {
        ...prev,
        isDownloading: false,
        statusMessage: `Download failed: ${err.message || err}`
      } : null);
    }
  };

  // Image Transformations
  const handleRotate = () => {
    updateActiveViewport({ rotation: (currentViewport.rotation + 90) % 360 });
  };

  const handleFlipH = () => {
    updateActiveViewport({ flipH: !currentViewport.flipH });
  };

  const handleFlipV = () => {
    updateActiveViewport({ flipV: !currentViewport.flipV });
  };

  const handleInvert = () => {
    updateActiveViewport({ invert: !currentViewport.invert });
  };

  const handleApplyWindowPreset = (wc: number, ww: number) => {
    updateActiveViewport({ windowCenter: wc, windowWidth: ww });
  };

  const handleClearMeasurements = () => {
    updateActiveViewport({ measurements: [] });
  };

  const handleAddMeasurement = (viewportId: string, measurement: Measurement) => {
    handleUpdateViewportState(viewportId, {
      measurements: [...(viewports.find(v => v.id === viewportId)?.measurements || []), measurement]
    });
  };

  // File & Folder Parsing
  const processRawFiles = async (files: FileList | File[], sourceDesc: string) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    try {
      setLoadingStatus({
        loaded: 0,
        total: fileArray.length,
        percent: 0,
        message: `Scanning ${fileArray.length} files...`
      });

    const parsedInstances: DicomInstance[] = [];
    const batchSize = 10;

    for (let i = 0; i < fileArray.length; i += batchSize) {
      const batch = fileArray.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (file) => {
          try {
            const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
            const buffer = await file.arrayBuffer();

            if (isZip) {
              setLoadingStatus({
                loaded: i,
                total: fileArray.length,
                percent: Math.round(((i + 1) / fileArray.length) * 100),
                message: `Unpacking ZIP archive: ${file.name}...`
              });

              const zip = await JSZip.loadAsync(buffer);
              const entries: JSZip.JSZipObject[] = [];
              zip.forEach((_, zipEntry) => {
                if (!zipEntry.dir) entries.push(zipEntry);
              });

              for (const entry of entries) {
                try {
                  const entryBuf = await entry.async('arraybuffer');
                  if (isDicomBuffer(entryBuf)) {
                    const inst = parseDicomBufferFast(entryBuf, entry.name);
                    if (inst) {
                      inst.filePath = `${file.name}/${entry.name}`;
                      parsedInstances.push(inst);
                    }
                  }
                } catch (_) {}
              }
            } else if (isDicomBuffer(buffer)) {
              const inst = parseDicomBufferFast(buffer, file.name);
              if (inst) {
                inst.filePath = (file as any).path || file.name;
                parsedInstances.push(inst);
              }
            }
          } catch (err) {
            // non-dicom file skipped
          }
        })
      );

      const loaded = Math.min(fileArray.length, i + batchSize);
      const percent = Math.round((loaded / fileArray.length) * 100);
      setLoadingStatus({
        loaded,
        total: fileArray.length,
        percent,
        message: `Parsed ${parsedInstances.length} DICOM instances (${percent}%)`
      });

      await new Promise((r) => setTimeout(r, 0));
    }

    setLoadingStatus(null);

    if (parsedInstances.length === 0) {
      showNotification('No valid DICOM files found in selection.');
      return;
    }

      const newStudies = groupInstancesIntoStudies(parsedInstances, 'file', sourceDesc);
      setStudies(prev => [...newStudies, ...prev]);
      handleSelectStudy(newStudies[0]);
      showNotification(`Loaded ${parsedInstances.length} DICOM files successfully.`);
    } catch (err: any) {
      setLoadingStatus(null);
      console.error('[CRASH SHIELD] processRawFiles error:', err);
      showNotification('Some files could not be parsed. App recovered safely.');
    }
  };

  // Process raw ArrayBuffers from Native Electron dialogs safely
  const processRawBuffers = async (rawFiles: Array<{ fileName: string; filePath: string; buffer: ArrayBuffer }>, sourceDesc: string) => {
    if (!rawFiles || rawFiles.length === 0) return;
    try {
      setLoadingStatus({
        loaded: 0,
        total: rawFiles.length,
        percent: 0,
        message: `Reading ${rawFiles.length} files...`
      });

      const parsedInstances: DicomInstance[] = [];
      const batchSize = 20;

      for (let i = 0; i < rawFiles.length; i += batchSize) {
        const batch = rawFiles.slice(i, i + batchSize);
        for (const item of batch) {
          try {
            if (isDicomBuffer(item.buffer)) {
              const inst = parseDicomBufferFast(item.buffer, item.fileName, item.filePath);
              if (inst) {
                inst.filePath = item.filePath || item.fileName;
                parsedInstances.push(inst);
              }
            }
          } catch (_) {}
        }

        const loaded = Math.min(rawFiles.length, i + batchSize);
        const percent = Math.round((loaded / rawFiles.length) * 100);
        setLoadingStatus({
          loaded,
          total: rawFiles.length,
          percent,
          message: `Parsed ${parsedInstances.length} DICOM images (${percent}%)`
        });

        await new Promise(r => setTimeout(r, 0));
      }

      setLoadingStatus(null);
      if (parsedInstances.length === 0) {
        showNotification('No valid DICOM files found in selection.');
        return;
      }

      const newStudies = groupInstancesIntoStudies(parsedInstances, 'file', sourceDesc);
      setStudies(prev => [...newStudies, ...prev]);
      handleSelectStudy(newStudies[0]);
      showNotification(`Loaded ${parsedInstances.length} DICOM images successfully.`);
    } catch (err: any) {
      setLoadingStatus(null);
      console.error('[CRASH SHIELD] Error reading raw buffers:', err);
      showNotification('An error occurred during file reading. System recovered safely.');
    }
  };

  const handleOpenFile = async () => {
    if (window.electronAPI?.openDicomFiles) {
      try {
        const nativeFiles = await window.electronAPI.openDicomFiles();
        if (nativeFiles && nativeFiles.length > 0) {
          await processRawBuffers(nativeFiles, 'Local DICOM Files');
          return;
        }
      } catch (err) {
        console.warn('Native openDicomFiles error, falling back to input:', err);
      }
    }
    fileInputRef.current?.click();
  };

  const handleOpenFolder = async () => {
    if (window.electronAPI?.openDicomDirectory) {
      try {
        const nativeFiles = await window.electronAPI.openDicomDirectory();
        if (nativeFiles && nativeFiles.length > 0) {
          await processRawBuffers(nativeFiles, 'Local Study Folder');
          return;
        }
      } catch (err) {
        console.warn('Native openDicomDirectory error, falling back to input:', err);
      }
    }
    folderInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processRawFiles(e.target.files, 'Local Files');
    }
  };

  // Global Window Drag & Drop for DICOM Files & Series
  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processRawFiles(files, 'Drag & Drop Media');
      return;
    }

    try {
      const rawJson = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        let targetStudy = parsed.study;
        let targetSeries = parsed.series;

        if (!targetStudy && parsed.studyUid) {
          targetStudy = studies.find(s => s.studyInstanceUid === parsed.studyUid) || null;
        }
        if (!targetSeries && parsed.seriesUid) {
          if (targetStudy) {
            targetSeries = targetStudy.series.find((s: any) => s.seriesInstanceUid === parsed.seriesUid) || null;
          } else {
            for (const s of studies) {
              const found = s.series.find(ser => ser.seriesInstanceUid === parsed.seriesUid);
              if (found) {
                targetSeries = found;
                targetStudy = s;
                break;
              }
            }
          }
        }

        if (targetSeries && targetStudy) {
          handleDropSeriesOnViewport(activeViewportId, targetSeries, targetStudy);
        }
      }
    } catch (_) {}
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if ((window as any).electronAPI?.toggleFullScreen) {
      (window as any).electronAPI.toggleFullScreen();
      setIsFullscreen(!isFullscreen);
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Window Minimize
  const handleMinimize = () => {
    if ((window as any).electronAPI?.minimizeWindow) {
      (window as any).electronAPI.minimizeWindow();
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      } else {
        showNotification('Minimizing workstation view');
      }
    }
  };

  // Application Exit / Close
  const handleExit = () => {
    if ((window as any).electronAPI?.closeWindow) {
      (window as any).electronAPI.closeWindow();
    } else {
      if (confirm('Are you sure you want to exit RadNode Viewer?')) {
        window.close();
        window.location.href = 'about:blank';
      }
    }
  };

  // Switch to or open MPR layout with matching anatomical plane series
  const handleOpenMprLayout = (layout: '2x2' | '3-view' | 'coronal-only' | 'axial-only' | 'sagittal-only') => {
    const currentStudy = activeStudy || studies[0] || null;
    if (currentStudy && currentStudy.series.length > 0) {
      if (layout === '2x2' || layout === '3-view') {
        // Multi-view (2x2 or 1x3): Respect the user's currently active series if valid and eligible!
        // Strictly exclude SR (Structured Reports) and scouts/topograms.
        const currentSeries = currentStudy.series.find(s => s.seriesInstanceUid === currentViewport?.seriesUid) || activeSeries;
        let targetSeries = currentSeries;
        if (!targetSeries || !isEligibleForMpr(targetSeries)) {
          targetSeries = findMainVolumetricSeries(currentStudy);
        }
        if (targetSeries) {
          handleSelectSeries(targetSeries);
        }
        setMprInitialLayout(layout);
        setIsMprActive(true);
      } else {
        // Single plane layout: coronal-only, axial-only, sagittal-only
        const targetPlane =
          layout === 'coronal-only' ? 'CORONAL' :
          layout === 'axial-only' ? 'AXIAL' : 'SAGITTAL';

        // Check if there is a real native multi-slice series for this plane (strictly NOT a topogram or SR)
        const matchingMultiSliceSeries = currentStudy.series.find((s) => {
          if (!isEligibleForMpr(s)) return false;
          const rep = s.instances[Math.floor(s.instances.length / 2)] || s.instances[0];
          return detectAnatomicalPlane(s.seriesDescription, rep?.imageOrientationPatient) === targetPlane;
        });

        if (matchingMultiSliceSeries) {
          handleSelectSeries(matchingMultiSliceSeries);
          // If the user was in normal 2D viewing mode, show the native acquired series directly
          if (!isMprActive) {
            setIsMprActive(false);
            return;
          }
        } else {
          // If no separate multi-slice series exists, pick the main volumetric series (Axial CT)
          // to reconstruct this plane in MPR! NEVER pick a topogram or SR!
          const mainVol = findMainVolumetricSeries(currentStudy);
          if (mainVol) {
            handleSelectSeries(mainVol);
          }
        }
        setMprInitialLayout(layout);
        setIsMprActive(true);
      }
    }
  };

  // Track Fullscreen Mode changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === '1') handleApplyWindowPreset(-600, 1500); // CT Lung
      else if (e.key === '2') handleApplyWindowPreset(400, 1800); // CT Bone
      else if (e.key === '3') handleApplyWindowPreset(40, 80); // CT Brain
      else if (e.key === '4') handleApplyWindowPreset(40, 400); // CT Soft Tissue
      else if (e.key === '5') handleApplyWindowPreset(50, 350); // CT Mediastinum
      else if (e.key === '6') handleApplyWindowPreset(60, 400); // CT Abdomen
      else if (e.key === '7') handleApplyWindowPreset(300, 600); // Angio
      else if (e.key === '8') handleApplyWindowPreset(350, 700); // MRI T1
      else if (e.key === '9') handleApplyWindowPreset(600, 1200); // MRI T2
      else if (e.key === '0') handleApplyWindowPreset(128, 256); // Full Dynamic Range
      else if (e.key.toLowerCase() === 'w') setActiveTool('ww_wl');
      else if ((e.ctrlKey && e.key.toLowerCase() === 'z') || e.key === 'Delete' || e.key === 'Backspace') {
        if (currentViewport.measurements && currentViewport.measurements.length > 0) {
          updateActiveViewport({
            measurements: currentViewport.measurements.slice(0, -1)
          });
          showNotification('Last measurement removed (Undo).');
        }
      }
      else if (e.key.toLowerCase() === 'z' && !e.ctrlKey) setActiveTool('zoom');
      else if (e.key.toLowerCase() === 'p') setActiveTool('pan');
      else if (e.key.toLowerCase() === 'l') setActiveTool('loupe');
      else if (e.key.toLowerCase() === 'b') handleBookmarkCurrentSlice();
      else if (e.key.toLowerCase() === 'd') setActiveTool('distance');
      else if (e.key.toLowerCase() === 't') {
        setActiveTool('arrow');
        showNotification('Arrow & Lesion Annotation Tool Selected [T]');
      }
      else if (e.key.toLowerCase() === 'o') handleToggleOverlays();
      else if (e.key === '?' || e.key === 'F1') setIsShortcutsModalOpen(true);
      else if (e.key.toLowerCase() === 'a') setActiveTool('angle');
      else if (e.key.toLowerCase() === 'r') setActiveTool('rectangle_roi');
      else if (e.key.toLowerCase() === 'e') setActiveTool('ellipse_roi');
      else if (e.key.toLowerCase() === 'h') setActiveTool('hu_probe');
      else if (e.key.toLowerCase() === 'i') handleInvert();
      else if (e.key.toLowerCase() === 'f') handleFlipH();
      else if (e.code === 'Space') {
        e.preventDefault();
        updateActiveViewport({ cinePlaying: !currentViewport.cinePlaying });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentViewport, handleBookmarkCurrentSlice]);

  const handleSetGrid = (newGrid: GridLayout) => {
    setGridLayout(newGrid);
    if (activeStudy && activeStudy.series.length > 1) {
      setViewports(prev => {
        return prev.map((vp, idx) => {
          if (!vp.seriesUid && activeStudy.series[idx]) {
            const ser = activeStudy.series[idx];
            const firstInst = ser.instances[0];
            const isCt = ser.modality === 'CT' || (firstInst?.rescaleIntercept !== undefined && firstInst.rescaleIntercept < -100);
            return {
              ...vp,
              studyUid: activeStudy.studyInstanceUid,
              seriesUid: ser.seriesInstanceUid,
              instanceIndex: 0,
              windowCenter: firstInst?.windowCenter !== undefined ? firstInst.windowCenter : (isCt ? 40 : 128),
              windowWidth: firstInst?.windowWidth !== undefined ? firstInst.windowWidth : (isCt ? 400 : 256),
              zoom: 1.0,
              pan: { x: 0, y: 0 }
            };
          }
          return vp;
        });
      });
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleWindowDrop}
      className="h-screen w-screen flex flex-col bg-radiant-darkest text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* Background Streaming Progress Pill */}
      {loadingStatus && (
        <div className="fixed bottom-6 right-6 z-50 bg-radiant-card/95 border border-cyan-500/80 rounded-xl shadow-2xl p-3.5 backdrop-blur-md flex flex-col gap-2 min-w-[300px] animate-fade-in pointer-events-none">
          <div className="flex items-center justify-between text-xs font-semibold text-cyan-300">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>{loadingStatus.message}</span>
            </div>
            <span className="font-mono text-cyan-400 font-bold">{loadingStatus.percent}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-150"
              style={{ width: `${loadingStatus.percent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-36 left-1/2 -translate-x-1/2 z-50 bg-cyan-950/95 border border-cyan-400/80 text-cyan-100 px-5 py-2.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] text-xs font-semibold backdrop-blur-md flex items-center gap-2 animate-fade-in pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>{notification}</span>
        </div>
      )}

      {/* 1. Top Header Bar */}
      <HeaderBar
        activeStudy={activeStudy}
        onOpenPacs={() => setIsPacsModalOpen(true)}
        onOpenDicomDir={() => setIsDicomDirModalOpen(true)}
        onOpenTags={() => setIsTagModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenFileClick={handleOpenFile}
        onOpenFolderClick={handleOpenFolder}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* 2. Menu Bar */}
      <MenuBar
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
        onOpenDicomDir={() => setIsDicomDirModalOpen(true)}
        onOpenPacs={() => setIsPacsModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        onClearMeasurements={handleClearMeasurements}
        onSelectTool={setActiveTool}
        onApplyWindowPreset={handleApplyWindowPreset}
        onSetGrid={handleSetGrid}
        onRotate={handleRotate}
        onFlipH={handleFlipH}
        onFlipV={handleFlipV}
        onInvert={handleInvert}
        onToggleMpr={() => {
          if (!isMprActive) {
            handleOpenMprLayout(mprInitialLayout || '2x2');
          } else {
            setIsMprActive(false);
          }
        }}
        onOpenMprLayout={handleOpenMprLayout}
        onOpenTags={() => setIsTagModalOpen(true)}
        onOpenAbout={() => setIsAboutModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
      />

      {/* 3. Main Tool Bar */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onRotate={handleRotate}
        onFlipH={handleFlipH}
        onFlipV={handleFlipV}
        onInvert={handleInvert}
        currentGrid={gridLayout}
        onSetGrid={handleSetGrid}
        currentLut={currentViewport.lut || 'grayscale'}
        onSetLut={(lut) => updateActiveViewport({ lut })}
        currentFilter={currentViewport.filter || 'none'}
        onSetFilter={(filter: ImageFilterType) => updateActiveViewport({ filter })}
        syncMode={syncMode}
        onSetSyncMode={setSyncMode}
        currentMipMode={currentViewport.mipMode || 'none'}
        currentMipSlab={currentViewport.mipSlabThickness || 1}
        onSetMip={(mode, slab) => updateActiveViewport({ mipMode: mode, mipSlabThickness: slab })}
        isMprActive={isMprActive}
        onToggleMpr={() => {
          if (!isMprActive) {
            handleOpenMprLayout(mprInitialLayout || '2x2');
          } else {
            setIsMprActive(false);
          }
        }}
        onOpenMprLayout={handleOpenMprLayout}
        onOpen3D={() => setIs3dModalOpen(true)}
        isCinePlaying={currentViewport.cinePlaying}
        onToggleCine={() => updateActiveViewport({ cinePlaying: !currentViewport.cinePlaying })}
        currentWindowCenter={currentViewport.windowCenter}
        currentWindowWidth={currentViewport.windowWidth}
        onApplyWindowPreset={handleApplyWindowPreset}
        onClearMeasurements={handleClearMeasurements}
        onOpenPacs={() => setIsPacsModalOpen(true)}
        onOpenDicomDir={() => setIsDicomDirModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
        bookmarksCount={bookmarks.length}
        onOpenBookmarks={() => setIsKeyImagesModalOpen(true)}
        onOpenReport={() => setIsReportModalOpen(true)}
        showOverlays={showOverlays}
        onToggleOverlays={handleToggleOverlays}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
      />

      {/* 4. Central Workstation Workspace (Sidebar + Viewport Grid or MPR) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Series & Patient Drawer */}
        <SeriesSidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          studies={studies}
          activeStudy={activeStudy}
          activeSeries={activeSeries}
          onSelectStudy={handleSelectStudy}
          onSelectSeries={handleSelectSeries}
          onDragSeriesStart={handleDragSeriesStart}
          pacsDownloadState={pacsDownloadState}
        />

        {/* Center Canvas Workspace */}
        <main className="flex-1 flex flex-col bg-black overflow-hidden relative">
          {isMprActive ? (
            <MprViewportView
              series={activeSeries}
              study={activeStudy}
              initialLayout={mprInitialLayout}
              onClose={() => setIsMprActive(false)}
              onSelectSeries={handleSelectSeries}
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              windowCenter={currentViewport.windowCenter}
              windowWidth={currentViewport.windowWidth}
              onUpdateWindowing={(wc, ww) => updateActiveViewport({ windowCenter: wc, windowWidth: ww })}
              lut={currentViewport.lut || 'grayscale'}
              onSetLut={(lut) => updateActiveViewport({ lut })}
              invert={currentViewport.invert || false}
              onToggleInvert={handleInvert}
              showOverlays={showOverlays}
              onToggleOverlays={handleToggleOverlays}
            />
          ) : (
            <ViewportGrid
              gridLayout={gridLayout}
              viewports={viewports}
              activeViewportId={activeViewportId}
              activeTool={activeTool}
              studies={studies}
              onActivateViewport={setActiveViewportId}
              onUpdateViewportState={handleUpdateViewportState}
              onAddMeasurement={handleAddMeasurement}
              onDropSeriesOnViewport={handleDropSeriesOnViewport}
            />
          )}

          {/* High-Tech Medical Telemetry Bottom Status Bar */}
          <BottomStatusBar
            activeStudy={activeStudy}
            activeSeries={activeSeries}
            activeInstance={activeInstance}
            viewportState={currentViewport}
            showOverlays={showOverlays}
            onToggleOverlays={handleToggleOverlays}
            onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
            totalStudiesCount={studies.length}
          />
        </main>
      </div>

      {/* Hidden inputs for File & Folder Dialogs */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept=".dcm,.dicom,.zip,application/dicom,application/zip"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        type="file"
        ref={folderInputRef}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Modals */}
      <PacsManagerModal
        isOpen={isPacsModalOpen}
        onClose={() => setIsPacsModalOpen(false)}
        onStartRetrieve={handleStartPacsRetrieve}
        onStudyRetrieved={(study) => {
          setStudies(prev => {
            const exists = prev.some(s => s.studyInstanceUid === study.studyInstanceUid);
            if (exists) {
              return prev.map(s => s.studyInstanceUid === study.studyInstanceUid ? study : s);
            }
            return [study, ...prev];
          });
          handleSelectStudy(study);
        }}
      />

      <DicomDirModal
        isOpen={isDicomDirModalOpen}
        onClose={() => setIsDicomDirModalOpen(false)}
        onStudiesLoaded={(loaded) => {
          setStudies(prev => [...loaded, ...prev]);
          if (loaded.length > 0) handleSelectStudy(loaded[0]);
        }}
      />

      <DicomTagModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        instance={activeInstance}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        study={activeStudy}
        currentInstance={activeInstance}
        measurements={currentViewport.measurements}
      />

      <KeyImagesModal
        isOpen={isKeyImagesModalOpen}
        onClose={() => setIsKeyImagesModalOpen(false)}
        bookmarks={bookmarks}
        onDeleteBookmark={handleDeleteBookmark}
        onUpdateNotes={handleUpdateBookmarkNotes}
        onOpenReport={() => setIsReportModalOpen(true)}
        onJumpToSlice={(b) => {
          const study = studies.find(s => s.studyInstanceUid === b.studyInstanceUid);
          const ser = study?.series.find(s => s.seriesInstanceUid === b.seriesInstanceUid);
          if (ser && study) {
            setActiveStudyUid(study.studyInstanceUid);
            setActiveSeriesUid(ser.seriesInstanceUid);
            updateActiveViewport({
              studyUid: study.studyInstanceUid,
              seriesUid: ser.seriesInstanceUid,
              instanceIndex: b.instanceIndex
            });
          }
        }}
      />

      <ReportGeneratorModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        study={activeStudy}
        bookmarks={bookmarks}
        measurements={currentViewport.measurements}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onProfileUpdated={(p) => showNotification(`Saved physician profile for ${p.radiologistName}`)}
      />

      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      <Volume3dModal
        isOpen={is3dModalOpen}
        onClose={() => setIs3dModalOpen(false)}
        series={activeSeries}
        study={activeStudy}
      />

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};

export default App;
