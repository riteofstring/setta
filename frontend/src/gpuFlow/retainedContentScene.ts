import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentRowState = {
  readonly disabled: boolean;
  readonly error: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
  readonly selected: boolean;
};

export type GpuRetainedContentRowPortInput = {
  readonly id: string;
  readonly kind: "input" | "output";
  readonly side: "left" | "right";
};

export type GpuRetainedContentRowInput = {
  readonly controlKind: string | null;
  readonly depth: number;
  readonly id: string;
  readonly label: string;
  readonly ports?: readonly GpuRetainedContentRowPortInput[] | undefined;
  readonly state?: Partial<GpuRetainedContentRowState> | undefined;
};

export type GpuRetainedContentRow = {
  readonly contentRect: GpuRect;
  readonly controlKind: string | null;
  readonly depth: number;
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly ports: readonly GpuRetainedContentRowPortInput[];
  readonly projectedRect: GpuRect;
  readonly state: GpuRetainedContentRowState;
};

export type GpuRetainedContentVisibleRowRange = {
  readonly endIndex: number;
  readonly rowCount: number;
  readonly startIndex: number;
};

export type GpuRetainedContentDrawCommand =
  | {
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
    };

export type GpuRetainedContentHitRecord = {
  readonly id: string;
  readonly kind: "control" | "port" | "row";
  readonly ownerRowId: string;
  readonly rect: GpuRect;
};

export type GpuRetainedContentPortAnchor = {
  readonly hitRect: GpuRect;
  readonly id: string;
  readonly kind: "input" | "output";
  readonly localPosition: GpuPoint;
  readonly ownerRowId: string;
};

export type GpuRetainedContentScene = {
  readonly contentRect: GpuRect;
  readonly drawCommands: readonly GpuRetainedContentDrawCommand[];
  readonly hitRecords: readonly GpuRetainedContentHitRecord[];
  readonly id: string;
  readonly ownerSectionId: string;
  readonly portAnchors: readonly GpuRetainedContentPortAnchor[];
  readonly rowHeight: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly scrollOffset: GpuPoint;
  readonly visibleRange: GpuRetainedContentVisibleRowRange;
  readonly viewportRect: GpuRect;
};

export type CreateGpuRetainedRowContentSceneInput = {
  readonly controlWidth?: number | undefined;
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
const DEFAULT_INDENT_WIDTH = 14;
const DEFAULT_LABEL_CONTROL_GAP = 8;
const DEFAULT_OVERSCAN_ROWS = 2;
const DEFAULT_PORT_HIT_SIZE = 12;

export function createGpuRetainedRowContentScene(
  input: CreateGpuRetainedRowContentSceneInput,
): GpuRetainedContentScene {
  validateGpuRetainedRowContentSceneInput(input);
  const controlWidth = input.controlWidth ?? DEFAULT_CONTROL_WIDTH;
  const indentWidth = input.indentWidth ?? DEFAULT_INDENT_WIDTH;
  const labelControlGap = input.labelControlGap ?? DEFAULT_LABEL_CONTROL_GAP;
  const portHitSize = input.portHitSize ?? DEFAULT_PORT_HIT_SIZE;
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
      controlWidth,
      indentWidth,
      labelControlGap,
      rows: visibleRows,
    }),
    hitRecords: createGpuRetainedContentHitRecords({
      controlWidth,
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
  index,
  input,
  rowHeight,
  scrollOffset,
  viewportRect,
}: {
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
  return {
    contentRect,
    controlKind: input.controlKind,
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
    state: {
      disabled: Boolean(input.state?.disabled),
      error: Boolean(input.state?.error),
      focused: Boolean(input.state?.focused),
      hovered: Boolean(input.state?.hovered),
      selected: Boolean(input.state?.selected),
    },
  };
}

function createGpuRetainedContentDrawCommands({
  controlWidth,
  indentWidth,
  labelControlGap,
  rows,
}: {
  readonly controlWidth: number;
  readonly indentWidth: number;
  readonly labelControlGap: number;
  readonly rows: readonly GpuRetainedContentRow[];
}): GpuRetainedContentDrawCommand[] {
  const commands: GpuRetainedContentDrawCommand[] = [];
  for (const row of rows) {
    commands.push({
      kind: "row-background",
      rect: row.projectedRect,
      rowId: row.id,
      state: row.state,
    });
    if (row.depth > 0) {
      commands.push({
        depth: row.depth,
        kind: "nest-guide",
        rect: {
          height: row.projectedRect.height,
          width: Math.max(1, Math.min(2, indentWidth / 4)),
          x: row.projectedRect.x + (row.depth - 0.5) * indentWidth,
          y: row.projectedRect.y,
        },
        rowId: row.id,
      });
    }
    const labelX = row.projectedRect.x + row.depth * indentWidth;
    const controlRect = createGpuRetainedContentControlRect({
      controlWidth,
      rowRect: row.projectedRect,
    });
    commands.push({
      depth: row.depth,
      kind: "row-label",
      rect: {
        height: row.projectedRect.height,
        width: Math.max(0, controlRect.x - labelControlGap - labelX),
        x: labelX,
        y: row.projectedRect.y,
      },
      rowId: row.id,
      text: row.label,
    });
    if (row.controlKind) {
      commands.push({
        controlKind: row.controlKind,
        kind: "row-control",
        rect: controlRect,
        rowId: row.id,
      });
    }
  }
  return commands;
}

function createGpuRetainedContentHitRecords({
  controlWidth,
  portHitSize,
  rows,
  viewportRect,
}: {
  readonly controlWidth: number;
  readonly portHitSize: number;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentHitRecord[] {
  const hitRecords: GpuRetainedContentHitRecord[] = [];
  for (const row of rows) {
    hitRecords.push({
      id: `row:${row.id}`,
      kind: "row",
      ownerRowId: row.id,
      rect: row.projectedRect,
    });
    if (row.controlKind) {
      hitRecords.push({
        id: `control:${row.id}`,
        kind: "control",
        ownerRowId: row.id,
        rect: createGpuRetainedContentControlRect({
          controlWidth,
          rowRect: row.projectedRect,
        }),
      });
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
      };
    }),
  );
}

function createGpuRetainedContentControlRect({
  controlWidth,
  rowRect,
}: {
  readonly controlWidth: number;
  readonly rowRect: GpuRect;
}): GpuRect {
  const width = Math.min(controlWidth, rowRect.width);
  return {
    height: rowRect.height,
    width,
    x: rowRect.x + rowRect.width - width,
    y: rowRect.y,
  };
}

function validateGpuRetainedRowContentSceneInput(
  input: CreateGpuRetainedRowContentSceneInput,
) {
  assertFinitePositive("retained content row height", input.rowHeight);
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

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
