import { PanOnScrollMode } from "@xyflow/react";

import type { WorkspaceGestureOptions } from "../core.js";

export type WorkspaceCanvasGesturePolicy = Readonly<{
  maxZoom: number;
  minZoom: number;
  panActivationKeyCode: string | string[] | null;
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  panOnScrollMode: PanOnScrollMode;
  panOnScrollSpeed: number;
  preventScrolling: boolean;
  zoomActivationKeyCode: string | string[] | null;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}>;

function mutableActivationKey(
  value: WorkspaceGestureOptions["panActivationKey"],
): string | string[] | null {
  return value === null || typeof value === "string" ? value : [...value];
}

function mutablePanOnDrag(value: WorkspaceGestureOptions["panOnDrag"]): boolean | number[] {
  return typeof value === "boolean" ? value : [...value];
}

function upstreamPanOnScrollMode(
  mode: WorkspaceGestureOptions["panOnScrollMode"],
): PanOnScrollMode {
  if (mode === "horizontal") {
    return PanOnScrollMode.Horizontal;
  }
  if (mode === "vertical") {
    return PanOnScrollMode.Vertical;
  }
  return PanOnScrollMode.Free;
}

export function createWorkspaceCanvasGesturePolicy(
  options: WorkspaceGestureOptions,
): WorkspaceCanvasGesturePolicy {
  return {
    maxZoom: options.maxZoom,
    minZoom: options.minZoom,
    panActivationKeyCode: mutableActivationKey(options.panActivationKey),
    panOnDrag: mutablePanOnDrag(options.panOnDrag),
    panOnScroll: options.panOnScroll,
    panOnScrollMode: upstreamPanOnScrollMode(options.panOnScrollMode),
    panOnScrollSpeed: options.panOnScrollSpeed,
    preventScrolling:
      options.panOnScroll || options.zoomOnScroll || options.zoomActivationKey !== null,
    zoomActivationKeyCode: mutableActivationKey(options.zoomActivationKey),
    zoomOnDoubleClick: options.zoomOnDoubleClick,
    zoomOnPinch: options.zoomOnPinch,
    zoomOnScroll: options.zoomOnScroll,
  };
}
