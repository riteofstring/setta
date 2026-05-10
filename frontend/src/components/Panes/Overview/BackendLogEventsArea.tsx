import _ from "lodash";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IoCheckmark, IoCopyOutline, IoTrashOutline } from "react-icons/io5";
import { List } from "react-window";
import {
  clearBackendLogEvents,
  markBackendLogEventsHighSeverityAsRead,
  resetBackendLogEventsFilter,
  setBackendLogEventsFilter,
} from "state/actions/backendLogEvents";
import { useAllProjectMetadata, useBackendLogEvents } from "state/definitions";
import { type BackendLogEvent } from "utils/generatedTypes";
import {
  addBackendLogResizeListeners,
  BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  type BackendLogColumnWidthName,
  type BackendLogColumnWidths,
  type BackendLogCopyStatus,
  type BackendLogSeverity,
  buildBackendLogGridTemplateColumns,
  copyBackendLogMessage,
  filterEvents,
  getBackendLogCopyButtonPresentation,
  getBackendLogEventById,
  getBackendLogEventsById,
  getBackendLogGridMinWidth,
  getBackendLogListRenderWidth,
  getBackendLogResizedColumnWidth,
  isBackendLogSeverity,
  removeBackendLogResizeListeners,
} from "./BackendLogEventsArea.utils";

const BACKEND_LOG_COPY_FEEDBACK_MS = 1300;
const BACKEND_LOG_ROW_HEIGHT_PX = 26;
const BACKEND_LOG_MIN_GRID_WIDTH_PX = 640;

type BackendLogResizeHandlers = {
  mouseMove: (event: globalThis.MouseEvent) => void;
  mouseUp: (event: globalThis.MouseEvent) => void;
};

type CopyFeedback = {
  eventId: string;
  status: BackendLogCopyStatus;
};

const BACKEND_LOG_COPY_STATUS_ICON = {
  copy: IoCopyOutline,
  checkmark: IoCheckmark,
} as const;

