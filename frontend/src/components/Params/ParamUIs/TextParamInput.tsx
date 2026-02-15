import { useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  DateParamConfigForFrontend,
  TimeParamConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import {
  buildCalendarMonthGrid,
  parseIsoDate,
  resolveCalendarAnchorDate,
  shiftCalendarMonth,
} from "utils/calendarGrid";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStart,
  DateCalendarWeekStartEnum,
  DateControlMode,
  DateControlModeEnum,
  DateDisplayFormat,
  DateDisplayFormatEnum,
  DateSelectionMode,
  DateSelectionModeEnum,
  TextParamInputUIType,
  TextParamInputUITypeEnum,
  TimeControlMode,
  TimeControlModeEnum,
  TimeDisplayFont,
  TimeDisplayFontEnum,
  TimeDisplayFormat,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import {
  combineIsoDateAndTimeParts,
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";
import type { ParamValueChange } from "./ConfiguredParamInputs";
import { SwitchInput } from "./SwitchInput";

const ROW_CLASS_NAME =
  "flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]";
const LABEL_CLASS_NAME =
  "flex-1 font-sans text-xs font-semibold text-setta-600 dark:text-setta-400";
const SELECT_CLASS_NAME =
  "nodrag font-code cursor-pointer border-0 border-b border-solid border-setta-300 bg-transparent text-xs focus:border-blue-400 focus:outline-none focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-700 dark:text-setta-300";

const TIME_FORMAT_OPTIONS: Array<{
  value: TimeDisplayFormat;
  label: string;
}> = [
  { value: TimeDisplayFormatEnum.twenty_four_hour, label: "24-hour" },
  { value: TimeDisplayFormatEnum.twelve_hour, label: "12-hour" },
];

const TIME_CONTROL_MODE_OPTIONS: Array<{
  value: TimeControlMode;
  label: string;
}> = [
  { value: TimeControlModeEnum.display, label: "Display" },
  { value: TimeControlModeEnum.input, label: "Input" },
];

const TIME_DISPLAY_FONT_OPTIONS: Array<{
  value: TimeDisplayFont;
  label: string;
}> = [
  { value: TimeDisplayFontEnum.clock, label: "Clock" },
  { value: TimeDisplayFontEnum.monospace, label: "Monospace" },
  { value: TimeDisplayFontEnum.system, label: "System" },
];

const TIME_DISPLAY_SCALE_MIN = 0.5;
const TIME_DISPLAY_SCALE_MAX = 3.0;
const TIME_DISPLAY_SCALE_STEP = 0.1;

const DATE_FORMAT_OPTIONS: Array<{
  value: DateDisplayFormat;
  label: string;
}> = [
  { value: DateDisplayFormatEnum.iso, label: "ISO (YYYY-MM-DD)" },
  { value: DateDisplayFormatEnum.us, label: "US (MM/DD/YYYY)" },
  { value: DateDisplayFormatEnum.eu, label: "EU (DD/MM/YYYY)" },
  { value: DateDisplayFormatEnum.long, label: "Long (Month D, YYYY)" },
];

const DATE_CONTROL_MODE_OPTIONS: Array<{
  value: DateControlMode;
  label: string;
}> = [
  { value: DateControlModeEnum.input, label: "Date input" },
  { value: DateControlModeEnum.calendar, label: "Calendar" },
];

const DATE_SELECTION_MODE_OPTIONS: Array<{
  value: DateSelectionMode;
  label: string;
}> = [
  { value: DateSelectionModeEnum.single, label: "Single date" },
  { value: DateSelectionModeEnum.multiple, label: "Multiple dates" },
];

const DATE_WEEK_START_OPTIONS: Array<{
  value: DateCalendarWeekStart;
  label: string;
}> = [
  { value: DateCalendarWeekStartEnum.sunday, label: "Sunday" },
  { value: DateCalendarWeekStartEnum.monday, label: "Monday" },
];

const SUNDAY_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONDAY_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekdayLabels(
  weekStart: DateCalendarWeekStart,
): ReadonlyArray<string> {
  if (weekStart === DateCalendarWeekStartEnum.monday) {
    return MONDAY_WEEKDAY_LABELS;
  }
  return SUNDAY_WEEKDAY_LABELS;
}

function clampTimeDisplayScale(rawScale: number): number {
  if (!Number.isFinite(rawScale)) {
    return 1;
  }
  return Math.min(
    TIME_DISPLAY_SCALE_MAX,
    Math.max(TIME_DISPLAY_SCALE_MIN, rawScale),
  );
}

function getTimeDisplayFontClassName(timeDisplayFont: TimeDisplayFont): string {
  if (timeDisplayFont === TimeDisplayFontEnum.system) {
    return "font-sans tabular-nums";
  }
  if (timeDisplayFont === TimeDisplayFontEnum.clock) {
    return "font-semibold tabular-nums tracking-[0.08em]";
  }
  return "font-mono tabular-nums";
}

export function parseCalendarSelectedDates(
  rawValue: string,
  selectionMode: DateSelectionMode,
  includeTime = false,
): Array<string> {
  if (selectionMode === DateSelectionModeEnum.single) {
    const candidate = includeTime
      ? splitIsoDateAndTimeParts(rawValue)?.dateIso ?? ""
      : rawValue;
    const normalized = normalizeDateToIso(candidate, DateDisplayFormatEnum.iso);
    if (parseIsoDate(normalized) === null) {
      return [];
    }
    return [normalized];
  }

  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return [];
  }

  let candidates: Array<string> = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      candidates = parsed.filter(
        (item): item is string => typeof item === "string",
      );
    } else if (typeof parsed === "string") {
      candidates = [parsed];
    }
  } catch {
    candidates = [trimmed];
  }

  const normalized = candidates
    .map((candidate) =>
      normalizeDateToIso(
        includeTime
          ? splitIsoDateAndTimeParts(candidate)?.dateIso ?? candidate
          : candidate,
        DateDisplayFormatEnum.iso,
      ),
    )
    .filter((candidate) => parseIsoDate(candidate) !== null);

  return Array.from(new Set(normalized)).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function serializeCalendarSelectedDates(
  selectedDates: Array<string>,
  selectionMode: DateSelectionMode,
): string {
  const sorted = Array.from(new Set(selectedDates)).sort((left, right) =>
    left.localeCompare(right),
  );
  if (selectionMode === DateSelectionModeEnum.single) {
    return sorted[0] ?? "";
  }
  if (sorted.length === 0) {
    return "";
  }
  return JSON.stringify(sorted);
}

