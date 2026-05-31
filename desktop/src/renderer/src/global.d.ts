import type { SettaAPI } from "@shared/types";

interface PixiWorkspaceDebugSnapshot {
  canvas: {
    clientHeight: number;
    clientWidth: number;
    height: number;
    width: number;
  };
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  graph: {
    edgeCount: number;
    nodeCount: number;
    nodes: Array<{
      height: number;
      id: string;
      screenX: number;
      screenY: number;
      width: number;
      x: number;
      y: number;
    }>;
  };
  interaction: {
    drawingEdge: boolean;
    selectedNodeId: string | null;
  };
  render: {
    averageFrameMs: number;
    cameraUpdateCount: number;
    edgeRedrawCount: number;
    frameCount: number;
    nodeDragUpdateCount: number;
    reactRenderCount: number;
    recentFrameMs: number[];
    worstFrameMs: number;
  };
  visual: {
    hasNonBackgroundPixels: boolean;
    nonBackgroundPixelCount: number;
    sampledColorCount: number;
    sampledPixelCount: number;
  };
}

interface PixiWorkspaceDebugApi {
  getSnapshot: () => PixiWorkspaceDebugSnapshot;
}

declare global {
  interface Window {
    __settaPixiWorkspaceDebug?: PixiWorkspaceDebugApi;
    setta: SettaAPI;
  }
}

export {};
