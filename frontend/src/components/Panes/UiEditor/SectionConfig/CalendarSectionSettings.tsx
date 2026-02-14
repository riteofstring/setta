import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_calendar_section_settings } from "utils/generatedEndpoints";
import {
  CalendarWeekStart,
  CalendarWeekStartEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

const WEEK_START_OPTIONS: Array<{ value: CalendarWeekStart; label: string }> = [
  { value: CalendarWeekStartEnum.sunday, label: "Sunday" },
  { value: CalendarWeekStartEnum.monday, label: "Monday" },
];

export function CalendarSectionSettings({ sectionId }: { sectionId: string }) {
  const { canEditLayout } = useShareCapabilities();
  const { selectedDateIso, weekStartsOn, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Calendar,
    );
    return {
      selectedDateIso: impl.selectedDateIso,
      weekStartsOn: impl.weekStartsOn,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  const isDisabled = isFrozen || !canEditLayout;

  function persist(next: {
    selectedDateIso: string;
    weekStartsOn: CalendarWeekStart;
  }) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"CalendarSection">(state, sectionId, {
          selectedDateIso: next.selectedDateIso,
          weekStartsOn: next.weekStartsOn,
        });
      },
      send: (frontendOpId) =>
        route_set_calendar_section_settings({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          selectedDateIso: next.selectedDateIso,
          weekStartsOn: next.weekStartsOn,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 p-2 dark:border-setta-700/70">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Calendar
      </p>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Control selected date and first day of week.
      </p>

      <label className="text-xs text-setta-600 dark:text-setta-300">
        Selected date
        <input
          type="date"
          value={selectedDateIso}
          onChange={(event) =>
            persist({
              selectedDateIso: event.target.value,
              weekStartsOn,
            })
          }
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
      </label>

      <label className="text-xs text-setta-600 dark:text-setta-300">
        Week starts on
        <select
          value={weekStartsOn}
          onChange={(event) =>
            persist({
              selectedDateIso,
              weekStartsOn: event.target.value as CalendarWeekStart,
            })
          }
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        >
          {WEEK_START_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
