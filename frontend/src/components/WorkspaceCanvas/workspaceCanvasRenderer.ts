import type {
  WorkspaceDictRowScene,
  WorkspaceMinimapScene,
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
  sectionStroke: string;
  sectionHeader: string;
  sectionHeaderText: string;
  sectionBody: string;
  rowFill: string;
  rowStroke: string;
  labelText: string;
  valueText: string;
  mutedText: string;
  rail: string;
  error: string;
  controlStroke: string;
  controlFill: string;
  controlActive: string;
  minimapFill: string;
  minimapStroke: string;
  minimapSection: string;
  minimapViewport: string;
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
    drawMinimap(context, scene.minimap, palette);
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
  drawScreenGridLines(
    context,
    options,
    minor,
    scene.viewport.x,
    scene.viewport.y,
    palette.gridMinor,
  );
  if (major >= 24) {
    drawScreenGridLines(
      context,
      options,
      major,
      scene.viewport.x,
      scene.viewport.y,
      palette.gridMajor,
    );
  }
}

function drawScreenGridLines(
  context: CanvasRenderingContext2D,
  options: WorkspaceCanvasRenderOptions,
  spacing: number,
  xOffset: number,
  yOffset: number,
  strokeStyle: string,
) {
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
  for (const sectionId of scene.sectionOrder) {
    const section = scene.sectionsById[sectionId];
    if (section) {
      drawSection(context, section, palette);
    }
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
    palette.sectionFill,
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
  drawRect(context, row.rect, palette.rowFill, palette.rowStroke);
  for (const rail of row.nestingRails) {
    drawRect(context, rail, palette.rail, null);
  }
  context.font =
    "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillStyle = row.errors.length > 0 ? palette.error : palette.labelText;
  fillClippedText(context, row.label, row.labelRect);
  context.fillStyle = palette.valueText;
  fillClippedText(context, row.passiveValue.text, row.valueRect);
  drawControlPreview(context, row, palette);
}

function drawControlPreview(
  context: CanvasRenderingContext2D,
  row: WorkspaceDictRowScene,
  palette: WorkspaceCanvasPalette,
) {
  if (row.support.controlKind === "toggle") {
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
    return;
  }
  if (row.support.controlKind === "color-swatch") {
    const swatch = insetRect(row.controlRect, 6);
    drawRoundedRect(
      context,
      swatch,
      4,
      row.passiveValue.swatchColor ?? palette.controlFill,
      palette.controlStroke,
    );
    return;
  }
  if (
    row.support.controlKind === "dropdown" ||
    row.support.controlKind === "button"
  ) {
    drawRoundedRect(
      context,
      insetRect(row.controlRect, 3),
      4,
      palette.controlFill,
      palette.controlStroke,
    );
  }
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
  minimap: WorkspaceMinimapScene,
  palette: WorkspaceCanvasPalette,
) {
  drawRoundedRect(
    context,
    minimap.bounds,
    6,
    palette.minimapFill,
    palette.minimapStroke,
  );
  for (const preview of minimap.sectionPreviews) {
    drawRoundedRect(context, preview.rect, 2, palette.minimapSection, null);
  }
  drawRoundedRect(
    context,
    minimap.viewportMask,
    2,
    "transparent",
    palette.minimapViewport,
  );
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
      sectionStroke: "rgba(148, 163, 184, 0.35)",
      sectionHeader: "#172033",
      sectionHeaderText: "#e5e7eb",
      sectionBody: "#0f172a",
      rowFill: "rgba(30, 41, 59, 0.85)",
      rowStroke: "rgba(148, 163, 184, 0.16)",
      labelText: "#cbd5e1",
      valueText: "#f8fafc",
      mutedText: "#94a3b8",
      rail: "rgba(56, 189, 248, 0.42)",
      error: "#f87171",
      controlStroke: "rgba(203, 213, 225, 0.4)",
      controlFill: "rgba(15, 23, 42, 0.95)",
      controlActive: "#38bdf8",
      minimapFill: "rgba(15, 23, 42, 0.78)",
      minimapStroke: "rgba(148, 163, 184, 0.45)",
      minimapSection: "rgba(148, 163, 184, 0.58)",
      minimapViewport: "#38bdf8",
    };
  }
  return {
    background: "#f8fafc",
    gridMajor: "rgba(100, 116, 139, 0.16)",
    gridMinor: "rgba(100, 116, 139, 0.08)",
    sectionFill: "#ffffff",
    sectionStroke: "rgba(100, 116, 139, 0.32)",
    sectionHeader: "#e2e8f0",
    sectionHeaderText: "#0f172a",
    sectionBody: "#f8fafc",
    rowFill: "rgba(255, 255, 255, 0.9)",
    rowStroke: "rgba(100, 116, 139, 0.2)",
    labelText: "#334155",
    valueText: "#0f172a",
    mutedText: "#64748b",
    rail: "rgba(14, 116, 144, 0.36)",
    error: "#dc2626",
    controlStroke: "rgba(71, 85, 105, 0.35)",
    controlFill: "rgba(241, 245, 249, 0.95)",
    controlActive: "#0891b2",
    minimapFill: "rgba(226, 232, 240, 0.82)",
    minimapStroke: "rgba(71, 85, 105, 0.35)",
    minimapSection: "rgba(71, 85, 105, 0.48)",
    minimapViewport: "#0891b2",
  };
}
