import _ from "lodash";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IoCopyOutline, IoTrashOutline } from "react-icons/io5";
import {
  clearBackendLogEvents,
  markBackendLogEventsHighSeverityAsRead,
  resetBackendLogEventsFilter,
  setBackendLogEventsFilter,
} from "state/actions/backendLogEvents";
import { useAllProjectMetadata, useBackendLogEvents } from "state/definitions";
import { SettaBackendLogEvent } from "utils/generatedTypes";

type BackendLogSeverity = SettaBackendLogEvent["severity"];

export type BackendLogColumnWidths = {
  timestamp: number;
  severity: number;
  project: number;
};

export type BackendLogColumnWidthName = keyof BackendLogColumnWidths;

const SEVERITY_ORDER: Record<BackendLogSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

const BACKEND_LOG_COPY_COLUMN_WIDTH_PX = 56;
const BACKEND_LOG_MESSAGE_COLUMN_MIN_WIDTH_PX = 220;
const BACKEND_LOG_COPY_FEEDBACK_MS = 1300;

export const BACKEND_LOG_DEFAULT_COLUMN_WIDTHS: BackendLogColumnWidths = {
  timestamp: 72,
  severity: 74,
  project: 176,
};

const BACKEND_LOG_COLUMN_WIDTH_BOUNDS: Record<
  BackendLogColumnWidthName,
  { min: number; max: number }
> = {
  timestamp: { min: 64, max: 160 },
  severity: { min: 64, max: 170 },
  project: { min: 120, max: 380 },
};

function isBackendLogSeverity(value: string): value is BackendLogSeverity {
  return Object.hasOwn(SEVERITY_ORDER, value);
}

export function clampBackendLogColumnWidth(
  column: BackendLogColumnWidthName,
  width: number,
): number {
  const bounds = BACKEND_LOG_COLUMN_WIDTH_BOUNDS[column];
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(width)));
}

export function applyBackendLogColumnResize(
  initialWidths: BackendLogColumnWidths,
  column: BackendLogColumnWidthName,
  deltaX: number,
): BackendLogColumnWidths {
  return {
    ...initialWidths,
    [column]: clampBackendLogColumnWidth(
      column,
      initialWidths[column] + deltaX,
    ),
  };
}

export function buildBackendLogGridTemplateColumns(
  columnWidths: BackendLogColumnWidths,
): string {
  return `${columnWidths.timestamp}px ${columnWidths.severity}px ${columnWidths.project}px minmax(${BACKEND_LOG_MESSAGE_COLUMN_MIN_WIDTH_PX}px, 1fr) ${BACKEND_LOG_COPY_COLUMN_WIDTH_PX}px`;
}

export async function copyBackendLogMessage(
  writeText: (value: string) => Promise<void>,
  message: string,
): Promise<boolean> {
  return writeText(message).then(
    () => true,
    () => false,
  );
}

type CopyFeedback = {
  eventId: string;
  status: "copied" | "failed";
};

export function BackendLogEventsArea() {
  const { events, filter } = useBackendLogEvents(
    (state) => ({ events: state.events, filter: state.filter }),
    _.isEqual,
  );
  const [columnWidths, setColumnWidths] = useState<BackendLogColumnWidths>(
    BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  );
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

  useEffect(() => {
    markBackendLogEventsHighSeverityAsRead();
  }, []);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCopyFeedback((current) =>
        current &&
        current.eventId === copyFeedback.eventId &&
        current.status === copyFeedback.status
          ? null
          : current,
      );
    }, BACKEND_LOG_COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  const projectMetadata = useAllProjectMetadata(
    (state) => state.projectMetadata,
    _.isEqual,
  );
  const projectNameById = useMemo(
    () => Object.fromEntries(projectMetadata.map((m) => [m.id, m.name])),
    [projectMetadata],
  );

  const filteredEvents = useMemo(
    () => filterEvents(events, filter),
    [events, filter],
  );

  const gridTemplateColumns = useMemo(
    () => buildBackendLogGridTemplateColumns(columnWidths),
    [columnWidths],
  );

  function beginColumnResizeDrag(
    column: BackendLogColumnWidthName,
    event: MouseEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const initialWidths = columnWidths;

    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextWidth = applyBackendLogColumnResize(
        initialWidths,
        column,
        deltaX,
      )[column];
      setColumnWidths((current) =>
        current[column] === nextWidth
          ? current
          : { ...current, [column]: nextWidth },
      );
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function handleCopyMessage(eventId: string, message: string) {
    void copyBackendLogMessage(
      (value) => navigator.clipboard.writeText(value),
      message,
    ).then((didCopy) => {
      setCopyFeedback({
        eventId,
        status: didCopy ? "copied" : "failed",
      });
    });
  }

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

        <button
          type="button"
          className="rounded border border-setta-200 px-2 py-1 text-xs font-medium text-setta-600 hover:bg-white hover:text-setta-900 dark:border-setta-850 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
          onClick={() => resetBackendLogEventsFilter()}
        >
          Reset filters
        </button>

        <div className="ml-auto text-xs text-setta-400 dark:text-setta-500">
          {filteredEvents.length} / {events.length} events
        </div>
      </div>

      <Filters
        filter={filter}
        projectMetadata={projectMetadata}
        onUpdate={(patch) => setBackendLogEventsFilter(patch)}
      />

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-setta-200 bg-white font-mono text-[11px] leading-4 text-setta-900 dark:border-setta-850 dark:bg-setta-900 dark:text-setta-100">
        {filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-setta-400 dark:text-setta-500">
            No matching backend log events
          </div>
        ) : (
          <LogLines
            events={filteredEvents}
            projectNameById={projectNameById}
            gridTemplateColumns={gridTemplateColumns}
            copyFeedback={copyFeedback}
            onResizeColumn={beginColumnResizeDrag}
            onCopyMessage={handleCopyMessage}
          />
        )}
      </div>
    </div>
  );
}

