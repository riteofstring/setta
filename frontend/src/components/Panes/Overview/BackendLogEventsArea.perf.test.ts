import { SettaBackendLogEvent } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  applyBackendLogColumnResize,
  BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  filterEvents,
} from "./BackendLogEventsArea";

const STRICT_PERF_BUDGETS_ENABLED = process.env.SETTA_STRICT_PERF === "1";

describe("BackendLogEventsArea filtering (perf)", () => {
  it("filters a large backend log list fast enough for interactive search", () => {
    const events: Array<SettaBackendLogEvent> = [];

    for (let i = 0; i < 40_000; i += 1) {
      const isHit = i === 39_999;
      events.push({
        id: `event-${i}`,
        projectConfigId: i % 2 === 0 ? "project-a" : "project-b",
        severity: isHit ? "critical" : i % 7 === 0 ? "warning" : "info",
        message: isHit ? "critical cache warm failure" : `log message ${i}`,
        timestamp: "2025-02-14T10:00:00.000Z",
      });
    }

    const start = performance.now();
    const filtered = filterEvents(events, {
      projectConfigId: null,
      minSeverity: "warning",
      query: "cache warm failure",
    });
    const elapsedMs = performance.now() - start;

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("event-39999");

    if (STRICT_PERF_BUDGETS_ENABLED) {
      // Optional strict perf budget for dedicated perf runs.
      expect(elapsedMs).toBeLessThan(1400);
    }
  });

  it("applies many resize-drag calculations without falling behind pointer input", () => {
    // This approximates repeated mousemove events while dragging column handles.
    let widths = BACKEND_LOG_DEFAULT_COLUMN_WIDTHS;
    const start = performance.now();
    for (let i = 0; i < 80_000; i += 1) {
      const delta = (i % 11) - 5;
      let column: "timestamp" | "severity" | "project" = "project";
      if (i % 3 === 0) {
        column = "timestamp";
      } else if (i % 3 === 1) {
        column = "severity";
      }
      widths = applyBackendLogColumnResize(widths, column, delta);
    }
    const elapsedMs = performance.now() - start;

    expect(widths.timestamp).toBeGreaterThanOrEqual(64);
    expect(widths.severity).toBeGreaterThanOrEqual(64);
    expect(widths.project).toBeGreaterThanOrEqual(120);
    if (STRICT_PERF_BUDGETS_ENABLED) {
      // Optional strict perf budget for dedicated perf runs.
      expect(elapsedMs).toBeLessThan(900);
    }
  });
});
