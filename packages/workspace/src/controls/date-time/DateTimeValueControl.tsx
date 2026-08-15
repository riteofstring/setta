import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { getElementTextDirection } from "../../styles/textDirection";
import { focusSectionAfterEscape } from "../sectionFocus";
import {
  buildCalendarMonthGrid,
  parseIsoDate,
  resolveCalendarAnchorDate,
  shiftCalendarMonth,
  type CalendarMonthCell,
} from "./calendarGrid";
import { resolveCalendarKeyboardDate, shiftCalendarDateByMonths } from "./calendarKeyboard";
import type {
  DateCalendarWeekStart,
  DateControlMode,
  DateDisplayFormat,
  DateSelectionMode,
  DateValueControlProps,
  TimeControlMode,
  TimeDisplayFont,
  TimeDisplayFormat,
  TimeValueControlProps,
} from "./dateTimeTypes";
import {
  combineIsoDateAndTimeParts,
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getLocalTodayIsoDate,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
  splitIsoDateAndTimeParts,
} from "./dateTimeUtils";

// The remaining-controls milestone's date and time controls: the frozen
// `TextParamDateTimeInput` ordinary-row presentation behind package-owned controlled-string
// props. Date configuration selects the formatted native input or live calendar; time
// configuration selects the native time input or formatted display. The package keeps no clock,
// locale, persistence, or parameter-model state.

