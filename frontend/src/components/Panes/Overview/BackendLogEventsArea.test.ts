import { describe, expect, it, vi } from "vitest";
import { SettaBackendLogEvent } from "utils/generatedTypes";
import {
  applyBackendLogColumnResize,
  BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  buildBackendLogGridTemplateColumns,
  clampBackendLogColumnWidth,
  copyBackendLogMessage,
  filterEvents,
} from "./BackendLogEventsArea";

describe("BackendLogEventsArea column sizing helpers", () => {
  it("applies resize deltas for a single column while keeping other widths unchanged", () => {
    const resized = applyBackendLogColumnResize(
      BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
      "project",
      42,
    );

    expect(resized.project).toBe(BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.project + 42);
    expect(resized.timestamp).toBe(BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.timestamp);
    expect(resized.severity).toBe(BACKEND_LOG_DEFAULT_COLUMN_WIDTHS.severity);
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
