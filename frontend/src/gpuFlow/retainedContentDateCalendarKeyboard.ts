import { parseIsoDate, shiftCalendarMonth } from "utils/calendarGrid";

import type {
  GpuRetainedContentDateCalendarCell,
  GpuRetainedContentDateCalendarMonth,
} from "./retainedContentDateCalendarTypes";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuFlowScene } from "./scene";

type GpuRetainedContentDateCalendarKeyboardTarget = {
  readonly highlightedDateIso?: string | null | undefined;
  readonly kind: "date-calendar";
  readonly ownerRowId: string;
  readonly surfaceId: string;
};

type GpuRetainedContentDateCalendarResolvedTarget =
  GpuRetainedContentDateCalendarKeyboardTarget & {
    readonly highlightedDateIso: string;
    readonly visibleMonth: GpuRetainedContentDateCalendarMonth;
  };

type GpuRetainedContentDateCalendarKeyboardCommand =
  | { readonly deltaDays: number; readonly kind: "move-day" }
  | { readonly deltaMonths: number; readonly kind: "move-month" }
  | { readonly kind: "commit" }
  | { readonly edge: "end" | "start"; readonly kind: "move-edge" };

type GpuRetainedContentDateCalendarKeyboardResult =
  | { readonly handled: false }
  | {
      readonly action: "highlight";
      readonly handled: true;
      readonly target: GpuRetainedContentDateCalendarResolvedTarget;
    }
  | {
      readonly action: "commit";
      readonly dateIso: string;
      readonly handled: true;
      readonly target: GpuRetainedContentDateCalendarResolvedTarget;
    };

type GpuRetainedContentDateCalendarControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "date-time" }
> & {
  readonly calendar: NonNullable<
    Extract<
      GpuRetainedContentControlDescriptor,
      { kind: "date-time" }
    >["calendar"]
  >;
};

type GpuRetainedContentDateCalendarRow = GpuRetainedContentRow & {
  readonly control: GpuRetainedContentDateCalendarControl;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DATE_CALENDAR_KEYBOARD_COMMAND_BY_KEY = {
  ArrowDown: { deltaDays: 7, kind: "move-day" },
  ArrowLeft: { deltaDays: -1, kind: "move-day" },
  ArrowRight: { deltaDays: 1, kind: "move-day" },
  ArrowUp: { deltaDays: -7, kind: "move-day" },
  End: { edge: "end", kind: "move-edge" },
  Enter: { kind: "commit" },
  Home: { edge: "start", kind: "move-edge" },
  PageDown: { deltaMonths: 1, kind: "move-month" },
  PageUp: { deltaMonths: -1, kind: "move-month" },
  " ": { kind: "commit" },
} as const satisfies Record<
  string,
  GpuRetainedContentDateCalendarKeyboardCommand
>;

export function getGpuRetainedContentDateCalendarKeyboardCommand(
  event: Pick<KeyboardEvent, "key">,
): GpuRetainedContentDateCalendarKeyboardCommand | null {
  return DATE_CALENDAR_KEYBOARD_COMMAND_BY_KEY[event.key] ?? null;
}

export function resolveGpuRetainedContentDateCalendarKeyboard({
  command,
  scene,
  target,
}: {
  readonly command: GpuRetainedContentDateCalendarKeyboardCommand;
  readonly scene: GpuFlowScene;
  readonly target: GpuRetainedContentDateCalendarKeyboardTarget | null;
}): GpuRetainedContentDateCalendarKeyboardResult {
  const context = getGpuRetainedContentDateCalendarContext({ scene, target });
  if (!context) {
    return { handled: false };
  }
  const currentDateIso = getGpuRetainedContentDateCalendarCurrentDateIso({
    row: context.row,
    target: context.target,
  });
  if (!currentDateIso) {
    return { handled: false };
  }
  if (command.kind === "commit") {
    return {
      action: "commit",
      dateIso: currentDateIso,
      handled: true,
      target: createGpuRetainedContentDateCalendarResolvedTarget({
        dateIso: currentDateIso,
        row: context.row,
        target: context.target,
      }),
    };
  }
  const nextDateIso = resolveGpuRetainedContentDateCalendarNextDateIso({
    command,
    currentDateIso,
    row: context.row,
  });
  return {
    action: "highlight",
    handled: true,
    target: createGpuRetainedContentDateCalendarResolvedTarget({
      dateIso: nextDateIso,
      row: context.row,
      target: context.target,
    }),
  };
}

function getGpuRetainedContentDateCalendarContext({
  scene,
  target,
}: {
  readonly scene: GpuFlowScene;
  readonly target: GpuRetainedContentDateCalendarKeyboardTarget | null;
}): {
  readonly row: GpuRetainedContentDateCalendarRow;
  readonly target: GpuRetainedContentDateCalendarKeyboardTarget;
} | null {
  if (!target) {
    return null;
  }
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === target.surfaceId,
  );
  if (
    !surface ||
    surface.renderer.kind !== "canvas-content" ||
    !surface.retainedScene
  ) {
    return null;
  }
  const row = surface.retainedScene.rows.find(
    (candidate) => candidate.id === target.ownerRowId,
  );
  if (!isGpuRetainedContentDateCalendarRow(row)) {
    return null;
  }
  return {
    row,
    target,
  };
}

