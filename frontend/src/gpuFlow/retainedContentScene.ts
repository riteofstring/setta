import { createGpuRetainedContentControlSubpartHitRecords } from "./retainedContentControlSubpartHits";
import { createGpuRetainedContentDateCalendarHitRecords } from "./retainedContentDateCalendarScene";
import type {
  GpuRetainedContentDateCalendarDescriptor,
  GpuRetainedContentDateCalendarDrawCommand,
  GpuRetainedContentDateTimeMode,
} from "./retainedContentDateCalendarTypes";
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
import {
  createGpuRetainedContentScrollbarHitRecords,
  type GpuRetainedContentScrollbarDrawCommand,
} from "./retainedContentScrollbar";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
export type { GpuRetainedContentRowStatus } from "./retainedContentRowStatus";

export type GpuRetainedContentRowState = {
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly error: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
  readonly searchFocused: boolean;
  readonly searchMatched: boolean;
  readonly selected: boolean;
};

export type GpuRetainedContentLabelAppearance = {
  readonly fontFamily: "mono" | "sans";
  readonly fontWeight: "normal" | "semibold";
  readonly tone: "accent" | "default" | "muted";
};

type GpuRetainedContentRowPortInput = {
  readonly id: string;
  readonly kind: "input" | "output";
  readonly side: "left" | "right";
};

type GpuRetainedContentControlCommitPolicy =
  | "immediate"
  | "native-island"
  | "preview-commit";

export type GpuRetainedContentColorChoice = {
  readonly color: string;
  readonly description: string;
};

export type GpuRetainedContentDropdownChoice = {
  readonly label: string;
  readonly value: string;
};

export type GpuRetainedContentDropzoneAttachment = {
  readonly id: string | null;
  readonly kind: "file" | "text";
  readonly name: string;
  readonly sizeLabel: string | null;
};

export type GpuRetainedContentPopupChoice =
  | GpuRetainedContentColorChoice
  | GpuRetainedContentDropdownChoice;

export type GpuRetainedContentControlDescriptor =
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly editorKind: "code" | "text" | "textarea";
      readonly kind: "text-like";
      readonly rendererFamily: string;
      readonly commitPolicy: "native-island";
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "button";
      readonly label: string;
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate";
    }
  | {
      readonly checked: boolean;
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "switch";
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate";
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "slider";
      readonly rendererFamily: string;
      readonly commitPolicy: "preview-commit";
      readonly max: number;
      readonly min: number;
      readonly step: number;
      readonly value: number;
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "rotary";
      readonly rendererFamily: string;
      readonly commitPolicy: "preview-commit";
      readonly max: number;
      readonly min: number;
      readonly step: number;
      readonly value: number;
    }
  | {
      readonly choices: readonly GpuRetainedContentColorChoice[];
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "color-picker";
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate" | "native-island";
      readonly selectedIndex: number | null;
    }
  | {
      readonly choices: readonly GpuRetainedContentDropdownChoice[];
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "dropdown";
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate";
      readonly selectedIndex: number | null;
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly hasSecret: boolean;
      readonly kind: "password";
      readonly placeholder: string;
      readonly rendererFamily: string;
      readonly revealAvailable: boolean;
      readonly revealPending: boolean;
      readonly revealedValue: string | null;
      readonly commitPolicy: "native-island";
    }
  | {
      readonly attachments: readonly GpuRetainedContentDropzoneAttachment[];
      readonly canAttachMore: boolean;
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "dropzone";
      readonly label: string;
      readonly maxAttachments: number | null;
      readonly mode: string;
      readonly placeholder: string;
      readonly remainingSlots: number | null;
      readonly rendererFamily: string;
      readonly commitPolicy: "native-island";
    }
  | {
      readonly calendar: GpuRetainedContentDateCalendarDescriptor | null;
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "date-time";
      readonly label: string;
      readonly mode: GpuRetainedContentDateTimeMode;
      readonly rendererFamily: string;
      readonly summaryText: string | null;
      readonly commitPolicy: GpuRetainedContentControlCommitPolicy;
    };

export type GpuRetainedContentRowInput = {
  readonly control?: GpuRetainedContentControlDescriptor | null | undefined;
  readonly controlKind: string | null;
  readonly depth: number;
  readonly id: string;
  readonly label: string;
  readonly labelAppearance?:
    | GpuRetainedContentLabelAppearance
    | null
    | undefined;
  readonly ports?: readonly GpuRetainedContentRowPortInput[] | undefined;
  readonly state?: Partial<GpuRetainedContentRowState> | undefined;
  readonly status?: GpuRetainedContentRowStatus | null | undefined;
  readonly verticalGapBefore?: number | undefined;
};

export type GpuRetainedContentRow = {
  readonly contentRect: GpuRect;
  readonly control: GpuRetainedContentControlDescriptor | null;
  readonly controlKind: string | null;
  readonly depth: number;
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly labelAppearance: GpuRetainedContentLabelAppearance;
  readonly ports: readonly GpuRetainedContentRowPortInput[];
  readonly projectedRect: GpuRect;
  readonly state: GpuRetainedContentRowState;
  readonly status: GpuRetainedContentRowStatus | null;
};

