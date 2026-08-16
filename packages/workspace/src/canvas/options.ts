import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import type { PanOnScrollMode, SelectionMode } from "./types";

export type WorkspaceGridPattern = "lines" | "dots" | "cross";

export type MiniMapSide = "left" | "right";

// The preferences/appearance seam: the reference reads these from `useSettings.gui` and
// `useLocalStorage`; the package owns them as host-configurable interaction options. Defaults
// match the frozen reference's shipped defaults (`internal/settingsstate/defaults.json` and the
// `useLocalStorage` initial state at 043d3b2e9).
export type WorkspaceInteractionOptions = {
  panOnDrag: boolean | Array<number>;
  panOnScroll: boolean;
  panOnScrollSpeed: number;
  panOnScrollMode: PanOnScrollMode;
  zoomOnScroll: boolean;
  zoomOnPinch: boolean;
  zoomOnDoubleClick: boolean;
  minZoom: number;
  maxZoom: number;
  defaultZoomLevel: number;
  transitionDuration: number;
  snapToGrid: boolean;
  snapGrid: [number, number];
  showGridLines: boolean;
  gridPattern: WorkspaceGridPattern;
  gridPatternSize: number;
  gridColor: string;
  gridColorDarkMode: string;
  selectionMode: SelectionMode;
  showMinimap: boolean;
  minimapSide: MiniMapSide;
};

export const useWorkspaceOptions = createWithEqualityFn(
  withResetFn<WorkspaceInteractionOptions>(() => ({
    panOnDrag: true,
    panOnScroll: true,
    panOnScrollSpeed: 1.0,
    panOnScrollMode: "free",
    zoomOnScroll: true,
    zoomOnPinch: true,
    zoomOnDoubleClick: false,
    minZoom: 0.1,
    maxZoom: 10,
    defaultZoomLevel: 1.0,
    transitionDuration: 50,
    snapToGrid: true,
    snapGrid: [15, 15],
    showGridLines: true,
    gridPattern: "dots",
    gridPatternSize: 2,
    gridColor: "#afbacf",
    gridColorDarkMode: "#2b364a",
    selectionMode: "partial",
    showMinimap: true,
    minimapSide: "left",
  })),
);

// The reference's `toggleSnapToGrid`/`toggleMiniMap`/`toggleMiniMapSide`
// (`state/actions/localStorage.ts`) flip the same preferences on its localStorage store.
export function toggleSnapToGrid() {
  useWorkspaceOptions.setState((state) => ({ snapToGrid: !state.snapToGrid }));
}

export function toggleMiniMap() {
  useWorkspaceOptions.setState((state) => ({
    showMinimap: !state.showMinimap,
  }));
}

export function toggleMiniMapSide() {
  useWorkspaceOptions.setState((state) => ({
    minimapSide: state.minimapSide === "left" ? "right" : "left",
  }));
}
