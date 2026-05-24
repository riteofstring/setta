import type {
  WorkspaceDictRowScene,
  WorkspaceRect,
  WorkspaceScene,
  WorkspaceScrollbarScene,
  WorkspaceSectionScene,
} from "./workspaceScene";

export type WorkspaceCanvasRenderOptions = {
  width: number;
  height: number;
  devicePixelRatio: number;
  isDarkMode: boolean;
  showMinimap: boolean;
};

type WorkspaceCanvasPalette = {
  background: string;
  gridMajor: string;
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
  labelText: string;
  valueText: string;
  mutedText: string;
  rail: string;
  error: string;
  controlStroke: string;
  controlFill: string;
  controlActive: string;
  controlText: string;
  controlMutedText: string;
  minimapFill: string;
  minimapStroke: string;
  minimapSection: string;
  minimapSectionSelected: string;
  minimapViewport: string;
};

type GridLineSpec = {
  spacing: number;
  xOffset: number;
  yOffset: number;
  strokeStyle: string;
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
  const minor = 32 * scene.viewport.zoom;
  const major = minor * 4;
  if (minor < 8) {
    return;
  }
  drawScreenGridLines(context, options, {
    spacing: minor,
    xOffset: scene.viewport.x,
    yOffset: scene.viewport.y,
    strokeStyle: palette.gridMinor,
  });
  if (major >= 24) {
    drawScreenGridLines(context, options, {
      spacing: major,
      xOffset: scene.viewport.x,
      yOffset: scene.viewport.y,
      strokeStyle: palette.gridMajor,
    });
  }
}

function drawScreenGridLines(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
  spec: GridLineSpec,
) {
  const { spacing, xOffset, yOffset, strokeStyle } = spec;
  const normalizedXOffset = ((xOffset % spacing) + spacing) % spacing;
  const normalizedYOffset = ((yOffset % spacing) + spacing) % spacing;
  context.strokeStyle = strokeStyle;
  context.beginPath();
  for (let x = normalizedXOffset; x <= options.width; x += spacing) {
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, options.height);
  }
  for (let y = normalizedYOffset; y <= options.height; y += spacing) {
    context.moveTo(0, Math.round(y) + 0.5);
    context.lineTo(options.width, Math.round(y) + 0.5);
  }
  context.stroke();
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
  drawRect(
    context,
    section.worldBounds,
    section.hovered ? palette.sectionFillHover : palette.sectionFill,
    palette.sectionStroke,
  );
  drawRect(context, section.geometry.header, palette.sectionHeader, null);
  drawRect(context, section.geometry.body, palette.sectionBody, null);
  drawSectionTitle(context, section, palette);
  if (section.renderModel.kind === "dict") {
    drawDictRows(context, section, section.renderModel.dict.rows, palette);
    drawScrollbar(context, section.renderModel.dict.scrollbar, palette);
  } else {
    drawPlaceholder(context, section, section.renderModel.reason, palette);
  }
  if (section.selected || section.active) {
    context.strokeStyle = palette.controlActive;
    context.lineWidth = 2;
    strokeRect(context, section.worldBounds);
    context.lineWidth = 1;
  }
}

function drawSectionTitle(
  context: CanvasRenderingContext2D,
  section: WorkspaceSectionScene,
  palette: WorkspaceCanvasPalette,
) {
  context.fillStyle = palette.sectionHeaderText;
  context.font =
    "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  fillClippedText(context, section.name, {
    x: section.geometry.header.x + 12,
    y: section.geometry.header.y,
    width: Math.max(0, section.geometry.header.width - 24),
    height: section.geometry.header.height,
  });
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
  context.font =
    "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillStyle = row.errors.length > 0 ? palette.error : palette.labelText;
  fillClippedText(context, row.label, row.labelRect);
  if (row.codePreview) {
    drawCodePreview(context, row, palette);
  } else {
    context.fillStyle = palette.valueText;
    fillClippedText(context, row.passiveValue.text, row.valueRect);
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
  return palette.rowStroke;
}

function drawCodePreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const tokenRuns = row.codePreview?.tokenRuns;
  if (!tokenRuns || tokenRuns.length === 0) {
    context.fillStyle = palette.valueText;
    fillClippedText(context, row.passiveValue.text, row.valueRect);
    return;
  }

  context.save();
  applyClip(context, row.valueRect);
  const lineHeight = 14;
  const baseX = row.valueRect.x + 6;
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
  const rect = insetRect(row.controlRect, 5);
  drawRoundedRect(
    context,
    rect,
    rect.height / 2,
    checked ? palette.controlActive : palette.controlFill,
    palette.controlStroke,
  );
  const knobSize = Math.max(8, rect.height - 8);
  const knobX = checked ? rect.x + rect.width - knobSize - 4 : rect.x + 4;
  drawRoundedRect(
    context,
    { x: knobX, y: rect.y + 4, width: knobSize, height: knobSize },
    knobSize / 2,
    "#ffffff",
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
    insetRect(row.controlRect, 6),
    4,
    row.passiveValue.swatchColor ?? palette.controlFill,
    palette.controlStroke,
  );
}

function drawDropdownOrButtonControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  const rect = insetRect(row.controlRect, 3);
  drawRoundedRect(context, rect, 4, palette.controlFill, palette.controlStroke);
  context.fillStyle = palette.controlText;
  context.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  fillClippedText(context, row.passiveValue.text, insetRect(rect, 2));
  if (row.support.controlKind === "dropdown") {
    drawChevronDown(context, rect, palette);
  }
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
  drawChevronRight(context, insetRect(row.controlRect, 5), palette);
}

function drawChevronDown(
  context: CanvasRenderingContext2D,
  rect: WorkspaceRect,
  palette: WorkspaceCanvasPalette,
) {
  const centerX = rect.x + rect.width - 12;
  const centerY = rect.y + rect.height / 2;
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
  drawRoundedRect(
    context,
    minimap.viewportMask,
    2,
    "transparent",
    palette.minimapViewport,
  );
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
) {
  context.save();
  applyClip(context, rect);
  context.fillText(text, rect.x + 6, rect.y + rect.height / 2);
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

function insetRect(rect: WorkspaceRect, inset: number): WorkspaceRect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
  };
}

function getWorkspaceCanvasPalette(
  isDarkMode: boolean,
): WorkspaceCanvasPalette {
  if (isDarkMode) {
    return {
      background: "#080b12",
      gridMajor: "rgba(148, 163, 184, 0.16)",
      gridMinor: "rgba(148, 163, 184, 0.07)",
      sectionFill: "#111827",
      sectionFillHover: "#142036",
      sectionStroke: "rgba(148, 163, 184, 0.35)",
      sectionHeader: "#172033",
      sectionHeaderText: "#e5e7eb",
      sectionBody: "#0f172a",
      rowFill: "rgba(30, 41, 59, 0.85)",
      rowFillHover: "rgba(51, 65, 85, 0.88)",
      rowFillSelected: "rgba(14, 116, 144, 0.26)",
      rowFillActive: "rgba(8, 145, 178, 0.34)",
      rowStroke: "rgba(148, 163, 184, 0.16)",
      rowFocus: "#7dd3fc",
      labelText: "#cbd5e1",
      valueText: "#f8fafc",
      mutedText: "#94a3b8",
      rail: "rgba(56, 189, 248, 0.42)",
      error: "#f87171",
      controlStroke: "rgba(203, 213, 225, 0.4)",
      controlFill: "rgba(15, 23, 42, 0.95)",
      controlActive: "#38bdf8",
      controlText: "#e5e7eb",
      controlMutedText: "#94a3b8",
      minimapFill: "rgba(15, 23, 42, 0.78)",
      minimapStroke: "rgba(148, 163, 184, 0.45)",
      minimapSection: "rgba(148, 163, 184, 0.58)",
      minimapSectionSelected: "rgba(56, 189, 248, 0.88)",
      minimapViewport: "#38bdf8",
    };
  }
  return {
    background: "#f8fafc",
    gridMajor: "rgba(100, 116, 139, 0.16)",
    gridMinor: "rgba(100, 116, 139, 0.08)",
    sectionFill: "#ffffff",
    sectionFillHover: "#f8fafc",
    sectionStroke: "rgba(100, 116, 139, 0.32)",
    sectionHeader: "#e2e8f0",
    sectionHeaderText: "#0f172a",
    sectionBody: "#f8fafc",
    rowFill: "rgba(255, 255, 255, 0.9)",
    rowFillHover: "rgba(226, 232, 240, 0.86)",
    rowFillSelected: "rgba(8, 145, 178, 0.16)",
    rowFillActive: "rgba(8, 145, 178, 0.22)",
    rowStroke: "rgba(100, 116, 139, 0.2)",
    rowFocus: "#0e7490",
    labelText: "#334155",
    valueText: "#0f172a",
    mutedText: "#64748b",
    rail: "rgba(14, 116, 144, 0.36)",
    error: "#dc2626",
    controlStroke: "rgba(71, 85, 105, 0.35)",
    controlFill: "rgba(241, 245, 249, 0.95)",
    controlActive: "#0891b2",
    controlText: "#0f172a",
    controlMutedText: "#64748b",
    minimapFill: "rgba(226, 232, 240, 0.82)",
    minimapStroke: "rgba(71, 85, 105, 0.35)",
    minimapSection: "rgba(71, 85, 105, 0.48)",
    minimapSectionSelected: "rgba(8, 145, 178, 0.78)",
    minimapViewport: "#0891b2",
  };
}