type GpuRetainedContentVisibleRowRange = {
  readonly endIndex: number;
  readonly rowCount: number;
  readonly startIndex: number;
};

export type GpuRetainedContentRowMetric = {
  readonly index: number;
  readonly input: GpuRetainedContentRowInput;
  readonly y: number;
};

export type GpuRetainedContentActivePopupInput = {
  readonly highlightedDateIso?: string | null | undefined;
  readonly highlightedOptionIndex?: number | null | undefined;
  readonly kind: "color-picker" | "date-calendar" | "dropdown";
  readonly ownerRowId: string;
};

export type GpuRetainedContentDropMarkerEdge = "after" | "before" | "inside";

export type GpuRetainedContentDrawCommand =
  | {
      readonly dividerRects: readonly GpuRect[];
      readonly kind: "row-background";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly state: GpuRetainedContentRowState;
    }
  | {
      readonly depth: number;
      readonly kind: "row-label";
      readonly appearance: GpuRetainedContentLabelAppearance;
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly text: string;
    }
  | {
      readonly kind: "row-status-badge";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly status: GpuRetainedContentRowStatus;
    }
  | {
      readonly kind: "row-status-overlay";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly status: GpuRetainedContentRowStatus;
    }
  | {
      readonly control: GpuRetainedContentControlDescriptor;
      readonly controlKind: string;
      readonly kind: "row-control";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly depth: number;
      readonly kind: "nest-guide";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly edge: GpuRetainedContentDropMarkerEdge;
      readonly kind: "row-drop-marker";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly kind: "row-drag-preview";
      readonly rect: GpuRect;
      readonly rowCount: number;
      readonly rowId: string;
      readonly text: string;
    }
  | {
      readonly kind: "control-popup-background";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly kind: "control-popup-option";
      readonly highlighted: boolean;
      readonly option: GpuRetainedContentPopupChoice;
      readonly optionIndex: number;
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly selected: boolean;
    }
  | GpuRetainedContentScrollbarDrawCommand
  | GpuRetainedContentDateCalendarDrawCommand;

export type GpuRetainedContentPortAnchor = {
  readonly hitRect: GpuRect;
  readonly id: string;
  readonly kind: "input" | "output";
  readonly localPosition: GpuPoint;
  readonly ownerRowId: string;
  readonly side: "left" | "right";
};

export type GpuRetainedContentScene = {
  readonly contentRect: GpuRect;
  readonly drawCommands: readonly GpuRetainedContentDrawCommand[];
  readonly hitRecords: readonly GpuRetainedContentHitRecord[];
  readonly id: string;
  readonly ownerSectionId: string;
  readonly portAnchors: readonly GpuRetainedContentPortAnchor[];
  readonly rowHeight: number;
  readonly rowOrder: readonly string[];
  readonly rows: readonly GpuRetainedContentRow[];
  readonly scrollOffset: GpuPoint;
  readonly visibleRange: GpuRetainedContentVisibleRowRange;
  readonly viewportRect: GpuRect;
};

export type GpuRetainedContentDragPreviewInput = {
  readonly draggingRowIds: readonly string[];
  readonly dropMarker?:
    | {
        readonly edge: GpuRetainedContentDropMarkerEdge;
        readonly rowId: string;
      }
    | null
    | undefined;
  readonly pointerLocal?: GpuPoint | null | undefined;
};

export type CreateGpuRetainedRowContentSceneInput = {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRightInset?: number | undefined;
  readonly controlWidth?: number | undefined;
  readonly dragPreview?: GpuRetainedContentDragPreviewInput | null | undefined;
  readonly id: string;
  readonly indentWidth?: number | undefined;
  readonly labelControlGap?: number | undefined;
  readonly ownerSectionId: string;
  readonly overscanRows?: number | undefined;
  readonly portHitSize?: number | undefined;
  readonly rowHeight: number;
  readonly rows: readonly GpuRetainedContentRowInput[];
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
};

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
        rowY: rowMetric.y,
        scrollOffset,
        viewportRect: sourceInput.viewportRect,
      }),
    );
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
    hitRecords: createGpuRetainedContentHitRecords({
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
    }),
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
  rowY,
  scrollOffset,
  viewportRect,
}: {
  readonly dragging: boolean;
  readonly index: number;
  readonly input: GpuRetainedContentRowInput;
  readonly rowHeight: number;
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
  };
}

function createGpuRetainedContentRowState(
  inputState: Partial<GpuRetainedContentRowState> | undefined,
  dragging: boolean,
  status: GpuRetainedContentRowStatus | null,
): GpuRetainedContentRowState {
  return {
    disabled: getGpuRetainedContentRowStateFlag(inputState, "disabled"),
    dragging:
      dragging || getGpuRetainedContentRowStateFlag(inputState, "dragging"),
    error:
      Boolean(status) || getGpuRetainedContentRowStateFlag(inputState, "error"),
    focused: getGpuRetainedContentRowStateFlag(inputState, "focused"),
    hovered: getGpuRetainedContentRowStateFlag(inputState, "hovered"),
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
      rect: row.projectedRect,
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
