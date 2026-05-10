import { createGpuRetainedContentControlSubpartHitRecords } from "./retainedContentControlSubpartHits";
import { createGpuRetainedContentDateCalendarHitRecords } from "./retainedContentDateCalendarScene";
import {
  getGpuRetainedContentDiagnosticsRecorder,
  nowForGpuRetainedContentDiagnostics,
} from "./retainedContentDiagnostics";
import { createGpuRetainedContentDrawCommands } from "./retainedContentDrawCommands";
import type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
import {
  assertFiniteNonNegative,
  assertFinitePositive,
  clampInteger,
} from "./retainedContentMath";
import { createGpuRetainedContentActivePopupLayout } from "./retainedContentPopupLayout";
import {
  createGpuRetainedContentLabelRect,
  createGpuRetainedContentRowControlRect,
} from "./retainedContentRowLayout";
import {
  createGpuRetainedContentStatusBadgeRect,
  type GpuRetainedContentRowStatus,
} from "./retainedContentRowStatus";
import {
  getGpuRetainedContentSceneSourceInput,
  setGpuRetainedContentSceneSourceInput,
  type GpuRetainedContentSceneSourceInput,
} from "./retainedContentSceneSourceMetadata";
import type {
  CreateGpuRetainedRowContentSceneInput,
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentLabelAppearance,
  GpuRetainedContentPopupChoice,
  GpuRetainedContentPortAnchor,
  GpuRetainedContentRow,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowMetric,
  GpuRetainedContentRowState,
  GpuRetainedContentRowVisualBounds,
  GpuRetainedContentScene,
  GpuRetainedContentVisibleRowRange,
} from "./retainedContentSceneTypes";
import { createGpuRetainedContentScrollbarHitRecords } from "./retainedContentScrollbar";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
export type { GpuRetainedContentRowStatus } from "./retainedContentRowStatus";
export type {
  CreateGpuRetainedRowContentSceneInput,
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentColorChoice,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDragPreviewInput,
  GpuRetainedContentDrawCommand,
  GpuRetainedContentDropdownChoice,
  GpuRetainedContentDropMarkerEdge,
  GpuRetainedContentDropzoneAttachment,
  GpuRetainedContentLabelAppearance,
  GpuRetainedContentPopupChoice,
  GpuRetainedContentPortAnchor,
  GpuRetainedContentRow,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowMetric,
  GpuRetainedContentRowState,
  GpuRetainedContentScene,
  GpuRetainedContentVisibleRowRange,
} from "./retainedContentSceneTypes";

const DEFAULT_CONTROL_WIDTH = 112;
const DEFAULT_CONTROL_RIGHT_INSET = 0;
const DEFAULT_INDENT_WIDTH = 14;
const DEFAULT_LABEL_CONTROL_GAP = 8;
const DEFAULT_LABEL_APPEARANCE: GpuRetainedContentLabelAppearance = {
  fontFamily: "sans",
  fontWeight: "normal",
  tone: "default",
};
const DEFAULT_OVERSCAN_ROWS = 2;
const DEFAULT_PORT_HIT_SIZE = 12;

export function createGpuRetainedRowContentScene(
  input: CreateGpuRetainedRowContentSceneInput,
): GpuRetainedContentScene {
  validateGpuRetainedRowContentSceneInput(input);
  const sourceInput = createGpuRetainedContentSceneSourceInput(input);
  return createGpuRetainedRowContentSceneFromSourceInput({
    scrollOffset: input.scrollOffset,
    sourceInput,
  });
}

