import { BackgroundVariantEnum } from "utils/generatedTypes";
import type {
  WorkspaceDictRowScene,
  WorkspaceRect,
  WorkspaceScene,
  WorkspaceScrollbarScene,
  WorkspaceSectionScene,
} from "./workspaceScene";
import { WORKSPACE_TEXT_STYLES } from "./workspaceTextMeasurementCache";

export type WorkspaceCanvasRenderOptions = {
  width: number;
  height: number;
  devicePixelRatio: number;
  isDarkMode: boolean;
  showMinimap: boolean;
  grid?: WorkspaceCanvasGridOptions;
};

export type WorkspaceCanvasGridOptions = {
  show: boolean;
  color: string;
  variant: WorkspaceCanvasGridVariant;
  patternSize: number;
  gap: readonly [number, number];
};

type WorkspaceCanvasPalette = {
  background: string;
  gridMinor: string;
  sectionFill: string;
  sectionFillHover: string;
  sectionStroke: string;
  sectionHeader: string;
  sectionHeaderText: string;
  sectionBody: string;
  rowFill: string;
  rowFillHover: string;
  rowFillSelected: string;
  rowFillActive: string;
  rowStroke: string;
  rowFocus: string;
  valueUnderline: string;
  labelText: string;
  valueText: string;
  valueNumberText: string;
  valueKeywordText: string;
  mutedText: string;
  rail: string;
  error: string;
  controlStroke: string;
  controlFill: string;
  controlActive: string;
  controlText: string;
  controlMutedText: string;
  colorSwatchStroke: string;
  colorSwatchEditMark: string;
  dropdownFill: string;
  dropdownStroke: string;
  dropdownText: string;
  popupFill: string;
  popupStroke: string;
  popupOptionFill: string;
  popupOptionHighlighted: string;
  popupOptionSelected: string;
  popupText: string;
  popupMutedText: string;
  toggleThumb: string;
  minimapFill: string;
  minimapStroke: string;
  minimapSection: string;
  minimapSectionSelected: string;
  minimapMask: string;
  minimapMaskStroke: string;
};

type WorkspaceCanvasGridVariant =
  (typeof BackgroundVariantEnum)[keyof typeof BackgroundVariantEnum];

type GridPatternSpec = {
  gapX: number;
  gapY: number;
  xOffset: number;
  yOffset: number;
  strokeOrFillStyle: string;
  patternSize: number;
};

type ControlPreviewDrawer = (
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) => void;

const CONTROL_PREVIEW_DRAWERS: Partial<
  Record<WorkspaceDictRowScene["support"]["controlKind"], ControlPreviewDrawer>
> = {
  toggle: drawToggleControlPreview,
  "color-swatch": drawColorSwatchControlPreview,
  dropdown: drawDropdownOrButtonControlPreview,
  button: drawDropdownOrButtonControlPreview,
  slider: drawSliderControlPreview,
  disclosure: drawDisclosureControlPreview,
};

export function renderWorkspaceCanvas(
  context: CanvasRenderingContext2D,
  scene: WorkspaceScene,
  options: WorkspaceCanvasRenderOptions,
) {
  const palette = getWorkspaceCanvasPalette(options.isDarkMode);
  prepareCanvas(context, options);
  drawWorkspaceBackground(context, options, palette);
  drawWorkspaceGrid(context, scene, options, palette);
  drawWorkspaceSections(context, scene, palette);
  if (options.showMinimap) {
    drawMinimap(context, scene, palette);
  }
}

function prepareCanvas(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
) {
  context.setTransform(
    options.devicePixelRatio,
    0,
    0,
    options.devicePixelRatio,
    0,
    0,
  );
  context.clearRect(0, 0, options.width, options.height);
  context.lineWidth = 1;
  context.lineJoin = "round";
  context.textBaseline = "middle";
}

function drawWorkspaceBackground(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
  palette: WorkspaceCanvasPalette,
) {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, options.width, options.height);
}

