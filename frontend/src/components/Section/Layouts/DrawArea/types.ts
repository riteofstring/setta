export type LayerCanvasesType = Array<HTMLCanvasElement | null>;

export type TempCanvasesType = {
  layer: HTMLCanvasElement | null;
  artifact: HTMLCanvasElement | null;
};

export type CanvasPointXY = { x: number; y: number };

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
