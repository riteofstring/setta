import { describe, expect, it } from "vitest";
import { SettaBackendLogEvent } from "utils/generatedTypes";
import { filterEvents } from "./BackendLogEventsArea";

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

    // Generous threshold; this guard catches algorithmic regressions.
    expect(elapsedMs).toBeLessThan(1400);
  });
});