function Filters({
  filter,
  projectMetadata,
  onUpdate,
}: {
  filter: {
    projectConfigId: string | null;
    minSeverity: BackendLogSeverity;
    query: string;
  };
  projectMetadata: Array<{ id: string; name: string }>;
  onUpdate: (patch: {
    projectConfigId?: string | null;
    minSeverity?: BackendLogSeverity;
    query?: string;
  }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 dark:border-setta-850 dark:bg-setta-900 dark:text-setta-200">
      <label className="flex items-center gap-2">
        <span className="text-setta-400 dark:text-setta-500">Project</span>
        <select
          className="rounded border border-setta-200 bg-white px-2 py-1 text-xs dark:border-setta-850 dark:bg-setta-900"
          value={filter.projectConfigId ?? ""}
          onChange={(e) =>
            onUpdate({ projectConfigId: e.target.value || null })
          }
        >
          <option value="">All</option>
          {projectMetadata.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="text-setta-400 dark:text-setta-500">Min severity</span>
        <select
          className="rounded border border-setta-200 bg-white px-2 py-1 text-xs dark:border-setta-850 dark:bg-setta-900"
          value={filter.minSeverity}
          onChange={(e) => {
            const value = e.target.value;
            if (isBackendLogSeverity(value)) {
              onUpdate({ minSeverity: value });
            }
          }}
        >
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
          <option value="critical">critical</option>
        </select>
      </label>

      <label className="flex flex-1 items-center gap-2">
        <span className="text-setta-400 dark:text-setta-500">Search</span>
        <input
          className="min-w-[180px] flex-1 rounded border border-setta-200 bg-white px-2 py-1 text-xs dark:border-setta-850 dark:bg-setta-900"
          value={filter.query}
          onChange={(e) => onUpdate({ query: e.target.value })}
          placeholder="Message contains…"
          type="text"
        />
      </label>
    </div>
  );
}

export function filterEvents(
  events: Array<SettaBackendLogEvent>,
  filter: {
    projectConfigId: string | null;
    minSeverity: BackendLogSeverity;
    query: string;
  },
): Array<SettaBackendLogEvent> {
  const query = filter.query.trim().toLowerCase();
  const minSeverityValue = SEVERITY_ORDER[filter.minSeverity];
  return events.filter((event) => {
    if (
      filter.projectConfigId &&
      event.projectConfigId !== filter.projectConfigId
    ) {
      return false;
    }
    if (SEVERITY_ORDER[event.severity] < minSeverityValue) {
      return false;
    }
    if (!query) {
      return true;
    }
    return event.message.toLowerCase().includes(query);
  });
}

function LogLines({
  events,
  projectNameById,
  gridTemplateColumns,
  copyFeedback,
  onResizeColumn,
  onCopyMessage,
}: {
  events: Array<SettaBackendLogEvent>;
  projectNameById: Record<string, string>;
  gridTemplateColumns: string;
  copyFeedback: CopyFeedback | null;
  onResizeColumn: (
    column: BackendLogColumnWidthName,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onCopyMessage: (eventId: string, message: string) => void;
}) {
  return (
    <div className="flex min-w-[640px] flex-col">
      <LogColumnHeader
        gridTemplateColumns={gridTemplateColumns}
        onResizeColumn={onResizeColumn}
      />
      {events.map((event) => (
        <LogLine
          key={event.id}
          event={event}
          projectNameById={projectNameById}
          gridTemplateColumns={gridTemplateColumns}
          copyStatus={
            copyFeedback?.eventId === event.id ? copyFeedback.status : null
          }
          onCopyMessage={onCopyMessage}
        />
      ))}
    </div>
  );
}

function LogColumnHeader({
  gridTemplateColumns,
  onResizeColumn,
}: {
  gridTemplateColumns: string;
  onResizeColumn: (
    column: BackendLogColumnWidthName,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
}) {
  return (
    <div
      data-testid="backend-log-columns-header"
      className="sticky top-0 z-10 grid items-center gap-2 border-b border-setta-200 bg-setta-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-setta-500 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-400"
      style={{ gridTemplateColumns }}
    >
      <LogColumnHeaderCell dataTestId="backend-log-col-header-time" label="Time">
        <LogColumnResizeHandle
          dataTestId="backend-log-resize-timestamp"
          label="Resize backend log time column"
          onMouseDown={(event) => onResizeColumn("timestamp", event)}
        />
      </LogColumnHeaderCell>

      <LogColumnHeaderCell
        dataTestId="backend-log-col-header-severity"
        label="Severity"
      >
        <LogColumnResizeHandle
          dataTestId="backend-log-resize-severity"
          label="Resize backend log severity column"
          onMouseDown={(event) => onResizeColumn("severity", event)}
        />
      </LogColumnHeaderCell>

      <LogColumnHeaderCell
        dataTestId="backend-log-col-header-project"
        label="Project"
      >
        <LogColumnResizeHandle
          dataTestId="backend-log-resize-project"
          label="Resize backend log project column"
          onMouseDown={(event) => onResizeColumn("project", event)}
        />
      </LogColumnHeaderCell>

      <div data-testid="backend-log-col-header-message" className="truncate">
        Message
      </div>
      <div
        data-testid="backend-log-col-header-copy"
        className="truncate text-right tracking-[0.08em]"
      >
        Copy
      </div>
    </div>
  );
}

function LogColumnHeaderCell({
  dataTestId,
  label,
  children,
}: {
  dataTestId: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={dataTestId} className="relative min-w-0 truncate pr-2">
      <span>{label}</span>
      {children}
    </div>
  );
}

function LogColumnResizeHandle({
  dataTestId,
  label,
  onMouseDown,
}: {
  dataTestId: string;
  label: string;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-testid={dataTestId}
      role="separator"
      aria-label={label}
      className="group/backend-log-col-resize absolute right-0 top-0 z-10 h-full w-4 translate-x-1/2 cursor-col-resize touch-none"
      onMouseDown={onMouseDown}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-300 group-hover/backend-log-col-resize:bg-blue-400 dark:bg-setta-700 dark:group-hover/backend-log-col-resize:bg-blue-400" />
    </div>
  );
}

function LogLine({
  event,
  projectNameById,
  gridTemplateColumns,
  copyStatus,
  onCopyMessage,
}: {
  event: SettaBackendLogEvent;
  projectNameById: Record<string, string>;
  gridTemplateColumns: string;
  copyStatus: "copied" | "failed" | null;
  onCopyMessage: (eventId: string, message: string) => void;
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
  const copyLabel =
    copyStatus === "copied"
      ? "Copied"
      : copyStatus === "failed"
        ? "Copy failed"
        : "Copy";
  const copyTextClassName =
    copyStatus === "failed"
      ? "text-red-600 dark:text-red-400"
      : "text-setta-500 dark:text-setta-400";

  return (
    <div
      data-testid="backend-log-row"
      className={`grid items-start gap-2 border-l-2 px-2 py-0.5 hover:bg-setta-50 dark:hover:bg-setta-800 ${severityBorderClassName}`}
      style={{ gridTemplateColumns }}
      title={isExpanded ? undefined : event.message}
    >
      <span className="truncate text-setta-400 dark:text-setta-500">{time}</span>
      <span className={`truncate ${severityClassName}`}>{event.severity}</span>
      <span
        className="truncate text-setta-500 dark:text-setta-400"
        title={projectConfigName}
      >
        {projectConfigName}
      </span>
      <div className="min-w-0">
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
      <button
        type="button"
        data-testid="backend-log-copy-message"
        className={`inline-flex items-center justify-end gap-1 rounded px-1 text-[10px] font-medium hover:bg-setta-100 hover:text-setta-900 dark:hover:bg-setta-700 dark:hover:text-setta-100 ${copyTextClassName}`}
        onClick={() => onCopyMessage(event.id, event.message)}
      >
        <IoCopyOutline size={11} />
        <span>{copyLabel}</span>
      </button>
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