function createGpuRetainedContentSceneSourceInput(
  input: CreateGpuRetainedRowContentSceneInput,
): GpuRetainedContentSceneSourceInput {
  const controlRightInset =
    input.controlRightInset ?? DEFAULT_CONTROL_RIGHT_INSET;
  const controlWidth = input.controlWidth ?? DEFAULT_CONTROL_WIDTH;
  const indentWidth = input.indentWidth ?? DEFAULT_INDENT_WIDTH;
  const labelControlGap = input.labelControlGap ?? DEFAULT_LABEL_CONTROL_GAP;
  const portHitSize = input.portHitSize ?? DEFAULT_PORT_HIT_SIZE;
  const overscanRows = input.overscanRows ?? DEFAULT_OVERSCAN_ROWS;
  const rowVisualBounds = normalizeGpuRetainedContentRowVisualBounds({
    bounds: input.rowVisualBounds,
    viewportRect: input.viewportRect,
  });
  const rowMetrics = createGpuRetainedContentRowMetrics({
    rowHeight: input.rowHeight,
    rows: input.rows,
  });
  return {
    activePopup: input.activePopup,
    controlRightInset,
    controlWidth,
    dragPreview: input.dragPreview,
    id: input.id,
    indentWidth,
    labelControlGap,
    layout: {
      contentRect: {
        height: getGpuRetainedRowContentHeightFromMetrics({
          rowHeight: input.rowHeight,
          rowMetrics,
        }),
        width: input.viewportRect.width,
        x: 0,
        y: 0,
      },
      hasVerticalGaps: input.rows.some((row) => Boolean(row.verticalGapBefore)),
      rowMetrics,
      rowOrder: input.rows.map((row) => row.id),
    },
    overscanRows,
    ownerSectionId: input.ownerSectionId,
    portHitSize,
    rowHeight: input.rowHeight,
    rowVisualBounds,
    rows: input.rows,
    viewportRect: input.viewportRect,
  };
}

function createGpuRetainedRowContentSceneFromSourceInput({
  scrollOffset,
  sourceInput,
}: {
  readonly scrollOffset: GpuPoint;
  readonly sourceInput: GpuRetainedContentSceneSourceInput;
}): GpuRetainedContentScene {
  validateGpuRetainedRowContentSceneInput({
    ...sourceInput,
    scrollOffset,
  });
  const recordSceneBuild =
    getGpuRetainedContentDiagnosticsRecorder()?.recordSceneBuild;
  const sceneBuildStartTime = recordSceneBuild
    ? nowForGpuRetainedContentDiagnostics()
    : 0;
  const draggingRowIds = new Set(sourceInput.dragPreview?.draggingRowIds ?? []);
  const visibleRange = resolveGpuRetainedContentVisibleRowRangeFromMetrics({
    hasVerticalGaps: sourceInput.layout.hasVerticalGaps,
    overscanRows: sourceInput.overscanRows,
    rowHeight: sourceInput.rowHeight,
    rowMetrics: sourceInput.layout.rowMetrics,
    scrollOffsetY: scrollOffset.y,
    viewportHeight: sourceInput.viewportRect.height,
  });
  const visibleRows = sourceInput.layout.rowMetrics
    .slice(visibleRange.startIndex, visibleRange.endIndex)
    .map((rowMetric) =>
      createGpuRetainedContentRow({
        dragging: draggingRowIds.has(rowMetric.input.id),
        index: rowMetric.index,
        input: rowMetric.input,
        rowHeight: sourceInput.rowHeight,
        rowVisualBounds: sourceInput.rowVisualBounds,
        rowY: rowMetric.y,
        scrollOffset,
        viewportRect: sourceInput.viewportRect,
      }),
    );
  const hitRecordBuildStartTime = recordSceneBuild
    ? nowForGpuRetainedContentDiagnostics()
    : 0;
  const hitRecords = createGpuRetainedContentHitRecords({
    activePopup: sourceInput.activePopup,
    contentRect: sourceInput.layout.contentRect,
    controlRightInset: sourceInput.controlRightInset,
    controlWidth: sourceInput.controlWidth,
    indentWidth: sourceInput.indentWidth,
    labelControlGap: sourceInput.labelControlGap,
    portHitSize: sourceInput.portHitSize,
    rows: visibleRows,
    sceneId: sourceInput.id,
    scrollOffset,
    viewportRect: sourceInput.viewportRect,
  });
  const hitRecordBuildDurationMs = recordSceneBuild
    ? nowForGpuRetainedContentDiagnostics() - hitRecordBuildStartTime
    : 0;
  const scene = {
    contentRect: sourceInput.layout.contentRect,
    drawCommands: createGpuRetainedContentDrawCommands({
      activePopup: sourceInput.activePopup,
      contentRect: sourceInput.layout.contentRect,
      controlRightInset: sourceInput.controlRightInset,
      controlWidth: sourceInput.controlWidth,
      dragPreview: sourceInput.dragPreview,
      indentWidth: sourceInput.indentWidth,
      labelControlGap: sourceInput.labelControlGap,
      rowHeight: sourceInput.rowHeight,
      rowInputs: sourceInput.rows,
      rows: visibleRows,
      scrollOffset,
      sceneId: sourceInput.id,
      viewportRect: sourceInput.viewportRect,
    }),
    hitRecords,
    id: sourceInput.id,
    ownerSectionId: sourceInput.ownerSectionId,
    portAnchors: createGpuRetainedContentPortAnchors({
      portHitSize: sourceInput.portHitSize,
      rows: visibleRows,
      viewportRect: sourceInput.viewportRect,
    }),
    rowHeight: sourceInput.rowHeight,
    rowOrder: sourceInput.layout.rowOrder,
    rows: visibleRows,
    scrollOffset,
    visibleRange,
    viewportRect: sourceInput.viewportRect,
  };
  setGpuRetainedContentSceneSourceInput(scene, sourceInput);
  recordSceneBuild?.({
    activePopup: Boolean(sourceInput.activePopup),
    durationMs: nowForGpuRetainedContentDiagnostics() - sceneBuildStartTime,
    hitRecordBuildDurationMs,
    hitRecordCount: hitRecords.length,
    rowCount: sourceInput.rows.length,
    sceneId: sourceInput.id,
    timestampMs: nowForGpuRetainedContentDiagnostics(),
    visibleRowCount: visibleRows.length,
  });
  return scene;
}

