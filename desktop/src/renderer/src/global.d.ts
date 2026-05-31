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
    edges: Array<{
      id: string;
      sourceNodeId: string;
      sourcePortId: string;
      targetNodeId: string;
      targetPortId: string;
    }>;
    nodeCount: number;
    nodes: Array<{
      height: number;
      id: string;
      label: {
        eventMode: string;
        globalX: number;
        globalY: number;
        screenX: number;
        screenY: number;
        scaleX: number;
        scaleY: number;
        text: string;
        visible: boolean;
        worldScaleX: number;
        worldScaleY: number;
      };
      ports: Array<{
        id: string;
        role: "source" | "target";
        screenX: number;
        screenY: number;
        x: number;
        y: number;
      }>;
      screenX: number;
      screenY: number;
      width: number;
      x: number;
      y: number;
    }>;
  };
  interaction: {
    drawingEdge: boolean;
    drawingMarquee: boolean;
    selectedNodeId: string | null;
    selectedNodeIds: string[];
  };
  render: {
    averageFrameMs: number;
    cameraUpdateCount: number;
    edgeCommitCount: number;
    edgeRedrawCount: number;
    frameCount: number;
    marqueeUpdateCount: number;
    nodeDragUpdateCount: number;
    pointerPanUpdateCount: number;
    reactRenderCount: number;
    recentFrameMs: number[];
    selectionChangeCount: number;
    temporaryEdgeUpdateCount: number;
    wheelPanUpdateCount: number;
    wheelZoomUpdateCount: number;
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
