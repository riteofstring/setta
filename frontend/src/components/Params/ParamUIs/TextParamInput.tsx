import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  TextParamConfigForFrontend,
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
  TimeDisplayFormat,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
} from "utils/textParamDateTime";
import type { ParamValueChange } from "./ConfiguredParamInputs";

const ROW_CLASS_NAME =
  "flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]";
const LABEL_CLASS_NAME =
  "flex-1 font-sans text-xs font-semibold text-setta-600 dark:text-setta-400";
const SELECT_CLASS_NAME =
  "nodrag font-code cursor-pointer border-0 border-b border-solid border-setta-300 bg-transparent text-xs focus:border-blue-400 focus:outline-none focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-700 dark:text-setta-300";

const UI_TYPE_OPTIONS: Array<{
  value: TextParamInputUIType;
  label: string;
}> = [
  { value: TextParamInputUITypeEnum.plain, label: "Plain text" },
  { value: TextParamInputUITypeEnum.time, label: "Time picker" },
  { value: TextParamInputUITypeEnum.date, label: "Date picker" },
];

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

export function parseCalendarSelectedDates(
  rawValue: string,
  selectionMode: DateSelectionMode,
): Array<string> {
  if (selectionMode === DateSelectionModeEnum.single) {
    const normalized = normalizeDateToIso(rawValue, DateDisplayFormatEnum.iso);
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
      normalizeDateToIso(candidate, DateDisplayFormatEnum.iso),
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

export function TextParamInputConfigForParam({
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
    CodeObjTypeEnum.TextParam,
  );

  function onConfigChange(nextConfig: Partial<TextParamConfigForFrontend>) {
    if (!canEditStructure) {
      return;
    }
    const merged: TextParamConfigForFrontend = {
      ...config,
      ...nextConfig,
    };
    const configClone = _.cloneDeep(merged);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"TextParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          configClone,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: configClone,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Input UI</p>
        <select
          className={SELECT_CLASS_NAME}
          value={config.uiType}
          onChange={(event) =>
            onConfigChange({
              uiType: event.target.value as TextParamInputUIType,
            })
          }
          disabled={!canEditStructure}
        >
          {UI_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {config.uiType === TextParamInputUITypeEnum.time ? (
        <>
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
        </>
      ) : null}
      {config.uiType === TextParamInputUITypeEnum.date ? (
        <>
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
          </div>
          {config.dateControlMode === DateControlModeEnum.calendar ? (
            <>
              <div className={ROW_CLASS_NAME}>
                <p className={LABEL_CLASS_NAME}>Selection</p>
                <select
                  className={SELECT_CLASS_NAME}
                  value={config.dateSelectionMode}
                  onChange={(event) =>
                    onConfigChange({
                      dateSelectionMode: event.target
                        .value as DateSelectionMode,
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
  summaryClassName,
}: {
  value: string;
  onChange: ParamValueChange;
  onEscape?: () => void;
  isDisabled: boolean;
  selectionMode: DateSelectionMode;
  weekStart: DateCalendarWeekStart;
  summaryClassName: string;
}) {
  const selectedDates = useMemo(
    () => parseCalendarSelectedDates(value, selectionMode),
    [value, selectionMode],
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
                onChange(
                  serializeCalendarSelectedDates([cell.isoDate], selectionMode),
                );
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
  dateDisplayFormat,
  dateControlMode,
  dateSelectionMode,
  dateCalendarWeekStart,
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
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
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
  const showDisplayOnlyTime =
    uiType === TextParamInputUITypeEnum.time &&
    timeControlMode === TimeControlModeEnum.display;

  if (showDisplayOnlyTime) {
    const formattedTimeValue = formatTimeForDisplay(value, timeDisplayFormat);
    const displayedTimeValue =
      formattedTimeValue.trim().length > 0 ? formattedTimeValue : "--:--";
    return (
      <>
        <div className={effectiveWrapperClassName}>
          <span
            className={`${effectiveInputClassName} flex min-w-0 flex-1 items-center`}
          >
            {displayedTimeValue}
          </span>
        </div>
        <span className={effectiveBorderClassName} />
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
            selectionMode={dateSelectionMode}
            weekStart={dateCalendarWeekStart}
            summaryClassName={effectiveFormattedClassName}
          />
        </div>
        <span className={effectiveBorderClassName} />
      </>
    );
  }

  let normalizedValue = "";
  if (uiType === TextParamInputUITypeEnum.time) {
    normalizedValue = normalizeTimeTo24Hour(value);
  } else {
    normalizedValue = normalizeDateToIso(value, dateDisplayFormat);
  }

  let formattedValue = "";
  let inputType: "time" | "date" = "date";
  if (uiType === TextParamInputUITypeEnum.time) {
    formattedValue = formatTimeForDisplay(normalizedValue, timeDisplayFormat);
    inputType = "time";
  } else {
    formattedValue = formatDateForDisplay(normalizedValue, dateDisplayFormat);
    inputType = "date";
  }

  return (
    <>
      <div className={effectiveWrapperClassName}>
        <input
          type={inputType}
          className={effectiveInputClassName}
          value={normalizedValue}
          onChange={(event) => {
            if (uiType === TextParamInputUITypeEnum.time) {
              onChange(normalizeTimeTo24Hour(event.target.value));
              return;
            }
            onChange(normalizeDateToIso(event.target.value, dateDisplayFormat));
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
