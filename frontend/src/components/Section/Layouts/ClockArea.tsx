import _ from "lodash";
import { useMemo, useState, useEffect } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  DateDisplayFormatEnum,
  SectionTypeEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { formatDateForDisplay } from "utils/textParamDateTime";

type IntlWithSupportedValues = Intl.DateTimeFormatConstructor & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

function resolveTimezone(timezone: string): {
  timeZone: string | undefined;
  invalidTimezone: string | null;
} {
  const trimmed = timezone.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "local") {
    return { timeZone: undefined, invalidTimezone: null };
  }
  const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
  if (!supportedValuesOf) {
    return { timeZone: undefined, invalidTimezone: trimmed };
  }
  const supported = new Set(supportedValuesOf("timeZone"));
  if (!supported.has(trimmed)) {
    return { timeZone: undefined, invalidTimezone: trimmed };
  }
  return { timeZone: trimmed, invalidTimezone: null };
}

function getIsoDateForNow(now: Date, timeZone: string | undefined): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function ClockArea({ sectionId }: { sectionId: string }) {
  const { timeDisplayFormat, dateDisplayFormat, showSeconds, showDate, timezone } =
    useProjectState((state) => {
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
      };
    }, _.isEqual);

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalMs = showSeconds ? 1000 : 30_000;
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [showSeconds]);

  const { timeZone, invalidTimezone } = useMemo(
    () => resolveTimezone(timezone),
    [timezone],
  );

  const timeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: showSeconds ? "2-digit" : undefined,
      hour12: timeDisplayFormat === TimeDisplayFormatEnum.twelve_hour,
      timeZone,
    });
    return formatter.format(now);
  }, [now, showSeconds, timeDisplayFormat, timeZone]);

  const dateLabel = useMemo(() => {
    if (!showDate) {
      return null;
    }
    const isoDate = getIsoDateForNow(now, timeZone);
    const displayFormat =
      dateDisplayFormat === DateDisplayFormatEnum.long
        ? DateDisplayFormatEnum.long
        : dateDisplayFormat;
    return formatDateForDisplay(isoDate, displayFormat);
  }, [now, showDate, dateDisplayFormat, timeZone]);

  return (
    <div className="section-main section-main-full-w mx-1 mb-2 mt-1 flex min-h-[120px] min-w-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-setta-200/70 bg-white/70 px-4 py-3 dark:border-setta-800/70 dark:bg-setta-950/40">
      <p className="font-mono text-3xl font-semibold tracking-wide text-setta-800 dark:text-setta-100">
        {timeLabel}
      </p>
      {dateLabel ? (
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400">
          {dateLabel}
        </p>
      ) : null}
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        {timeZone ?? "Local Time"}
      </p>
      {invalidTimezone ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-300">
          Unknown timezone `{invalidTimezone}`. Showing local time.
        </p>
      ) : null}
    </div>
  );
}
