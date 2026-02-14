import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
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
import {
  buildCalendarMonthGrid,
  getTodayIsoDate,
  parseIsoDate,
  resolveCalendarAnchorDate,
  shiftCalendarMonth,
  type CalendarMonthAnchor,
} from "utils/calendarGrid";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const WEEKDAY_LABELS = {
  [CalendarWeekStartEnum.sunday]: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  [CalendarWeekStartEnum.monday]: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
} as const satisfies Record<CalendarWeekStart, readonly string[]>;

function getMonthLabel(anchor: CalendarMonthAnchor): string {
  const date = new Date(Date.UTC(anchor.year, anchor.monthIndex, 1));
  return MONTH_LABEL_FORMATTER.format(date);
}

export function CalendarArea({ sectionId }: { sectionId: string }) {
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

  const [monthAnchor, setMonthAnchor] = useState<CalendarMonthAnchor>(() =>
    resolveCalendarAnchorDate(selectedDateIso),
  );

  useEffect(() => {
    setMonthAnchor(resolveCalendarAnchorDate(selectedDateIso));
  }, [selectedDateIso]);

  const persistCalendarState = useCallback(
    (nextSelectedDateIso: string, nextWeekStart: CalendarWeekStart) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"CalendarSection">(state, sectionId, {
            selectedDateIso: nextSelectedDateIso,
            weekStartsOn: nextWeekStart,
          });
        },
        send: (frontendOpId) =>
          route_set_calendar_section_settings({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            selectedDateIso: nextSelectedDateIso,
            weekStartsOn: nextWeekStart,
            frontendOpId,
          }),
      });
    },
    [sectionId],
  );

  const selectedDate = parseIsoDate(selectedDateIso);
  const selectedIso = selectedDate
    ? `${selectedDate.year}-${String(selectedDate.monthIndex + 1).padStart(2, "0")}-${String(
        selectedDate.day,
      ).padStart(2, "0")}`
    : null;

  const monthCells = useMemo(
    () =>
      buildCalendarMonthGrid({
        year: monthAnchor.year,
        monthIndex: monthAnchor.monthIndex,
        weekStartsOn,
      }),
    [monthAnchor, weekStartsOn],
  );

  const onSelectDate = useCallback(
    (isoDate: string) => {
      if (isDisabled) {
        return;
      }
      persistCalendarState(isoDate, weekStartsOn);
    },
    [isDisabled, persistCalendarState, weekStartsOn],
  );

  return (
    <div className="section-main section-main-full-w mx-1 mb-2 mt-1 flex min-w-[280px] flex-col gap-3 rounded-lg border border-setta-200/70 bg-white/70 p-3 dark:border-setta-800/70 dark:bg-setta-950/40">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-800 disabled:opacity-50 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          aria-label="Previous month"
          onClick={() => setMonthAnchor((prev) => shiftCalendarMonth(prev, -1))}
        >
          <FiChevronLeft size={16} />
        </button>
        <div className="text-sm font-semibold text-setta-800 dark:text-setta-100">
          {getMonthLabel(monthAnchor)}
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-800 disabled:opacity-50 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          aria-label="Next month"
          onClick={() => setMonthAnchor((prev) => shiftCalendarMonth(prev, 1))}
        >
          <FiChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-setta-500 dark:text-setta-400">
        {WEEKDAY_LABELS[weekStartsOn].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((cell) => {
          const isSelected = selectedIso === cell.isoDate;
          return (
            <button
              key={cell.isoDate}
              type="button"
              data-calendar-date={cell.isoDate}
              className={`h-9 rounded-md border text-xs transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-500 text-white"
                  : cell.inCurrentMonth
                    ? "border-setta-200 text-setta-700 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
                    : "border-setta-100 text-setta-400 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-900"
              }`}
              onClick={() => onSelectDate(cell.isoDate)}
              disabled={isDisabled}
            >
              {cell.dayOfMonth}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-setta-500 dark:text-setta-400">
        <span>{selectedIso ? `Selected: ${selectedIso}` : "No date selected"}</span>
        <button
          type="button"
          className="rounded-md px-2 py-1 font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
          onClick={() => onSelectDate(getTodayIsoDate())}
          disabled={isDisabled}
        >
          Today
        </button>
      </div>
    </div>
  );
}