const INTERACTION_BOUNDARY_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
// Let the browser paint native date/time affordances for the active appearance. Without this,
// Chromium keeps the default dark picker indicator over Setta's dark input surface.
const NATIVE_DATE_TIME_COLOR_SCHEME_CLASS_NAME = "dark:[color-scheme:dark]";
// Frozen main's global `input { all: unset }` makes these native inputs transparent. Keep the
// equivalent paint local to the package instead of leaking that host-wide reset to consumers.
const INPUT_BASE_CLASS_NAME = `${INTERACTION_BOUNDARY_CLASS_NAME} peer/textinput flex min-w-0 flex-1 self-center bg-transparent font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
const FORMATTED_CLASS_NAME = "text-[10px] font-mono text-setta-500 dark:text-setta-400";
const DIVIDER_BASE_CLASS_NAME =
  "section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30";
const META_CONTAINER_CLASS_NAME =
  "single-cell-container grid h-full min-h-0 w-full grid-cols-[1fr,auto] rounded-lg border border-setta-300/70 bg-setta-50 px-3 py-2 dark:border-setta-700 dark:bg-setta-850";
const META_TRANSPARENT_CONTAINER_CLASS_NAME =
  "single-cell-container grid h-full min-h-0 w-full grid-cols-[1fr,auto] rounded-lg border border-transparent bg-transparent px-3 py-2";
const DATE_DISPLAY_FORMATS = ["iso", "us", "eu", "long"] as const;
const DATE_CONTROL_MODES = ["input", "calendar"] as const;
const DATE_SELECTION_MODES = ["single", "multiple"] as const;
const WEEK_STARTS = ["sunday", "monday"] as const;
const TIME_CONTROL_MODES = ["input", "display"] as const;
const TIME_DISPLAY_FORMATS = ["twenty_four_hour", "twelve_hour"] as const;
const TIME_DISPLAY_FONTS = ["clock", "monospace", "system"] as const;
const TIME_DISPLAY_SCALE_MIN = 0.5;
const TIME_DISPLAY_SCALE_MAX = 3;
const WEEKDAY_LABELS: Record<DateCalendarWeekStart, ReadonlyArray<string>> = {
  monday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sunday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const WEEKDAY_ACCESSIBLE_LABELS: Record<DateCalendarWeekStart, ReadonlyArray<string>> = {
  monday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  sunday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const CALENDAR_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

type DateTimeControlClasses = {
  wrapper: string;
  input: string;
  formatted: string;
  border: string;
};

type DateTimePresentation = "item-row" | "meta-control";

type EditableDateTimeMode = "datetime-local" | "formatted-date" | "time";

type EditableDateTimeView = {
  mode: EditableDateTimeMode;
  inputType: "datetime-local" | "text" | "time";
  normalizedValue: string;
  formattedValue: string;
};

type EditableDateTimeChangeResult = {
  nextCommittedValue?: string;
  nextLocalDateInputValue?: string;
};

type ResolvedDateValueControlConfig = {
  displayFormat: DateDisplayFormat;
  controlMode: DateControlMode;
  selectionMode: DateSelectionMode;
  weekStart: DateCalendarWeekStart;
  includeTime: boolean;
  timeDisplayFormat: TimeDisplayFormat;
  disabled: boolean;
};

function assertOption(
  controlName: string,
  field: string,
  value: string,
  allowed: ReadonlyArray<string>,
): void {
  if (!allowed.includes(value)) {
    throw new Error(`${controlName} received invalid ${field}: ${value}.`);
  }
}

function assertDateConfig({
  displayFormat,
  controlMode,
  selectionMode,
  weekStart,
  timeDisplayFormat,
}: {
  displayFormat: DateDisplayFormat;
  controlMode: DateControlMode;
  selectionMode: DateSelectionMode;
  weekStart: DateCalendarWeekStart;
  timeDisplayFormat: TimeDisplayFormat;
}): void {
  assertOption("DateValueControl", "displayFormat", displayFormat, DATE_DISPLAY_FORMATS);
  assertOption("DateValueControl", "controlMode", controlMode, DATE_CONTROL_MODES);
  assertOption("DateValueControl", "selectionMode", selectionMode, DATE_SELECTION_MODES);
  assertOption("DateValueControl", "weekStart", weekStart, WEEK_STARTS);
  assertOption("DateValueControl", "timeDisplayFormat", timeDisplayFormat, TIME_DISPLAY_FORMATS);
}

function resolveDateValueControlConfig(
  props: DateValueControlProps,
): ResolvedDateValueControlConfig {
  return {
    displayFormat: props.displayFormat ?? "iso",
    controlMode: props.controlMode ?? "input",
    selectionMode: props.selectionMode ?? "single",
    weekStart: props.weekStart ?? "sunday",
    includeTime: props.includeTime ?? false,
    timeDisplayFormat: props.timeDisplayFormat ?? "twenty_four_hour",
    disabled: props.disabled ?? false,
  };
}

function assertTimeConfig({
  controlMode,
  displayFormat,
  scale,
  font,
}: {
  controlMode: TimeControlMode;
  displayFormat: TimeDisplayFormat;
  scale: number;
  font: TimeDisplayFont;
}): void {
  assertOption("TimeValueControl", "controlMode", controlMode, TIME_CONTROL_MODES);
  assertOption("TimeValueControl", "displayFormat", displayFormat, TIME_DISPLAY_FORMATS);
  assertOption("TimeValueControl", "font", font, TIME_DISPLAY_FONTS);
  if (!Number.isFinite(scale) || scale < TIME_DISPLAY_SCALE_MIN || scale > TIME_DISPLAY_SCALE_MAX) {
    throw new Error(
      `TimeValueControl received invalid scale: ${String(scale)}; expected 0.5 through 3.`,
    );
  }
}

function getRowClasses(isDisabled: boolean, isSelectingItems: boolean): DateTimeControlClasses {
  return {
    wrapper: `${INTERACTION_BOUNDARY_CLASS_NAME} section-value flex min-w-0 items-center gap-2`,
    input: `${!isDisabled ? "cursor-text select-text" : ""} ${INPUT_BASE_CLASS_NAME}`,
    formatted: FORMATTED_CLASS_NAME,
    border: `${DIVIDER_BASE_CLASS_NAME} ${!isSelectingItems ? "peer-focus-within/textinput:border-blue-400" : ""}`,
  };
}

function getMetaClasses(): DateTimeControlClasses {
  return {
    wrapper: `${INTERACTION_BOUNDARY_CLASS_NAME} section-value single-cell-child flex min-w-0 items-center gap-2`,
    input: `${INTERACTION_BOUNDARY_CLASS_NAME} peer/textinput flex min-w-0 flex-1 cursor-text self-center bg-transparent text-xs text-[rgb(3,_47,_98);] selection:bg-blue-500/30 dark:text-[rgb(165,_214,_255)]`,
    formatted: FORMATTED_CLASS_NAME,
    border:
      "single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 dark:border-setta-600/30 peer-focus-within/textinput:border-blue-400",
  };
}

function getDateTimeClasses(
  presentation: DateTimePresentation,
  isDisabled: boolean,
  isSelectingItems: boolean,
): DateTimeControlClasses {
  return presentation === "meta-control"
    ? getMetaClasses()
    : getRowClasses(isDisabled, isSelectingItems);
}

function wrapDateTimePresentation(
  content: ReactNode,
  presentation: DateTimePresentation,
  transparent: boolean,
) {
  if (presentation === "item-row") {
    return content;
  }
  return (
    <div
      className={transparent ? META_TRANSPARENT_CONTAINER_CLASS_NAME : META_CONTAINER_CLASS_NAME}
    >
      {content}
    </div>
  );
}

function handleEscape(event: KeyboardEvent<HTMLElement>, onEscape: () => void): void {
  if (event.key === "Escape" || event.code === "Escape") {
    event.stopPropagation();
    onEscape();
  }
}

export function DateValueControl(props: DateValueControlProps) {
  return <DateValueControlCore {...props} presentation="item-row" />;
}

// Package-internal direct-on-canvas presentation. Date parsing, calendar state, selection, and
// accessibility stay shared with the row control inside frozen main's full-area field wrapper.
export function MetaDateValueControl(props: DateValueControlProps) {
  return <DateValueControlCore {...props} presentation="meta-control" />;
}

function DateValueControlCore(
  props: DateValueControlProps & { presentation: DateTimePresentation },
) {
  const isSelectingItems = useItemSelectionModeForControl();
  const config = resolveDateValueControlConfig(props);
  const isDisabled = config.disabled || isSelectingItems;
  assertDateConfig(config);
  const classes = getDateTimeClasses(props.presentation, isDisabled, isSelectingItems);
  const onEscape = () => focusSectionAfterEscape(props.sectionId);

  if (config.controlMode === "calendar") {
    return wrapDateTimePresentation(
      <CalendarDateControl
        ariaLabel={props.ariaLabel}
        value={props.value}
        onChange={props.onValueChange}
        onEscape={onEscape}
        isDisabled={isDisabled}
        selectionMode={config.includeTime ? "single" : config.selectionMode}
        weekStart={config.weekStart}
        includeTime={config.includeTime}
        dateDisplayFormat={config.displayFormat}
        timeDisplayFormat={config.timeDisplayFormat}
        classes={classes}
      />,
      props.presentation,
      false,
    );
  }

  const view = resolveDateInputView({
    value: props.value,
    displayFormat: config.displayFormat,
    includeTime: config.includeTime,
    timeDisplayFormat: config.timeDisplayFormat,
  });
  return wrapDateTimePresentation(
    <EditableDateTimeInput
      ariaLabel={props.ariaLabel}
      value={props.value}
      onChange={props.onValueChange}
      onEscape={onEscape}
      isDisabled={isDisabled}
      dateDisplayFormat={config.displayFormat}
      classes={classes}
      view={view}
    />,
    props.presentation,
    false,
  );
}

export function TimeValueControl({ ...props }: TimeValueControlProps) {
  return <TimeValueControlCore {...props} presentation="item-row" />;
}

export function MetaTimeValueControl(props: TimeValueControlProps) {
  // Frozen main's direct-on-canvas Time dispatcher defaults to the formatted display, while the
  // ordinary item-row Time control defaults to its editable native input.
  return (
    <TimeValueControlCore
      {...props}
      controlMode={props.controlMode ?? "display"}
      presentation="meta-control"
    />
  );
}

function TimeValueControlCore({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  controlMode = "input",
  displayFormat = "twenty_four_hour",
  transparent = false,
  scale = 1,
  font = "monospace",
  disabled = false,
  presentation,
}: TimeValueControlProps & { presentation: DateTimePresentation }) {
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  assertTimeConfig({ controlMode, displayFormat, scale, font });
  const classes = getDateTimeClasses(presentation, isDisabled, isSelectingItems);

  if (controlMode === "display") {
    return wrapDateTimePresentation(
      <DisplayTimeValue
        ariaLabel={ariaLabel}
        value={value}
        displayFormat={displayFormat}
        transparent={transparent}
        scale={scale}
        font={font}
        classes={classes}
      />,
      presentation,
      transparent,
    );
  }

  const normalizedValue = normalizeTimeTo24Hour(value);
  return wrapDateTimePresentation(
    <EditableDateTimeInput
      ariaLabel={ariaLabel}
      value={value}
      onChange={onValueChange}
      onEscape={() => focusSectionAfterEscape(sectionId)}
      isDisabled={isDisabled}
      dateDisplayFormat="iso"
      classes={classes}
      view={{
        mode: "time",
        inputType: "time",
        normalizedValue,
        formattedValue: formatTimeForDisplay(normalizedValue, displayFormat),
      }}
    />,
    presentation,
    false,
  );
}

function resolveDateInputView({
  value,
  displayFormat,
  includeTime,
  timeDisplayFormat,
}: {
  value: string;
  displayFormat: DateDisplayFormat;
  includeTime: boolean;
  timeDisplayFormat: TimeDisplayFormat;
}): EditableDateTimeView {
  if (includeTime) {
    const split = splitIsoDateAndTimeParts(value);
    const normalizedDate = normalizeDateToIso(value, displayFormat);
    const normalizedValue = split
      ? `${split.dateIso}T${split.time24}`
      : normalizedDate === ""
        ? ""
        : `${normalizedDate}T00:00`;
    return {
      mode: "datetime-local",
      inputType: "datetime-local",
      normalizedValue,
      formattedValue: formatDateTimeForDisplay({
        raw: normalizedValue,
        dateDisplayFormat: displayFormat,
        timeDisplayFormat,
      }),
    };
  }

  return {
    mode: "formatted-date",
    inputType: "text",
    normalizedValue: normalizeDateToIso(value, displayFormat),
    formattedValue: "",
  };
}

function resolveEditableDateTimeChange({
  mode,
  rawValue,
  dateDisplayFormat,
}: {
  mode: EditableDateTimeMode;
  rawValue: string;
  dateDisplayFormat: DateDisplayFormat;
}): EditableDateTimeChangeResult {
  if (mode === "time") {
    return { nextCommittedValue: normalizeTimeTo24Hour(rawValue) };
  }
  if (mode === "datetime-local") {
    return { nextCommittedValue: normalizeDateTimeToLocalIso(rawValue) };
  }
  const nextIso = normalizeDateToIso(rawValue, dateDisplayFormat);
  return {
    nextCommittedValue: nextIso === "" ? undefined : nextIso,
    nextLocalDateInputValue: rawValue,
  };
}

function resolveFormattedDateBlur({
  localDateInputValue,
  committedValue,
  dateDisplayFormat,
}: {
  localDateInputValue: string;
  committedValue: string;
  dateDisplayFormat: DateDisplayFormat;
}): { nextCommittedValue?: string; nextLocalDateInputValue: string } {
  const nextIso = normalizeDateToIso(localDateInputValue, dateDisplayFormat);
  const fallbackIso = normalizeDateToIso(committedValue, dateDisplayFormat);
  const resolvedIso = nextIso !== "" ? nextIso : fallbackIso;
  return {
    nextCommittedValue: nextIso !== "" && nextIso !== fallbackIso ? nextIso : undefined,
    nextLocalDateInputValue: formatDateForDisplay(resolvedIso, dateDisplayFormat),
  };
}

function EditableDateTimeInput({
  ariaLabel,
  value,
  onChange,
  onEscape,
  isDisabled,
  dateDisplayFormat,
  classes,
  view,
}: {
  ariaLabel: string;
  value: string;
  onChange: (nextValue: string) => void;
  onEscape: () => void;
  isDisabled: boolean;
  dateDisplayFormat: DateDisplayFormat;
  classes: DateTimeControlClasses;
  view: EditableDateTimeView;
}) {
  const usesLocalDateInput = view.mode === "formatted-date";
  const [localDateInputValue, setLocalDateInputValue] = useState(() =>
    formatDateForDisplay(view.normalizedValue, dateDisplayFormat),
  );
  useEffect(() => {
    if (usesLocalDateInput) {
      setLocalDateInputValue(formatDateForDisplay(view.normalizedValue, dateDisplayFormat));
    }
  }, [dateDisplayFormat, usesLocalDateInput, view.normalizedValue]);
  const renderedInputValue = usesLocalDateInput ? localDateInputValue : view.normalizedValue;

  return (
    <>
      <div className={classes.wrapper}>
        <input
          aria-label={ariaLabel}
          type={view.inputType}
          className={`${classes.input} ${
            view.inputType === "text" ? "" : NATIVE_DATE_TIME_COLOR_SCHEME_CLASS_NAME
          }`}
          value={renderedInputValue}
          onChange={(event) => {
            const result = resolveEditableDateTimeChange({
              mode: view.mode,
              rawValue: event.target.value,
              dateDisplayFormat,
            });
            if (result.nextLocalDateInputValue !== undefined) {
              setLocalDateInputValue(result.nextLocalDateInputValue);
            }
            if (result.nextCommittedValue !== undefined) {
              onChange(result.nextCommittedValue);
            }
          }}
          onBlur={() => {
            if (!usesLocalDateInput) {
              return;
            }
            const result = resolveFormattedDateBlur({
              localDateInputValue,
              committedValue: value,
              dateDisplayFormat,
            });
            setLocalDateInputValue(result.nextLocalDateInputValue);
            if (result.nextCommittedValue !== undefined) {
              onChange(result.nextCommittedValue);
            }
          }}
          onKeyDown={(event) => handleEscape(event, onEscape)}
          disabled={isDisabled}
        />
        <span className={classes.formatted}>{view.formattedValue}</span>
      </div>
      <span className={classes.border} />
    </>
  );
}

function getTimeDisplayFontClassName(font: TimeDisplayFont): string {
  if (font === "system") {
    return "font-sans tabular-nums";
  }
  if (font === "clock") {
    return "font-semibold tabular-nums tracking-[0.08em]";
  }
  return "font-mono tabular-nums";
}

function DisplayTimeValue({
  ariaLabel,
  value,
  displayFormat,
  transparent,
  scale,
  font,
  classes,
}: {
  ariaLabel: string;
  value: string;
  displayFormat: TimeDisplayFormat;
  transparent: boolean;
  scale: number;
  font: TimeDisplayFont;
  classes: DateTimeControlClasses;
}) {
  const formatted = formatTimeForDisplay(value, displayFormat).trim() || "--:--";
  return (
    <>
      <div className={classes.wrapper}>
        <output
          aria-label={`${ariaLabel}: ${formatted}`}
          className={`${classes.input} ${getTimeDisplayFontClassName(font)} flex min-w-0 flex-1 items-center`}
          style={{ fontSize: `${scale}em`, lineHeight: "1.1" }}
        >
          {formatted}
        </output>
      </div>
      {transparent ? null : <span className={classes.border} />}
    </>
  );
}

function collectCalendarSelectionCandidates(parsed: unknown): Array<string> {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === "string");
  }
  return typeof parsed === "string" ? [parsed] : [];
}

function parseCalendarSelectionCandidates(rawValue: string): Array<string> {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return [];
  }
  try {
    return collectCalendarSelectionCandidates(JSON.parse(trimmed));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [trimmed];
    }
    throw error;
  }
}

function parseCalendarSelectedDates(
  rawValue: string,
  selectionMode: DateSelectionMode,
  includeTime: boolean,
): Array<string> {
  if (selectionMode === "single") {
    const candidate = includeTime ? (splitIsoDateAndTimeParts(rawValue)?.dateIso ?? "") : rawValue;
    const normalized = normalizeDateToIso(candidate, "iso");
    return parseIsoDate(normalized) ? [normalized] : [];
  }
  const normalized = parseCalendarSelectionCandidates(rawValue)
    .map((candidate) =>
      normalizeDateToIso(
        includeTime ? (splitIsoDateAndTimeParts(candidate)?.dateIso ?? candidate) : candidate,
        "iso",
      ),
    )
    .filter((candidate) => parseIsoDate(candidate) !== null);
  return Array.from(new Set(normalized)).sort((left, right) => left.localeCompare(right));
}

function serializeCalendarSelectedDates(
  selectedDates: Array<string>,
  selectionMode: DateSelectionMode,
): string {
  const sorted = Array.from(new Set(selectedDates)).sort((left, right) =>
    left.localeCompare(right),
  );
  if (selectionMode === "single") {
    return sorted[0] ?? "";
  }
  return sorted.length === 0 ? "" : JSON.stringify(sorted);
}

function formatMonthTitle(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function resolveCalendarCellClassName(cell: CalendarMonthCell, selected: boolean, today: boolean) {
  const monthClass = cell.inCurrentMonth
    ? "text-setta-700 dark:text-setta-200"
    : "text-setta-400 dark:text-setta-500";
  const selectedClass = selected
    ? "bg-blue-500 text-white hover:bg-blue-500/90 dark:bg-blue-600 dark:text-white"
    : "hover:bg-setta-200/40 dark:hover:bg-setta-700/60";
  const todayClass = today ? "ring-1 ring-blue-400 dark:ring-blue-500" : "";
  return `rounded px-1 py-1 text-xs font-medium ${monthClass} ${selectedClass} ${todayClass}`;
}

function resolveCalendarSummaryText({
  selectedDates,
  value,
  selectionMode,
  includeTime,
  dateDisplayFormat,
  timeDisplayFormat,
}: {
  selectedDates: Array<string>;
  value: string;
  selectionMode: DateSelectionMode;
  includeTime: boolean;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
}): string {
  if (selectionMode === "multiple") {
    return `${selectedDates.length} selected`;
  }
  if (includeTime && splitIsoDateAndTimeParts(value)) {
    return formatDateTimeForDisplay({
      raw: value,
      dateDisplayFormat,
      timeDisplayFormat,
    });
  }
  return selectedDates[0] ?? "No date selected";
}

function resolveCalendarDateSelectionValue({
  cellIsoDate,
  isSelected,
  selectedDates,
  selectionMode,
  includeTime,
  selectedTimeValue,
}: {
  cellIsoDate: string;
  isSelected: boolean;
  selectedDates: Array<string>;
  selectionMode: DateSelectionMode;
  includeTime: boolean;
  selectedTimeValue: string;
}): string {
  if (selectionMode === "multiple") {
    const nextDates = isSelected
      ? selectedDates.filter((date) => date !== cellIsoDate)
      : [...selectedDates, cellIsoDate];
    return serializeCalendarSelectedDates(nextDates, selectionMode);
  }
  return includeTime
    ? combineIsoDateAndTimeParts(cellIsoDate, selectedTimeValue)
    : serializeCalendarSelectedDates([cellIsoDate], selectionMode);
}

function CalendarDateButton({
  cell,
  isSelected,
  isToday,
  isDisabled,
  isFocused,
  buttonRef,
  onFocus,
  onNavigate,
  weekStart,
  onEscape,
  onSelect,
}: {
  cell: CalendarMonthCell;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  isFocused: boolean;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onNavigate: (nextDate: string) => void;
  weekStart: DateCalendarWeekStart;
  onEscape: () => void;
  onSelect: () => void;
}) {
  const parsed = parseIsoDate(cell.isoDate);
  if (!parsed) {
    throw new Error(`DateValueControl generated an invalid calendar date: ${cell.isoDate}.`);
  }
  const accessibleDate = CALENDAR_DATE_LABEL_FORMATTER.format(
    new Date(Date.UTC(parsed.year, parsed.monthIndex, parsed.day)),
  );
  return (
    <button
      type="button"
      role="gridcell"
      aria-label={accessibleDate}
      aria-selected={isSelected}
      aria-current={isToday ? "date" : undefined}
      tabIndex={isFocused ? 0 : -1}
      ref={buttonRef}
      className={resolveCalendarCellClassName(cell, isSelected, isToday)}
      onClick={onSelect}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.code === "Escape") {
          handleEscape(event, onEscape);
          return;
        }
        const nextDate = resolveCalendarKeyboardDate({
          isoDate: cell.isoDate,
          key: event.key,
          shiftKey: event.shiftKey,
          weekStartsOn: weekStart,
          direction: getElementTextDirection(event.currentTarget),
        });
        if (nextDate === null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onNavigate(nextDate);
      }}
      disabled={isDisabled}
    >
      {cell.dayOfMonth}
    </button>
  );
}

function CalendarDateControl({
  ariaLabel,
  value,
  onChange,
  onEscape,
  isDisabled,
  selectionMode,
  weekStart,
  includeTime,
  dateDisplayFormat,
  timeDisplayFormat,
  classes,
}: {
  ariaLabel: string;
  value: string;
  onChange: (nextValue: string) => void;
  onEscape: () => void;
  isDisabled: boolean;
  selectionMode: DateSelectionMode;
  weekStart: DateCalendarWeekStart;
  includeTime: boolean;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
  classes: DateTimeControlClasses;
}) {
  const splitDateTime = useMemo(() => splitIsoDateAndTimeParts(value), [value]);
  const selectedTimeValue = splitDateTime?.time24 ?? "00:00";
  const selectedDates = useMemo(
    () => parseCalendarSelectedDates(value, selectionMode, includeTime),
    [includeTime, selectionMode, value],
  );
  const primarySelectedDate = selectedDates[0] ?? "";
  const todayIso = useMemo(() => getLocalTodayIsoDate(), []);
  const [anchor, setAnchor] = useState(() => resolveCalendarAnchorDate(primarySelectedDate));
  const [focusedIsoDate, setFocusedIsoDate] = useState(
    () => primarySelectedDate || getLocalTodayIsoDate(),
  );
  const dateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const shouldRestoreCalendarFocus = useRef(false);
  useEffect(() => {
    setAnchor(resolveCalendarAnchorDate(primarySelectedDate));
    setFocusedIsoDate(primarySelectedDate || todayIso);
  }, [primarySelectedDate, todayIso]);
  const monthCells = useMemo(
    () =>
      buildCalendarMonthGrid({
        year: anchor.year,
        monthIndex: anchor.monthIndex,
        weekStartsOn: weekStart,
      }),
    [anchor.monthIndex, anchor.year, weekStart],
  );
  useEffect(() => {
    if (!shouldRestoreCalendarFocus.current) {
      return;
    }
    const nextButton = dateButtonRefs.current[focusedIsoDate];
    if (!nextButton) {
      return;
    }
    shouldRestoreCalendarFocus.current = false;
    nextButton.focus({ preventScroll: true });
  }, [anchor.monthIndex, anchor.year, focusedIsoDate]);
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const monthTitle = formatMonthTitle(anchor.year, anchor.monthIndex);
  const summaryText = resolveCalendarSummaryText({
    selectedDates,
    value,
    selectionMode,
    includeTime,
    dateDisplayFormat,
    timeDisplayFormat,
  });
  const navigateCalendarFocus = (nextDate: string) => {
    const parsed = parseIsoDate(nextDate);
    if (!parsed) {
      throw new Error(`DateValueControl cannot focus invalid calendar date: ${nextDate}.`);
    }
    shouldRestoreCalendarFocus.current = true;
    setFocusedIsoDate(nextDate);
    setAnchor({ year: parsed.year, monthIndex: parsed.monthIndex });
  };
  const moveDisplayedMonth = (deltaMonths: number) => {
    const nextAnchor = shiftCalendarMonth(anchor, deltaMonths);
    const parsedFocusedDate = parseIsoDate(focusedIsoDate);
    if (!parsedFocusedDate) {
      throw new Error(`DateValueControl cannot move invalid calendar date: ${focusedIsoDate}.`);
    }
    const focusedMonthDelta =
      nextAnchor.year * 12 +
      nextAnchor.monthIndex -
      (parsedFocusedDate.year * 12 + parsedFocusedDate.monthIndex);
    const focusedDateInNextMonth = shiftCalendarDateByMonths(focusedIsoDate, focusedMonthDelta);
    setFocusedIsoDate(focusedDateInNextMonth);
    setAnchor(nextAnchor);
  };

  return (
    <>
      <div
        role="group"
        aria-label={ariaLabel}
        aria-disabled={isDisabled}
        className={`${classes.wrapper} flex-col items-stretch gap-2`}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={`${ariaLabel}: Previous month`}
            className="rounded px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-200/40 dark:text-setta-300 dark:hover:bg-setta-700/60"
            onClick={() => moveDisplayedMonth(-1)}
            onKeyDown={(event) => handleEscape(event, onEscape)}
            disabled={isDisabled}
            data-setta-workspace-touch-target="compact"
          >
            Prev
          </button>
          <span
            aria-live="polite"
            className="text-xs font-semibold text-setta-700 dark:text-setta-200"
          >
            {monthTitle}
          </span>
          <button
            type="button"
            aria-label={`${ariaLabel}: Next month`}
            className="rounded px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-200/40 dark:text-setta-300 dark:hover:bg-setta-700/60"
            onClick={() => moveDisplayedMonth(1)}
            onKeyDown={(event) => handleEscape(event, onEscape)}
            disabled={isDisabled}
            data-setta-workspace-touch-target="compact"
          >
            Next
          </button>
        </div>
        <div role="grid" aria-label={`${ariaLabel}, ${monthTitle}`} className="flex flex-col gap-2">
          <div
            role="row"
            className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400"
          >
            {WEEKDAY_LABELS[weekStart].map((weekdayLabel, index) => (
              <span
                key={weekdayLabel}
                role="columnheader"
                aria-label={WEEKDAY_ACCESSIBLE_LABELS[weekStart][index]}
              >
                {weekdayLabel}
              </span>
            ))}
          </div>
          <div role="rowgroup" className="grid grid-cols-7 gap-1">
            {Array.from({ length: 6 }, (_, rowIndex) => (
              <div key={rowIndex} role="row" className="contents">
                {monthCells.slice(rowIndex * 7, rowIndex * 7 + 7).map((cell) => {
                  const isSelected = selectedDateSet.has(cell.isoDate);
                  return (
                    <CalendarDateButton
                      key={cell.isoDate}
                      cell={cell}
                      isSelected={isSelected}
                      isToday={cell.isoDate === todayIso}
                      isDisabled={isDisabled}
                      isFocused={cell.isoDate === focusedIsoDate}
                      buttonRef={(element) => {
                        dateButtonRefs.current[cell.isoDate] = element;
                      }}
                      onFocus={() => setFocusedIsoDate(cell.isoDate)}
                      onNavigate={navigateCalendarFocus}
                      weekStart={weekStart}
                      onEscape={onEscape}
                      onSelect={() => {
                        if (!isDisabled) {
                          if (!cell.inCurrentMonth) {
                            navigateCalendarFocus(cell.isoDate);
                          }
                          onChange(
                            resolveCalendarDateSelectionValue({
                              cellIsoDate: cell.isoDate,
                              isSelected,
                              selectedDates,
                              selectionMode,
                              includeTime,
                              selectedTimeValue,
                            }),
                          );
                        }
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {includeTime && selectionMode === "single" ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              Time
            </span>
            <input
              type="time"
              aria-label={`${ariaLabel} time`}
              className={`${INTERACTION_BOUNDARY_CLASS_NAME} ${NATIVE_DATE_TIME_COLOR_SCHEME_CLASS_NAME} w-full rounded border border-setta-300 bg-transparent px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:text-setta-300`}
              value={selectedTimeValue}
              onChange={(event) => {
                const nextDate = selectedDates[0] ?? todayIso;
                const combined = combineIsoDateAndTimeParts(nextDate, event.target.value);
                if (combined !== "") {
                  onChange(combined);
                }
              }}
              onKeyDown={(event) => handleEscape(event, onEscape)}
              disabled={isDisabled}
            />
          </div>
        ) : null}
        <span className={classes.formatted}>{summaryText}</span>
      </div>
      <span className={classes.border} />
    </>
  );
}
