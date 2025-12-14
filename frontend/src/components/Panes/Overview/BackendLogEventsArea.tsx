import _ from "lodash";
import { IoTrashOutline } from "react-icons/io5";
import { clearBackendLogEvents } from "state/actions/backendLogEvents";
import { useBackendLogEvents } from "state/definitions";
import { SettaBackendLogEvent } from "utils/generatedTypes";

type BackendLogSeverity = SettaBackendLogEvent["severity"];

export function BackendLogEventsArea() {
  const events = useBackendLogEvents((state) => state.events, _.isEqual);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-setta-200 px-2 py-1 text-xs font-medium text-setta-600 hover:bg-white hover:text-setta-900 dark:border-setta-850 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          onClick={() => clearBackendLogEvents()}
        >
          <IoTrashOutline size={14} />
          Clear
        </button>
        <div className="ml-auto text-xs text-setta-400 dark:text-setta-500">
          {events.length} events
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-setta-200 bg-white font-mono text-[11px] leading-4 text-setta-900 dark:border-setta-850 dark:bg-setta-900 dark:text-setta-100">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-setta-400 dark:text-setta-500">
            No backend log events yet
          </div>
        ) : (
          <LogLines events={events} />
        )}
      </div>
    </div>
  );
}

function LogLines({ events }: { events: Array<SettaBackendLogEvent> }) {
  return (
    <div className="flex w-full flex-col">
      {events.map((event) => (
        <LogLine key={event.id} event={event} />
      ))}
    </div>
  );
}

function LogLine({ event }: { event: SettaBackendLogEvent }) {
  const time = formatLogTimestamp(event.timestamp);
  const severityClassName = getSeverityTextClassName(event.severity);
  const severityBorderClassName = getSeverityBorderClassName(event.severity);
  const projectToken = formatProjectToken(event.projectConfigId);
  const singleLineMessage = formatSingleLineMessage(event.message);

  return (
    <div
      className={`flex items-baseline gap-2 border-l-2 px-2 py-0.5 hover:bg-setta-50 dark:hover:bg-setta-800 ${severityBorderClassName}`}
      title={event.message}
    >
      <span className="w-[64px] shrink-0 text-setta-400 dark:text-setta-500">
        {time}
      </span>
      <span className={`w-[56px] shrink-0 ${severityClassName}`}>
        {event.severity}
      </span>
      <span className="w-[86px] shrink-0 text-setta-500 dark:text-setta-400">
        {projectToken}
      </span>
      <span className="min-w-0 flex-1 truncate">{singleLineMessage}</span>
    </div>
  );
}

function formatProjectToken(projectConfigId: string | null): string {
  if (!projectConfigId) {
    return "-";
  }
  return projectConfigId.slice(0, 8);
}

function formatLogTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatSingleLineMessage(message: string): string {
  return message.replaceAll("\n", " ⏎ ");
}

function getSeverityTextClassName(severity: BackendLogSeverity): string {
  switch (severity) {
    case "critical":
      return "text-red-700 dark:text-red-400";
    case "error":
      return "text-red-600 dark:text-red-400";
    case "warning":
      return "text-yellow-700 dark:text-yellow-400";
    case "info":
      return "text-setta-600 dark:text-setta-300";
    default:
      return severity satisfies never;
  }
}

function getSeverityBorderClassName(severity: BackendLogSeverity): string {
  switch (severity) {
    case "critical":
      return "border-red-600 dark:border-red-500";
    case "error":
      return "border-red-500 dark:border-red-500";
    case "warning":
      return "border-yellow-500 dark:border-yellow-500";
    case "info":
      return "border-setta-200 dark:border-setta-800";
    default:
      return severity satisfies never;
  }
}
