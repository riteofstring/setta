import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";

import { updateParamImplConfig } from "openapi/http";

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

import {
  CodeObjTypeEnum,
  DateCalendarWeekStart,
  DateControlMode,
  DateControlModeEnum,
  DateDisplayFormat,
  DateDisplayFormatEnum,
  DateParamCodeObjImpl,
  DateSelectionMode,
  DateSelectionModeEnum,
  TextParamInputUIType,
  TextParamUIConfig,
  TimeControlMode,
  TimeControlModeEnum,
  TimeDisplayFont,
  TimeDisplayFontEnum,
  TimeDisplayFormat,
  TimeParamCodeObjImpl,
} from "utils/generatedTypes";

import {
  combineIsoDateAndTimeParts,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getLocalTodayIsoDate,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";

import type { ParamValueChange } from "../ConfiguredParamInputs";

import { SwitchInput } from "../SwitchInput";

const ROW_CLASS_NAME =
  "flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]";

const LABEL_CLASS_NAME =
  "flex-1 font-sans text-xs font-semibold text-setta-600 dark:text-setta-400";

const SELECT_CLASS_NAME =
  "nodrag font-code cursor-pointer border-0 border-b border-solid border-setta-300 bg-transparent text-xs focus:border-blue-400 focus:outline-none focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-700 dark:text-setta-300";

const TIME_DISPLAY_SCALE_MIN = 0.5;

const TIME_DISPLAY_SCALE_MAX = 3.0;

const TIME_DISPLAY_SCALE_STEP = 0.1;

function getWeekdayLabels(
  weekStart: DateCalendarWeekStart,
): ReadonlyArray<string> {
  const labels = TextParamUIConfig.calendarWeekdayLabelsByWeekStart[weekStart];
  if (!labels) {
    throw new Error(`Missing weekday labels for week start ${weekStart}`);
  }
  return labels;
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

function collectCalendarSelectionCandidates(parsed: unknown): Array<string> {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === "string");
  }
  if (typeof parsed === "string") {
    return [parsed];
  }
  return [];
}

function parseCalendarSelectionCandidates(rawValue: string): Array<string> {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return [];
  }
  try {
    return collectCalendarSelectionCandidates(JSON.parse(trimmed));
  } catch {
    return [trimmed];
  }
}

function normalizeCalendarSelectionCandidate(
  candidate: string,
  includeTime: boolean,
): string {
  const dateCandidate = includeTime
    ? splitIsoDateAndTimeParts(candidate)?.dateIso ?? candidate
    : candidate;
  return normalizeDateToIso(dateCandidate, DateDisplayFormatEnum.iso);
}