export function BackendLogEventsArea() {
  const { events, filter } = useBackendLogEvents(
    (state) => ({ events: state.events, filter: state.filter }),
    _.isEqual,
  );
  const [columnWidths, setColumnWidths] = useState<BackendLogColumnWidths>(
    BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  );
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const columnWidthRef = useRef(columnWidths);
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const activeResizeHandlersRef = useRef<BackendLogResizeHandlers | null>(null);

  const clearActiveColumnResizeListeners = useCallback(() => {
    removeBackendLogResizeListeners(activeResizeHandlersRef.current);
    activeResizeHandlersRef.current = null;
    if (resizeAnimationFrameRef.current !== null) {
      cancelAnimationFrame(resizeAnimationFrameRef.current);
      resizeAnimationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    columnWidthRef.current = columnWidths;
  }, [columnWidths]);

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

  useEffect(() => {
    return () => {
      clearActiveColumnResizeListeners();
    };
  }, [clearActiveColumnResizeListeners]);

  const projectMetadata = useAllProjectMetadata(
    (state) => state.projectMetadata ?? [],
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
  const filteredEventsById = useMemo(
    () => getBackendLogEventsById(filteredEvents),
    [filteredEvents],
  );
  const selectedEvent = useMemo(
    () => getBackendLogEventById(filteredEventsById, selectedEventId),
    [filteredEventsById, selectedEventId],
  );

  const gridTemplateColumns = useMemo(
    () => buildBackendLogGridTemplateColumns(columnWidths),
    [columnWidths],
  );
  const gridMinWidth = useMemo(
    () => getBackendLogGridMinWidth(columnWidths),
    [columnWidths],
  );

  const beginColumnResizeDrag = useCallback(
    (column: BackendLogColumnWidthName, event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearActiveColumnResizeListeners();
      const startX = event.clientX;
      const initialWidths = columnWidthRef.current;
      let latestClientX = startX;

      const applyResizeForClientX = (clientX: number) => {
        const deltaX = clientX - startX;
        const nextWidth = getBackendLogResizedColumnWidth(
          initialWidths,
          column,
          deltaX,
        );
        setColumnWidths((current) =>
          current[column] === nextWidth
            ? current
            : { ...current, [column]: nextWidth },
        );
      };

      const handleMove = (moveEvent: globalThis.MouseEvent) => {
        latestClientX = moveEvent.clientX;
        if (resizeAnimationFrameRef.current !== null) {
          return;
        }
        resizeAnimationFrameRef.current = requestAnimationFrame(() => {
          applyResizeForClientX(latestClientX);
          resizeAnimationFrameRef.current = null;
        });
      };

      const handleUp = (upEvent: globalThis.MouseEvent) => {
        clearActiveColumnResizeListeners();
        applyResizeForClientX(upEvent.clientX);
      };

      activeResizeHandlersRef.current = {
        mouseMove: handleMove,
        mouseUp: handleUp,
      };
      addBackendLogResizeListeners(activeResizeHandlersRef.current);
    },
    [clearActiveColumnResizeListeners],
  );

  const handleCopyMessage = useCallback((eventId: string, message: string) => {
    const clipboard = navigator.clipboard;
    const writeText = clipboard?.writeText;
    if (!clipboard || !writeText) {
      setCopyFeedback({
        eventId,
        status: "failed",
      });
      return;
    }
    void copyBackendLogMessage(
      (value) => writeText.call(clipboard, value),
      message,
    ).then((didCopy) => {
      setCopyFeedback({
        eventId,
        status: didCopy ? "copied" : "failed",
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }
    if (filteredEventsById.has(selectedEventId)) {
      return;
    }
    setSelectedEventId(null);
  }, [filteredEventsById, selectedEventId]);

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

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-setta-200 bg-white font-mono text-[11px] leading-4 text-setta-900 dark:border-setta-850 dark:bg-setta-900 dark:text-setta-100">
        {filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-setta-400 dark:text-setta-500">
            No matching backend log events
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {selectedEvent ? (
              <SelectedLogMessagePanel
                event={selectedEvent}
                projectName={formatProjectConfigName(
                  selectedEvent.projectConfigId,
                  projectNameById,
                )}
                copyFeedback={copyFeedback}
                onCopyMessage={handleCopyMessage}
                onClose={() => setSelectedEventId(null)}
              />
            ) : null}
            <LogLines
              events={filteredEvents}
              projectNameById={projectNameById}
              gridTemplateColumns={gridTemplateColumns}
              gridMinWidth={gridMinWidth}
              copyFeedback={copyFeedback}
              selectedEventId={selectedEventId}
              onResizeColumn={beginColumnResizeDrag}
              onCopyMessage={handleCopyMessage}
              onSelectEvent={setSelectedEventId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedLogMessagePanel({
  event,
  projectName,
  copyFeedback,
  onCopyMessage,
  onClose,
}: {
  event: BackendLogEvent;
  projectName: string;
  copyFeedback: CopyFeedback | null;
  onCopyMessage: (eventId: string, message: string) => void;
  onClose: () => void;
}) {
  const copyStatus =
    copyFeedback?.eventId === event.id ? copyFeedback.status : null;
  let copyStatusTitle = "Copy full message";
  let copyButtonClassName = "text-setta-700 dark:text-setta-200";
  if (copyStatus === "failed") {
    copyStatusTitle = "Copy failed";
    copyButtonClassName = "text-red-600 dark:text-red-400";
  } else if (copyStatus === "copied") {
    copyStatusTitle = "Copied";
    copyButtonClassName = "text-blue-600 dark:text-blue-400";
  }

  return (
    <div
      data-testid="backend-log-selected-message-panel"
      className="border-b border-setta-200 px-2 py-1.5 text-[11px] dark:border-setta-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.12em] text-setta-500 dark:text-setta-400">
          {formatLogTimestamp(event.timestamp)} | {event.severity} |{" "}
          {projectName}
        </div>
        <button
          type="button"
          data-testid="backend-log-selected-copy-message"
          data-copy-status={copyStatus ?? "idle"}
          className={`inline-flex items-center rounded p-1 hover:bg-setta-100 hover:text-setta-950 dark:hover:bg-setta-700 dark:hover:text-setta-50 ${copyButtonClassName}`}
          onClick={() => onCopyMessage(event.id, event.message)}
          title={copyStatusTitle}
          aria-label={copyStatusTitle}
        >
          {copyStatus === "copied" ? (
            <IoCheckmark size={14} />
          ) : (
            <IoCopyOutline size={14} />
          )}
        </button>
        <button
          type="button"
          data-testid="backend-log-selected-message-close"
          className="rounded border border-setta-200 px-1.5 py-0.5 text-[10px] text-setta-600 hover:bg-setta-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <pre
        data-testid="backend-log-selected-message"
        className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-setta-50 p-1 text-[11px] leading-4 dark:bg-setta-950"
      >
        {event.message}
      </pre>
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

function LogLines({
  events,
  projectNameById,
  gridTemplateColumns,
  gridMinWidth,
  copyFeedback,
  selectedEventId,
  onResizeColumn,
  onCopyMessage,
  onSelectEvent,
}: {
  events: Array<BackendLogEvent>;
  projectNameById: Record<string, string>;
  gridTemplateColumns: string;
  gridMinWidth: number;
  copyFeedback: CopyFeedback | null;
  selectedEventId: string | null;
  onResizeColumn: (
    column: BackendLogColumnWidthName,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onCopyMessage: (eventId: string, message: string) => void;
  onSelectEvent: (eventId: string) => void;
}) {
  const scrollShellRef = useRef<HTMLDivElement | null>(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const [listHeight, setListHeight] = useState(BACKEND_LOG_ROW_HEIGHT_PX * 10);
  const [viewportWidth, setViewportWidth] = useState(
    BACKEND_LOG_MIN_GRID_WIDTH_PX,
  );

  useEffect(() => {
    const wrapper = listWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextHeight = Math.max(1, Math.floor(entry.contentRect.height));
      setListHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const scrollShell = scrollShellRef.current;
    if (!scrollShell) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextViewportWidth = Math.max(
        1,
        Math.floor(entry.contentRect.width),
      );
      setViewportWidth((currentViewportWidth) =>
        currentViewportWidth === nextViewportWidth
          ? currentViewportWidth
          : nextViewportWidth,
      );
    });
    observer.observe(scrollShell);
    return () => {
      observer.disconnect();
    };
  }, []);

  const resolvedListHeight = Math.max(1, listHeight);
  const listWidth = getBackendLogListRenderWidth(gridMinWidth, viewportWidth);

  return (
    <div
      ref={scrollShellRef}
      data-testid="backend-log-grid-scroll-shell"
      className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ minWidth: gridMinWidth }}
      >
        <LogColumnHeader
          gridTemplateColumns={gridTemplateColumns}
          onResizeColumn={onResizeColumn}
        />
        <div ref={listWrapperRef} className="min-h-0 flex-1">
          <List
            data-testid="backend-log-virtual-list"
            rowComponent={BackendLogRow}
            rowCount={events.length}
            rowHeight={BACKEND_LOG_ROW_HEIGHT_PX}
            overscanCount={8}
            className="nodrag"
            rowProps={{
              events,
              projectNameById,
              gridTemplateColumns,
              copyFeedback,
              onCopyMessage,
              selectedEventId,
              onSelectEvent,
            }}
            style={{
              height: resolvedListHeight,
              width: listWidth,
              overflowX: "hidden",
            }}
          />
        </div>
      </div>
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
      <LogColumnHeaderCell
        dataTestId="backend-log-col-header-time"
        label="Time"
      >
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

function BackendLogRow({
  index,
  style,
  events,
  projectNameById,
  gridTemplateColumns,
  copyFeedback,
  selectedEventId,
  onCopyMessage,
  onSelectEvent,
}: {
  index: number;
  style: CSSProperties;
  events: Array<BackendLogEvent>;
  projectNameById: Record<string, string>;
  gridTemplateColumns: string;
  copyFeedback: CopyFeedback | null;
  selectedEventId: string | null;
  onCopyMessage: (eventId: string, message: string) => void;
  onSelectEvent: (eventId: string) => void;
}) {
  const event = events[index];
  if (!event) {
    return null;
  }
  const isSelected = selectedEventId === event.id;
  const copyStatus =
    copyFeedback?.eventId === event.id ? copyFeedback.status : null;
  const time = formatLogTimestamp(event.timestamp);
  const severityClassName = getSeverityTextClassName(event.severity);
  const severityBorderClassName = getSeverityBorderClassName(event.severity);
  const projectConfigName = formatProjectConfigName(
    event.projectConfigId,
    projectNameById,
  );
  const singleLineMessage = formatSingleLineMessage(event.message);
  const copyButtonPresentation =
    getBackendLogCopyButtonPresentation(copyStatus);
  const CopyStatusIcon =
    BACKEND_LOG_COPY_STATUS_ICON[copyButtonPresentation.iconName];
  const showCopyButton = copyStatus !== null || isSelected;

  return (
    <div
      data-testid="backend-log-row"
      className={`group/backend-log-row grid cursor-pointer items-center gap-2 border-l-2 px-2 py-0.5 hover:bg-setta-50 dark:hover:bg-setta-800 ${severityBorderClassName} ${
        isSelected ? "bg-setta-50 dark:bg-setta-850" : ""
      }`}
      style={{ ...style, gridTemplateColumns }}
      title={event.message}
      onClick={() => onSelectEvent(event.id)}
    >
      <span className="truncate text-setta-400 dark:text-setta-500">
        {time}
      </span>
      <span className={`truncate ${severityClassName}`}>{event.severity}</span>
      <span
        className="truncate text-setta-500 dark:text-setta-400"
        title={projectConfigName}
      >
        {projectConfigName}
      </span>
      <div className="min-w-0 truncate">{singleLineMessage}</div>
      <button
        type="button"
        data-testid="backend-log-copy-message"
        data-copy-status={copyStatus ?? "idle"}
        className={`inline-flex items-center justify-end rounded p-1 opacity-0 transition-opacity duration-100 hover:bg-setta-100 hover:text-setta-950 focus-visible:opacity-100 group-hover/backend-log-row:opacity-100 dark:hover:bg-setta-700 dark:hover:text-setta-50 ${copyButtonPresentation.className} ${
          showCopyButton ? "opacity-100" : ""
        }`}
        onClick={(buttonEvent) => {
          buttonEvent.stopPropagation();
          onCopyMessage(event.id, event.message);
        }}
        title={copyButtonPresentation.title}
        aria-label={copyButtonPresentation.title}
      >
        <CopyStatusIcon size={14} />
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
