import type {
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentColorChoice,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentColorPickerControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "color-picker" }
>;

type GpuRetainedContentColorPopupRow = GpuRetainedContentRow & {
  readonly control: GpuRetainedContentColorPickerControl;
};

type GpuRetainedContentPopupMetrics = {
  readonly backgroundRect: GpuRect;
  readonly optionCount: number;
  readonly startIndex: number;
};

export type GpuRetainedContentActivePopupLayout = {
  readonly backgroundRect: GpuRect;
  readonly options: readonly {
    readonly choice: GpuRetainedContentColorChoice;
    readonly optionIndex: number;
    readonly rect: GpuRect;
    readonly selected: boolean;
  }[];
  readonly row: GpuRetainedContentColorPopupRow;
};

const DEFAULT_POPUP_MARGIN = 4;
const DEFAULT_POPUP_OPTION_HEIGHT = 24;
const DEFAULT_POPUP_PADDING = 4;
const DEFAULT_POPUP_MAX_VISIBLE_OPTIONS = 8;

export function createGpuRetainedContentActivePopupLayout({
  activePopup,
  controlRect,
  rows,
  viewportRect,
}: {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRect: (row: GpuRetainedContentRow) => GpuRect;
  readonly rows: readonly GpuRetainedContentRow[];
  readonly viewportRect: GpuRect;
}): GpuRetainedContentActivePopupLayout | null {
  const row = getGpuRetainedContentActiveColorPopupRow(activePopup, rows);
  if (!row) {
    return null;
  }
  const metrics = createGpuRetainedContentPopupMetrics({
    choiceCount: row.control.choices.length,
    controlRect: controlRect(row),
    selectedIndex: row.control.selectedIndex,
    viewportRect,
  });
  if (!metrics) {
    return null;
  }
  return {
    backgroundRect: metrics.backgroundRect,
    options: createGpuRetainedContentPopupOptions({
      backgroundRect: metrics.backgroundRect,
      optionCount: metrics.optionCount,
      row,
      startIndex: metrics.startIndex,
    }),
    row,
  };
}

function getGpuRetainedContentActiveColorPopupRow(
  activePopup: GpuRetainedContentActivePopupInput | null | undefined,
  rows: readonly GpuRetainedContentRow[],
): GpuRetainedContentColorPopupRow | null {
  if (!activePopup) {
    return null;
  }
  const row = rows.find((candidate) => candidate.id === activePopup.ownerRowId);
  if (!row?.control || row.control.kind !== "color-picker") {
    return null;
  }
  if (row.control.choices.length === 0) {
    return null;
  }
  return row as GpuRetainedContentColorPopupRow;
}

function createGpuRetainedContentPopupMetrics({
  choiceCount,
  controlRect,
  selectedIndex,
  viewportRect,
}: {
  readonly choiceCount: number;
  readonly controlRect: GpuRect;
  readonly selectedIndex: number | null;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentPopupMetrics | null {
  const optionCount = getGpuRetainedContentPopupOptionCount({
    choiceCount,
    viewportRect,
  });
  const width = getGpuRetainedContentPopupWidth({ controlRect, viewportRect });
  if (optionCount <= 0 || width <= 0) {
    return null;
  }
  const height =
    optionCount * DEFAULT_POPUP_OPTION_HEIGHT + DEFAULT_POPUP_PADDING * 2;
  const startIndex = clampInteger(
    selectedIndex ?? 0,
    0,
    Math.max(0, choiceCount - optionCount),
  );
  return {
    backgroundRect: {
      height,
      width,
      x: getGpuRetainedContentPopupX({ controlRect, viewportRect, width }),
      y: getGpuRetainedContentPopupY({ controlRect, height, viewportRect }),
    },
    optionCount,
    startIndex,
  };
}

function createGpuRetainedContentPopupOptions({
  backgroundRect,
  optionCount,
  row,
  startIndex,
}: {
  readonly backgroundRect: GpuRect;
  readonly optionCount: number;
  readonly row: GpuRetainedContentColorPopupRow;
  readonly startIndex: number;
}): GpuRetainedContentActivePopupLayout["options"] {
  return row.control.choices
    .slice(startIndex, startIndex + optionCount)
    .map((choice, offset) => {
      const optionIndex = startIndex + offset;
      return {
        choice,
        optionIndex,
        rect: {
          height: DEFAULT_POPUP_OPTION_HEIGHT,
          width: Math.max(0, backgroundRect.width - DEFAULT_POPUP_PADDING * 2),
          x: backgroundRect.x + DEFAULT_POPUP_PADDING,
          y:
            backgroundRect.y +
            DEFAULT_POPUP_PADDING +
            offset * DEFAULT_POPUP_OPTION_HEIGHT,
        },
        selected: row.control.selectedIndex === optionIndex,
      };
    });
}

function getGpuRetainedContentPopupOptionCount({
  choiceCount,
  viewportRect,
}: {
  readonly choiceCount: number;
  readonly viewportRect: GpuRect;
}): number {
  const maxByViewport = Math.floor(
    Math.max(0, viewportRect.height - DEFAULT_POPUP_MARGIN * 2) /
      DEFAULT_POPUP_OPTION_HEIGHT,
  );
  return Math.min(
    choiceCount,
    DEFAULT_POPUP_MAX_VISIBLE_OPTIONS,
    maxByViewport,
  );
}

function getGpuRetainedContentPopupWidth({
  controlRect,
  viewportRect,
}: {
  readonly controlRect: GpuRect;
  readonly viewportRect: GpuRect;
}): number {
  return Math.max(
    0,
    Math.min(
      Math.max(controlRect.width, 144),
      viewportRect.width - DEFAULT_POPUP_MARGIN * 2,
    ),
  );
}

function getGpuRetainedContentPopupX({
  controlRect,
  viewportRect,
  width,
}: {
  readonly controlRect: GpuRect;
  readonly viewportRect: GpuRect;
  readonly width: number;
}): number {
  return clampNumber(
    controlRect.x + controlRect.width - width,
    viewportRect.x + DEFAULT_POPUP_MARGIN,
    viewportRect.x + viewportRect.width - width - DEFAULT_POPUP_MARGIN,
  );
}

function getGpuRetainedContentPopupY({
  controlRect,
  height,
  viewportRect,
}: {
  readonly controlRect: GpuRect;
  readonly height: number;
  readonly viewportRect: GpuRect;
}): number {
  const belowY = controlRect.y + controlRect.height + DEFAULT_POPUP_MARGIN;
  const aboveY = controlRect.y - height - DEFAULT_POPUP_MARGIN;
  const viewportBottom = viewportRect.y + viewportRect.height;
  if (belowY + height > viewportBottom && aboveY >= viewportRect.y) {
    return aboveY;
  }
  return clampNumber(
    belowY,
    viewportRect.y + DEFAULT_POPUP_MARGIN,
    viewportBottom - height - DEFAULT_POPUP_MARGIN,
  );
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
