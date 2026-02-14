import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_clock_section_settings } from "utils/generatedEndpoints";
import {
  DateDisplayFormat,
  DateDisplayFormatEnum,
  SectionTypeEnum,
  TimeDisplayFormat,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";

const TIME_FORMAT_OPTIONS: Array<{ value: TimeDisplayFormat; label: string }> = [
  { value: TimeDisplayFormatEnum.twenty_four_hour, label: "24-hour" },
  { value: TimeDisplayFormatEnum.twelve_hour, label: "12-hour" },
];

const DATE_FORMAT_OPTIONS: Array<{ value: DateDisplayFormat; label: string }> = [
  { value: DateDisplayFormatEnum.iso, label: "ISO" },
  { value: DateDisplayFormatEnum.us, label: "US" },
  { value: DateDisplayFormatEnum.eu, label: "EU" },
  { value: DateDisplayFormatEnum.long, label: "Long" },
];

export function ClockSectionSettings({ sectionId }: { sectionId: string }) {
  const { canEditLayout } = useShareCapabilities();
  const {
    timeDisplayFormat,
    dateDisplayFormat,
    showSeconds,
    showDate,
    timezone,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Clock,
    );
    return {
      timeDisplayFormat: impl.timeDisplayFormat,
      dateDisplayFormat: impl.dateDisplayFormat,
      showSeconds: impl.showSeconds,
      showDate: impl.showDate,
      timezone: impl.timezone,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  const isDisabled = isFrozen || !canEditLayout;
  const [timezoneDraft, setTimezoneDraft] = useState(timezone);

  useEffect(() => {
    setTimezoneDraft(timezone);
  }, [timezone]);

  const currentSettings = useMemo(
    () => ({
      timeDisplayFormat,
      dateDisplayFormat,
      showSeconds,
      showDate,
      timezone,
    }),
    [timeDisplayFormat, dateDisplayFormat, showSeconds, showDate, timezone],
  );

  function persistSettings(next: {
    timeDisplayFormat: TimeDisplayFormat;
    dateDisplayFormat: DateDisplayFormat;
    showSeconds: boolean;
    showDate: boolean;
    timezone: string;
  }) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ClockSection">(state, sectionId, {
          timeDisplayFormat: next.timeDisplayFormat,
          dateDisplayFormat: next.dateDisplayFormat,
          showSeconds: next.showSeconds,
          showDate: next.showDate,
          timezone: next.timezone,
        });
      },
      send: (frontendOpId) =>
        route_set_clock_section_settings({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          timeDisplayFormat: next.timeDisplayFormat,
          dateDisplayFormat: next.dateDisplayFormat,
          showSeconds: next.showSeconds,
          showDate: next.showDate,
          timezone: next.timezone,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 p-2 dark:border-setta-700/70">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">Clock</p>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Configure display format and timezone for this section.
      </p>

      <label className="text-xs text-setta-600 dark:text-setta-300">
        Time format
        <select
          value={timeDisplayFormat}
          onChange={(event) =>
            persistSettings({
              ...currentSettings,
              timeDisplayFormat: event.target.value as TimeDisplayFormat,
            })
          }
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        >
          {TIME_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-setta-600 dark:text-setta-300">
        Date format
        <select
          value={dateDisplayFormat}
          onChange={(event) =>
            persistSettings({
              ...currentSettings,
              dateDisplayFormat: event.target.value as DateDisplayFormat,
            })
          }
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        >
          {DATE_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
        <input
          type="checkbox"
          checked={showSeconds}
          onChange={(event) =>
            persistSettings({
              ...currentSettings,
              showSeconds: event.target.checked,
            })
          }
          disabled={isDisabled}
        />
        Show seconds
      </label>

      <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
        <input
          type="checkbox"
          checked={showDate}
          onChange={(event) =>
            persistSettings({
              ...currentSettings,
              showDate: event.target.checked,
            })
          }
          disabled={isDisabled}
        />
        Show date
      </label>

      <label className="text-xs text-setta-600 dark:text-setta-300">
        Timezone (`local` or IANA name)
        <input
          value={timezoneDraft}
          onChange={(event) => setTimezoneDraft(event.target.value)}
          onBlur={() => {
            const trimmed = timezoneDraft.trim();
            if (trimmed !== timezone) {
              persistSettings({
                ...currentSettings,
                timezone: trimmed,
              });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const trimmed = timezoneDraft.trim();
              if (trimmed !== timezone) {
                persistSettings({
                  ...currentSettings,
                  timezone: trimmed,
                });
              }
            }
          }}
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
      </label>
    </div>
  );
}
