import _ from "lodash";
import { useState } from "react";
import { IoTrashOutline } from "react-icons/io5";
import { clearBackendLogEvents } from "state/actions/backendLogEvents";
import { useAllProjectMetadata, useBackendLogEvents } from "state/definitions";
import { SettaBackendLogEvent } from "utils/generatedTypes";

type BackendLogSeverity = SettaBackendLogEvent["severity"];

export function BackendLogEventsArea() {
  const events = useBackendLogEvents((state) => state.events, _.isEqual);
  const projectNameById = useAllProjectMetadata(
    (state) =>
      Object.fromEntries(state.projectMetadata.map((m) => [m.id, m.name])),
    _.isEqual,
  );

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
          <LogLines events={events} projectNameById={projectNameById} />
        )}
      </div>
    </div>
  );
}

function LogLines({
  events,
  projectNameById,
}: {
  events: Array<SettaBackendLogEvent>;
  projectNameById: Record<string, string>;
}) {
  return (
    <div className="flex w-full flex-col">
      {events.map((event) => (
        <LogLine
          key={event.id}
          event={event}
          projectNameById={projectNameById}
        />
      ))}
    </div>
  );
}

function LogLine({
  event,
  projectNameById,
}: {
  event: SettaBackendLogEvent;
  projectNameById: Record<string, string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const time = formatLogTimestamp(event.timestamp);
  const severityClassName = getSeverityTextClassName(event.severity);
  const severityBorderClassName = getSeverityBorderClassName(event.severity);
  const projectConfigName = formatProjectConfigName(
    event.projectConfigId,
    projectNameById,
  );
  const singleLineMessage = formatSingleLineMessage(event.message);

  return (
    <div
      className={`flex items-start gap-2 border-l-2 px-2 py-0.5 hover:bg-setta-50 dark:hover:bg-setta-800 ${severityBorderClassName}`}
      title={isExpanded ? undefined : event.message}
    >
      <span className="w-[64px] shrink-0 text-setta-400 dark:text-setta-500">
        {time}
      </span>
      <span className={`w-[56px] shrink-0 ${severityClassName}`}>
        {event.severity}
      </span>
      <span
        className="w-[160px] shrink-0 truncate text-setta-500 dark:text-setta-400"
        title={projectConfigName}
      >
        {projectConfigName}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={`min-w-0 flex-1 ${
              isExpanded ? "whitespace-pre-wrap break-words" : "truncate"
            }`}
          >
            {isExpanded ? event.message : singleLineMessage}
          </span>
          <button
            type="button"
            className="shrink-0 text-[10px] font-medium text-setta-400 hover:text-setta-900 dark:text-setta-500 dark:hover:text-setta-100"
            onClick={() => setIsExpanded((x) => !x)}
          >
            {isExpanded ? "Less" : "More"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatProjectConfigName(
  projectConfigId: string | null,
  projectNameById: Record<string, string>,
): string {
  if (!projectConfigId) {
    return "-";
  }
  return projectNameById[projectConfigId] ?? "(unknown project)";
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
