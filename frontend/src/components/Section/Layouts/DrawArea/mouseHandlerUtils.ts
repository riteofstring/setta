import type { RefObject } from "react";
import type {
  BrushStroke,
  BrushStrokeWithTransform,
  DrawAreaTransform,
} from "utils/generatedTypes";
import { getCombinedTransformForStroke } from "./canvasUtils";
import { getTransformedPoints, isPointOnStroke } from "./lowLevelStrokeUtils";
import {
  applyTransformToPoint,
  applyTransformToVector,
} from "./transformUtils";
import type { ResizeHandle, ResizeHandleCorners } from "./types";

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ImageHandleBehaviorArgs = [
  transform: DrawAreaTransform,
  scaledWidth: number,
  scaledHeight: number,
  dx: number,
  dy: number,
  artifact: { value: HTMLImageElement },
];

type ImageHandleBehavior = (...args: ImageHandleBehaviorArgs) => void;

type StrokeLike = BrushStroke | BrushStrokeWithTransform;
type StrokeCollection = StrokeLike | Array<StrokeLike>;
type StrokeContainer = { value?: StrokeCollection | null | undefined };
type StrokeSource = StrokeCollection | StrokeContainer | null | undefined;

const IMAGE_HANDLE_BEHAVIORS = [
  imageTopLeftHandleBehavior,
  imageTopRightHandleBehavior,
  imageBottomLeftHandleBehavior,
  imageBottomRightHandleBehavior,
] as const satisfies readonly ImageHandleBehavior[];

function isStrokeWithTransform(
  stroke: StrokeLike,
): stroke is BrushStrokeWithTransform {
  return Array.isArray((stroke as Partial<BrushStrokeWithTransform>).transform);
}

function normalizeStrokeSource(source: StrokeSource): StrokeLike[] {
  if (source == null) {
    return [];
  }

  let maybeCollection: StrokeCollection | null | undefined;
  if (typeof source === "object" && "value" in source) {
    maybeCollection = source.value ?? null;
  } else {
    maybeCollection = source as StrokeCollection;
  }

  if (!maybeCollection) {
    return [];
  }

  const strokes = Array.isArray(maybeCollection)
    ? maybeCollection
    : [maybeCollection];

  return strokes.filter((stroke): stroke is StrokeLike => Boolean(stroke));
}

export const getBrushStrokesBounds = (
  strokes: StrokeSource,
  artifactTransform: DrawAreaTransform,
): Bounds => {
  const bounds: Bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };

  for (const stroke of normalizeStrokeSource(strokes)) {
    if (!stroke.points) {
      continue;
    }

    const combinedTransform = isStrokeWithTransform(stroke)
      ? getCombinedTransformForStroke(artifactTransform, stroke.transform)
      : artifactTransform;

    const numericPoints = stroke.points.filter((p): p is [number, number] =>
      Array.isArray(p),
    );

    for (const point of getTransformedPoints(
      numericPoints,
      combinedTransform,
    )) {
      bounds.minX = Math.min(bounds.minX, point[0]);
      bounds.minY = Math.min(bounds.minY, point[1]);
      bounds.maxX = Math.max(bounds.maxX, point[0]);
      bounds.maxY = Math.max(bounds.maxY, point[1]);
    }
  }

  return bounds;
};

export function incrementResizeHandleCorners(
  resizeHandle: RefObject<ResizeHandle | null>,
  resizeHandleCorners: RefObject<ResizeHandleCorners | null>,
  dx: number,
  dy: number,
): void {
  if (!resizeHandle.current || !resizeHandleCorners.current) {
    return;
  }

  const corners = resizeHandleCorners.current;

  switch (resizeHandle.current.idx) {
    case 0: // Top-left
      // Top-left handle
      corners[0].x += dx;
      corners[0].y += dy;
      // Top-right handle
      corners[1].y += dy;
      // Bottom-left handle
      corners[2].x += dx;
      break;
    case 1: // Top-right
      // Top-left handle
      corners[0].y += dy;
      // Top-right handle
      corners[1].x += dx;
      corners[1].y += dy;
      // Bottom-right handle
      corners[3].x += dx;
      break;
    case 2: // Bottom-left
      // Top-left handle
      corners[0].x += dx;
      // Bottom-left handle
      corners[2].x += dx;
      corners[2].y += dy;
      // Bottom-right handle
      corners[3].y += dy;
      break;
    case 3: // Bottom-right
      // Top-right handle
      corners[1].x += dx;
      // Bottom-left handle
      corners[2].y += dy;
      // Bottom-right handle
      corners[3].x += dx;
      corners[3].y += dy;
      break;
  }
}

