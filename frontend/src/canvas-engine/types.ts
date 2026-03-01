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

export type CanvasEngineSceneSnapshot = {
  camera: CanvasEngineCamera;
  clearColor: [number, number, number];
  rects: CanvasEngineRect[];
};
