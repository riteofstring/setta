import _ from "lodash";

import { useSettings } from "state/definitions";

export function useProjectGpuSurfaceSettings() {
  return useSettings(
    (state) => ({
      defaultZoomLevel: state.gui.defaultZoomLevel,
      gridColor: state.gui.gridColor,
      gridColorDarkMode: state.gui.gridColorDarkMode,
      gridPattern: state.gui.gridPattern,
      gridPatternSize: state.gui.gridPatternSize,
      maxZoom: state.gui.maxZoom,
      minZoom: state.gui.minZoom,
      panOnDrag: state.gui.panOnDrag,
      panOnScroll: state.gui.panOnScroll,
      panOnScrollMode: state.gui.panOnScrollMode,
      panOnScrollSpeed: state.gui.panOnScrollSpeed,
      selectionMode: state.gui.selectionMode,
      showGridLines: !!state.gui.showGridLines,
      snapGrid: state.gui.snapGrid,
      wireColor: (state.gui as unknown as { wireColor?: string }).wireColor,
      wireColorDarkMode: (
        state.gui as unknown as { wireColorDarkMode?: string }
      ).wireColorDarkMode,
      zoomOnDoubleClick: state.gui.zoomOnDoubleClick,
      zoomOnPinch: state.gui.zoomOnPinch,
      zoomOnScroll: state.gui.zoomOnScroll,
    }),
    _.isEqual,
  );
}

export type ProjectGpuSurfaceSettings = ReturnType<
  typeof useProjectGpuSurfaceSettings
>;
