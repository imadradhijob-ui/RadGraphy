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

import {
  DicomInstance,
  DicomSeries,
  DicomStudy,
  GridLayout,
  Measurement,
  Point2D,
  ToolType,
  ViewportState
} from './types/dicom';
import { parseDicomBufferFast, groupInstancesIntoStudies, isDicomBuffer } from './services/dicomParser';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  // Studies and series collections
  const [studies, setStudies] = useState<DicomStudy[]>([]);
  const [activeStudyUid, setActiveStudyUid] = useState<string | null>(null);
  const [activeSeriesUid, setActiveSeriesUid] = useState<string | null>(null);

  // Tool & layout states
  const [activeTool, setActiveTool] = useState<ToolType>('ww_wl');
  const [gridLayout, setGridLayout] = useState<GridLayout>('1x1');
  const [activeViewportId, setActiveViewportId] = useState<string>('vp_0');
  const [isMprActive, setIsMprActive] = useState<boolean>(false);

  // UI Panels and Modals
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPacsModalOpen, setIsPacsModalOpen] = useState<boolean>(false);
  const [isDicomDirModalOpen, setIsDicomDirModalOpen] = useState<boolean>(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [is3dModalOpen, setIs3dModalOpen] = useState<boolean>(false);

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
      measurements: []
    }));
  });

  const activeStudy = studies.find(s => s.studyInstanceUid === activeStudyUid) || studies[0] || null;
  const activeSeries = activeStudy?.series.find(s => s.seriesInstanceUid === activeSeriesUid) || activeStudy?.series[0] || null;

  const currentViewport = viewports.find(v => v.id === activeViewportId) || viewports[0];
  const activeInstanceIndex = currentViewport?.instanceIndex || 0;
  const activeInstance = activeSeries?.instances[activeInstanceIndex];

  const handleUpdateViewportState = useCallback((id: string, updates: Partial<ViewportState>) => {
    setViewports(prev =>
      prev.map(vp => (vp.id === id ? { ...vp, ...updates } : vp))
    );
  }, []);

  const updateActiveViewport = useCallback((updates: Partial<ViewportState>) => {
    handleUpdateViewportState(activeViewportId, updates);
  }, [activeViewportId, handleUpdateViewportState]);

  const handleSelectStudy = (study: DicomStudy) => {
    setActiveStudyUid(study.studyInstanceUid);
    const targetSer = [...study.series].sort((a, b) => b.instances.length - a.instances.length)[0] || study.series[0];
    if (targetSer) {
      setActiveSeriesUid(targetSer.seriesInstanceUid);
      const firstInst = targetSer.instances[0];
      const isCt = targetSer.modality === 'CT' || (firstInst?.rescaleIntercept !== undefined && firstInst.rescaleIntercept < -100);
      const defWc = isCt ? 40 : 128;
      const defWw = isCt ? 400 : 256;
      updateActiveViewport({
        studyUid: study.studyInstanceUid,
        seriesUid: targetSer.seriesInstanceUid,
        instanceIndex: 0,
        windowCenter: firstInst?.windowCenter !== undefined ? firstInst.windowCenter : defWc,
        windowWidth: firstInst?.windowWidth !== undefined ? firstInst.windowWidth : defWw,
        zoom: 1.0,
        pan: { x: 0, y: 0 }
      });
    }
  };

  const handleSelectSeries = (series: DicomSeries) => {
    setActiveSeriesUid(series.seriesInstanceUid);
    const firstInst = series.instances[0];
    const isCt = series.modality === 'CT' || (firstInst?.rescaleIntercept !== undefined && firstInst.rescaleIntercept < -100);
    const defWc = isCt ? 40 : 128;
    const defWw = isCt ? 400 : 256;

    updateActiveViewport({
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
    e.dataTransfer.setData('application/json', JSON.stringify({
      studyUid: series.studyInstanceUid,
      seriesUid: series.seriesInstanceUid
    }));
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
            const buffer = await file.arrayBuffer();
            if (isDicomBuffer(buffer)) {
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
  };

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleOpenFolder = () => {
    folderInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processRawFiles(e.target.files, 'Local Files');
    }
  };

  // Global Window Drag & Drop for DICOM Files
  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await processRawFiles(files, 'Drag & Drop Media');
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

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
      else if (e.key.toLowerCase() === 'w') setActiveTool('ww_wl');
      else if (e.key.toLowerCase() === 'z') setActiveTool('zoom');
      else if (e.key.toLowerCase() === 'p') setActiveTool('pan');
      else if (e.key.toLowerCase() === 'd') setActiveTool('distance');
      else if (e.key.toLowerCase() === 'a') setActiveTool('angle');
      else if (e.key.toLowerCase() === 'r') setActiveTool('rectangle_roi');
      else if (e.key.toLowerCase() === 'e') setActiveTool('ellipse_roi');
      else if (e.code === 'Space') {
        e.preventDefault();
        updateActiveViewport({ cinePlaying: !currentViewport.cinePlaying });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentViewport]);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleWindowDrop}
      className="h-screen w-screen flex flex-col bg-radiant-darkest text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* Background Streaming Progress Pill */}
      {loadingStatus && (
        <div className="absolute top-12 right-6 z-50 bg-radiant-card/95 border border-cyan-500/80 rounded-xl shadow-2xl p-3 backdrop-blur-md flex flex-col gap-2 min-w-[280px] animate-fade-in">
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
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-cyan-900/90 border border-cyan-400 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-semibold backdrop-blur-sm animate-bounce">
          {notification}
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
        onSetGrid={setGridLayout}
        onRotate={handleRotate}
        onFlipH={handleFlipH}
        onFlipV={handleFlipV}
        onInvert={handleInvert}
        onToggleMpr={() => setIsMprActive(!isMprActive)}
        onOpenTags={() => setIsTagModalOpen(true)}
        onOpenAbout={() => setIsAboutModalOpen(true)}
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
        onSetGrid={setGridLayout}
        currentLut={currentViewport.lut || 'grayscale'}
        onSetLut={(lut) => updateActiveViewport({ lut })}
        currentMipMode={currentViewport.mipMode || 'none'}
        currentMipSlab={currentViewport.mipSlabThickness || 1}
        onSetMip={(mode, slab) => updateActiveViewport({ mipMode: mode, mipSlabThickness: slab })}
        isMprActive={isMprActive}
        onToggleMpr={() => setIsMprActive(!isMprActive)}
        onOpen3D={() => setIs3dModalOpen(true)}
        isCinePlaying={currentViewport.cinePlaying}
        onToggleCine={() => updateActiveViewport({ cinePlaying: !currentViewport.cinePlaying })}
        onApplyWindowPreset={handleApplyWindowPreset}
        onClearMeasurements={handleClearMeasurements}
        onOpenPacs={() => setIsPacsModalOpen(true)}
        onOpenDicomDir={() => setIsDicomDirModalOpen(true)}
        onOpenExport={() => setIsExportModalOpen(true)}
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
        />

        {/* Center Canvas Workspace */}
        <main className="flex-1 flex flex-col bg-black overflow-hidden relative">
          {isMprActive ? (
            <MprViewportView
              series={activeSeries}
              study={activeStudy}
              onClose={() => setIsMprActive(false)}
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
        </main>
      </div>

      {/* Hidden inputs for File & Folder Dialogs */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
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
        onStudyRetrieved={(study) => {
          setStudies(prev => {
            const exists = prev.some(s => s.studyInstanceUid === study.studyInstanceUid);
            if (exists) {
              return prev.map(s => s.studyInstanceUid === study.studyInstanceUid ? study : s);
            }
            return [study, ...prev];
          });
          if (activeStudyUid !== study.studyInstanceUid) {
            handleSelectStudy(study);
          }
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
    </div>
  );
};

export default App;
