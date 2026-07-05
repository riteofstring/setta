import { afterEach, describe, expect, test, vi } from "vitest";
import type { WorkspaceUIEvent, WorkspaceUILayout } from "@generated/backend";

import {
  initialWorkspaceUIPaneMetadataLoadState,
  initialWorkspaceUILayoutLoadState,
  workspaceUILayoutEventDecision,
} from "./workspace-ui-layout";

describe("workspace UI layout loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("starts non-empty real workspaces in loading state when persisted layout reads are available", () => {
    vi.stubGlobal("window", {
      setta: {
        workspace: {
          listUIPanes: vi.fn(),
          readUILayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("workspace_api", "workspace")).toStrictEqual({
      error: null,
      key: "workspace:workspace_api",
      layout: null,
      status: "loading",
    });
    expect(initialWorkspaceUIPaneMetadataLoadState("workspace_api", "workspace")).toMatchObject({
      error: null,
      key: "workspace:workspace_api",
      status: "loading",
    });
  });

  test("does not block benchmark or empty workspaces on persisted UI layout reads", () => {
    vi.stubGlobal("window", {
      setta: {
        workspace: {
          listUIPanes: vi.fn(),
          readUILayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUILayoutLoadState("workspace_api", "benchmark").status).toBe("loaded");
    expect(initialWorkspaceUILayoutLoadState("empty", "workspace").status).toBe("loaded");
    expect(initialWorkspaceUIPaneMetadataLoadState("workspace_api", "benchmark").status).toBe(
      "loaded",
    );
    expect(initialWorkspaceUIPaneMetadataLoadState("empty", "workspace").status).toBe("loaded");
  });

  test("fails explicitly when real workspace pane metadata API is unavailable", () => {
    vi.stubGlobal("window", {
      setta: {
        workspace: {
          readUILayout: vi.fn(),
        },
      },
    });

    expect(initialWorkspaceUIPaneMetadataLoadState("workspace_api", "workspace")).toMatchObject({
      error: "Workspace pane metadata API is unavailable",
      key: "workspace:workspace_api",
      status: "failed",
    });
  });

  test("applies only newer workspace UI layout events for the current workspace", () => {
    const newerLayout = workspaceUILayout(3);

    expect(
      workspaceUILayoutEventDecision(layoutUpdatedEvent(newerLayout), 2, "workspace_api"),
    ).toEqual({
      kind: "apply",
      layout: newerLayout,
    });
    expect(
      workspaceUILayoutEventDecision(layoutUpdatedEvent(workspaceUILayout(2)), 2, "workspace_api"),
    ).toEqual({ kind: "ignore" });
    expect(
      workspaceUILayoutEventDecision(
        layoutUpdatedEvent(workspaceUILayout(4, "workspace_other")),
        2,
        "workspace_api",
      ),
    ).toEqual({ kind: "ignore" });
  });

  test("rejects malformed workspace UI layout events", () => {
    const event = layoutUpdatedEvent(workspaceUILayout(3));

    expect(workspaceUILayoutEventDecision({ ...event, layout: null }, 2, "workspace_api")).toEqual({
      kind: "error",
      message: "Workspace UI layout update event did not include a layout",
    });
    expect(workspaceUILayoutEventDecision({ ...event, revision: 4 }, 2, "workspace_api")).toEqual({
      kind: "error",
      message: "Workspace UI layout event revision 4 does not match layout revision 3",
    });
  });

  test("requests resync only when the resync event is newer than the live revision", () => {
    expect(workspaceUILayoutEventDecision(resyncEvent(5), 4, "workspace_api")).toEqual({
      kind: "resync",
    });
    expect(workspaceUILayoutEventDecision(resyncEvent(5), 5, "workspace_api")).toEqual({
      kind: "ignore",
    });
    expect(
      workspaceUILayoutEventDecision({ ...resyncEvent(5), resync: null }, 4, "workspace_api"),
    ).toEqual({
      kind: "error",
      message: "Workspace UI resync event did not include resync details",
    });
  });
});

function layoutUpdatedEvent(layout: WorkspaceUILayout): WorkspaceUIEvent {
  return {
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `workspace_ui_stream_test:${layout.revision}`,
    layout,
    resync: null,
    revision: layout.revision,
    schemaVersion: 1,
    sequence: layout.revision,
    streamId: "workspace_ui_stream_test",
    type: "workspace_ui.layout_updated",
    workspaceId: layout.workspaceId,
  };
}

function resyncEvent(revision: number): WorkspaceUIEvent {
  return {
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `workspace_ui_stream_test:${revision}`,
    layout: null,
    resync: {
      currentRevision: revision,
      currentSequence: revision,
      currentStreamId: "workspace_ui_stream_test",
      earliestSequence: 1,
      reason: "workspace UI replay is no longer available",
      requestedSequence: 0,
      requestedStreamId: "workspace_ui_stream_old",
    },
    revision,
    schemaVersion: 1,
    sequence: revision,
    streamId: "workspace_ui_stream_test",
    type: "workspace_ui.resync_required",
    workspaceId: "workspace_api",
  };
}

function workspaceUILayout(revision: number, workspaceId = "workspace_api"): WorkspaceUILayout {
  return {
    columns: [],
    focusedPaneId: "workspace_pane_0",
    panes: [],
    revision,
    schemaVersion: 3,
    workspaceId,
  };
}
