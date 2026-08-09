export type InteractionPoint = {
  x: number;
  y: number;
};

export type InteractionRect = InteractionPoint & {
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type ViewportTransform = InteractionPoint & {
  zoom: number;
};

export type DragTransform = InteractionPoint & {
  scaleX: number;
  scaleY: number;
};

export function normalizeScreenDelta(delta: InteractionPoint, zoom: number): InteractionPoint {
  assertPositiveFiniteZoom(zoom);
  assertFinitePoint(delta, "screen delta");
  return {
    x: delta.x / zoom,
    y: delta.y / zoom,
  };
}

export function screenPointToWorkspace(
  point: InteractionPoint,
  viewport: ViewportTransform,
): InteractionPoint {
  assertFinitePoint(point, "screen point");
  assertViewport(viewport);
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function workspacePointToScreen(
  point: InteractionPoint,
  viewport: ViewportTransform,
): InteractionPoint {
  assertFinitePoint(point, "workspace point");
  assertViewport(viewport);
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function resolveRectBoundsById(
  ids: readonly string[],
  rectsById: Readonly<Record<string, InteractionRect>>,
): InteractionRect | null {
  if (ids.length === 0) {
    return null;
  }

  const firstId = ids[0];
  if (!firstId) {
    return null;
  }
  const firstRect = rectsById[firstId];
  if (!firstRect) {
    return null;
  }

  let left = firstRect.x;
  let top = firstRect.y;
  let right = firstRect.right;
  let bottom = firstRect.bottom;
  for (const id of ids.slice(1)) {
    const rect = rectsById[id];
    if (!rect) {
      return null;
    }
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  return createInteractionRect(left, top, right - left, bottom - top);
}

export function resolveCanvasDropPositions(
  ids: readonly string[],
  rectsById: Readonly<Record<string, InteractionRect>>,
  screenDelta: InteractionPoint,
  viewport: ViewportTransform,
): Readonly<Record<string, InteractionPoint>> | null {
  const positions: Record<string, InteractionPoint> = {};
  for (const id of ids) {
    const rect = rectsById[id];
    if (!rect) {
      return null;
    }
    positions[id] = screenPointToWorkspace(
      { x: rect.x + screenDelta.x, y: rect.y + screenDelta.y },
      viewport,
    );
  }
  return positions;
}

export function createInteractionRect(
  x: number,
  y: number,
  width: number,
  height: number,
): InteractionRect {
  const values = [x, y, width, height];
  if (!values.every(Number.isFinite)) {
    throw new Error("Interaction rectangles require finite coordinates and dimensions.");
  }
  if (width < 0 || height < 0) {
    throw new Error("Interaction rectangle dimensions cannot be negative.");
  }
  return {
    x,
    y,
    width,
    height,
    right: x + width,
    bottom: y + height,
  };
}

export function serializeDragTransform(transform: DragTransform | null): string {
  if (!transform) {
    return "";
  }
  const translate = `translate3d(${transform.x}px, ${transform.y}px, 0)`;
  if (transform.scaleX === 1 && transform.scaleY === 1) {
    return translate;
  }
  return `${translate} scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
}

function assertViewport(viewport: ViewportTransform): void {
  assertFinitePoint(viewport, "viewport translation");
  assertPositiveFiniteZoom(viewport.zoom);
}

function assertFinitePoint(point: InteractionPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} coordinates must be finite.`);
  }
}

function assertPositiveFiniteZoom(zoom: number): void {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error("Viewport zoom must be a positive finite number.");
  }
}