function drawWorkspaceGrid(
  context: CanvasRenderingContext2D,
  scene: WorkspaceScene,
  options: WorkspaceCanvasRenderOptions,
  palette: WorkspaceCanvasPalette,
) {
  const grid = resolveWorkspaceCanvasGridOptions(options, palette);
  if (!grid.show) {
    return;
  }
  const gapX = Math.max(1, grid.gap[0] * scene.viewport.zoom || 1);
  const gapY = Math.max(1, grid.gap[1] * scene.viewport.zoom || 1);
  const patternSize = Math.max(0.1, grid.patternSize * scene.viewport.zoom);
  if (gapX < 4 || gapY < 4) {
    return;
  }
  const spec = {
    gapX,
    gapY,
    xOffset: scene.viewport.x,
    yOffset: scene.viewport.y,
    strokeOrFillStyle: grid.color,
    patternSize,
  };
  if (grid.variant === BackgroundVariantEnum.lines) {
    drawScreenGridLines(context, options, spec);
    return;
  }
  if (grid.variant === BackgroundVariantEnum.cross) {
    drawScreenGridCrosses(context, options, spec);
    return;
  }
  drawScreenGridDots(context, options, spec);
}

function drawScreenGridDots(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
  spec: GridPatternSpec,
) {
  const { gapX, gapY, xOffset, yOffset, strokeOrFillStyle, patternSize } = spec;
  const radius = patternSize / 2;
  const normalizedXOffset = normalizeGridOffset(xOffset, gapX);
  const normalizedYOffset = normalizeGridOffset(yOffset, gapY);
  context.fillStyle = strokeOrFillStyle;
  context.beginPath();
  for (let y = normalizedYOffset; y <= options.height; y += gapY) {
    for (let x = normalizedXOffset; x <= options.width; x += gapX) {
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
  context.fill();
}

function drawScreenGridLines(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
  spec: GridPatternSpec,
) {
  const { gapX, gapY, xOffset, yOffset, strokeOrFillStyle, patternSize } = spec;
  const normalizedXOffset = normalizeGridOffset(xOffset, gapX);
  const normalizedYOffset = normalizeGridOffset(yOffset, gapY);
  context.save();
  context.strokeStyle = strokeOrFillStyle;
  context.lineWidth = patternSize;
  context.beginPath();
  for (let x = normalizedXOffset; x <= options.width; x += gapX) {
    context.moveTo(x, 0);
    context.lineTo(x, options.height);
  }
  for (let y = normalizedYOffset; y <= options.height; y += gapY) {
    context.moveTo(0, y);
    context.lineTo(options.width, y);
  }
  context.stroke();
  context.restore();
}

function drawScreenGridCrosses(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
  spec: GridPatternSpec,
) {
  const { gapX, gapY, xOffset, yOffset, strokeOrFillStyle, patternSize } = spec;
  const normalizedXOffset = normalizeGridOffset(xOffset, gapX);
  const normalizedYOffset = normalizeGridOffset(yOffset, gapY);
  const halfSize = patternSize / 2;
  context.save();
  context.strokeStyle = strokeOrFillStyle;
  context.lineWidth = patternSize;
  context.beginPath();
  for (let y = normalizedYOffset; y <= options.height; y += gapY) {
    for (let x = normalizedXOffset; x <= options.width; x += gapX) {
      context.moveTo(x - halfSize, y);
      context.lineTo(x + halfSize, y);
      context.moveTo(x, y - halfSize);
      context.lineTo(x, y + halfSize);
    }
  }
  context.stroke();
  context.restore();
}

function normalizeGridOffset(offset: number, gap: number) {
  return ((offset % gap) + gap) % gap;
}

function drawWorkspaceSections(
  context: CanvasRenderingContext2D,
  scene: WorkspaceScene,
  palette: WorkspaceCanvasPalette,
) {
  context.save();
  context.translate(scene.viewport.x, scene.viewport.y);
  context.scale(scene.viewport.zoom, scene.viewport.zoom);
  for (const sectionId of scene.rootSectionIds) {
    drawSectionRecursive(context, scene, sectionId, palette);
  }
  drawCanvasPopup(context, scene.canvasPopup, palette);
  context.restore();
}

function drawSectionRecursive(
  context: CanvasRenderingContext2D,
  scene: WorkspaceScene,
  sectionId: string,
  palette: WorkspaceCanvasPalette,
) {
  const section = scene.sectionsById[sectionId];
  if (!section) {
    return;
  }
  drawSection(context, section, palette);
  if (section.childIds.length === 0) {
    return;
  }
  context.save();
  applyClip(context, section.geometry.childContentRegion);
  for (const childId of section.childIds) {
    drawSectionRecursive(context, scene, childId, palette);
  }
  context.restore();
}

function drawSection(
  context: CanvasRenderingContext2D,
  section: WorkspaceSectionScene,
  palette: WorkspaceCanvasPalette,
) {
  context.save();
  applyRoundedClip(context, section.worldBounds, 8);
  drawRect(
    context,
    section.worldBounds,
    section.hovered ? palette.sectionFillHover : palette.sectionFill,
    null,
  );
  drawRect(context, section.geometry.header, palette.sectionHeader, null);
  drawRect(context, section.geometry.body, palette.sectionBody, null);
  context.restore();
  drawRoundedRect(context, section.worldBounds, 8, null, palette.sectionStroke);
  drawSectionTitle(context, section, palette);
  if (section.renderModel.kind === "dict") {
    drawDictToolbar(context, section);
  }
  if (section.renderModel.kind === "dict") {
    drawDictRows(context, section, section.renderModel.dict.rows, palette);
    if (section.hovered) {
      drawScrollbar(context, section.renderModel.dict.scrollbar, palette);
    }
  } else {
    drawPlaceholder(context, section, section.renderModel.reason, palette);
  }
  if (section.selected || section.active) {
    context.strokeStyle = palette.controlActive;
    context.lineWidth = 4;
    strokeRoundedRect(context, outsetRect(section.worldBounds, 2), 10);
    context.lineWidth = 1;
  }
}

function drawSectionTitle(
  context: CanvasRenderingContext2D,
  section: WorkspaceSectionScene,
  palette: WorkspaceCanvasPalette,
) {
  context.fillStyle = palette.sectionHeaderText;
  context.font = WORKSPACE_TEXT_STYLES["section-title"];
  drawSectionMenuIcon(context, section.geometry.header, palette);
  fillClippedText(
    context,
    section.titleTextPreview.displayText,
    {
      x: section.geometry.header.x + 17,
      y: section.geometry.header.y + 4,
      width: Math.max(0, section.geometry.header.width - 29),
      height: Math.min(28, section.geometry.header.height),
    },
    { paddingX: 0 },
  );
}

function drawSectionMenuIcon(
  context: CanvasRenderingContext2D,
  header: WorkspaceRect,
  palette: WorkspaceCanvasPalette,
) {
  const x = header.x + 13;
  const y = header.y + 17;
  context.strokeStyle = palette.mutedText;
  context.lineWidth = 1.25;
  context.beginPath();
  for (let offset = -4; offset <= 4; offset += 4) {
    context.moveTo(x - 5, y + offset);
    context.lineTo(x + 5, y + offset);
  }
  context.stroke();
  context.lineWidth = 1;
}

function drawDictToolbar(
  context: CanvasRenderingContext2D,
  section: WorkspaceSectionScene,
) {
  const header = section.geometry.header;
  const toolbarY = header.y + 33;
  const toolbarHeight = 18;
  context.save();
  applyClip(context, {
    x: header.x,
    y: toolbarY - 2,
    width: header.width,
    height: toolbarHeight + 4,
  });
  context.font = "700 12px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "rgba(117, 136, 174, 0.3)";
  fillClippedText(context, "ARGS", {
    x: header.x + 10,
    y: toolbarY,
    width: 34,
    height: toolbarHeight,
  });
  context.strokeStyle = "#56698f";
  context.fillStyle = "#56698f";
  context.lineWidth = 1;
  drawToolbarMinus(context, header.x + 43, toolbarY + 9);
  drawToolbarPlus(context, header.x + 64, toolbarY + 9);
  drawToolbarPin(context, header.x + 85, toolbarY + 9);
  drawToolbarLink(context, header.x + 107, toolbarY + 9);
  drawToolbarClose(context, header.x + 129, toolbarY + 9);
  drawToolbarSort(context, header.x + 150, toolbarY + 9);
  context.font = "12px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "rgba(117, 136, 174, 0.55)";
  fillClippedText(context, "Filter", {
    x: header.x + 172,
    y: toolbarY,
    width: Math.max(0, header.width - 181),
    height: toolbarHeight,
  });
  context.restore();
}

function drawToolbarMinus(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.beginPath();
  context.moveTo(x - 3, y);
  context.lineTo(x + 3, y);
  context.stroke();
}

function drawToolbarPlus(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  drawToolbarMinus(context, x, y);
  context.beginPath();
  context.moveTo(x, y - 3);
  context.lineTo(x, y + 3);
  context.stroke();
}

function drawToolbarPin(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.beginPath();
  context.arc(x, y - 2, 2.2, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, y + 4);
  context.stroke();
}

function drawToolbarLink(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.beginPath();
  context.ellipse(x - 2, y, 3, 1.8, -0.6, 0, Math.PI * 2);
  context.ellipse(x + 2, y, 3, 1.8, -0.6, 0, Math.PI * 2);
  context.stroke();
}

function drawToolbarClose(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.beginPath();
  context.moveTo(x - 3, y - 3);
  context.lineTo(x + 3, y + 3);
  context.moveTo(x + 3, y - 3);
  context.lineTo(x - 3, y + 3);
  context.stroke();
}

function drawToolbarSort(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.save();
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x - 3, y - 4);
  context.lineTo(x + 2, y - 4);
  context.moveTo(x - 3, y);
  context.lineTo(x + 1, y);
  context.moveTo(x - 3, y + 4);
  context.lineTo(x, y + 4);
  context.moveTo(x + 4, y - 4);
  context.lineTo(x + 4, y + 4);
  context.moveTo(x + 2, y + 2);
  context.lineTo(x + 4, y + 4);
  context.lineTo(x + 6, y + 2);
  context.stroke();
  context.restore();
}

function drawDictRows(
  context: CanvasRenderingContext2D,
  section: WorkspaceSectionScene,
  rows: Array<WorkspaceDictRowScene>,
  palette: WorkspaceCanvasPalette,
) {
  context.save();
  applyClip(context, section.geometry.body);
  for (const row of rows) {
    if (!row.visibleRect) {
      continue;
    }
    drawDictRow(context, row, palette);
  }
  context.restore();
}

function drawDictRow(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  drawRect(
    context,
    row.rect,
    getRowFill(row, palette),
    getRowStroke(row, palette),
  );
  for (const rail of row.nestingRails) {
    drawRect(context, rail, palette.rail, null);
  }
  context.font = WORKSPACE_TEXT_STYLES["dict-label"];
  context.fillStyle = row.errors.length > 0 ? palette.error : palette.labelText;
  fillClippedText(context, row.textPreviews.label.displayText, row.labelRect, {
    paddingX: 1,
    baselineOffsetY: 0,
  });
  drawValueCellUnderline(context, row, palette);
  if (row.codePreview) {
    drawCodePreview(context, row, palette);
  } else if (shouldDrawPassiveValueText(row)) {
    context.font = WORKSPACE_TEXT_STYLES["dict-value"];
    context.fillStyle = getValueTextFill(row, palette);
    fillClippedText(
      context,
      row.textPreviews.value.displayText,
      row.valueRect,
      {
        paddingX: 0,
      },
    );
  }
  drawControlPreview(context, row, palette);
  if (row.errors.length > 0) {
    drawErrorMarker(context, row, palette);
  }
  if (row.focused) {
    context.strokeStyle = palette.rowFocus;
    context.lineWidth = 1.5;
    strokeRect(context, insetRect(row.rect, 1));
    context.lineWidth = 1;
  }
}

function getRowFill(
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  if (row.active) {
    return palette.rowFillActive;
  }
  if (row.selected) {
    return palette.rowFillSelected;
  }
  if (row.hovered) {
    return palette.rowFillHover;
  }
  return palette.rowFill;
}

function getRowStroke(
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  if (row.errors.length > 0) {
    return palette.error;
  }
  if (row.selected || row.active || row.focused) {
    return palette.controlActive;
  }
  return null;
}

function drawValueCellUnderline(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  if (row.support.controlKind !== "value-cell") {
    return;
  }
  const y = row.valueRect.y + row.valueRect.height - 0.5;
  context.save();
  context.strokeStyle =
    row.errors.length > 0 ? palette.error : palette.valueUnderline;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(row.valueRect.x, y);
  context.lineTo(row.valueRect.x + row.valueRect.width, y);
  context.stroke();
  context.restore();
}

function getValueTextFill(
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  if (row.errors.length > 0) {
    return palette.error;
  }
  if (row.passiveValue.kind === "number") {
    return palette.valueNumberText;
  }
  if (isNullValuePreview(row.passiveValue.text)) {
    return palette.valueKeywordText;
  }
  return palette.valueText;
}

function isNullValuePreview(value: string) {
  return value === "null" || value === "None";
}

function drawCodePreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const tokenRuns = row.codePreview?.tokenRuns;
  if (!tokenRuns || tokenRuns.length === 0) {
    context.font = WORKSPACE_TEXT_STYLES["dict-value"];
    context.fillStyle = palette.valueText;
    fillClippedText(context, row.textPreviews.value.displayText, row.valueRect);
    return;
  }

  context.save();
  applyClip(context, row.valueRect);
  const lineHeight = 14;
  const baseX = row.valueRect.x + 1;
  const firstBaselineY =
    row.valueRect.y + Math.min(15, row.valueRect.height / 2 + 4);
  const maxVisibleLine = Math.max(
    0,
    Math.floor(Math.max(0, row.valueRect.height - 4) / lineHeight) - 1,
  );
  context.textBaseline = "alphabetic";
  for (const run of tokenRuns) {
    if (run.line > maxVisibleLine) {
      continue;
    }
    context.font = formatCodePreviewFont(run.fontStyle, run.fontWeight);
    context.fillStyle = run.color;
    const charWidth = context.measureText("M").width || 7;
    context.fillText(
      run.text,
      baseX + run.fromColumn * charWidth,
      firstBaselineY + run.line * lineHeight,
    );
  }
  context.textBaseline = "middle";
  context.restore();
}

function drawControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  CONTROL_PREVIEW_DRAWERS[row.support.controlKind]?.(context, row, palette);
}

function drawToggleControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const checked = row.passiveValue.text === "On";
  const rect = row.controlRect;
  drawRoundedRect(
    context,
    rect,
    rect.height / 2,
    checked ? palette.controlActive : palette.controlFill,
    null,
  );
  const knobInset = rect.height * 0.2;
  const knobSize = Math.max(4, rect.height * 0.625);
  const knobX = checked ? rect.x + knobInset + rect.height : rect.x + knobInset;
  drawRoundedRect(
    context,
    {
      x: knobX,
      y: rect.y + (rect.height - knobSize) / 2,
      width: knobSize,
      height: knobSize,
    },
    knobSize / 2,
    palette.toggleThumb,
    null,
  );
}

function drawColorSwatchControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  drawRoundedRect(
    context,
    row.controlRect,
    row.controlRect.height / 2,
    palette.colorSwatchStroke,
    null,
  );
  const swatchRect = insetRect(row.controlRect, 1);
  drawRoundedRect(
    context,
    swatchRect,
    swatchRect.height / 2,
    row.passiveValue.swatchColor ?? palette.controlFill,
    null,
  );
  drawColorPickerGlyph(context, row.controlRect, palette);
}

function drawDropdownOrButtonControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const rect = row.controlRect;
  const fillStyle =
    row.support.controlKind === "dropdown"
      ? palette.dropdownFill
      : palette.controlFill;
  const strokeStyle =
    row.support.controlKind === "dropdown"
      ? palette.dropdownStroke
      : palette.controlStroke;
  drawRoundedRect(
    context,
    rect,
    row.support.controlKind === "dropdown" ? rect.height / 2 : 4,
    fillStyle,
    strokeStyle,
  );
  context.fillStyle =
    row.support.controlKind === "dropdown"
      ? palette.dropdownText
      : palette.controlText;
  context.font =
    row.support.controlKind === "dropdown"
      ? '500 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      : WORKSPACE_TEXT_STYLES["dict-control"];
  fillClippedText(
    context,
    row.textPreviews.control?.displayText ?? row.passiveValue.text,
    rect,
    {
      paddingX: row.support.controlKind === "dropdown" ? 12 : 10,
      baselineOffsetY: row.support.controlKind === "dropdown" ? 1 : 0,
    },
  );
  if (row.support.controlKind === "dropdown") {
    drawChevronDown(context, rect, palette);
  }
}

function drawColorPickerGlyph(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  palette: WorkspaceCanvasPalette,
) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  context.save();
  context.strokeStyle = palette.colorSwatchEditMark;
  context.lineCap = "round";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX + 2, centerY - 3);
  context.lineTo(centerX - 3, centerY + 2);
  context.stroke();
  context.restore();
}

