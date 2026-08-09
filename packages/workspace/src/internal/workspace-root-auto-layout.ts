import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspacePoint } from "./workspace-document-contract.js";

export type WorkspacePackingRectangle = Readonly<{
  height: number;
  sectionId: string;
  width: number;
}>;

export type WorkspacePackedRectangle = WorkspacePackingRectangle & WorkspacePoint;

export type WorkspaceRectanglePackingInput = Readonly<{
  gap?: number;
  origin?: WorkspacePoint;
  rectangles: readonly WorkspacePackingRectangle[];
}>;

export type WorkspaceRootAutoLayoutRectangle = WorkspacePackingRectangle & WorkspacePoint;

export type WorkspaceRootAutoLayoutInput = Readonly<{
  gap?: number;
  rootRects: readonly WorkspaceRootAutoLayoutRectangle[];
}>;

export type WorkspaceRootAutoLayoutPlan = Readonly<{
  positions: Readonly<Record<string, WorkspacePoint>>;
}>;

const DEFAULT_AUTO_LAYOUT_GAP = 48;
const packingInputKeys = ["gap", "origin", "rectangles"] as const;
const packingRectangleKeys = ["height", "sectionId", "width"] as const;
const pointKeys = ["x", "y"] as const;
const rootAutoLayoutInputKeys = ["gap", "rootRects"] as const;
const rootAutoLayoutRectangleKeys = ["height", "sectionId", "width", "x", "y"] as const;

type IndexedPackingRectangle = WorkspacePackingRectangle &
  Readonly<{
    inputIndex: number;
    packedHeight: number;
    packedWidth: number;
  }>;

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number <= 0) {
    throw new TypeError(`${label} must be positive.`);
  }
  return number;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number < 0) {
    throw new TypeError(`${label} must be non-negative.`);
  }
  return number;
}

function sectionIdAt(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function pointAt(value: unknown, label: string): WorkspacePoint {
  const point = optionOverridesAt(value, pointKeys, label, "workspace packing origin field");
  if (!Object.hasOwn(point, "x") || !Object.hasOwn(point, "y")) {
    throw new TypeError(`${label} must provide x and y.`);
  }
  return {
    x: finiteNumber(point.x, `${label} x`),
    y: finiteNumber(point.y, `${label} y`),
  };
}

function gapAt(value: unknown): number {
  return value === undefined
    ? DEFAULT_AUTO_LAYOUT_GAP
    : nonNegativeNumber(value, "Workspace rectangle packing gap");
}

function packingRectangleAt(value: unknown, index: number): WorkspacePackingRectangle {
  const label = `Workspace packing rectangle at index ${String(index)}`;
  const rectangle = optionOverridesAt(
    value,
    packingRectangleKeys,
    label,
    "workspace packing rectangle field",
  );
  return {
    height: positiveNumber(rectangle.height, `${label} height`),
    sectionId: sectionIdAt(rectangle.sectionId, `${label} sectionId`),
    width: positiveNumber(rectangle.width, `${label} width`),
  };
}

function rootAutoLayoutRectangleAt(
  value: unknown,
  index: number,
): WorkspaceRootAutoLayoutRectangle {
  const label = `Workspace root auto-layout rectangle at index ${String(index)}`;
  const rectangle = optionOverridesAt(
    value,
    rootAutoLayoutRectangleKeys,
    label,
    "workspace root auto-layout rectangle field",
  );
  return {
    height: positiveNumber(rectangle.height, `${label} height`),
    sectionId: sectionIdAt(rectangle.sectionId, `${label} sectionId`),
    width: positiveNumber(rectangle.width, `${label} width`),
    x: finiteNumber(rectangle.x, `${label} x`),
    y: finiteNumber(rectangle.y, `${label} y`),
  };
}

function uniqueRectangles<T extends WorkspacePackingRectangle>(
  rectangles: readonly T[],
): readonly T[] {
  const sectionIds = new Set<string>();
  for (const rectangle of rectangles) {
    if (sectionIds.has(rectangle.sectionId)) {
      throw new TypeError(
        `Workspace rectangle packing section ID ${JSON.stringify(rectangle.sectionId)} is duplicated.`,
      );
    }
    sectionIds.add(rectangle.sectionId);
  }
  return rectangles;
}

function rectanglesAt<T extends WorkspacePackingRectangle>(
  value: unknown,
  label: string,
  parse: (candidate: unknown, index: number) => T,
): readonly T[] {
  if (!isDenseArray(value)) {
    throw new TypeError(`${label} must be a dense array without extra fields.`);
  }
  return uniqueRectangles(value.map(parse));
}

function packedDimension(size: number, gap: number): number {
  const dimension = size + gap;
  if (!Number.isFinite(dimension)) {
    throw new RangeError("Workspace rectangle packing dimensions exceed the finite number range.");
  }
  return dimension;
}

function indexedRectangles(
  rectangles: readonly WorkspacePackingRectangle[],
  gap: number,
): readonly IndexedPackingRectangle[] {
  return rectangles
    .map((rectangle, inputIndex) => ({
      ...rectangle,
      inputIndex,
      packedHeight: packedDimension(rectangle.height, gap),
      packedWidth: packedDimension(rectangle.width, gap),
    }))
    .sort(
      (left, right) =>
        right.packedHeight - left.packedHeight ||
        right.packedWidth - left.packedWidth ||
        left.inputIndex - right.inputIndex,
    );
}

function packingTargetWidth(rectangles: readonly IndexedPackingRectangle[]): number {
  let area = 0;
  let widest = 0;
  for (const rectangle of rectangles) {
    area += rectangle.packedWidth * rectangle.packedHeight;
    widest = Math.max(widest, rectangle.packedWidth);
  }
  if (!Number.isFinite(area)) {
    throw new RangeError("Workspace rectangle packing area exceeds the finite number range.");
  }
  return Math.max(widest, Math.sqrt(area));
}

function finitePackedCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Workspace rectangle packing positions exceed the finite number range.");
  }
  return Object.is(value, -0) ? 0 : value;
}

