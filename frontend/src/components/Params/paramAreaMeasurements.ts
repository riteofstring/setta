import { SectionSize } from "utils/generatedTypes";

type ParamAreaMeasureKeyInput = {
  paramIds: string[];
  sectionWidth: SectionSize["width"] | null | undefined;
  columnWidth: number | null | undefined;
};

export function buildParamAreaMeasureKey({
  paramIds,
  sectionWidth,
  columnWidth,
}: ParamAreaMeasureKeyInput): string {
  const widthKey =
    typeof sectionWidth === "number"
      ? Math.round(sectionWidth)
      : sectionWidth ?? "auto";
  const columnKey = columnWidth ?? "auto";
  return `${paramIds.join("|")}::${widthKey}::${columnKey}`;
}

export function getRepresentativeRowHeight(rowHeights: number[]): number {
  const valid = rowHeights
    .filter((height) => Number.isFinite(height) && height > 0)
    .sort((a, b) => a - b);
  if (valid.length === 0) {
    return 0;
  }
  return valid[Math.floor(valid.length / 2)];
}

export function measureParamAreaMinHeight({
  rowHeights,
  headerHeight,
  paddingTop,
  paddingBottom,
}: {
  rowHeights: number[];
  headerHeight: number;
  paddingTop: number;
  paddingBottom: number;
}): number {
  const rowHeight = getRepresentativeRowHeight(rowHeights);
  if (rowHeight <= 0) {
    return 0;
  }
  return Math.ceil(paddingTop + paddingBottom + headerHeight + rowHeight);
}
