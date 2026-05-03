import { createGpuRetainedContentControlSubpartHitRecords } from "./retainedContentControlSubpartHits";
import { createGpuRetainedContentDateCalendarHitRecords } from "./retainedContentDateCalendarScene";
import type {
  GpuRetainedContentDateCalendarDescriptor,
  GpuRetainedContentDateCalendarDrawCommand,
  GpuRetainedContentDateTimeMode,
} from "./retainedContentDateCalendarTypes";
import { createGpuRetainedContentDrawCommands } from "./retainedContentDrawCommands";
import type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
import { clampInteger } from "./retainedContentMath";
import { createGpuRetainedContentActivePopupLayout } from "./retainedContentPopupLayout";
import {
  createGpuRetainedContentControlRect,
  createGpuRetainedContentLabelRect,
} from "./retainedContentRowLayout";
import {
  createGpuRetainedContentStatusBadgeRect,
  type GpuRetainedContentRowStatus,
} from "./retainedContentRowStatus";
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
  readonly ports?: readonly GpuRetainedContentRowPortInput[] | undefined;
  readonly state?: Partial<GpuRetainedContentRowState> | undefined;
  readonly status?: GpuRetainedContentRowStatus | null | undefined;
};

export type GpuRetainedContentRow = {
  readonly contentRect: GpuRect;
  readonly control: GpuRetainedContentControlDescriptor | null;
  readonly controlKind: string | null;
  readonly depth: number;
  readonly id: string;
  readonly index: number;
  readonly label: string;
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

type CreateGpuRetainedRowContentSceneInput = {
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
const DEFAULT_OVERSCAN_ROWS = 2;
const DEFAULT_PORT_HIT_SIZE = 12;

export function createGpuRetainedRowContentScene(
  input: CreateGpuRetainedRowContentSceneInput,
): GpuRetainedContentScene {
  validateGpuRetainedRowContentSceneInput(input);
  const controlRightInset =
    input.controlRightInset ?? DEFAULT_CONTROL_RIGHT_INSET;
  const controlWidth = input.controlWidth ?? DEFAULT_CONTROL_WIDTH;
  const indentWidth = input.indentWidth ?? DEFAULT_INDENT_WIDTH;
  const labelControlGap = input.labelControlGap ?? DEFAULT_LABEL_CONTROL_GAP;
  const portHitSize = input.portHitSize ?? DEFAULT_PORT_HIT_SIZE;
  const draggingRowIds = new Set(input.dragPreview?.draggingRowIds ?? []);
  const contentRect = {
    height: input.rows.length * input.rowHeight,
    width: input.viewportRect.width,
    x: 0,
    y: 0,
  };
  const visibleRange = resolveGpuRetainedContentVisibleRowRange({
    overscanRows: input.overscanRows ?? DEFAULT_OVERSCAN_ROWS,
    rowCount: input.rows.length,
    rowHeight: input.rowHeight,
    scrollOffsetY: input.scrollOffset.y,
    viewportHeight: input.viewportRect.height,
  });
  const visibleRows = input.rows
    .slice(visibleRange.startIndex, visibleRange.endIndex)
    .map((row, offset) =>
      createGpuRetainedContentRow({
        dragging: draggingRowIds.has(row.id),
        index: visibleRange.startIndex + offset,
        input: row,
        rowHeight: input.rowHeight,
        scrollOffset: input.scrollOffset,
        viewportRect: input.viewportRect,
      }),
    );

  return {
    contentRect,
    drawCommands: createGpuRetainedContentDrawCommands({
      activePopup: input.activePopup,
      controlRightInset,
      controlWidth,
      dragPreview: input.dragPreview,
      indentWidth,
      labelControlGap,
      rowHeight: input.rowHeight,
      rowInputs: input.rows,
      rows: visibleRows,
      viewportRect: input.viewportRect,
    }),
    hitRecords: createGpuRetainedContentHitRecords({
      activePopup: input.activePopup,
      controlRightInset,
      controlWidth,
      indentWidth,
      labelControlGap,
      portHitSize,
      rows: visibleRows,
      viewportRect: input.viewportRect,
    }),
    id: input.id,
    ownerSectionId: input.ownerSectionId,
    portAnchors: createGpuRetainedContentPortAnchors({
      portHitSize,
      rows: visibleRows,
      viewportRect: input.viewportRect,
    }),
    rowHeight: input.rowHeight,
    rowOrder: input.rows.map((row) => row.id),
    rows: visibleRows,
    scrollOffset: input.scrollOffset,
    visibleRange,
    viewportRect: input.viewportRect,
  };
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

function createGpuRetainedContentRow({
  dragging,
  index,
  input,
  rowHeight,
  scrollOffset,
  viewportRect,
}: {
  readonly dragging: boolean;
  readonly index: number;
  readonly input: GpuRetainedContentRowInput;
  readonly rowHeight: number;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentRow {
  const contentRect = {
    height: rowHeight,
    width: viewportRect.width,
    x: 0,
    y: index * rowHeight,
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
  controlRightInset,
  controlWidth,
  indentWidth,
  labelControlGap,
  portHitSize,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRightInset: number;
  readonly controlWidth: number;
  readonly indentWidth: number;
  readonly labelControlGap: number;
  readonly portHitSize: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentHitRecord[] {
  const hitRecords: GpuRetainedContentHitRecord[] = [];
  for (const row of rows) {
    const controlRect = row.control
      ? createGpuRetainedContentControlRect({
          rightInset: controlRightInset,
          controlWidth,
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
      createGpuRetainedContentControlRect({
        rightInset: controlRightInset,
        controlWidth,
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
        createGpuRetainedContentControlRect({
          rightInset: controlRightInset,
          controlWidth,
          rowRect: row.projectedRect,
        }),
      rows,
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

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}