function packNormalizedRectangles(
  rectangles: readonly WorkspacePackingRectangle[],
  origin: WorkspacePoint,
  gap: number,
): readonly WorkspacePackedRectangle[] {
  const indexed = indexedRectangles(rectangles, gap);
  const targetWidth = packingTargetWidth(indexed);
  const packed: WorkspacePackedRectangle[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const rectangle of indexed) {
    if (cursorX > 0 && cursorX + rectangle.packedWidth > targetWidth) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    packed.push({
      height: rectangle.height,
      sectionId: rectangle.sectionId,
      width: rectangle.width,
      x: finitePackedCoordinate(origin.x + cursorX),
      y: finitePackedCoordinate(origin.y + cursorY),
    });
    cursorX = finitePackedCoordinate(cursorX + rectangle.packedWidth);
    rowHeight = Math.max(rowHeight, rectangle.packedHeight);
  }

  return packed;
}

export function packWorkspaceRectangles(
  value: WorkspaceRectanglePackingInput,
): readonly WorkspacePackedRectangle[] {
  const input = optionOverridesAt(
    value,
    packingInputKeys,
    "Workspace rectangle packing input",
    "workspace rectangle packing field",
  );
  if (!Object.hasOwn(input, "rectangles")) {
    throw new TypeError("Workspace rectangle packing input must provide rectangles.");
  }
  const rectangles = rectanglesAt(
    input.rectangles,
    "Workspace packing rectangles",
    packingRectangleAt,
  );
  const origin = input.origin === undefined ? { x: 0, y: 0 } : pointAt(input.origin, "Origin");
  return packNormalizedRectangles(rectangles, origin, gapAt(input.gap));
}

function rootLayoutOrigin(rectangles: readonly WorkspaceRootAutoLayoutRectangle[]): WorkspacePoint {
  const first = rectangles[0];
  if (!first) {
    return { x: 0, y: 0 };
  }
  let x = first.x;
  let y = first.y;
  for (let index = 1; index < rectangles.length; index += 1) {
    const rectangle = rectangles[index] as WorkspaceRootAutoLayoutRectangle;
    x = Math.min(x, rectangle.x);
    y = Math.min(y, rectangle.y);
  }
  return { x, y };
}

export function planWorkspaceRootAutoLayout(
  value: WorkspaceRootAutoLayoutInput,
): WorkspaceRootAutoLayoutPlan {
  const input = optionOverridesAt(
    value,
    rootAutoLayoutInputKeys,
    "Workspace root auto-layout input",
    "workspace root auto-layout field",
  );
  if (!Object.hasOwn(input, "rootRects")) {
    throw new TypeError("Workspace root auto-layout input must provide rootRects.");
  }
  const rootRects = rectanglesAt(
    input.rootRects,
    "Workspace root auto-layout rectangles",
    rootAutoLayoutRectangleAt,
  );
  const packed = packNormalizedRectangles(rootRects, rootLayoutOrigin(rootRects), gapAt(input.gap));
  return {
    positions: Object.fromEntries(
      packed.map(({ sectionId, x, y }) => [sectionId, { x, y }] as const),
    ),
  };
}