export function createGpuRetainedRowContentSceneWithScrollOffset({
  scene,
  scrollOffset,
}: {
  readonly scene: GpuRetainedContentScene;
  readonly scrollOffset: GpuPoint;
}): GpuRetainedContentScene {
  const sourceInput = getGpuRetainedContentSceneSourceInput(scene);
  if (!sourceInput) {
    throw new Error(
      "Cannot scroll retained content scene without retained row source metadata.",
    );
  }
  return createGpuRetainedRowContentSceneFromSourceInput({
    scrollOffset,
    sourceInput,
  });
}

export function createGpuRetainedRowContentSceneWithScrollWindow({
  scene,
  scrollOffset,
  viewportRect,
}: {
  readonly scene: GpuRetainedContentScene;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentScene {
  const sourceInput = getGpuRetainedContentSceneSourceInput(scene);
  if (!sourceInput) {
    throw new Error(
      "Cannot create retained content scroll window without retained row source metadata.",
    );
  }
  return createGpuRetainedRowContentSceneFromSourceInput({
    scrollOffset,
    sourceInput: {
      ...sourceInput,
      viewportRect,
    },
  });
}

function getGpuRetainedRowContentHeightFromMetrics({
  rowHeight,
  rowMetrics,
}: {
  readonly rowHeight: number;
  readonly rowMetrics: readonly GpuRetainedContentRowMetric[];
}): number {
  const lastMetric = rowMetrics.at(-1);
  if (!lastMetric) {
    return 0;
  }
  return lastMetric.y + rowHeight;
}

function normalizeGpuRetainedContentRowVisualBounds({
  bounds,
  viewportRect,
}: {
  readonly bounds: GpuRetainedContentRowVisualBounds | null | undefined;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentRowVisualBounds {
  const x = bounds?.x ?? 0;
  const width = bounds?.width ?? viewportRect.width;
  assertFiniteNonNegative("retained content row visual x", x);
  assertFinitePositive("retained content row visual width", width);
  return { width, x };
}

export function getGpuRetainedRowContentHeight({
  rowHeight,
  rows,
}: {
  readonly rowHeight: number;
  readonly rows: readonly GpuRetainedContentRowInput[];
}): number {
  assertFinitePositive("retained content row height", rowHeight);
  let height = 0;
  for (const row of rows) {
    height += getGpuRetainedContentRowVerticalGapBefore(row) + rowHeight;
  }
  return height;
}

export function resolveGpuRetainedContentVisibleRowRange({
  overscanRows,
  rowCount,
  rowHeight,
  scrollOffsetY,
  viewportHeight,
}: {
  readonly overscanRows: number;
  readonly rowCount: number;
  readonly rowHeight: number;
  readonly scrollOffsetY: number;
  readonly viewportHeight: number;
}): GpuRetainedContentVisibleRowRange {
  assertFiniteNonNegative("retained row overscan", overscanRows);
  assertFiniteNonNegative("retained row count", rowCount);
  assertFinitePositive("retained row height", rowHeight);
  assertFiniteNonNegative("retained content scroll y", scrollOffsetY);
  assertFiniteNonNegative("retained content viewport height", viewportHeight);

  const startIndex = clampInteger(
    Math.floor(scrollOffsetY / rowHeight) - Math.floor(overscanRows),
    0,
    rowCount,
  );
  const endIndex = clampInteger(
    Math.ceil((scrollOffsetY + viewportHeight) / rowHeight) +
      Math.floor(overscanRows),
    startIndex,
    rowCount,
  );
  return { endIndex, rowCount, startIndex };
}

function resolveGpuRetainedContentVisibleRowRangeFromMetrics({
  hasVerticalGaps,
  overscanRows,
  rowHeight,
  rowMetrics,
  scrollOffsetY,
  viewportHeight,
}: {
  readonly hasVerticalGaps?: boolean | undefined;
  readonly overscanRows: number;
  readonly rowHeight: number;
  readonly rowMetrics: readonly GpuRetainedContentRowMetric[];
  readonly scrollOffsetY: number;
  readonly viewportHeight: number;
}): GpuRetainedContentVisibleRowRange {
  if (
    !(hasVerticalGaps ?? rowMetrics.some((row) => row.input.verticalGapBefore))
  ) {
    return resolveGpuRetainedContentVisibleRowRange({
      overscanRows,
      rowCount: rowMetrics.length,
      rowHeight,
      scrollOffsetY,
      viewportHeight,
    });
  }
  assertFiniteNonNegative("retained row overscan", overscanRows);
  assertFinitePositive("retained row height", rowHeight);
  assertFiniteNonNegative("retained content scroll y", scrollOffsetY);
  assertFiniteNonNegative("retained content viewport height", viewportHeight);
  const overscanPx = Math.floor(overscanRows) * rowHeight;
  const visibleTop = Math.max(0, scrollOffsetY - overscanPx);
  const visibleBottom = scrollOffsetY + viewportHeight + overscanPx;
  const startIndex = findFirstGpuRetainedContentRowEndingAfter({
    rowHeight,
    rowMetrics,
    y: visibleTop,
  });
  const endIndex = findFirstGpuRetainedContentRowStartingAfter({
    rowMetrics,
    startIndex,
    y: visibleBottom,
  });
  return {
    endIndex,
    rowCount: rowMetrics.length,
    startIndex,
  };
}

function createGpuRetainedContentRowMetrics({
  rowHeight,
  rows,
}: {
  readonly rowHeight: number;
  readonly rows: readonly GpuRetainedContentRowInput[];
}): readonly GpuRetainedContentRowMetric[] {
  assertFinitePositive("retained content row height", rowHeight);
  const metrics: GpuRetainedContentRowMetric[] = [];
  let y = 0;
  for (const [index, row] of rows.entries()) {
    y += getGpuRetainedContentRowVerticalGapBefore(row);
    metrics.push({ index, input: row, y });
    y += rowHeight;
  }
  return metrics;
}

function getGpuRetainedContentRowVerticalGapBefore(
  row: GpuRetainedContentRowInput,
): number {
  const gap = row.verticalGapBefore ?? 0;
  assertFiniteNonNegative("retained content row vertical gap", gap);
  return gap;
}

function findFirstGpuRetainedContentRowEndingAfter({
  rowHeight,
  rowMetrics,
  y,
}: {
  readonly rowHeight: number;
  readonly rowMetrics: readonly GpuRetainedContentRowMetric[];
  readonly y: number;
}): number {
  let lower = 0;
  let upper = rowMetrics.length;
  while (lower < upper) {
    const mid = Math.floor((lower + upper) / 2);
    const rowMetric = rowMetrics[mid];
    if (!rowMetric) {
      throw new Error(`Missing retained row metric at index ${mid}.`);
    }
    if (rowMetric.y + rowHeight < y) {
      lower = mid + 1;
    } else {
      upper = mid;
    }
  }
  return lower;
}

function findFirstGpuRetainedContentRowStartingAfter({
  rowMetrics,
  startIndex,
  y,
}: {
  readonly rowMetrics: readonly GpuRetainedContentRowMetric[];
  readonly startIndex: number;
  readonly y: number;
}): number {
  let lower = startIndex;
  let upper = rowMetrics.length;
  while (lower < upper) {
    const mid = Math.floor((lower + upper) / 2);
    const rowMetric = rowMetrics[mid];
    if (!rowMetric) {
      throw new Error(`Missing retained row metric at index ${mid}.`);
    }
    if (rowMetric.y <= y) {
      lower = mid + 1;
    } else {
      upper = mid;
    }
  }
  return lower;
}

function createGpuRetainedContentRow({
  dragging,
  index,
  input,
  rowHeight,
  rowVisualBounds,
  rowY,
  scrollOffset,
  viewportRect,
}: {
  readonly dragging: boolean;
  readonly index: number;
  readonly input: GpuRetainedContentRowInput;
  readonly rowHeight: number;
  readonly rowVisualBounds: GpuRetainedContentRowVisualBounds;
  readonly rowY: number;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentRow {
  const contentRect = {
    height: rowHeight,
    width: viewportRect.width,
    x: 0,
    y: rowY,
  };
  const visualContentRect = {
    height: rowHeight,
    width: rowVisualBounds.width,
    x: rowVisualBounds.x,
    y: rowY,
  };
  const status = input.status ?? null;
  return {
    contentRect,
    control: createGpuRetainedContentControl(input),
    controlKind: input.control?.rendererFamily ?? input.controlKind,
    depth: input.depth,
    id: input.id,
    index,
    label: input.label,
    labelAppearance: input.labelAppearance ?? DEFAULT_LABEL_APPEARANCE,
    ports: input.ports ?? [],
    projectedRect: {
      ...contentRect,
      x: viewportRect.x + contentRect.x - scrollOffset.x,
      y: viewportRect.y + contentRect.y - scrollOffset.y,
    },
    state: createGpuRetainedContentRowState(input.state, dragging, status),
    status,
    visualContentRect,
    visualProjectedRect: {
      ...visualContentRect,
      x: viewportRect.x + visualContentRect.x - scrollOffset.x,
      y: viewportRect.y + visualContentRect.y - scrollOffset.y,
    },
  };
}

function createGpuRetainedContentRowState(
  inputState: Partial<GpuRetainedContentRowState> | undefined,
  dragging: boolean,
  status: GpuRetainedContentRowStatus | null,
): GpuRetainedContentRowState {
  return {
    controlFocused: getGpuRetainedContentRowStateFlag(
      inputState,
      "controlFocused",
    ),
    disabled: getGpuRetainedContentRowStateFlag(inputState, "disabled"),
    dragging:
      dragging || getGpuRetainedContentRowStateFlag(inputState, "dragging"),
    error:
      Boolean(status) || getGpuRetainedContentRowStateFlag(inputState, "error"),
    focused: getGpuRetainedContentRowStateFlag(inputState, "focused"),
    hovered: getGpuRetainedContentRowStateFlag(inputState, "hovered"),
    nativeControlActive: getGpuRetainedContentRowStateFlag(
      inputState,
      "nativeControlActive",
    ),
    nativeLabelActive: getGpuRetainedContentRowStateFlag(
      inputState,
      "nativeLabelActive",
    ),
    searchFocused: getGpuRetainedContentRowStateFlag(
      inputState,
      "searchFocused",
    ),
    searchMatched: getGpuRetainedContentRowStateFlag(
      inputState,
      "searchMatched",
    ),
    selected: getGpuRetainedContentRowStateFlag(inputState, "selected"),
  };
}

function getGpuRetainedContentRowStateFlag(
  inputState: Partial<GpuRetainedContentRowState> | undefined,
  key: keyof GpuRetainedContentRowState,
): boolean {
  return Boolean(inputState?.[key]);
}

function createGpuRetainedContentHitRecords({
  activePopup,
  contentRect,
  controlRightInset,
  controlWidth,
  indentWidth,
  labelControlGap,
  portHitSize,
  rows,
  sceneId,
  scrollOffset,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly contentRect: GpuRect;
  readonly controlRightInset: number;
  readonly controlWidth: number;
  readonly indentWidth: number;
  readonly labelControlGap: number;
  readonly portHitSize: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly sceneId: string;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentHitRecord[] {
  const hitRecords: GpuRetainedContentHitRecord[] = [];
  for (const row of rows) {
    const controlRect = row.control
      ? createGpuRetainedContentRowControlRect({
          rightInset: controlRightInset,
          controlWidth,
          indentWidth,
          rowDepth: row.depth,
          rowRect: row.projectedRect,
        })
      : null;
    const statusBadgeRect = row.status
      ? createGpuRetainedContentStatusBadgeRect({
          controlRect,
          labelControlGap,
          rowRect: row.projectedRect,
        })
      : null;
    hitRecords.push({
      id: `row:${row.id}`,
      kind: "row",
      ownerRowId: row.id,
      rect: row.visualProjectedRect,
    });
    hitRecords.push({
      id: `label:${row.id}`,
      kind: "label",
      ownerRowId: row.id,
      rect: createGpuRetainedContentLabelRect({
        controlRect,
        labelControlGap,
        labelX: row.projectedRect.x + row.depth * indentWidth,
        rowRect: row.projectedRect,
        statusBadgeRect,
      }),
    });
    if (row.control && controlRect) {
      hitRecords.push({
        id: `control:${row.id}`,
        kind: "control",
        ownerRowId: row.id,
        rect: controlRect,
      });
      hitRecords.push(
        ...createGpuRetainedContentControlSubpartHitRecords({
          controlRect,
          row,
        }),
      );
    }
    for (const anchor of createGpuRetainedContentPortAnchors({
      portHitSize,
      rows: [row],
      viewportRect,
    })) {
      hitRecords.push({
        id: `port:${anchor.id}`,
        kind: "port",
        ownerRowId: row.id,
        rect: anchor.hitRect,
      });
    }
  }
  const popup = createGpuRetainedContentActivePopupLayout({
    activePopup,
    controlRect: (row) =>
      createGpuRetainedContentRowControlRect({
        rightInset: controlRightInset,
        controlWidth,
        indentWidth,
        rowDepth: row.depth,
        rowRect: row.projectedRect,
      }),
    rows,
    viewportRect,
  });
  if (popup) {
    hitRecords.push({
      id: `popup-background:${popup.row.id}`,
      kind: "popup-background",
      ownerRowId: popup.row.id,
      rect: popup.backgroundRect,
    });
    for (const option of popup.options) {
      hitRecords.push({
        id: `popup-option:${popup.row.id}:${option.optionIndex}`,
        kind: "popup-option",
        optionIndex: option.optionIndex,
        optionValue: getGpuRetainedContentPopupChoiceValue(option.choice),
        ownerRowId: popup.row.id,
        rect: option.rect,
      });
    }
  }
  hitRecords.push(
    ...createGpuRetainedContentDateCalendarHitRecords({
      activePopup,
      controlRect: (row) =>
        createGpuRetainedContentRowControlRect({
          rightInset: controlRightInset,
          controlWidth,
          indentWidth,
          rowDepth: row.depth,
          rowRect: row.projectedRect,
        }),
      rows,
      viewportRect,
    }),
  );
  hitRecords.push(
    ...createGpuRetainedContentScrollbarHitRecords({
      contentRect,
      sceneId,
      scrollOffset,
      viewportRect,
    }),
  );
  return hitRecords;
}

function createGpuRetainedContentPortAnchors({
  portHitSize,
  rows,
  viewportRect,
}: {
  readonly portHitSize: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentPortAnchor[] {
  return rows.flatMap((row) =>
    row.ports.map((port) => {
      const localPosition = {
        x:
          port.side === "left"
            ? viewportRect.x
            : viewportRect.x + viewportRect.width,
        y: row.projectedRect.y + row.projectedRect.height / 2,
      };
      return {
        hitRect: {
          height: portHitSize,
          width: portHitSize,
          x: localPosition.x - portHitSize / 2,
          y: localPosition.y - portHitSize / 2,
        },
        id: port.id,
        kind: port.kind,
        localPosition,
        ownerRowId: row.id,
        side: port.side,
      };
    }),
  );
}

function createGpuRetainedContentControl(
  input: GpuRetainedContentRowInput,
): GpuRetainedContentControlDescriptor | null {
  if (input.control) {
    return input.control;
  }
  if (!input.controlKind) {
    return null;
  }
  if (input.controlKind === "nested") {
    return null;
  }
  throw new Error(
    `Retained content row ${input.id} declared control kind ${JSON.stringify(
      input.controlKind,
    )} without a concrete control descriptor.`,
  );
}

function getGpuRetainedContentPopupChoiceValue(
  choice: GpuRetainedContentPopupChoice,
): string {
  return "color" in choice ? choice.color : choice.value;
}

function validateGpuRetainedRowContentSceneInput(
  input: CreateGpuRetainedRowContentSceneInput,
) {
  assertFinitePositive("retained content row height", input.rowHeight);
  if (input.controlRightInset !== undefined) {
    assertFiniteNonNegative(
      "retained content control right inset",
      input.controlRightInset,
    );
  }
  assertFiniteNonNegative(
    "retained content viewport width",
    input.viewportRect.width,
  );
  assertFiniteNonNegative(
    "retained content viewport height",
    input.viewportRect.height,
  );
  assertFiniteNonNegative("retained content scroll x", input.scrollOffset.x);
  assertFiniteNonNegative("retained content scroll y", input.scrollOffset.y);
}
