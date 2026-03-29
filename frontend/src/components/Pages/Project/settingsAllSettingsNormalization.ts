import { createTopLevelSectionLayout } from "utils/generatedTypes";

export const SETTINGS_ALL_SETTINGS_NORMALIZATION_GRID_COLUMNS = 3;
export const SETTINGS_ALL_SETTINGS_NORMALIZATION_MIN_CELL_SIZE_PX = 600;

type SettingsAllSettingsMeasuredSectionSize = {
  height: number;
  width: number;
};

export function buildNormalizedAllSettingsTopLevelSections({
  gridColumns,
  measuredSectionSizesById,
  minimumCellSizePx,
  orderedSectionNames,
  sectionIdByName,
}: {
  gridColumns: number;
  measuredSectionSizesById: Record<
    string,
    SettingsAllSettingsMeasuredSectionSize | undefined
  >;
  minimumCellSizePx: number;
  orderedSectionNames: string[];
  sectionIdByName: Record<string, string>;
}) {
  if (!Number.isInteger(gridColumns) || gridColumns <= 0) {
    throw new Error(`Invalid All Settings normalization grid columns.`);
  }
  if (!Number.isFinite(minimumCellSizePx) || minimumCellSizePx <= 0) {
    throw new Error(`Invalid All Settings normalization minimum cell size.`);
  }

  const orderedSections = orderedSectionNames.map((sectionName, index) => {
    const sectionId = sectionIdByName[sectionName];
    if (!sectionId) {
      throw new Error(
        `Missing settings section for All Settings normalization: ${sectionName}`,
      );
    }

    const measuredSectionSize = measuredSectionSizesById[sectionId];
    if (
      !measuredSectionSize ||
      !Number.isFinite(measuredSectionSize.width) ||
      !Number.isFinite(measuredSectionSize.height) ||
      measuredSectionSize.width <= 0 ||
      measuredSectionSize.height <= 0
    ) {
      throw new Error(
        `Missing measured node size for All Settings normalization: ${sectionName}`,
      );
    }

    return {
      columnIndex: index % gridColumns,
      height: Math.max(minimumCellSizePx, measuredSectionSize.height),
      rowIndex: Math.floor(index / gridColumns),
      sectionId,
      width: Math.max(minimumCellSizePx, measuredSectionSize.width),
    };
  });

  const rowCount =
    orderedSections.reduce(
      (maxRowIndex, section) => Math.max(maxRowIndex, section.rowIndex),
      -1,
    ) + 1;
  const columnWidths = Array.from({ length: gridColumns }, () => 0);
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  orderedSections.forEach((section) => {
    columnWidths[section.columnIndex] = Math.max(
      columnWidths[section.columnIndex],
      section.width,
    );
    rowHeights[section.rowIndex] = Math.max(
      rowHeights[section.rowIndex],
      section.height,
    );
  });

  const columnOffsets = columnWidths.map((_, columnIndex) =>
    columnWidths
      .slice(0, columnIndex)
      .reduce((sum, columnWidth) => sum + columnWidth, 0),
  );
  const rowOffsets = rowHeights.map((_, rowIndex) =>
    rowHeights
      .slice(0, rowIndex)
      .reduce((sum, rowHeight) => sum + rowHeight, 0),
  );

  return Object.fromEntries(
    orderedSections.map((section) => [
      section.sectionId,
      createTopLevelSectionLayout({
        x: columnOffsets[section.columnIndex],
        y: rowOffsets[section.rowIndex],
      }),
    ]),
  );
}
