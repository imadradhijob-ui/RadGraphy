import React from 'react';
import { DicomViewport } from './DicomViewport';
import {
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
        const study = studies.find(s => s.studyInstanceUid === vp.studyUid) || studies[0] || null;
        let series: DicomSeries | null = null;

        if (study) {
          series = study.series.find(s => s.seriesInstanceUid === vp.seriesUid) || study.series[0] || null;
        }

        return (
          <div key={vp.id} className="relative w-full h-full min-w-0 min-h-0">
            <DicomViewport
              viewportState={vp}
              series={series}
              study={study}
              activeTool={activeTool}
              isActive={vp.id === activeViewportId}
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
                  const rawData = e.dataTransfer.getData('application/json');
                  if (rawData) {
                    const parsed = JSON.parse(rawData);
                    if (parsed.series && parsed.study) {
                      onDropSeriesOnViewport(vp.id, parsed.series, parsed.study);
                    }
                  }
                } catch (err) {
                  console.warn('Drop series parse error:', err);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
};