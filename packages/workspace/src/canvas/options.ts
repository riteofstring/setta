import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { createHostStoreGetter } from "../state/hostStore";
import type { WorkspaceHost } from "../workspaceHost";
import type { PanOnScrollMode, SelectionMode } from "./types";

export type WorkspaceGridPattern = "lines" | "dots" | "cross";

export type MiniMapSide = "left" | "right";

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

function createWorkspaceOptionsStore() {
  return createStore(
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
}

export const getWorkspaceOptionsStore = createHostStoreGetter(
  createWorkspaceOptionsStore,
);

export function useWorkspaceOptions<T>(
  selector: (state: WorkspaceInteractionOptions) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getWorkspaceOptionsStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function toggleSnapToGrid(host: WorkspaceHost) {
  getWorkspaceOptionsStore(host).setState((state) => ({
    snapToGrid: !state.snapToGrid,
  }));
}

export function toggleMiniMap(host: WorkspaceHost) {
  getWorkspaceOptionsStore(host).setState((state) => ({
    showMinimap: !state.showMinimap,
  }));
}

export function setWorkspaceMiniMapVisibility(
  host: WorkspaceHost,
  visible: boolean,
) {
  getWorkspaceOptionsStore(host).setState({ showMinimap: visible });
}

export function toggleMiniMapSide(host: WorkspaceHost) {
  getWorkspaceOptionsStore(host).setState((state) => ({
    minimapSide: state.minimapSide === "left" ? "right" : "left",
  }));
}
