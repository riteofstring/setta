export type CanvasOwnedTextActivator = {
  height: number;
  sectionId: string;
  targetId: string;
  width: number;
  x: number;
  y: number;
  zIndex: number;
};

declare global {
  var __SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__:
    | Array<CanvasOwnedTextActivator>
    | undefined;
}

let currentActivators: Array<CanvasOwnedTextActivator> = [];

type CanvasOwnedTextActivatorGraphPoint = {
  sectionId?: string;
  x: number;
  y: number;
};

type CanvasOwnedTextActivatorHitSlopOptions = {
  minimumScreenHitSizePx?: number;
  viewportScale?: number;
};

function compareCanvasOwnedTextActivators(
  left: CanvasOwnedTextActivator,
  right: CanvasOwnedTextActivator,
) {
  if (left.zIndex !== right.zIndex) {
    return right.zIndex - left.zIndex;
  }

  const leftArea = left.width * left.height;
  const rightArea = right.width * right.height;
  if (leftArea !== rightArea) {
    return leftArea - rightArea;
  }

  if (left.sectionId !== right.sectionId) {
    return left.sectionId.localeCompare(right.sectionId);
  }

  return left.targetId.localeCompare(right.targetId);
}

function copyCanvasOwnedTextActivator(
  activator: CanvasOwnedTextActivator,
): CanvasOwnedTextActivator {
  return { ...activator };
}

function syncCanvasOwnedTextActivatorGlobal() {
  globalThis.__SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__ = currentActivators.map(
    copyCanvasOwnedTextActivator,
  );
}

function getCanvasOwnedTextActivatorSource() {
  const globalActivators = globalThis.__SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__;
  return Array.isArray(globalActivators) ? globalActivators : currentActivators;
}

function expandCanvasOwnedTextActivatorBounds({
  activator,
  minimumScreenHitSizePx,
  viewportScale,
}: {
  activator: CanvasOwnedTextActivator;
} & CanvasOwnedTextActivatorHitSlopOptions) {
  if (
    !Number.isFinite(minimumScreenHitSizePx) ||
    minimumScreenHitSizePx === undefined ||
    minimumScreenHitSizePx <= 0 ||
    !Number.isFinite(viewportScale) ||
    viewportScale === undefined ||
    viewportScale <= 0
  ) {
    return {
      maxX: activator.x + activator.width,
      maxY: activator.y + activator.height,
      minX: activator.x,
      minY: activator.y,
    };
  }

  const minimumGraphHitSize = minimumScreenHitSizePx / viewportScale;
  const horizontalPadding = Math.max(
    0,
    (minimumGraphHitSize - activator.width) * 0.5,
  );
  const verticalPadding = Math.max(
    0,
    (minimumGraphHitSize - activator.height) * 0.5,
  );

  return {
    maxX: activator.x + activator.width + horizontalPadding,
    maxY: activator.y + activator.height + verticalPadding,
    minX: activator.x - horizontalPadding,
    minY: activator.y - verticalPadding,
  };
}

export function replaceCanvasOwnedTextActivators(
  nextActivators: Array<CanvasOwnedTextActivator>,
) {
  currentActivators = [...nextActivators].sort(compareCanvasOwnedTextActivators);
  syncCanvasOwnedTextActivatorGlobal();
}

export function clearCanvasOwnedTextActivators() {
  currentActivators = [];
  syncCanvasOwnedTextActivatorGlobal();
}

export function getCanvasOwnedTextActivatorSnapshot({
  sectionId,
}: {
  sectionId?: string;
} = {}) {
  return getCanvasOwnedTextActivatorSource()
    .filter((activator) => sectionId === undefined || activator.sectionId === sectionId)
    .map(copyCanvasOwnedTextActivator);
}

export function resolveCanvasOwnedTextActivatorAtGraphPoint({
  sectionId,
  minimumScreenHitSizePx,
  viewportScale,
  x,
  y,
}: CanvasOwnedTextActivatorGraphPoint & CanvasOwnedTextActivatorHitSlopOptions) {
  let bestMatch:
    | {
        activator: CanvasOwnedTextActivator;
        area: number;
        centerDistance: number;
      }
    | undefined;

  for (const activator of getCanvasOwnedTextActivatorSource()) {
    if (sectionId !== undefined && activator.sectionId !== sectionId) {
      continue;
    }
    const bounds = expandCanvasOwnedTextActivatorBounds({
      activator,
      minimumScreenHitSizePx,
      viewportScale,
    });
    if (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      y >= bounds.minY &&
      y <= bounds.maxY
    ) {
      const centerDistance = Math.hypot(
        x - (activator.x + activator.width * 0.5),
        y - (activator.y + activator.height * 0.5),
      );
      const area = activator.width * activator.height;

      if (
        bestMatch === undefined ||
        centerDistance < bestMatch.centerDistance ||
        (centerDistance === bestMatch.centerDistance &&
          activator.zIndex > bestMatch.activator.zIndex) ||
        (centerDistance === bestMatch.centerDistance &&
          activator.zIndex === bestMatch.activator.zIndex &&
          area < bestMatch.area) ||
        (centerDistance === bestMatch.centerDistance &&
          activator.zIndex === bestMatch.activator.zIndex &&
          area === bestMatch.area &&
          activator.targetId.localeCompare(bestMatch.activator.targetId) < 0)
      ) {
        bestMatch = {
          activator,
          area,
          centerDistance,
        };
      }
    }
  }

  return bestMatch ? copyCanvasOwnedTextActivator(bestMatch.activator) : null;
}