function shouldDrawPassiveValueText(row: WorkspaceDictRowScene) {
  return row.support.controlKind === "value-cell";
}

function drawSliderControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const rect = insetRect(row.controlRect, 6);
  const midY = rect.y + rect.height / 2;
  context.strokeStyle = palette.controlStroke;
  context.beginPath();
  context.moveTo(rect.x, midY);
  context.lineTo(rect.x + rect.width, midY);
  context.stroke();
  drawRoundedRect(
    context,
    { x: rect.x, y: midY - 5, width: 10, height: 10 },
    5,
    palette.controlActive,
    null,
  );
}

function drawDisclosureControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  if (row.disclosureExpanded === false) {
    drawChevronRight(context, insetRect(row.controlRect, 5), palette);
    return;
  }
  drawChevronDownCentered(context, insetRect(row.controlRect, 5), palette);
}

function drawChevronDown(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  palette: WorkspaceCanvasPalette,
) {
  const centerX = rect.x + rect.width - 12;
  const centerY = rect.y + rect.height / 2 + 1;
  context.strokeStyle = palette.controlMutedText;
  context.beginPath();
  context.moveTo(centerX - 4, centerY - 2);
  context.lineTo(centerX, centerY + 2);
  context.lineTo(centerX + 4, centerY - 2);
  context.stroke();
}

