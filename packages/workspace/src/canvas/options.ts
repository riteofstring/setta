import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import type { PanOnScrollMode, SelectionMode } from "./types";

export type WorkspaceGridPattern = "lines" | "dots" | "cross";

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
  })),
);

// The reference's `toggleSnapToGrid` (`state/actions/localStorage.ts`) flips the same preference
// on its localStorage store.
export function toggleSnapToGrid() {
  useWorkspaceOptions.setState((state) => ({ snapToGrid: !state.snapToGrid }));
}
