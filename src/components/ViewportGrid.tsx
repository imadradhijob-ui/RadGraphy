import React from 'react';
import { DicomViewport } from './DicomViewport';
import { DicomErrorBoundary } from './DicomErrorBoundary';
import {
  DicomInstance,
  DicomSeries,
  DicomStudy,
  GridLayout,
  Measurement,
  ToolType,
  ViewportState
} from '../types/dicom';

interface ViewportGridProps {
  gridLayout: GridLayout;
  viewports: ViewportState[];
  activeViewportId: string;
  activeTool: ToolType;
  studies: DicomStudy[];
  onActivateViewport: (id: string) => void;
  onUpdateViewportState: (id: string, updates: Partial<ViewportState>) => void;
  onAddMeasurement: (viewportId: string, m: Measurement) => void;
  onDropSeriesOnViewport: (viewportId: string, series: DicomSeries, study: DicomStudy) => void;
}

export const ViewportGrid: React.FC<ViewportGridProps> = ({
  gridLayout,
  viewports,
  activeViewportId,
  activeTool,
  studies,
  onActivateViewport,
  onUpdateViewportState,
  onAddMeasurement,
  onDropSeriesOnViewport
}) => {
  // Determine number of rows and columns based on layout
  const getGridConfig = () => {
    switch (gridLayout) {
      case '1x1':
        return { rows: 1, cols: 1, count: 1 };
      case '1x2':
        return { rows: 1, cols: 2, count: 2 };
      case '2x1':
        return { rows: 2, cols: 1, count: 2 };
      case '2x2':
        return { rows: 2, cols: 2, count: 4 };
      case '1x3':
        return { rows: 1, cols: 3, count: 3 };
      case '3x1':
        return { rows: 3, cols: 1, count: 3 };
      case '3x3':
        return { rows: 3, cols: 3, count: 9 };
      default:
        return { rows: 1, cols: 1, count: 1 };
    }
  };

  const { rows, cols, count } = getGridConfig();
  const visibleViewports = viewports.slice(0, count);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gap: '2px'
  };

  return (
    <div className="flex-1 w-full h-full bg-radiant-darkest p-1 overflow-hidden" style={gridStyle}>
      {visibleViewports.map((vp) => {
        // Find matching study and series for this viewport
        const study = studies.find(s => s.studyInstanceUid === vp.studyUid) || (vp.studyUid ? null : studies[0]) || null;
        let series: DicomSeries | null = null;

        if (study) {
          series = study.series.find(s => s.seriesInstanceUid === vp.seriesUid) || (vp.seriesUid ? null : study.series[0]) || null;
        }

        // Collect current instances of other visible & synchronized viewports to draw 3D cross-reference lines
        const otherRefInstances: DicomInstance[] = [];
        if (count > 1 && (vp.isSyncLocked ?? true)) {
          visibleViewports.forEach(otherVp => {
            if (otherVp.id !== vp.id && (otherVp.isSyncLocked ?? true)) {
              const oStudy = studies.find(s => s.studyInstanceUid === otherVp.studyUid) || (otherVp.studyUid ? null : studies[0]) || null;
              const oSeries = oStudy ? (oStudy.series.find(s => s.seriesInstanceUid === otherVp.seriesUid) || (otherVp.seriesUid ? null : oStudy.series[0]) || null) : null;
              const oInst = oSeries?.instances[otherVp.instanceIndex || 0];
              if (oInst) {
                otherRefInstances.push(oInst);
              }
            }
          });
        }

        return (
          <div key={vp.id} className="relative w-full h-full min-w-0 min-h-0">
            <DicomErrorBoundary fallbackMessage={`Viewport ${vp.id} Recovery`}>
              <DicomViewport
                viewportState={vp}
                series={series}
                study={study}
                activeTool={activeTool}
                isActive={vp.id === activeViewportId}
                isSplitScreen={count > 1}
                referenceSlices={otherRefInstances}
                onActivate={() => onActivateViewport(vp.id)}
                onUpdateState={(updates) => onUpdateViewportState(vp.id, updates)}
                onAddMeasurement={(m) => onAddMeasurement(vp.id, m)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  try {
                    const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
                    if (rawData) {
                      const parsed = JSON.parse(rawData);
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
                        onDropSeriesOnViewport(vp.id, targetSeries, targetStudy);
                      }
                    }
                  } catch (err) {
                    console.warn('Drop series parse error:', err);
                  }
                }}
              />
            </DicomErrorBoundary>
          </div>
        );
      })}
    </div>
  );
};