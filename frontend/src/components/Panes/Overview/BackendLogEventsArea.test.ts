import { SettaBackendLogEvent } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  addBackendLogResizeListeners,
  applyBackendLogColumnResize,
  BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  buildBackendLogGridTemplateColumns,
  clampBackendLogColumnWidth,
  copyBackendLogMessage,
  filterEvents,
  getBackendLogEventById,
  getBackendLogEventsById,
  getBackendLogGridMinWidth,
  getBackendLogListRenderWidth,
  getBackendLogResizedColumnWidth,
  removeBackendLogResizeListeners,
} from "./BackendLogEventsArea.utils";

describe("BackendLogEventsArea column sizing helpers", () => {
  it("applies resize deltas for a single column while keeping other widths unchanged", () => {
    const resized = applyBackendLogColumnResize(
      BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
      "project",
      42,
    );

    expect(resized.project).toBe(
      BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.project + 42,
    );
    expect(resized.timestamp).toBe(BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.timestamp);
    expect(resized.severity).toBe(BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.severity);
  });

  it("computes a resized column width without allocating all column widths", () => {
    expect(
      getBackendLogResizedColumnWidth(
        BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
        "project",
        42,
      ),
    ).toBe(BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.project + 42);
  });

  it("clamps column widths within configured bounds", () => {
    expect(clampBackendLogColumnWidth("timestamp", -1000)).toBe(64);
    expect(clampBackendLogColumnWidth("severity", 9999)).toBe(170);
    expect(clampBackendLogColumnWidth("project", 10)).toBe(120);
  });

  it("builds a stable CSS grid template string from column widths", () => {
    expect(
      buildBackendLogGridTemplateColumns({
        timestamp: 80,
        severity: 90,
        project: 200,
      }),
    ).toBe("80px 90px 200px minmax(220px, 1fr) 56px");
  });

  it("derives a minimum grid width from fixed columns and message floor", () => {
    expect(
      getBackendLogGridMinWidth({
        timestamp: 80,
        severity: 90,
        project: 200,
      }),
    ).toBe(646);
  });
});

describe("BackendLogEventsArea clipboard helper", () => {
  it("returns true when clipboard writes succeed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const copied = await copyBackendLogMessage(writeText, "hello world");

    expect(copied).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello world");
  });

  it("returns false when clipboard writes fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const copied = await copyBackendLogMessage(writeText, "hello world");

    expect(copied).toBe(false);
  });

  it("returns false when clipboard writes throw synchronously", async () => {
    const writeText = vi.fn().mockImplementation(() => {
      throw new Error("clipboard unavailable");
    });
    const copied = await copyBackendLogMessage(writeText, "hello world");

    expect(copied).toBe(false);
  });
});

describe("BackendLogEventsArea resize teardown", () => {
  it("adds and removes both global drag listeners", () => {
    const mouseMove = vi.fn();
    const mouseUp = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener,
      removeEventListener,
    });

    try {
      addBackendLogResizeListeners({
        mouseMove,
        mouseUp,
      });
      removeBackendLogResizeListeners({
        mouseMove,
        mouseUp,
      });

      expect(addEventListener).toHaveBeenCalledWith("mousemove", mouseMove);
      expect(addEventListener).toHaveBeenCalledWith("mouseup", mouseUp);
      expect(removeEventListener).toHaveBeenCalledWith("mousemove", mouseMove);
      expect(removeEventListener).toHaveBeenCalledWith("mouseup", mouseUp);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores null listener cleanup requests", () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener,
    });

    try {
      removeBackendLogResizeListeners(null);
      expect(removeEventListener).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("filterEvents", () => {
  it("filters by project, severity, and message query", () => {
    const events: Array<SettaBackendLogEvent> = [
      {
        id: "event-1",
        projectConfigId: "a",
        severity: "info",
        message: "started",
        timestamp: "2025-02-14T10:00:00.000Z",
      },
      {
        id: "event-2",
        projectConfigId: "b",
        severity: "error",
        message: "failed to run",
        timestamp: "2025-02-14T10:00:01.000Z",
      },
      {
        id: "event-3",
        projectConfigId: "b",
        severity: "critical",
        message: "failed hard",
        timestamp: "2025-02-14T10:00:02.000Z",
      },
    ];

    const filtered = filterEvents(events, {
      projectConfigId: "b",
      minSeverity: "error",
      query: "failed",
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((event) => event.severity)).toEqual([
      "error",
      "critical",
    ]);
  });
});

describe("getBackendLogEventById", () => {
  it("returns the matching event when selected id exists", () => {
    const events: Array<SettaBackendLogEvent> = [
      {
        id: "event-1",
        projectConfigId: null,
        severity: "info",
        message: "first",
        timestamp: "2025-02-14T10:00:00.000Z",
      },
      {
        id: "event-2",
        projectConfigId: null,
        severity: "error",
        message: "second",
        timestamp: "2025-02-14T10:00:01.000Z",
      },
    ];

    const eventsById = getBackendLogEventsById(events);
    const selected = getBackendLogEventById(eventsById, "event-2");
    expect(selected?.message).toBe("second");
  });

  it("returns null for missing ids and null selections", () => {
    const events: Array<SettaBackendLogEvent> = [
      {
        id: "event-1",
        projectConfigId: null,
        severity: "info",
        message: "first",
        timestamp: "2025-02-14T10:00:00.000Z",
      },
    ];

    const eventsById = getBackendLogEventsById(events);
    expect(getBackendLogEventById(eventsById, "missing")).toBeNull();
    expect(getBackendLogEventById(eventsById, null)).toBeNull();
  });
});

describe("backend log list width calculation", () => {
  it("tracks viewport width when it is wider than grid minimum", () => {
    expect(getBackendLogListRenderWidth(640, 900)).toBe(900);
  });

  it("sticks to grid minimum width when viewport is narrower", () => {
    expect(getBackendLogListRenderWidth(820, 640)).toBe(820);
  });
});