function drawChevronRight(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  palette: WorkspaceCanvasPalette,
) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  context.strokeStyle = palette.controlMutedText;
  context.beginPath();
  context.moveTo(centerX - 2, centerY - 5);
  context.lineTo(centerX + 3, centerY);
  context.lineTo(centerX - 2, centerY + 5);
  context.stroke();
}

function drawChevronDownCentered(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  palette: WorkspaceCanvasPalette,
) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  context.strokeStyle = palette.controlMutedText;
  context.beginPath();
  context.moveTo(centerX - 5, centerY - 2);
  context.lineTo(centerX, centerY + 3);
  context.lineTo(centerX + 5, centerY - 2);
  context.stroke();
}

function drawCanvasPopup(
  context: CanvasRenderingContext2D,
  popup: WorkspaceScene["canvasPopup"],
  palette: WorkspaceCanvasPalette,
) {
  if (!popup) {
    return;
  }
  drawRoundedRect(
    context,
    popup.bounds,
    6,
    palette.popupFill,
    palette.popupStroke,
  );
  context.save();
  applyRoundedClip(context, popup.bounds, 6);
  for (const option of popup.options) {
    drawCanvasPopupOption(context, popup.kind, option, palette);
  }
  context.restore();
}

function drawCanvasPopupOption(
  context: CanvasRenderingContext2D,
  popupKind: NonNullable<WorkspaceScene["canvasPopup"]>["kind"],
  option: NonNullable<WorkspaceScene["canvasPopup"]>["options"][number],
  palette: WorkspaceCanvasPalette,
) {
  const fill = option.highlighted
    ? palette.popupOptionHighlighted
    : option.selected
      ? palette.popupOptionSelected
      : palette.popupOptionFill;
  drawRoundedRect(context, option.rect, 4, fill, null);
  const swatchSize = popupKind === "color-palette" ? 14 : 0;
  if (popupKind === "color-palette") {
    const swatchRect = {
      x: option.rect.x + 8,
      y: option.rect.y + (option.rect.height - swatchSize) / 2,
      width: swatchSize,
      height: swatchSize,
    };
    drawRoundedRect(
      context,
      swatchRect,
      3,
      option.swatchColor ?? palette.controlFill,
      palette.popupStroke,
    );
  }
  context.font = WORKSPACE_TEXT_STYLES["dict-control"];
  context.fillStyle =
    option.selected || option.highlighted
      ? palette.popupText
      : palette.popupMutedText;
  fillClippedText(context, option.label, option.rect, {
    paddingX: popupKind === "color-palette" ? 30 : 10,
  });
}

function drawErrorMarker(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const radius = 3;
  context.beginPath();
  context.arc(
    row.rect.x + row.rect.width - 9,
    row.rect.y + row.rect.height / 2,
    radius,
    0,
    Math.PI * 2,
  );
  context.fillStyle = palette.error;
  context.fill();
}

function drawScrollbar(
  context: CanvasRenderingContext2D,
  scrollbar: WorkspaceScrollbarScene | null,
  palette: WorkspaceCanvasPalette,
) {
  if (!scrollbar) {
    return;
  }
  drawRoundedRect(context, scrollbar.track, 4, palette.controlFill, null);
  drawRoundedRect(context, scrollbar.thumb, 4, palette.controlStroke, null);
}

function drawPlaceholder(
  context: CanvasRenderingContext2D,
  section: WorkspaceSectionScene,
  text: string,
  palette: WorkspaceCanvasPalette,
) {
  context.font =
    "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillStyle = palette.mutedText;
  fillClippedText(context, text, insetRect(section.geometry.body, 12));
}

