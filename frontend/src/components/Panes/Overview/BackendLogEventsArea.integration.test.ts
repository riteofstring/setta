import { SettaBackendLogEvent } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
  filterEvents,
  getBackendLogEventById,
  getBackendLogEventsById,
  getBackendLogGridMinWidth,
  getBackendLogListRenderWidth,
  getBackendLogResizedColumnWidth,
} from "./BackendLogEventsArea.utils";

describe("BackendLogEventsArea sizing integration", () => {
  it("shrinks list render width after narrowing columns from an expanded state", () => {
    // Fixed viewport width; column drags should control when grid min-width exceeds viewport.
    const viewportWidth = 700;
    const widenedWidths = {
      ...BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
      project: getBackendLogResizedColumnWidth(
        BACKEND_LOG_DEFAULT_COLUMN_WIDTHS,
        "project",
        120,
      ),
    };
    const narrowedWidths = {
      ...widenedWidths,
      project: getBackendLogResizedColumnWidth(widenedWidths, "project", -80),
    };

    const widenedListWidth = getBackendLogListRenderWidth(
      getBackendLogGridMinWidth(widenedWidths),
      viewportWidth,
    );
    const narrowedListWidth = getBackendLogListRenderWidth(
      getBackendLogGridMinWidth(narrowedWidths),
      viewportWidth,
    );

    expect(widenedListWidth).toBeGreaterThan(narrowedListWidth);
    expect(narrowedListWidth).toBe(viewportWidth);
  });
});

describe("BackendLogEventsArea selection integration", () => {
  it("clears selected-event lookup when filtering removes the selected id", () => {
    const events: Array<SettaBackendLogEvent> = [
      {
        id: "event-1",
        projectConfigId: "project-1",
        severity: "info",
        message: "first message",
        timestamp: "2025-02-14T10:00:00.000Z",
      },
      {
        id: "event-2",
        projectConfigId: "project-1",
        severity: "critical",
        message: "second message",
        timestamp: "2025-02-14T10:00:01.000Z",
      },
    ];

    const visibleEvents = filterEvents(events, {
      projectConfigId: null,
      minSeverity: "info",
      query: "",
    });
    const visibleEventsById = getBackendLogEventsById(visibleEvents);
    expect(getBackendLogEventById(visibleEventsById, "event-2")).not.toBeNull();

    const filteredEvents = filterEvents(events, {
      projectConfigId: null,
      minSeverity: "info",
      query: "first",
    });
    const filteredEventsById = getBackendLogEventsById(filteredEvents);
    expect(getBackendLogEventById(filteredEventsById, "event-2")).toBeNull();
  });
});
