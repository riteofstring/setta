import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspacePoint } from "./workspace-document-contract.js";

export type WorkspacePlacementRect = WorkspacePoint &
  Readonly<{
    height: number;
    width: number;
  }>;

export type WorkspacePlacementSize = Readonly<{
  height: number;
  width: number;
}>;

export type WorkspaceSmartPlacementInput = Readonly<{
  grid?: readonly [x: number, y: number] | null;
  padding?: number;
  rootRects: readonly WorkspacePlacementRect[];
  size: WorkspacePlacementSize;
  viewport: WorkspacePlacementRect;
}>;

export type WorkspaceSmartPlacementResult = Readonly<{
  panTarget: WorkspacePoint | null;
  position: WorkspacePoint;
}>;

const inputKeys = ["grid", "padding", "rootRects", "size", "viewport"] as const;
const rectKeys = ["height", "width", "x", "y"] as const;
const sizeKeys = ["height", "width"] as const;
const DEFAULT_PLACEMENT_PADDING = 24;

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number < 0) {
    throw new TypeError(`${label} must be non-negative.`);
  }
  return number;
}

function positiveNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number <= 0) {
    throw new TypeError(`${label} must be positive.`);
  }
  return number;
}

function sizeAt(value: unknown, label: string): WorkspacePlacementSize {
  const size = optionOverridesAt(value, sizeKeys, label, "workspace placement size field");
  return {
    height: positiveNumber(size.height, `${label} height`),
    width: positiveNumber(size.width, `${label} width`),
  };
}

function rectAt(value: unknown, label: string): WorkspacePlacementRect {
  const rect = optionOverridesAt(value, rectKeys, label, "workspace placement rectangle field");
  return {
    height: positiveNumber(rect.height, `${label} height`),
    width: positiveNumber(rect.width, `${label} width`),
    x: finiteNumber(rect.x, `${label} x`),
    y: finiteNumber(rect.y, `${label} y`),
  };
}

function gridAt(value: unknown): readonly [number, number] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isDenseArray(value) || value.length !== 2) {
    throw new TypeError("Workspace placement grid must contain exactly two values.");
  }
  return [
    positiveNumber(value[0], "Workspace placement grid x spacing"),
    positiveNumber(value[1], "Workspace placement grid y spacing"),
  ];
}

function inputAt(value: unknown): Required<WorkspaceSmartPlacementInput> {
  const input = optionOverridesAt(
    value,
    inputKeys,
    "Workspace smart placement input",
    "workspace smart placement field",
  );
  if (!isDenseArray(input.rootRects)) {
    throw new TypeError(
      "Workspace smart placement rootRects must be a dense array without extra fields.",
    );
  }
  return {
    grid: gridAt(input.grid),
    padding:
      input.padding === undefined
        ? DEFAULT_PLACEMENT_PADDING
        : nonNegativeNumber(input.padding, "Workspace placement padding"),
    rootRects: input.rootRects.map((rect, index) =>
      rectAt(rect, `Workspace root rectangle at index ${String(index)}`),
    ),
    size: sizeAt(input.size, "Workspace placement size"),
    viewport: rectAt(input.viewport, "Workspace placement viewport"),
  };
}

function normalizedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function overlaps(
  position: WorkspacePoint,
  size: WorkspacePlacementSize,
  rect: WorkspacePlacementRect,
  padding: number,
): boolean {
  return (
    position.x < rect.x + rect.width + padding &&
    position.x + size.width + padding > rect.x &&
    position.y < rect.y + rect.height + padding &&
    position.y + size.height + padding > rect.y
  );
}

function isOpen(
  position: WorkspacePoint,
  size: WorkspacePlacementSize,
  rootRects: readonly WorkspacePlacementRect[],
  padding: number,
): boolean {
  return !rootRects.some((rect) => overlaps(position, size, rect, padding));
}

function isVisible(
  position: WorkspacePoint,
  size: WorkspacePlacementSize,
  viewport: WorkspacePlacementRect,
  margin: number,
): boolean {
  return (
    position.x >= viewport.x + margin &&
    position.y >= viewport.y + margin &&
    position.x + size.width <= viewport.x + viewport.width - margin &&
    position.y + size.height <= viewport.y + viewport.height - margin
  );
}

function uniqueSorted(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function snappedAxisValues(
  values: readonly number[],
  spacing: number | undefined,
): readonly number[] {
  if (spacing === undefined) {
    return uniqueSorted(values);
  }
  return uniqueSorted(
    values.flatMap((value) => [
      normalizedZero(spacing * Math.round(value / spacing)),
      normalizedZero(spacing * Math.ceil(value / spacing)),
    ]),
  );
}

function candidatePoints(
  viewport: WorkspacePlacementRect,
  rootRects: readonly WorkspacePlacementRect[],
  padding: number,
  grid: readonly [number, number] | null,
): readonly WorkspacePoint[] {
  const xValues = snappedAxisValues(
    [viewport.x + padding, ...rootRects.map((rect) => rect.x + rect.width + padding)],
    grid?.[0],
  );
  const yValues = snappedAxisValues(
    [viewport.y + padding, ...rootRects.map((rect) => rect.y + rect.height + padding)],
    grid?.[1],
  );
  return yValues.flatMap((y) => xValues.map((x) => ({ x, y })));
}

function firstVisiblePosition(
  input: Required<WorkspaceSmartPlacementInput>,
  margin: number,
): WorkspacePoint | null {
  const candidates = candidatePoints(input.viewport, input.rootRects, margin, input.grid);
  return (
    candidates.find(
      (position) =>
        isVisible(position, input.size, input.viewport, margin) &&
        isOpen(position, input.size, input.rootRects, input.padding),
    ) ?? null
  );
}

function outwardGridValue(value: number, spacing: number): number {
  return normalizedZero(spacing * Math.ceil(value / spacing));
}

function fallbackPosition(input: Required<WorkspaceSmartPlacementInput>): WorkspacePoint {
  const farRight = Math.max(
    input.viewport.x,
    ...input.rootRects.map((rect) => rect.x + rect.width),
  );
  const below = Math.max(input.viewport.y, ...input.rootRects.map((rect) => rect.y + rect.height));
  const rightPosition = {
    x: farRight + input.padding,
    y: input.viewport.y + input.padding,
  };
  const belowPosition = {
    x: input.viewport.x + input.padding,
    y: below + input.padding,
  };
  if (!input.grid) {
    return isOpen(rightPosition, input.size, input.rootRects, input.padding)
      ? rightPosition
      : belowPosition;
  }
  return {
    x: outwardGridValue(rightPosition.x, input.grid[0]),
    y: outwardGridValue(rightPosition.y, input.grid[1]),
  };
}

function sectionCenter(position: WorkspacePoint, size: WorkspacePlacementSize): WorkspacePoint {
  return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
}

export function planWorkspaceSectionPlacement(
  value: WorkspaceSmartPlacementInput,
): WorkspaceSmartPlacementResult {
  const input = inputAt(value);
  const visiblePosition =
    firstVisiblePosition(input, input.padding) ?? firstVisiblePosition(input, 0);
  if (visiblePosition) {
    return { panTarget: null, position: visiblePosition };
  }
  const position = fallbackPosition(input);
  return { panTarget: sectionCenter(position, input.size), position };
}