function drawMinimap(
  context: CanvasRenderingContext2D,
  scene: WorkspaceScene,
  palette: WorkspaceCanvasPalette,
) {
  const minimap = scene.minimap;
  drawRoundedRect(
    context,
    minimap.bounds,
    6,
    palette.minimapFill,
    palette.minimapStroke,
  );
  for (const preview of minimap.sectionPreviews) {
    const section = scene.sectionsById[preview.sectionId];
    drawRoundedRect(
      context,
      preview.rect,
      2,
      section?.selected
        ? palette.minimapSectionSelected
        : palette.minimapSection,
      null,
    );
  }
  drawMinimapViewportMask(context, minimap, palette);
}

function drawMinimapViewportMask(
  context: CanvasRenderingContext2D,
  minimap: WorkspaceScene["minimap"],
  palette: WorkspaceCanvasPalette,
) {
  context.save();
  context.beginPath();
  context.rect(
    minimap.bounds.x,
    minimap.bounds.y,
    minimap.bounds.width,
    minimap.bounds.height,
  );
  context.rect(
    minimap.viewportMask.x,
    minimap.viewportMask.y,
    minimap.viewportMask.width,
    minimap.viewportMask.height,
  );
  context.fillStyle = palette.minimapMask;
  context.fill("evenodd");
  context.lineWidth = 2;
  drawRoundedRect(
    context,
    minimap.viewportMask,
    2,
    "transparent",
    palette.minimapMaskStroke,
  );
  context.restore();
}

