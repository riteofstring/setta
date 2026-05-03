import { createGpuRetainedContentDateCalendarDrawCommands } from "./retainedContentDateCalendarScene";
import { clampNumber } from "./retainedContentMath";
import { createGpuRetainedContentActivePopupLayout } from "./retainedContentPopupLayout";
import {
  GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT,
  createGpuRetainedContentLabelRect,
  createGpuRetainedContentNestGuideRect,
  createGpuRetainedContentRowControlRect,
} from "./retainedContentRowLayout";
import {
  createGpuRetainedContentStatusBadgeRect,
  createGpuRetainedContentStatusOverlayRect,
} from "./retainedContentRowStatus";
import type {
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDragPreviewInput,
  GpuRetainedContentDrawCommand,
  GpuRetainedContentDropMarkerEdge,
  GpuRetainedContentRow,
  GpuRetainedContentRowInput,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

export function createGpuRetainedContentDrawCommands({
  activePopup,
  controlRightInset,
  controlWidth,
  dragPreview,
  indentWidth,
  labelControlGap,
  rowHeight,
  rowInputs,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRightInset: number;
  readonly controlWidth: number;
  readonly dragPreview?: GpuRetainedContentDragPreviewInput | null | undefined;
  readonly indentWidth: number;
  readonly labelControlGap: number;
  readonly rowHeight: number;
  readonly rowInputs: readonly GpuRetainedContentRowInput[];
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentDrawCommand[] {
  const commands: GpuRetainedContentDrawCommand[] = [];
  const statusOverlays: GpuRetainedContentDrawCommand[] = [];
  for (const row of rows) {
    const rowCommands = createGpuRetainedContentRowDrawCommands({
      controlWidth,
      controlRightInset,
      indentWidth,
      labelControlGap,
      row,
      viewportRect,
    });
    commands.push(...rowCommands.commands);
    statusOverlays.push(...rowCommands.statusOverlays);
  }
  const marker = createGpuRetainedContentDropMarkerCommand({
    dragPreview,
    indentWidth,
    rows,
    viewportRect,
  });
  if (marker) {
    commands.push(marker);
  }
  const preview = createGpuRetainedContentDragPreviewCommand({
    dragPreview,
    rowHeight,
    rowInputs,
    viewportRect,
  });
  if (preview) {
    commands.push(preview);
  }
  appendGpuRetainedContentPopupCommands({
    activePopup,
    commands,
    controlWidth,
    controlRightInset,
    indentWidth,
    rows,
    viewportRect,
  });
  commands.push(...statusOverlays);
  return commands;
}

function createGpuRetainedContentRowDrawCommands({
  controlWidth,
  controlRightInset,
  indentWidth,
  labelControlGap,
  row,
  viewportRect,
}: {
  readonly controlWidth: number;
  readonly controlRightInset: number;
  readonly indentWidth: number;
  readonly labelControlGap: number;
  readonly row: GpuRetainedContentRow;
  readonly viewportRect: GpuRect;
}): {
  readonly commands: readonly GpuRetainedContentDrawCommand[];
  readonly statusOverlays: readonly GpuRetainedContentDrawCommand[];
} {
  const labelX = row.projectedRect.x + row.depth * indentWidth;
  const controlRect = row.control
    ? createGpuRetainedContentRowControlRect({
        controlWidth,
        indentWidth,
        rightInset: controlRightInset,
        rowDepth: row.depth,
        rowRect: row.projectedRect,
      })
    : null;
  const statusCommands = createGpuRetainedContentRowStatusCommands({
    controlRect,
    labelControlGap,
    row,
    viewportRect,
  });
  const labelRect = createGpuRetainedContentLabelRect({
    controlRect,
    labelControlGap,
    labelX,
    rowRect: row.projectedRect,
    statusBadgeRect: statusCommands.badgeRect,
  });
  const commands: GpuRetainedContentDrawCommand[] = [
    {
      dividerRects: createGpuRetainedContentRowDividerRects({
        control: row.control,
        controlRect,
        labelAppearance: row.labelAppearance,
        labelRect,
      }),
      kind: "row-background",
      rect: row.projectedRect,
      rowId: row.id,
      state: row.state,
    },
  ];
  if (row.depth > 0) {
    commands.push({
      depth: row.depth,
      kind: "nest-guide",
      rect: createGpuRetainedContentNestGuideRect({
        indentWidth,
        rowDepth: row.depth,
        rowRect: row.projectedRect,
      }),
      rowId: row.id,
    });
  }
  commands.push({
    appearance: row.labelAppearance,
    depth: row.depth,
    kind: "row-label",
    rect: labelRect,
    rowId: row.id,
    text: row.label,
  });
  commands.push(...statusCommands.badges);
  if (row.control && controlRect) {
    commands.push({
      control: row.control,
      controlKind: row.control.rendererFamily,
      kind: "row-control",
      rect: controlRect,
      rowId: row.id,
    });
  }
  return {
    commands,
    statusOverlays: statusCommands.overlays,
  };
}

function createGpuRetainedContentRowDividerRects({
  control,
  controlRect,
  labelAppearance,
  labelRect,
}: {
  readonly control: GpuRetainedContentControlDescriptor | null;
  readonly controlRect: GpuRect | null;
  readonly labelAppearance: GpuRetainedContentRow["labelAppearance"];
  readonly labelRect: GpuRect;
}): readonly GpuRect[] {
  return [
    ...(shouldDrawGpuRetainedContentLabelDivider(labelAppearance)
      ? [labelRect]
      : []),
    ...(control &&
    controlRect &&
    shouldDrawGpuRetainedContentControlDivider(control)
      ? [createGpuRetainedContentControlDividerRect(controlRect)]
      : []),
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}

function createGpuRetainedContentControlDividerRect(
  controlRect: GpuRect,
): GpuRect {
  const inset = Math.min(
    GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT,
    controlRect.width,
  );
  return {
    ...controlRect,
    width: Math.max(0, controlRect.width - inset),
    x: controlRect.x + inset,
  };
}

function shouldDrawGpuRetainedContentLabelDivider(
  labelAppearance: GpuRetainedContentRow["labelAppearance"],
): boolean {
  return labelAppearance.fontFamily === "mono";
}

function shouldDrawGpuRetainedContentControlDivider(
  control: GpuRetainedContentControlDescriptor,
): boolean {
  return control.kind === "text-like" || control.kind === "date-time";
}

function createGpuRetainedContentRowStatusCommands({
  controlRect,
  labelControlGap,
  row,
  viewportRect,
}: {
  readonly controlRect: GpuRect | null;
  readonly labelControlGap: number;
  readonly row: GpuRetainedContentRow;
  readonly viewportRect: GpuRect;
}): {
  readonly badgeRect: GpuRect | null;
  readonly badges: readonly GpuRetainedContentDrawCommand[];
  readonly overlays: readonly GpuRetainedContentDrawCommand[];
} {
  const statusBadgeRect = row.status
    ? createGpuRetainedContentStatusBadgeRect({
        controlRect,
        labelControlGap,
        rowRect: row.projectedRect,
      })
    : null;
  if (!row.status || !statusBadgeRect) {
    return { badgeRect: null, badges: [], overlays: [] };
  }
  const overlayRect = createGpuRetainedContentStatusOverlayRect({
    badgeRect: statusBadgeRect,
    row,
    viewportRect,
  });
  return {
    badgeRect: statusBadgeRect,
    badges: [
      {
        kind: "row-status-badge",
        rect: statusBadgeRect,
        rowId: row.id,
        status: row.status,
      },
    ],
    overlays: overlayRect
      ? [
          {
            kind: "row-status-overlay",
            rect: overlayRect,
            rowId: row.id,
            status: row.status,
          },
        ]
      : [],
  };
}

function appendGpuRetainedContentPopupCommands({
  activePopup,
  commands,
  controlRightInset,
  controlWidth,
  indentWidth,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly commands: GpuRetainedContentDrawCommand[];
  readonly controlRightInset: number;
  readonly controlWidth: number;
  readonly indentWidth: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}) {
  const popup = createGpuRetainedContentActivePopupLayout({
    activePopup,
    controlRect: (row) =>
      createGpuRetainedContentRowControlRect({
        controlWidth,
        indentWidth,
        rightInset: controlRightInset,
        rowDepth: row.depth,
        rowRect: row.projectedRect,
      }),
    rows,
    viewportRect,
  });
  if (popup) {
    commands.push({
      kind: "control-popup-background",
      rect: popup.backgroundRect,
      rowId: popup.row.id,
    });
    for (const option of popup.options) {
      commands.push({
        highlighted: option.highlighted,
        kind: "control-popup-option",
        option: option.choice,
        optionIndex: option.optionIndex,
        rect: option.rect,
        rowId: popup.row.id,
        selected: option.selected,
      });
    }
  }
  commands.push(
    ...createGpuRetainedContentDateCalendarDrawCommands({
      activePopup,
      controlRect: (row) =>
        createGpuRetainedContentRowControlRect({
          controlWidth,
          indentWidth,
          rightInset: controlRightInset,
          rowDepth: row.depth,
          rowRect: row.projectedRect,
        }),
      rows,
      viewportRect,
    }),
  );
}

function createGpuRetainedContentDropMarkerCommand({
  dragPreview,
  indentWidth,
  rows,
  viewportRect,
}: {
  readonly dragPreview?: GpuRetainedContentDragPreviewInput | null | undefined;
  readonly indentWidth: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentDrawCommand | null {
  const marker = dragPreview?.dropMarker;
  if (!marker) {
    return null;
  }
  const row = rows.find((candidate) => candidate.id === marker.rowId);
  if (!row) {
    return null;
  }
  const rect = createGpuRetainedContentDropMarkerRect({
    edge: marker.edge,
    indentWidth,
    row,
    viewportRect,
  });
  if (!rect) {
    return null;
  }
  return {
    edge: marker.edge,
    kind: "row-drop-marker",
    rect,
    rowId: row.id,
  };
}

function createGpuRetainedContentDropMarkerRect({
  edge,
  indentWidth,
  row,
  viewportRect,
}: {
  readonly edge: GpuRetainedContentDropMarkerEdge;
  readonly indentWidth: number;
  readonly row: GpuRetainedContentRow;
  readonly viewportRect: GpuRect;
}): GpuRect | null {
  const markerHeight = edge === "inside" ? 3 : 2;
  const y = getGpuRetainedContentDropMarkerY(edge, row, markerHeight);
  if (
    y + markerHeight < viewportRect.y ||
    y > viewportRect.y + viewportRect.height
  ) {
    return null;
  }
  return {
    height: markerHeight,
    width: Math.max(
      0,
      viewportRect.width -
        getGpuRetainedContentDropMarkerInsetX(edge, row, indentWidth) -
        4,
    ),
    x:
      viewportRect.x +
      getGpuRetainedContentDropMarkerInsetX(edge, row, indentWidth),
    y,
  };
}

function getGpuRetainedContentDropMarkerY(
  edge: GpuRetainedContentDropMarkerEdge,
  row: GpuRetainedContentRow,
  markerHeight: number,
): number {
  if (edge === "inside") {
    return row.projectedRect.y + row.projectedRect.height - markerHeight - 4;
  }
  const markerCenterY =
    edge === "before"
      ? row.projectedRect.y
      : row.projectedRect.y + row.projectedRect.height;
  return markerCenterY - markerHeight / 2;
}

function getGpuRetainedContentDropMarkerInsetX(
  edge: GpuRetainedContentDropMarkerEdge,
  row: GpuRetainedContentRow,
  indentWidth: number,
): number {
  return edge === "inside" ? 4 + (row.depth + 1) * indentWidth : 4;
}

function createGpuRetainedContentDragPreviewCommand({
  dragPreview,
  rowHeight,
  rowInputs,
  viewportRect,
}: {
  readonly dragPreview?: GpuRetainedContentDragPreviewInput | null | undefined;
  readonly rowHeight: number;
  readonly rowInputs: readonly GpuRetainedContentRowInput[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentDrawCommand | null {
  const firstDraggingRowId = dragPreview?.draggingRowIds[0];
  const pointerLocal = dragPreview?.pointerLocal;
  if (!firstDraggingRowId || !pointerLocal) {
    return null;
  }
  const firstRow = rowInputs.find((row) => row.id === firstDraggingRowId);
  if (!firstRow) {
    return null;
  }
  const horizontalMargin = 8;
  const previewWidth = Math.max(
    0,
    Math.min(220, viewportRect.width - horizontalMargin * 2),
  );
  if (previewWidth <= 0) {
    return null;
  }
  const previewHeight = Math.min(rowHeight, viewportRect.height);
  const x = clampNumber(
    pointerLocal.x + horizontalMargin,
    viewportRect.x + horizontalMargin,
    viewportRect.x + viewportRect.width - previewWidth - horizontalMargin,
  );
  const y = clampNumber(
    pointerLocal.y - previewHeight / 2,
    viewportRect.y,
    viewportRect.y + viewportRect.height - previewHeight,
  );
  const rowCount = dragPreview.draggingRowIds.length;
  return {
    kind: "row-drag-preview",
    rect: {
      height: previewHeight,
      width: previewWidth,
      x,
      y,
    },
    rowCount,
    rowId: firstRow.id,
    text: firstRow.label,
  };
}
