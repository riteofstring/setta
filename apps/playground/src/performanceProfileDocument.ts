import type {
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "@setta/workspace";

export const PERFORMANCE_PROFILE_COLUMNS = 16;
export const PERFORMANCE_PROFILE_ROWS = 16;
export const PERFORMANCE_PROFILE_SECTION_COUNT =
  PERFORMANCE_PROFILE_COLUMNS * PERFORMANCE_PROFILE_ROWS;
export const PERFORMANCE_PROFILE_DRAG_TARGET_ID = "performance-drag-target";

const ORIGIN_X = 45;
const ORIGIN_Y = 45;
const COLUMN_SPACING = 270;
const ROW_SPACING = 165;
const SECTION_WIDTH = 200;
const SECTION_HEIGHT = 122;
const DRAG_TARGET_COLUMN = 3;
const DRAG_TARGET_ROW = 1;

function sectionId(column: number, row: number): string {
  if (column === DRAG_TARGET_COLUMN && row === DRAG_TARGET_ROW) {
    return PERFORMANCE_PROFILE_DRAG_TARGET_ID;
  }
  return `performance-section-${String(row).padStart(2, "0")}-${String(column).padStart(2, "0")}`;
}

function makeSection(id: string, index: number): WorkspaceSectionInput {
  const name =
    id === PERFORMANCE_PROFILE_DRAG_TARGET_ID
      ? "Performance drag target"
      : `Performance section ${String(index).padStart(3, "0")}`;
  return {
    id,
    kind: "leaf",
    name,
    data: { body: name },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function createPerformanceSections(): WorkspaceDocumentInput["sections"] {
  const sections: WorkspaceDocumentInput["sections"] = {};
  for (let row = 0; row < PERFORMANCE_PROFILE_ROWS; row += 1) {
    for (let column = 0; column < PERFORMANCE_PROFILE_COLUMNS; column += 1) {
      const id = sectionId(column, row);
      const index = row * PERFORMANCE_PROFILE_COLUMNS + column;
      sections[id] = makeSection(id, index);
    }
  }
  return sections;
}

function createPerformanceLayout(): WorkspaceDocumentInput["topLevelSections"] {
  const topLevelSections: WorkspaceDocumentInput["topLevelSections"] = {};
  for (let row = 0; row < PERFORMANCE_PROFILE_ROWS; row += 1) {
    for (let column = 0; column < PERFORMANCE_PROFILE_COLUMNS; column += 1) {
      const id = sectionId(column, row);
      topLevelSections[id] = {
        x: ORIGIN_X + column * COLUMN_SPACING,
        y: ORIGIN_Y + row * ROW_SPACING,
        w: SECTION_WIDTH,
        h: SECTION_HEIGHT,
        zIndex: row * PERFORMANCE_PROFILE_COLUMNS + column,
      };
    }
  }
  return topLevelSections;
}

export const performanceProfileDocument: WorkspaceDocumentInput = {
  sections: createPerformanceSections(),
  topLevelSections: createPerformanceLayout(),
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};