function parseCalendarSelectedDates(
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
  const normalized = parseCalendarSelectionCandidates(rawValue)
    .map((candidate) =>
      normalizeCalendarSelectionCandidate(candidate, includeTime),
    )
    .filter((candidate) => parseIsoDate(candidate) !== null);
  return Array.from(new Set(normalized)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function serializeCalendarSelectedDates(
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

function resolveCalendarSummaryText({
  selectedDates,
  value,
  selectionMode,
  includeTime,
  splitDateTime,
  dateDisplayFormat,
  timeDisplayFormat,
}: {
  selectedDates: Array<string>;
  value: string;
  selectionMode: DateSelectionMode;
  includeTime: boolean;
  splitDateTime: ReturnType<typeof splitIsoDateAndTimeParts>;
  dateDisplayFormat: DateDisplayFormat;
  timeDisplayFormat: TimeDisplayFormat;
}): string {
  if (selectionMode === DateSelectionModeEnum.multiple) {
    return `${selectedDates.length} selected`;
  }
  if (includeTime && splitDateTime) {
    return formatDateTimeForDisplay({
      raw: value,
      dateDisplayFormat,
      timeDisplayFormat,
    });
  }
  return selectedDates[0] ?? "No date selected";
}

function resolveCalendarCellClassName({
  inCurrentMonth,
  isSelected,
  isToday,
}: {
  inCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}): string {
  const inCurrentMonthClass = inCurrentMonth
    ? "text-setta-700 dark:text-setta-200"
    : "text-setta-400 dark:text-setta-500";
  const selectedClass = isSelected
    ? "bg-blue-500 text-white hover:bg-blue-500/90 dark:bg-blue-600 dark:text-white"
    : "hover:bg-setta-200/40 dark:hover:bg-setta-700/60";
  const todayClass = isToday ? "ring-1 ring-blue-400 dark:ring-blue-500" : "";
  return `rounded px-1 py-1 text-xs font-medium ${inCurrentMonthClass} ${selectedClass} ${todayClass}`;
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
  if (selectionMode === DateSelectionModeEnum.multiple) {
    const nextDates = isSelected
      ? selectedDates.filter((date) => date !== cellIsoDate)
      : [...selectedDates, cellIsoDate];
    return serializeCalendarSelectedDates(nextDates, selectionMode);
  }
  if (includeTime) {
    return combineIsoDateAndTimeParts(cellIsoDate, selectedTimeValue);
  }
  return serializeCalendarSelectedDates([cellIsoDate], selectionMode);
}

function CalendarDateButton({
  cell,
  isSelected,
  isToday,
  isDisabled,
  onEscape,
  onSelect,
}: {
  cell: ReturnType<typeof buildCalendarMonthGrid>[number];
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
  onEscape?: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={resolveCalendarCellClassName({
        inCurrentMonth: cell.inCurrentMonth,
        isSelected,
        isToday,
      })}
      onClick={onSelect}
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
        setCurrEffectiveCodeObjImplValue<TimeParamCodeObjImpl>(
          state,
          sectionId,
          paramInfoId,
          merged,
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          updateParamImplConfig({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              paramInfoId,
              newConfig: merged,
              frontendOpId,
            },
          } as Parameters<typeof updateParamImplConfig>[0]),
        ),
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
          {TextParamUIConfig.timeControlModeOptions.map((option) => (
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
          {TextParamUIConfig.timeDisplayFormatOptions.map((option) => (
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
              {TextParamUIConfig.timeDisplayFontOptions.map((option) => (
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
        setCurrEffectiveCodeObjImplValue<DateParamCodeObjImpl>(
          state,
          sectionId,
          paramInfoId,
          merged,
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          updateParamImplConfig({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              paramInfoId,
              newConfig: merged,
              frontendOpId,
            },
          } as Parameters<typeof updateParamImplConfig>[0]),
        ),
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
          {TextParamUIConfig.dateDisplayFormatOptions.map((option) => (
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
            {TextParamUIConfig.dateControlModeOptions.map((option) => (
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
                {TextParamUIConfig.dateSelectionModeOptions.map((option) => (
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
              {TextParamUIConfig.dateCalendarWeekStartOptions.map((option) => (
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

export function DateCalendarInput({
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
  const todayIso = useMemo(() => getLocalTodayIsoDate(), []);
  const summaryText = resolveCalendarSummaryText({
    selectedDates,
    value,
    selectionMode,
    includeTime,
    splitDateTime,
    dateDisplayFormat,
    timeDisplayFormat,
  });
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
          return (
            <CalendarDateButton
              key={cell.isoDate}
              cell={cell}
              isSelected={isSelected}
              isToday={isToday}
              isDisabled={isDisabled}
              onEscape={onEscape}
              onSelect={() => {
                if (isDisabled) {
                  return;
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
              }}
            />
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

export type TextParamDateTimeInputProps = {
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
};

export type TextParamDateTimeClasses = {
  wrapper: string;
  input: string;
  formatted: string;
  border: string;
};

type TextParamDateTimeDisplayOptions = {
  fontClassName: string;
  scale: number;
  transparent: boolean;
};

export type EditableTextParamDateTimeMode =
  | "date"
  | "datetime-local"
  | "formatted-date"
  | "time";

export type EditableTextParamDateTimeView = {
  kind: "editable";
  mode: EditableTextParamDateTimeMode;
  inputType: "time" | "date" | "datetime-local" | "text";
  normalizedValue: string;
  formattedValue: string;
};

export type TextParamDateTimeView =
  | {
      kind: "calendar";
      selectionMode: DateSelectionMode;
    }
  | {
      kind: "display-only-time";
      displayedTimeValue: string;
    }
  | EditableTextParamDateTimeView;

export type EditableDateTimeChangeResult = {
  nextCommittedValue?: string;
  nextLocalDateInputValue?: string;
};

export type FormattedDateBlurResult = {
  nextCommittedValue?: string;
  nextLocalDateInputValue: string;
};

export function resolveTextParamDateTimeClasses({
  wrapperClassName,
  inputClassName,
  formattedValueClassName,
  borderClassName,
  isDisabled,
}: Pick<
  TextParamDateTimeInputProps,
  | "borderClassName"
  | "formattedValueClassName"
  | "inputClassName"
  | "isDisabled"
  | "wrapperClassName"
>): TextParamDateTimeClasses {
  return {
    wrapper:
      wrapperClassName ?? "section-value flex min-w-0 items-center gap-2",
    input:
      inputClassName ??
      `${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`,
    formatted:
      formattedValueClassName ??
      "text-[10px] font-mono text-setta-500 dark:text-setta-400",
    border:
      borderClassName ??
      "section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30 peer-focus-within/textinput:border-blue-400",
  };
}

export function resolveTextParamDateTimeDisplayOptions({
  timeDisplayFont,
  timeDisplayScale,
  timeDisplayTransparent,
}: Pick<
  TextParamDateTimeInputProps,
  "timeDisplayFont" | "timeDisplayScale" | "timeDisplayTransparent"
>): TextParamDateTimeDisplayOptions {
  return {
    fontClassName: getTimeDisplayFontClassName(
      timeDisplayFont ?? TimeDisplayFontEnum.monospace,
    ),
    scale: clampTimeDisplayScale(timeDisplayScale ?? 1),
    transparent: timeDisplayTransparent ?? false,
  };
}

function formatDisplayOnlyTimeValue(
  value: string,
  timeDisplayFormat: TimeDisplayFormat,
): string {
  const formattedTimeValue = formatTimeForDisplay(value, timeDisplayFormat);
  return formattedTimeValue.trim().length > 0 ? formattedTimeValue : "--:--";
}

export function normalizeDateTimeInputValue(
  value: string,
  dateDisplayFormat: DateDisplayFormat,
): string {
  const split = splitIsoDateAndTimeParts(value);
  if (split) {
    return `${split.dateIso}T${split.time24}`;
  }
  const normalizedDate = normalizeDateToIso(value, dateDisplayFormat);
  return normalizedDate === "" ? "" : `${normalizedDate}T00:00`;
}

export function buildEditableTextParamDateTimeView(
  mode: EditableTextParamDateTimeMode,
  inputType: EditableTextParamDateTimeView["inputType"],
  normalizedValue: string,
  formattedValue: string,
): EditableTextParamDateTimeView {
  return {
    kind: "editable",
    mode,
    inputType,
    normalizedValue,
    formattedValue,
  };
}

export function resolveTimeParamDateTimeView(
  value: string,
  timeControlMode: TimeControlMode,
  timeDisplayFormat: TimeDisplayFormat,
): TextParamDateTimeView {
  if (timeControlMode === TimeControlModeEnum.display) {
    return {
      kind: "display-only-time",
      displayedTimeValue: formatDisplayOnlyTimeValue(value, timeDisplayFormat),
    };
  }
  const normalizedValue = normalizeTimeTo24Hour(value);
  return buildEditableTextParamDateTimeView(
    "time",
    "time",
    normalizedValue,
    formatTimeForDisplay(normalizedValue, timeDisplayFormat),
  );
}
