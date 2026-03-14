import type { TopLevelSectionLayout } from "utils/generatedTypes";

export type CanvasEngineSelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_SELECTION_WIDTH = 320;
const DEFAULT_SELECTION_HEIGHT = 200;

export function getCanvasEngineTopLevelSelectionBounds({
  activeSectionIds,
  topLevelSections,
}: {
  activeSectionIds: string[];
  topLevelSections: Record<string, TopLevelSectionLayout>;
}): CanvasEngineSelectionBounds | null {
  const selectedLayouts = activeSectionIds
    .map((sectionId) => topLevelSections[sectionId] ?? null)
    .filter((layout): layout is TopLevelSectionLayout => layout !== null);

  if (selectedLayouts.length === 0) {
    return null;
  }

  const left = Math.min(
    ...selectedLayouts.map((layout) =>
      typeof layout.x === "number" ? layout.x : 0,
    ),
  );
  const top = Math.min(
    ...selectedLayouts.map((layout) =>
      typeof layout.y === "number" ? layout.y : 0,
    ),
  );
  const right = Math.max(
    ...selectedLayouts.map((layout) => {
      const x = typeof layout.x === "number" ? layout.x : 0;
      const width =
        typeof layout.w === "number" ? layout.w : DEFAULT_SELECTION_WIDTH;
      return x + width;
    }),
  );
  const bottom = Math.max(
    ...selectedLayouts.map((layout) => {
      const y = typeof layout.y === "number" ? layout.y : 0;
      const height =
        typeof layout.h === "number" ? layout.h : DEFAULT_SELECTION_HEIGHT;
      return y + height;
    }),
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function getCanvasEngineKeyboardMoveDelta({
  key,
  isShiftPressed,
  snapToGrid,
  snapGrid,
}: {
  key: string;
  isShiftPressed: boolean;
  snapToGrid: boolean;
  snapGrid: [number, number];
}): { x: number; y: number } | null {
  const baseDeltaByKey: Record<string, { x: number; y: number }> = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };
  const baseDelta = baseDeltaByKey[key];
  if (!baseDelta) {
    return null;
  }
  const factor = isShiftPressed ? 4 : 1;
  const xVelocity = snapToGrid ? snapGrid[0] : 5;
  const yVelocity = snapToGrid ? snapGrid[1] : 5;
  return {
    x: baseDelta.x * xVelocity * factor,
    y: baseDelta.y * yVelocity * factor,
  };
}