function formatMonthTitle(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function TextParamInputConfigForParam(_: {
  sectionId: string;
  paramInfoId: string;
}) {
  return null;
}

export function TimeParamInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.TimeParam,
  );

  function onConfigChange(nextConfig: Partial<TimeParamConfigForFrontend>) {
    if (!canEditStructure) {
      return;
    }
    const merged: TimeParamConfigForFrontend = {
      ...config,
      ...nextConfig,
    };
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"TimeParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          merged,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: merged,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Time UI</p>
        <select
          className={SELECT_CLASS_NAME}
          value={config.timeControlMode}
          onChange={(event) =>
            onConfigChange({
              timeControlMode: event.target.value as TimeControlMode,
            })
          }
          disabled={!canEditStructure}
        >
          {TIME_CONTROL_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Time Format</p>
        <select
          className={SELECT_CLASS_NAME}
          value={config.timeDisplayFormat}
          onChange={(event) =>
            onConfigChange({
              timeDisplayFormat: event.target.value as TimeDisplayFormat,
            })
          }
          disabled={!canEditStructure}
        >
          {TIME_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {config.timeControlMode === TimeControlModeEnum.display ? (
        <>
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>Transparent</p>
            <SwitchInput
              value={config.timeDisplayTransparent}
              onChange={(nextValue) =>
                onConfigChange({ timeDisplayTransparent: nextValue })
              }
              isDisabled={!canEditStructure}
              outerDivClassName="flex items-center"
            />
          </div>
          <div
            className={`${ROW_CLASS_NAME} flex-col items-stretch gap-1 rounded-xl`}
          >
            <div className="flex items-center justify-between">
              <p className={LABEL_CLASS_NAME}>Clock Scale</p>
              <span className="font-code text-[11px] text-setta-500 dark:text-setta-400">
                {clampTimeDisplayScale(config.timeDisplayScale).toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={TIME_DISPLAY_SCALE_MIN}
              max={TIME_DISPLAY_SCALE_MAX}
              step={TIME_DISPLAY_SCALE_STEP}
              value={clampTimeDisplayScale(config.timeDisplayScale)}
              onChange={(event) =>
                onConfigChange({
                  timeDisplayScale: clampTimeDisplayScale(
                    Number(event.target.value),
                  ),
                })
              }
              disabled={!canEditStructure}
              className="w-full accent-blue-500"
            />
          </div>
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>Clock Font</p>
            <select
              className={SELECT_CLASS_NAME}
              value={config.timeDisplayFont}
              onChange={(event) =>
                onConfigChange({
                  timeDisplayFont: event.target.value as TimeDisplayFont,
                })
              }
              disabled={!canEditStructure}
            >
              {TIME_DISPLAY_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function DateParamInputConfigForParam({
  sectionId,
  paramInfoId,
  allowCalendarUi = false,
}: {
  sectionId: string;
  paramInfoId: string;
  allowCalendarUi?: boolean;
}) {
  const { canEditStructure } = useShareCapabilities();
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.DateParam,
  );

  function onConfigChange(nextConfig: Partial<DateParamConfigForFrontend>) {
    if (!canEditStructure) {
      return;
    }
    const merged: DateParamConfigForFrontend = {
      ...config,
      ...nextConfig,
    };
    if (merged.dateIncludesTime) {
      merged.dateSelectionMode = DateSelectionModeEnum.single;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"DateParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          merged,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: merged,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Date Display</p>
        <select
          className={SELECT_CLASS_NAME}
          value={config.dateDisplayFormat}
          onChange={(event) =>
            onConfigChange({
              dateDisplayFormat: event.target.value as DateDisplayFormat,
            })
          }
          disabled={!canEditStructure}
        >
          {DATE_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Date UI</p>
        {allowCalendarUi ? (
          <select
            className={SELECT_CLASS_NAME}
            value={config.dateControlMode}
            onChange={(event) =>
              onConfigChange({
                dateControlMode: event.target.value as DateControlMode,
              })
            }
            disabled={!canEditStructure}
          >
            {DATE_CONTROL_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-code text-xs text-setta-500 dark:text-setta-400">
            Date input
          </span>
        )}
      </div>
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Include Time</p>
        <SwitchInput
          value={config.dateIncludesTime}
          onChange={(nextValue) =>
            onConfigChange({ dateIncludesTime: nextValue })
          }
          isDisabled={!canEditStructure}
          outerDivClassName="flex items-center"
        />
      </div>
      {allowCalendarUi &&
      config.dateControlMode === DateControlModeEnum.calendar ? (
        <>
          {!config.dateIncludesTime ? (
            <div className={ROW_CLASS_NAME}>
              <p className={LABEL_CLASS_NAME}>Selection</p>
              <select
                className={SELECT_CLASS_NAME}
                value={config.dateSelectionMode}
                onChange={(event) =>
                  onConfigChange({
                    dateSelectionMode: event.target.value as DateSelectionMode,
                  })
                }
                disabled={!canEditStructure}
              >
                {DATE_SELECTION_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={ROW_CLASS_NAME}>
              <p className={LABEL_CLASS_NAME}>Selection</p>
              <span className="font-code text-xs text-setta-500 dark:text-setta-400">
                Single date
              </span>
            </div>
          )}
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>Week Starts</p>
            <select
              className={SELECT_CLASS_NAME}
              value={config.dateCalendarWeekStart}
              onChange={(event) =>
                onConfigChange({
                  dateCalendarWeekStart: event.target
                    .value as DateCalendarWeekStart,
                })
              }
              disabled={!canEditStructure}
            >
              {DATE_WEEK_START_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DateCalendarInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  selectionMode,
  weekStart,
  includeTime,
  dateDisplayFormat,
  timeDisplayFormat,
  summaryClassName,
}: {
  value: string;
  onChange: ParamValueChange;
  onEscape?: () => void;
  isDisabled: boolean;
  selectionMode: DateSelectionMode;
  weekStart: DateCalendarWeekStart;
  includeTime: boolean;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
  summaryClassName: string;
}) {
  const splitDateTime = useMemo(() => splitIsoDateAndTimeParts(value), [value]);
  const selectedTimeValue = splitDateTime?.time24 ?? "00:00";
  const selectedDates = useMemo(
    () => parseCalendarSelectedDates(value, selectionMode, includeTime),
    [includeTime, selectionMode, value],
  );
  const primarySelectedDate = selectedDates[0] ?? "";
  const [anchor, setAnchor] = useState(() =>
    resolveCalendarAnchorDate(primarySelectedDate),
  );

  useEffect(() => {
    setAnchor(resolveCalendarAnchorDate(primarySelectedDate));
  }, [primarySelectedDate]);

  const monthCells = useMemo(
    () =>
      buildCalendarMonthGrid({
        year: anchor.year,
        monthIndex: anchor.monthIndex,
        weekStartsOn: weekStart,
      }),
    [anchor.monthIndex, anchor.year, weekStart],
  );
  const selectedDateSet = useMemo(
    () => new Set(selectedDates),
    [selectedDates],
  );
  const weekdayLabels = useMemo(() => getWeekdayLabels(weekStart), [weekStart]);
  const todayIso = useMemo(
    () =>
      normalizeDateToIso(
        new Date().toISOString().slice(0, 10),
        DateDisplayFormatEnum.iso,
      ),
    [],
  );

  let summaryText = "No date selected";
  if (selectionMode === DateSelectionModeEnum.multiple) {
    summaryText = `${selectedDates.length} selected`;
  } else if (includeTime && splitDateTime) {
    summaryText = formatDateTimeForDisplay({
      raw: value,
      dateDisplayFormat,
      timeDisplayFormat,
    });
  } else if (selectedDates.length > 0) {
    summaryText = selectedDates[0];
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-200/40 dark:text-setta-300 dark:hover:bg-setta-700/60"
          onClick={() => setAnchor(shiftCalendarMonth(anchor, -1))}
          disabled={isDisabled}
        >
          Prev
        </button>
        <span className="text-xs font-semibold text-setta-700 dark:text-setta-200">
          {formatMonthTitle(anchor.year, anchor.monthIndex)}
        </span>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-200/40 dark:text-setta-300 dark:hover:bg-setta-700/60"
          onClick={() => setAnchor(shiftCalendarMonth(anchor, 1))}
          disabled={isDisabled}
        >
          Next
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        {weekdayLabels.map((weekdayLabel) => (
          <span key={weekdayLabel}>{weekdayLabel}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((cell) => {
          const isSelected = selectedDateSet.has(cell.isoDate);
          const isToday = cell.isoDate === todayIso;
          const inCurrentMonthClass = cell.inCurrentMonth
            ? "text-setta-700 dark:text-setta-200"
            : "text-setta-400 dark:text-setta-500";
          const selectedClass = isSelected
            ? "bg-blue-500 text-white hover:bg-blue-500/90 dark:bg-blue-600 dark:text-white"
            : "hover:bg-setta-200/40 dark:hover:bg-setta-700/60";
          const todayClass = isToday
            ? "ring-1 ring-blue-400 dark:ring-blue-500"
            : "";
          return (
            <button
              key={cell.isoDate}
              type="button"
              className={`rounded px-1 py-1 text-xs font-medium ${inCurrentMonthClass} ${selectedClass} ${todayClass}`}
              onClick={() => {
                if (isDisabled) {
                  return;
                }
                if (selectionMode === DateSelectionModeEnum.multiple) {
                  const nextDates = selectedDates.filter(
                    (date) => date !== cell.isoDate,
                  );
                  if (!isSelected) {
                    nextDates.push(cell.isoDate);
                  }
                  onChange(
                    serializeCalendarSelectedDates(nextDates, selectionMode),
                  );
                  return;
                }
                if (includeTime) {
                  onChange(
                    combineIsoDateAndTimeParts(cell.isoDate, selectedTimeValue),
                  );
                } else {
                  onChange(
                    serializeCalendarSelectedDates(
                      [cell.isoDate],
                      selectionMode,
                    ),
                  );
                }
              }}
              onKeyDown={(event) => {
                if (event.code === "Escape") {
                  onEscape?.();
                }
              }}
              disabled={isDisabled}
            >
              {cell.dayOfMonth}
            </button>
          );
        })}
      </div>
      {includeTime && selectionMode === DateSelectionModeEnum.single ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
            Time
          </span>
          <input
            type="time"
            className="w-full rounded border border-setta-300 bg-transparent px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 dark:border-setta-700 dark:text-setta-300"
            value={selectedTimeValue}
            onChange={(event) => {
              const nextDate = selectedDates[0] ?? todayIso;
              const combined = combineIsoDateAndTimeParts(
                nextDate,
                event.target.value,
              );
              if (combined !== "") {
                onChange(combined);
              }
            }}
            disabled={isDisabled}
          />
        </div>
      ) : null}
      <span className={summaryClassName}>{summaryText}</span>
    </>
  );
}

export function TextParamDateTimeInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  uiType,
  timeControlMode,
  timeDisplayFormat,
  timeDisplayTransparent,
  timeDisplayScale,
  timeDisplayFont,
  dateDisplayFormat,
  dateControlMode,
  dateSelectionMode,
  dateCalendarWeekStart,
  dateIncludesTime,
  wrapperClassName,
  inputClassName,
  formattedValueClassName,
  borderClassName,
}: {
  value: string;
  onChange: ParamValueChange;
  onEscape?: () => void;
  isDisabled: boolean;
  uiType: TextParamInputUIType;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent?: boolean;
  timeDisplayScale?: number;
  timeDisplayFont?: TimeDisplayFont;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
  wrapperClassName?: string;
  inputClassName?: string;
  formattedValueClassName?: string;
  borderClassName?: string;
}) {
  const effectiveWrapperClassName =
    wrapperClassName ?? "section-value flex min-w-0 items-center gap-2";
  const effectiveInputClassName =
    inputClassName ??
    `${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
  const effectiveFormattedClassName =
    formattedValueClassName ??
    "text-[10px] font-mono text-setta-500 dark:text-setta-400";
  const effectiveBorderClassName =
    borderClassName ??
    "section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30 peer-focus-within/textinput:border-blue-400";

  const showCalendarDateUi =
    uiType === TextParamInputUITypeEnum.date &&
    dateControlMode === DateControlModeEnum.calendar;
  const effectiveDateSelectionMode = dateIncludesTime
    ? DateSelectionModeEnum.single
    : dateSelectionMode;
  const showDisplayOnlyTime =
    uiType === TextParamInputUITypeEnum.time &&
    timeControlMode === TimeControlModeEnum.display;
  const effectiveTimeDisplayScale = clampTimeDisplayScale(
    timeDisplayScale ?? 1,
  );
  const effectiveTimeDisplayTransparent = timeDisplayTransparent ?? false;
  const timeDisplayFontClassName = getTimeDisplayFontClassName(
    timeDisplayFont ?? TimeDisplayFontEnum.monospace,
  );

  if (showDisplayOnlyTime) {
    const formattedTimeValue = formatTimeForDisplay(value, timeDisplayFormat);
    const displayedTimeValue =
      formattedTimeValue.trim().length > 0 ? formattedTimeValue : "--:--";
    return (
      <>
        <div className={effectiveWrapperClassName}>
          <span
            className={`${effectiveInputClassName} ${timeDisplayFontClassName} flex min-w-0 flex-1 items-center`}
            style={{
              fontSize: `${effectiveTimeDisplayScale}em`,
              lineHeight: "1.1",
            }}
          >
            {displayedTimeValue}
          </span>
        </div>
        {effectiveTimeDisplayTransparent ? null : (
          <span className={effectiveBorderClassName} />
        )}
      </>
    );
  }

  if (showCalendarDateUi) {
    return (
      <>
        <div
          className={`${effectiveWrapperClassName} flex-col items-stretch gap-2`}
        >
          <DateCalendarInput
            value={value}
            onChange={onChange}
            onEscape={onEscape}
            isDisabled={isDisabled}
            selectionMode={effectiveDateSelectionMode}
            weekStart={dateCalendarWeekStart}
            includeTime={dateIncludesTime}
            dateDisplayFormat={dateDisplayFormat}
            timeDisplayFormat={timeDisplayFormat}
            summaryClassName={effectiveFormattedClassName}
          />
        </div>
        <span className={effectiveBorderClassName} />
      </>
    );
  }

  const showFormattedDateInput =
    uiType === TextParamInputUITypeEnum.date && !dateIncludesTime;

  let normalizedValue = "";
  if (uiType === TextParamInputUITypeEnum.time) {
    normalizedValue = normalizeTimeTo24Hour(value);
  } else if (dateIncludesTime) {
    const split = splitIsoDateAndTimeParts(value);
    if (split) {
      normalizedValue = `${split.dateIso}T${split.time24}`;
    } else {
      const normalizedDate = normalizeDateToIso(value, dateDisplayFormat);
      normalizedValue = normalizedDate === "" ? "" : `${normalizedDate}T00:00`;
    }
  } else {
    normalizedValue = normalizeDateToIso(value, dateDisplayFormat);
  }

  const [localDateInputValue, setLocalDateInputValue] = useState(() =>
    formatDateForDisplay(normalizedValue, dateDisplayFormat),
  );
  useEffect(() => {
    if (!showFormattedDateInput) {
      return;
    }
    setLocalDateInputValue(
      formatDateForDisplay(normalizedValue, dateDisplayFormat),
    );
  }, [dateDisplayFormat, normalizedValue, showFormattedDateInput]);

  let formattedValue = "";
  let inputType: "time" | "date" | "datetime-local" | "text" = "date";
  if (uiType === TextParamInputUITypeEnum.time) {
    formattedValue = formatTimeForDisplay(normalizedValue, timeDisplayFormat);
    inputType = "time";
  } else if (dateIncludesTime) {
    formattedValue = formatDateTimeForDisplay({
      raw: normalizedValue,
      dateDisplayFormat,
      timeDisplayFormat,
    });
    inputType = "datetime-local";
  } else {
    if (showFormattedDateInput) {
      formattedValue = "";
      inputType = "text";
    } else {
      formattedValue = formatDateForDisplay(normalizedValue, dateDisplayFormat);
      inputType = "date";
    }
  }

  return (
    <>
      <div className={effectiveWrapperClassName}>
        <input
          type={inputType}
          className={effectiveInputClassName}
          value={showFormattedDateInput ? localDateInputValue : normalizedValue}
          onChange={(event) => {
            if (uiType === TextParamInputUITypeEnum.time) {
              onChange(normalizeTimeTo24Hour(event.target.value));
              return;
            }
            if (dateIncludesTime) {
              onChange(normalizeDateTimeToLocalIso(event.target.value));
              return;
            }
            if (showFormattedDateInput) {
              const rawValue = event.target.value;
              setLocalDateInputValue(rawValue);
              const nextIso = normalizeDateToIso(rawValue, dateDisplayFormat);
              if (nextIso !== "") {
                onChange(nextIso);
              }
              return;
            }
            onChange(normalizeDateToIso(event.target.value, dateDisplayFormat));
          }}
          onBlur={() => {
            if (!showFormattedDateInput) {
              return;
            }
            const nextIso = normalizeDateToIso(
              localDateInputValue,
              dateDisplayFormat,
            );
            const fallbackIso = normalizeDateToIso(value, dateDisplayFormat);
            const resolvedIso = nextIso !== "" ? nextIso : fallbackIso;
            setLocalDateInputValue(
              formatDateForDisplay(resolvedIso, dateDisplayFormat),
            );
            if (nextIso !== "" && nextIso !== fallbackIso) {
              onChange(nextIso);
            }
          }}
          onKeyDown={(event) => {
            if (event.code === "Escape") {
              onEscape?.();
            }
          }}
          disabled={isDisabled}
        />
        <span className={effectiveFormattedClassName}>{formattedValue}</span>
      </div>
      <span className={effectiveBorderClassName} />
    </>
  );
}
