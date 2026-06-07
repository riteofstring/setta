import type { NiriColumn } from "./types";

export function columnSlotIndex(column: NiriColumn): number {
  return normalizedSlotIndex(column.slotIndex, column.index);
}

export function compareColumnsByPlaneAndSlot(left: NiriColumn, right: NiriColumn): number {
  return (
    left.planeIndex - right.planeIndex ||
    columnSlotIndex(left) - columnSlotIndex(right) ||
    left.index - right.index
  );
}

export function normalizeColumnSlots(columns: readonly NiriColumn[]): NiriColumn[] {
  const usedSlotsByPlane = new Map<number, Set<number>>();
  const nextFallbackSlotByPlane = new Map<number, number>();
  return columns.map((column) => {
    const usedSlots = usedSlotsByPlane.get(column.planeIndex) ?? new Set<number>();
    usedSlotsByPlane.set(column.planeIndex, usedSlots);
    const fallbackSlotIndex = nextFallbackSlotByPlane.get(column.planeIndex) ?? 0;
    let slotIndex = normalizedSlotIndex(column.slotIndex, fallbackSlotIndex);
    while (usedSlots.has(slotIndex)) {
      slotIndex += 1;
    }
    usedSlots.add(slotIndex);
    nextFallbackSlotByPlane.set(column.planeIndex, Math.max(fallbackSlotIndex, slotIndex) + 1);
    return {
      ...column,
      slotIndex,
    };
  });
}

function normalizedSlotIndex(slotIndex: number | undefined, fallbackSlotIndex: number): number {
  if (typeof slotIndex !== "number" || !Number.isFinite(slotIndex)) {
    return Math.max(0, Math.floor(fallbackSlotIndex));
  }
  return Math.max(0, Math.floor(slotIndex));
}

export function nextSlotIndexForPlane(planeColumns: readonly NiriColumn[]): number {
  const lastSlotIndex = Math.max(-1, ...planeColumns.map((column) => columnSlotIndex(column)));
  return lastSlotIndex + 1;
}

export function planeHasSlot(planeColumns: readonly NiriColumn[], slotIndex: number): boolean {
  return planeColumns.some((column) => columnSlotIndex(column) === slotIndex);
}

export function shiftPlaneSlotsAtOrAfter(
  columns: readonly NiriColumn[],
  planeIndex: number,
  slotIndex: number,
): NiriColumn[] {
  return columns.map((column) =>
    column.planeIndex === planeIndex && columnSlotIndex(column) >= slotIndex
      ? { ...column, slotIndex: columnSlotIndex(column) + 1 }
      : column,
  );
}

export function slotIndexForDenseInsertion(
  planeColumns: readonly NiriColumn[],
  planeColumnIndex: number,
): number {
  if (planeColumns.length === 0) {
    return Math.max(0, Math.floor(planeColumnIndex));
  }
  const clampedPlaneColumnIndex = clamp(planeColumnIndex, 0, planeColumns.length);
  const beforeColumn = planeColumns[clampedPlaneColumnIndex];
  const afterColumn = planeColumns[clampedPlaneColumnIndex - 1];
  if (beforeColumn && afterColumn) {
    return Math.min(columnSlotIndex(beforeColumn), columnSlotIndex(afterColumn) + 1);
  }
  if (beforeColumn) {
    return Math.max(0, columnSlotIndex(beforeColumn) - 1);
  }
  if (afterColumn) {
    return columnSlotIndex(afterColumn) + 1;
  }
  return 0;
}

export function slotOffsetsForColumns({
  columnGap,
  columns,
  defaultWidth,
  widths,
}: {
  columnGap: number;
  columns: readonly NiriColumn[];
  defaultWidth: number;
  widths: readonly number[];
}): Map<number, number> {
  const slotWidths = new Map<number, number>();
  for (const column of columns) {
    const slotIndex = columnSlotIndex(column);
    const width = widths[column.index] ?? defaultWidth;
    slotWidths.set(slotIndex, Math.max(slotWidths.get(slotIndex) ?? defaultWidth, width));
  }
  const highestSlotIndex = Math.max(0, ...columns.map((column) => columnSlotIndex(column)));
  const offsets = new Map<number, number>();
  let nextOffset = 0;
  for (let slotIndex = 0; slotIndex <= highestSlotIndex; slotIndex += 1) {
    offsets.set(slotIndex, nextOffset);
    nextOffset += (slotWidths.get(slotIndex) ?? defaultWidth) + columnGap;
  }
  return offsets;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
