import { DrawAreaLayerItem } from "utils/generatedTypes";

export type LayerCanvasesType = Array<HTMLCanvasElement | null>;

export type TempCanvasesType = {
  layer: HTMLCanvasElement | null;
  artifact: HTMLCanvasElement | null;
};

export type CanvasPoint = [number, number];
export type CanvasPointXY = { x: number; y: number };

export type StrokeElement = {
  strokeStyle: CanvasFillStrokeStyles["strokeStyle"];
  lineWidth: CanvasPathDrawingStyles["lineWidth"];
  lineCap: CanvasPathDrawingStyles["lineCap"];
  points: CanvasPoint;
  globalCompositeOperation: CanvasCompositing["globalCompositeOperation"];
  transform: DrawAreaLayerItem["transform"];
};

export type Strokes = Array<StrokeElement>;

export type EraserStrokeElement = {
  strokeStyle: CanvasFillStrokeStyles["strokeStyle"];
  lineWidth: CanvasPathDrawingStyles["lineWidth"];
  lineCap: CanvasPathDrawingStyles["lineCap"];
  points: CanvasPoint;
  globalCompositeOperation: CanvasCompositing["globalCompositeOperation"];
};

export type EraserStrokes = Array<EraserStrokeElement>;

export type ResizeHandle = {
  idx: number;
  wasPositive: { xScale: boolean; yScale: boolean };
};

export type ResizeHandleCorners = [
  CanvasPointXY,
  CanvasPointXY,
  CanvasPointXY,
  CanvasPointXY,
];