function isGpuRetainedContentDateCalendarRow(
  row: GpuRetainedContentRow | undefined,
): row is GpuRetainedContentDateCalendarRow {
  return Boolean(
    row?.control &&
      row.control.kind === "date-time" &&
      row.control.mode === "date-calendar" &&
      row.control.calendar &&
      row.control.calendar.cells.length > 0,
  );
}

function getGpuRetainedContentDateCalendarCurrentDateIso({
  row,
  target,
}: {
  readonly row: GpuRetainedContentDateCalendarRow;
  readonly target: GpuRetainedContentDateCalendarKeyboardTarget;
}): string | null {
  const cells = row.control.calendar.cells;
  return (
    getValidCalendarCellDate(cells, target.highlightedDateIso) ??
    getFirstValidCalendarCellDate(cells, row.control.calendar.selectedDates) ??
    getPreferredCalendarFallbackDate(cells)
  );
}

function getValidCalendarCellDate(
  cells: readonly GpuRetainedContentDateCalendarCell[],
  dateIso: string | null | undefined,
): string | null {
  return dateIso && hasCalendarCell(cells, dateIso) ? dateIso : null;
}

function getFirstValidCalendarCellDate(
  cells: readonly GpuRetainedContentDateCalendarCell[],
  dateIsos: readonly string[],
): string | null {
  return dateIsos.find((dateIso) => hasCalendarCell(cells, dateIso)) ?? null;
}

function getPreferredCalendarFallbackDate(
  cells: readonly GpuRetainedContentDateCalendarCell[],
): string | null {
  return (
    cells.find((cell) => cell.today && cell.inCurrentMonth)?.isoDate ??
    cells.find((cell) => cell.inCurrentMonth)?.isoDate ??
    cells[0]?.isoDate ??
    null
  );
}

function resolveGpuRetainedContentDateCalendarNextDateIso({
  command,
  currentDateIso,
  row,
}: {
  readonly command: Exclude<
    GpuRetainedContentDateCalendarKeyboardCommand,
    { kind: "commit" }
  >;
  readonly currentDateIso: string;
  readonly row: GpuRetainedContentDateCalendarRow;
}): string {
  if (command.kind === "move-day") {
    return shiftIsoDateByDays(currentDateIso, command.deltaDays);
  }
  if (command.kind === "move-month") {
    return shiftIsoDateByMonths(currentDateIso, command.deltaMonths);
  }
  const currentMonthCells = row.control.calendar.cells.filter(
    (cell) => cell.inCurrentMonth,
  );
  return command.edge === "start"
    ? currentMonthCells[0]?.isoDate ?? currentDateIso
    : currentMonthCells[currentMonthCells.length - 1]?.isoDate ??
        currentDateIso;
}

function createGpuRetainedContentDateCalendarResolvedTarget({
  dateIso,
  row,
  target,
}: {
  readonly dateIso: string;
  readonly row: GpuRetainedContentDateCalendarRow;
  readonly target: GpuRetainedContentDateCalendarKeyboardTarget;
}): GpuRetainedContentDateCalendarResolvedTarget {
  return {
    highlightedDateIso: dateIso,
    kind: target.kind,
    ownerRowId: target.ownerRowId,
    surfaceId: target.surfaceId,
    visibleMonth: getGpuRetainedContentDateCalendarVisibleMonth({
      dateIso,
      row,
    }),
  };
}

function getGpuRetainedContentDateCalendarVisibleMonth({
  dateIso,
  row,
}: {
  readonly dateIso: string;
  readonly row: GpuRetainedContentDateCalendarRow;
}): GpuRetainedContentDateCalendarMonth {
  if (hasCalendarCell(row.control.calendar.cells, dateIso)) {
    return row.control.calendar.month;
  }
  const parsed = parseIsoDate(dateIso);
  return parsed
    ? { monthIndex: parsed.monthIndex, year: parsed.year }
    : row.control.calendar.month;
}

function hasCalendarCell(
  cells: readonly GpuRetainedContentDateCalendarCell[],
  dateIso: string,
): boolean {
  return cells.some((cell) => cell.isoDate === dateIso);
}

function shiftIsoDateByDays(dateIso: string, deltaDays: number): string {
  const parsed = parseIsoDate(dateIso);
  if (!parsed) {
    return dateIso;
  }
  return formatIsoDateFromUtcMs(
    Date.UTC(parsed.year, parsed.monthIndex, parsed.day) +
      deltaDays * MS_PER_DAY,
  );
}

function shiftIsoDateByMonths(dateIso: string, deltaMonths: number): string {
  const parsed = parseIsoDate(dateIso);
  if (!parsed) {
    return dateIso;
  }
  const shiftedMonth = shiftCalendarMonth(parsed, deltaMonths);
  const day = Math.min(
    parsed.day,
    getDaysInUtcMonth(shiftedMonth.year, shiftedMonth.monthIndex),
  );
  return formatIsoDate(shiftedMonth.year, shiftedMonth.monthIndex, day);
}

function getDaysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatIsoDateFromUtcMs(utcMs: number): string {
  const date = new Date(utcMs);
  return formatIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
