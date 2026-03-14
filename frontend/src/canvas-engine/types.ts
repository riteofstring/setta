export type CanvasEngineBackend = "webgpu" | "webgl2";

export type CanvasEngineBackendSelection = {
  preferredBackend: CanvasEngineBackend;
  activeBackend: CanvasEngineBackend;
  webgpuAvailable: boolean;
  webgl2Available: boolean;
  fallbackReason: string | null;
};

export type CanvasEngineCamera = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasEngineViewport = {
  width: number;
  height: number;
  dpr: number;
};

export type CanvasEngineRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isActive: boolean;
  color: [number, number, number];
};

export type CanvasEngineNestedPreviewRect = {
  id: string;
  parentSectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  color: [number, number, number];
};

export type CanvasEngineDataEdge = {
  id: string;
  sourceSectionId: string;
  sourceVariantId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetVariantId: string;
  targetPortId: string;
  sourceX: number | null;
  sourceY: number | null;
  targetX: number | null;
  targetY: number | null;
  hidden: boolean;
  selected: boolean;
  zIndex: number;
};

export type CanvasEngineAgenticEdge = {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: string;
  hidden: boolean;
  selected: boolean;
  zIndex: number;
};

export type CanvasEngineConnectionPreview = {
  kind: "agentic-connect" | "data-connect" | "data-reconnect";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  targetHandleX: number | null;
  targetHandleY: number | null;
  targetValid: boolean;
};

export type CanvasEngineHoveredEdge = {
  kind: "data" | "agentic";
  id: string;
};

export type CanvasEngineSceneSnapshot = {
  camera: CanvasEngineCamera;
  clearColor: [number, number, number];
  rects: CanvasEngineRect[];
  nestedPreviewRects: CanvasEngineNestedPreviewRect[];
  dataEdges: CanvasEngineDataEdge[];
  agenticEdges: CanvasEngineAgenticEdge[];
  connectionPreview: CanvasEngineConnectionPreview | null;
  hoveredEdge: CanvasEngineHoveredEdge | null;
};
