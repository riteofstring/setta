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
  return currentActivators
    .filter((activator) => sectionId === undefined || activator.sectionId === sectionId)
    .map(copyCanvasOwnedTextActivator);
}

export function resolveCanvasOwnedTextActivatorAtGraphPoint({
  sectionId,
  x,
  y,
}: {
  sectionId?: string;
  x: number;
  y: number;
}) {
  for (const activator of currentActivators) {
    if (sectionId !== undefined && activator.sectionId !== sectionId) {
      continue;
    }
    if (
      x >= activator.x &&
      x <= activator.x + activator.width &&
      y >= activator.y &&
      y <= activator.y + activator.height
    ) {
      return copyCanvasOwnedTextActivator(activator);
    }
  }

  return null;
}