export function setResizeHandleCorners(
  resizeHandleCorners: RefObject<ResizeHandleCorners | null>,
  bounds: Bounds,
): void {
  resizeHandleCorners.current = [
    { x: bounds.minX, y: bounds.minY }, // Top-left
    { x: bounds.maxX, y: bounds.minY }, // Top-right
    { x: bounds.minX, y: bounds.maxY }, // Bottom-left
    { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
  ] as ResizeHandleCorners;
}

export function getTrueBoundsFromResizeHandleCorners(
  resizeHandleCorners: RefObject<ResizeHandleCorners | null>,
): Bounds {
  if (!resizeHandleCorners.current) {
    throw new Error("Resize handle corners are not initialized");
  }

  const xs = resizeHandleCorners.current.map((r) => r.x);
  const ys = resizeHandleCorners.current.map((r) => r.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function getPseudoBoundsFromResizeHandleCorners(
  resizeHandleCorners: RefObject<ResizeHandleCorners | null>,
): Bounds {
  if (!resizeHandleCorners.current) {
    throw new Error("Resize handle corners are not initialized");
  }

  return {
    minX: resizeHandleCorners.current[0].x,
    maxX: resizeHandleCorners.current[1].x,
    minY: resizeHandleCorners.current[0].y,
    maxY: resizeHandleCorners.current[2].y,
  };
}

export function getScaledWidth(
  image: HTMLImageElement,
  transform: DrawAreaTransform,
): number {
  const [dx, dy] = applyTransformToVector(transform, [image.width, 0]);
  return Math.hypot(dx, dy);
}

export function getScaledHeight(
  image: HTMLImageElement,
  transform: DrawAreaTransform,
): number {
  const [dx, dy] = applyTransformToVector(transform, [0, image.height]);
  return Math.hypot(dx, dy);
}

export function getImageBounds(
  image: HTMLImageElement,
  transform: DrawAreaTransform,
): Bounds {
  const corners = [
    applyTransformToPoint(transform, [0, 0]),
    applyTransformToPoint(transform, [image.width, 0]),
    applyTransformToPoint(transform, [0, image.height]),
    applyTransformToPoint(transform, [image.width, image.height]),
  ];

  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function getImageHandleBehaviorFn(
  resizeHandleIdx: number,
  xScaleWasPositive: boolean,
  yScaleWasPositive: boolean,
): ImageHandleBehavior {
  const mirroredBits =
    (xScaleWasPositive ? 0 : 1) | (yScaleWasPositive ? 0 : 2);
  return (
    IMAGE_HANDLE_BEHAVIORS[resizeHandleIdx ^ mirroredBits] ??
    imageTopLeftHandleBehavior
  );
}

export function preventExactZero(scale: number): number {
  if (scale === 0) {
    return 0.000001;
  }
  return scale;
}

function imageTopLeftHandleBehavior(
  ...[
    transform,
    scaledWidth,
    scaledHeight,
    dx,
    dy,
    artifact,
  ]: ImageHandleBehaviorArgs
): void {
  transform[0] = preventExactZero((scaledWidth - dx) / artifact.value.width);
  transform[3] = preventExactZero((scaledHeight - dy) / artifact.value.height);
  transform[4] += dx;
  transform[5] += dy;
}

function imageTopRightHandleBehavior(
  ...[
    transform,
    scaledWidth,
    scaledHeight,
    dx,
    dy,
    artifact,
  ]: ImageHandleBehaviorArgs
): void {
  transform[0] = preventExactZero((scaledWidth + dx) / artifact.value.width);
  transform[3] = preventExactZero((scaledHeight - dy) / artifact.value.height);
  transform[5] += dy;
}

function imageBottomLeftHandleBehavior(
  ...[
    transform,
    scaledWidth,
    scaledHeight,
    dx,
    dy,
    artifact,
  ]: ImageHandleBehaviorArgs
): void {
  transform[0] = preventExactZero((scaledWidth - dx) / artifact.value.width);
  transform[3] = preventExactZero((scaledHeight + dy) / artifact.value.height);
  transform[4] += dx;
}

function imageBottomRightHandleBehavior(
  ...[
    transform,
    scaledWidth,
    scaledHeight,
    dx,
    dy,
    artifact,
  ]: ImageHandleBehaviorArgs
): void {
  transform[0] = preventExactZero((scaledWidth + dx) / artifact.value.width);
  transform[3] = preventExactZero((scaledHeight + dy) / artifact.value.height);
}

export function detectHit(
  x: number,
  y: number,
  artifact: StrokeContainer,
  transform: DrawAreaTransform,
): boolean {
  for (const stroke of normalizeStrokeSource(artifact)) {
    const combinedTransform = isStrokeWithTransform(stroke)
      ? getCombinedTransformForStroke(transform, stroke.transform)
      : transform;

    if (isPointOnStroke(x, y, stroke, combinedTransform)) {
      return true;
    }
  }

  return false;
}
