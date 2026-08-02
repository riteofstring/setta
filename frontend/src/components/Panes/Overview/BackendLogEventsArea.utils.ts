import { type BackendLogEvent } from "utils/generatedTypes";

export type BackendLogSeverity = BackendLogEvent["severity"];
export type BackendLogCopyStatus = "copied" | "failed";

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

const BACKEND_LOG_COPY_BUTTON_PRESENTATION_BY_STATUS = {
  idle: {
    title: "Copy message",
    className: "text-setta-700 dark:text-setta-200",
    iconName: "copy",
  },
  failed: {
    title: "Copy failed",
    className: "text-red-600 dark:text-red-400",
    iconName: "copy",
  },
  copied: {
    title: "Copied",
    className: "text-blue-600 dark:text-blue-400",
    iconName: "checkmark",
  },
} as const;

export function isBackendLogSeverity(
  value: string,
): value is BackendLogSeverity {
  return Object.hasOwn(SEVERITY_ORDER, value);
}

export function getBackendLogCopyButtonPresentation(
  copyStatus: BackendLogCopyStatus | null,
) {
  return BACKEND_LOG_COPY_BUTTON_PRESENTATION_BY_STATUS[copyStatus ?? "idle"];
}

function clampBackendLogColumnWidth(
  column: BackendLogColumnWidthName,
  width: number,
): number {
  const bounds = BACKEND_LOG_COLUMN_WIDTH_BOUNDS[column];
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(width)));
}

export function getBackendLogResizedColumnWidth(
  initialWidths: BackendLogColumnWidths,
  column: BackendLogColumnWidthName,
  deltaX: number,
): number {
  return clampBackendLogColumnWidth(column, initialWidths[column] + deltaX);
}

export function buildBackendLogGridTemplateColumns(
  columnWidths: BackendLogColumnWidths,
): string {
  return `${columnWidths.timestamp}px ${columnWidths.severity}px ${columnWidths.project}px minmax(${BACKEND_LOG_MESSAGE_COLUMN_MIN_WIDTH_PX}px, 1fr) ${BACKEND_LOG_COPY_COLUMN_WIDTH_PX}px`;
}

export function getBackendLogGridMinWidth(
  columnWidths: BackendLogColumnWidths,
): number {
  return (
    columnWidths.timestamp +
    columnWidths.severity +
    columnWidths.project +
    BACKEND_LOG_MESSAGE_COLUMN_MIN_WIDTH_PX +
    BACKEND_LOG_COPY_COLUMN_WIDTH_PX
  );
}

type BackendLogResizeHandlers = {
  mouseMove: (event: globalThis.MouseEvent) => void;
  mouseUp: (event: globalThis.MouseEvent) => void;
};

export function addBackendLogResizeListeners(
  handlers: BackendLogResizeHandlers,
): void {
  window.addEventListener("mousemove", handlers.mouseMove);
  window.addEventListener("mouseup", handlers.mouseUp);
}

export function removeBackendLogResizeListeners(
  handlers: BackendLogResizeHandlers | null,
): void {
  if (!handlers) {
    return;
  }
  window.removeEventListener("mousemove", handlers.mouseMove);
  window.removeEventListener("mouseup", handlers.mouseUp);
}

export async function copyBackendLogMessage(
  writeText: (value: string) => Promise<void> | void,
  message: string,
): Promise<boolean> {
  try {
    await writeText(message);
    return true;
  } catch {
    return false;
  }
}

export function getBackendLogEventsById(
  events: Array<BackendLogEvent>,
): Map<string, BackendLogEvent> {
  const eventsById = new Map<string, BackendLogEvent>();
  for (const event of events) {
    eventsById.set(event.id, event);
  }
  return eventsById;
}

export function getBackendLogEventById(
  eventsById: Map<string, BackendLogEvent>,
  eventId: string | null,
): BackendLogEvent | null {
  if (!eventId) {
    return null;
  }
  return eventsById.get(eventId) ?? null;
}

export function filterEvents(
  events: Array<BackendLogEvent>,
  filter: {
    projectConfigId: string | null;
    minSeverity: BackendLogSeverity;
    query: string;
  },
): Array<BackendLogEvent> {
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

export function getBackendLogListRenderWidth(
  gridMinWidth: number,
  viewportWidth: number,
): number {
  return Math.max(gridMinWidth, viewportWidth);
}