function formatCodePreviewFont(
  fontStyle: "normal" | "italic" | undefined,
  fontWeight: "normal" | "bold" | undefined,
) {
  return `${fontStyle ?? "normal"} ${fontWeight ?? "normal"} 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
}

function drawRect(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  fillStyle: string | null,
  strokeStyle: string | null,
) {
  if (fillStyle) {
    context.fillStyle = fillStyle;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    strokeRect(context, rect);
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  radius: number,
  fillStyle: string | null,
  strokeStyle: string | null,
) {
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  if (fillStyle && fillStyle !== "transparent") {
    context.fillStyle = fillStyle;
    context.fill();
  }
  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.stroke();
  }
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  radius: number,
) {
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  context.stroke();
}

function strokeRect(context: CanvasRenderingContext2D, rect: WorkspaceRect) {
  context.strokeRect(
    Math.round(rect.x) + 0.5,
    Math.round(rect.y) + 0.5,
    Math.max(0, Math.round(rect.width)),
    Math.max(0, Math.round(rect.height)),
  );
}

function fillClippedText(
  context: CanvasRenderingContext2D,
  text: string,
  rect: WorkspaceRect,
  options: { paddingX?: number; baselineOffsetY?: number } = {},
) {
  context.save();
  applyClip(context, rect);
  context.fillText(
    text,
    rect.x + (options.paddingX ?? 6),
    rect.y + rect.height / 2 + (options.baselineOffsetY ?? 0),
  );
  context.restore();
}

function applyClip(context: CanvasRenderingContext2D, rect: WorkspaceRect) {
  context.beginPath();
  context.rect(
    rect.x,
    rect.y,
    Math.max(0, rect.width),
    Math.max(0, rect.height),
  );
  context.clip();
}

function applyRoundedClip(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  radius: number,
) {
  context.beginPath();
  context.roundRect(
    rect.x,
    rect.y,
    Math.max(0, rect.width),
    Math.max(0, rect.height),
    radius,
  );
  context.clip();
}

function insetRect(rect: WorkspaceRect, inset: number): WorkspaceRect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
  };
}

function outsetRect(rect: WorkspaceRect, outset: number): WorkspaceRect {
  return {
    x: rect.x - outset,
    y: rect.y - outset,
    width: rect.width + outset * 2,
    height: rect.height + outset * 2,
  };
}

function resolveWorkspaceCanvasGridOptions(
  options: WorkspaceCanvasRenderOptions,
  palette: WorkspaceCanvasPalette,
): WorkspaceCanvasGridOptions {
  return {
    show: true,
    color: palette.gridMinor,
    variant: BackgroundVariantEnum.dots,
    patternSize: 2,
    gap: [15, 15],
    ...options.grid,
  };
}

function getWorkspaceCanvasPalette(
  isDarkMode: boolean,
): WorkspaceCanvasPalette {
  if (isDarkMode) {
    return {
      background: "#1c2331",
      gridMinor: "#2b364a",
      sectionFill: "#10141b",
      sectionFillHover: "#151c26",
      sectionStroke: "#2b374a",
      sectionHeader: "#10141b",
      sectionHeaderText: "rgb(150, 164, 192)",
      sectionBody: "#10141b",
      rowFill: "#10141b",
      rowFillHover: "#172033",
      rowFillSelected: "rgba(37, 99, 235, 0.22)",
      rowFillActive: "rgba(37, 99, 235, 0.3)",
      rowStroke: "rgba(75, 92, 118, 0.42)",
      rowFocus: "#60a5fa",
      valueUnderline: "rgba(71, 85, 105, 0.3)",
      labelText: "rgb(182, 192, 211)",
      valueText: "#a5d6ff",
      valueNumberText: "#79c0ff",
      valueKeywordText: "#ff7b72",
      mutedText: "#64748b",
      rail: "rgba(71, 85, 105, 0.76)",
      error: "#f87171",
      controlStroke: "rgba(203, 213, 225, 0.4)",
      controlFill: "hsl(219, 25%, 34%)",
      controlActive: "#1d4ed8",
      controlText: "#e5e7eb",
      controlMutedText: "#64748b",
      colorSwatchStroke: "rgba(86, 105, 143, 0.4)",
      colorSwatchEditMark: "#020617",
      dropdownFill: "#0b0e13",
      dropdownStroke: "rgba(43, 54, 74, 0.7)",
      dropdownText: "rgb(150, 164, 192)",
      popupFill: "#0b0e13",
      popupStroke: "rgba(96, 165, 250, 0.42)",
      popupOptionFill: "rgba(15, 23, 42, 0)",
      popupOptionHighlighted: "rgba(37, 99, 235, 0.34)",
      popupOptionSelected: "rgba(71, 85, 105, 0.28)",
      popupText: "#e5e7eb",
      popupMutedText: "rgb(150, 164, 192)",
      toggleThumb: "hsl(220, 26%, 14%)",
      minimapFill: "hsla(220, 27%, 6%, 0.72)",
      minimapStroke: "hsla(220, 26%, 14%, 0.55)",
      minimapSection: "#2d384d",
      minimapSectionSelected: "#2d384d",
      minimapMask: "rgb(20, 22, 31, 0.5)",
      minimapMaskStroke: "rgba(226, 232, 240, 0)",
    };
  }
  return {
    background: "#94a3b8",
    gridMinor: "#94a3b8",
    sectionFill: "#eff1f6",
    sectionFillHover: "#e2e8f0",
    sectionStroke: "#d8dee8",
    sectionHeader: "#eff1f6",
    sectionHeaderText: "#0f172a",
    sectionBody: "#eff1f6",
    rowFill: "#eff1f6",
    rowFillHover: "rgba(226, 232, 240, 0.86)",
    rowFillSelected: "rgba(59, 130, 246, 0.16)",
    rowFillActive: "rgba(59, 130, 246, 0.22)",
    rowStroke: "rgba(100, 116, 139, 0.2)",
    rowFocus: "#0e7490",
    valueUnderline: "rgba(100, 116, 139, 0.28)",
    labelText: "#1b202d",
    valueText: "#0f172a",
    valueNumberText: "#0550ae",
    valueKeywordText: "#cf222e",
    mutedText: "#94a3b8",
    rail: "rgba(14, 116, 144, 0.36)",
    error: "#dc2626",
    controlStroke: "rgba(71, 85, 105, 0.35)",
    controlFill: "hsl(220, 26%, 57%)",
    controlActive: "#3b82f6",
    controlText: "#0f172a",
    controlMutedText: "#7588ae",
    colorSwatchStroke: "rgba(100, 116, 139, 0.2)",
    colorSwatchEditMark: "#020617",
    dropdownFill: "#ffffff",
    dropdownStroke: "#e2e8f0",
    dropdownText: "#475569",
    popupFill: "#ffffff",
    popupStroke: "rgba(14, 116, 144, 0.32)",
    popupOptionFill: "rgba(255, 255, 255, 0)",
    popupOptionHighlighted: "rgba(14, 116, 144, 0.16)",
    popupOptionSelected: "rgba(100, 116, 139, 0.14)",
    popupText: "#0f172a",
    popupMutedText: "#475569",
    toggleThumb: "#ffffff",
    minimapFill: "rgba(226, 232, 240, 0.82)",
    minimapStroke: "rgba(71, 85, 105, 0.35)",
    minimapSection: "rgba(71, 85, 105, 0.48)",
    minimapSectionSelected: "rgba(8, 145, 178, 0.78)",
    minimapMask: "rgb(51, 65, 85, 0.3)",
    minimapMaskStroke: "rgba(30, 41, 59, 0.6)",
  };
}
