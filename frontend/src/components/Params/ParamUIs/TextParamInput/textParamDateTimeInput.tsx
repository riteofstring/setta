import { useEffect, useState } from "react";

import {
  DateControlModeEnum,
  DateDisplayFormat,
  DateSelectionModeEnum,
  TextParamInputUITypeEnum,
} from "utils/generatedTypes";

import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
} from "utils/textParamDateTime";

import type { ParamValueChange } from "../ConfiguredParamInputs";

import {
  DateCalendarInput,
  EditableDateTimeChangeResult,
  EditableTextParamDateTimeMode,
  EditableTextParamDateTimeView,
  FormattedDateBlurResult,
  TextParamDateTimeClasses,
  TextParamDateTimeInputProps,
  TextParamDateTimeView,
  buildEditableTextParamDateTimeView,
  normalizeDateTimeInputValue,
  resolveTextParamDateTimeClasses,
  resolveTextParamDateTimeDisplayOptions,
  resolveTimeParamDateTimeView,
} from "./dateTimeParamInputs";

function resolveDateParamDateTimeView({
  value,
  dateControlMode,
  dateSelectionMode,
  dateDisplayFormat,
  timeDisplayFormat,
  dateIncludesTime,
}: Pick<
  TextParamDateTimeInputProps,
  | "dateControlMode"
  | "dateDisplayFormat"
  | "dateIncludesTime"
  | "dateSelectionMode"
  | "timeDisplayFormat"
  | "value"
>): TextParamDateTimeView {
  if (dateControlMode === DateControlModeEnum.calendar) {
    return {
      kind: "calendar",
      selectionMode: dateIncludesTime
        ? DateSelectionModeEnum.single
        : dateSelectionMode,
    };
  }
  if (dateIncludesTime) {
    const normalizedValue = normalizeDateTimeInputValue(
      value,
      dateDisplayFormat,
    );
    return buildEditableTextParamDateTimeView(
      "datetime-local",
      "datetime-local",
      normalizedValue,
      formatDateTimeForDisplay({
        raw: normalizedValue,
        dateDisplayFormat,
        timeDisplayFormat,
      }),
    );
  }
  const normalizedValue = normalizeDateToIso(value, dateDisplayFormat);
  return buildEditableTextParamDateTimeView(
    "formatted-date",
    "text",
    normalizedValue,
    "",
  );
}

function resolveDefaultDateParamDateTimeView(
  value: string,
  dateDisplayFormat: DateDisplayFormat,
): EditableTextParamDateTimeView {
  const normalizedValue = normalizeDateToIso(value, dateDisplayFormat);
  return buildEditableTextParamDateTimeView(
    "date",
    "date",
    normalizedValue,
    formatDateForDisplay(normalizedValue, dateDisplayFormat),
  );
}

function resolveTextParamDateTimeView({
  value,
  uiType,
  timeControlMode,
  timeDisplayFormat,
  dateDisplayFormat,
  dateControlMode,
  dateSelectionMode,
  dateIncludesTime,
}: Pick<
  TextParamDateTimeInputProps,
  | "dateControlMode"
  | "dateDisplayFormat"
  | "dateIncludesTime"
  | "dateSelectionMode"
  | "timeControlMode"
  | "timeDisplayFormat"
  | "uiType"
  | "value"
>): TextParamDateTimeView {
  if (uiType === TextParamInputUITypeEnum.time) {
    return resolveTimeParamDateTimeView(
      value,
      timeControlMode,
      timeDisplayFormat,
    );
  }
  if (uiType === TextParamInputUITypeEnum.date) {
    return resolveDateParamDateTimeView({
      value,
      dateControlMode,
      dateSelectionMode,
      dateDisplayFormat,
      timeDisplayFormat,
      dateIncludesTime,
    });
  }
  return resolveDefaultDateParamDateTimeView(value, dateDisplayFormat);
}

function resolveEditableDateTimeChange({
  mode,
  rawValue,
  dateDisplayFormat,
}: {
  mode: EditableTextParamDateTimeMode;
  rawValue: string;
  dateDisplayFormat: DateDisplayFormat;
}): EditableDateTimeChangeResult {
  if (mode === "time") {
    return {
      nextCommittedValue: normalizeTimeTo24Hour(rawValue),
    };
  }
  if (mode === "datetime-local") {
    return {
      nextCommittedValue: normalizeDateTimeToLocalIso(rawValue),
    };
  }
  if (mode === "formatted-date") {
    const nextIso = normalizeDateToIso(rawValue, dateDisplayFormat);
    return {
      nextCommittedValue: nextIso === "" ? undefined : nextIso,
      nextLocalDateInputValue: rawValue,
    };
  }
  return {
    nextCommittedValue: normalizeDateToIso(rawValue, dateDisplayFormat),
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
}): FormattedDateBlurResult {
  const nextIso = normalizeDateToIso(localDateInputValue, dateDisplayFormat);
  const fallbackIso = normalizeDateToIso(committedValue, dateDisplayFormat);
  const resolvedIso = nextIso !== "" ? nextIso : fallbackIso;
  return {
    nextCommittedValue:
      nextIso !== "" && nextIso !== fallbackIso ? nextIso : undefined,
    nextLocalDateInputValue: formatDateForDisplay(
      resolvedIso,
      dateDisplayFormat,
    ),
  };
}

function EditableTextParamDateTimeInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  dateDisplayFormat,
  classes,
  view,
}: {
  value: string;
  onChange: ParamValueChange;
  onEscape?: () => void;
  isDisabled: boolean;
  dateDisplayFormat: DateDisplayFormat;
  classes: TextParamDateTimeClasses;
  view: EditableTextParamDateTimeView;
}) {
  const usesLocalDateInput = view.mode === "formatted-date";
  const [localDateInputValue, setLocalDateInputValue] = useState(() =>
    formatDateForDisplay(view.normalizedValue, dateDisplayFormat),
  );
  useEffect(() => {
    if (!usesLocalDateInput) {
      return;
    }
    setLocalDateInputValue(
      formatDateForDisplay(view.normalizedValue, dateDisplayFormat),
    );
  }, [dateDisplayFormat, usesLocalDateInput, view.normalizedValue]);
  const renderedInputValue = usesLocalDateInput
    ? localDateInputValue
    : view.normalizedValue;
  return (
    <>
      <div className={classes.wrapper}>
        <input
          type={view.inputType}
          className={classes.input}
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
          onKeyDown={(event) => {
            if (event.code === "Escape") {
              onEscape?.();
            }
          }}
          disabled={isDisabled}
        />
        <span className={classes.formatted}>{view.formattedValue}</span>
      </div>
      <span className={classes.border} />
    </>
  );
}

export function TextParamDateTimeInput(props: TextParamDateTimeInputProps) {
  const classes = resolveTextParamDateTimeClasses(props);
  const displayOptions = resolveTextParamDateTimeDisplayOptions(props);
  const view = resolveTextParamDateTimeView(props);
  if (view.kind === "display-only-time") {
    return (
      <>
        <div className={classes.wrapper}>
          <span
            className={`${classes.input} ${displayOptions.fontClassName} flex min-w-0 flex-1 items-center`}
            style={{
              fontSize: `${displayOptions.scale}em`,
              lineHeight: "1.1",
            }}
          >
            {view.displayedTimeValue}
          </span>
        </div>
        {displayOptions.transparent ? null : (
          <span className={classes.border} />
        )}
      </>
    );
  }
  if (view.kind === "calendar") {
    return (
      <>
        <div className={`${classes.wrapper} flex-col items-stretch gap-2`}>
          <DateCalendarInput
            value={props.value}
            onChange={props.onChange}
            onEscape={props.onEscape}
            isDisabled={props.isDisabled}
            selectionMode={view.selectionMode}
            weekStart={props.dateCalendarWeekStart}
            includeTime={props.dateIncludesTime}
            dateDisplayFormat={props.dateDisplayFormat}
            timeDisplayFormat={props.timeDisplayFormat}
            summaryClassName={classes.formatted}
          />
        </div>
        <span className={classes.border} />
      </>
    );
  }
  return (
    <EditableTextParamDateTimeInput
      value={props.value}
      onChange={props.onChange}
      onEscape={props.onEscape}
      isDisabled={props.isDisabled}
      dateDisplayFormat={props.dateDisplayFormat}
      classes={classes}
      view={view}
    />
  );
}
