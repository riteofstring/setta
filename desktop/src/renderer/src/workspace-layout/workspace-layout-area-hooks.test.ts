import { describe, expect, test } from "vitest";
import type { WorkspaceUILayout } from "@generated/backend";

import type { WorkspaceLayoutTransientSnapshot } from "./layout-store";
import { workspaceUILiveLayoutStateAfterUpdate } from "./workspace-layout-area-hooks";

describe("workspace UI live layout updates", () => {
  test("keeps event replay strictly newer than the current revision", () => {
    const current = {
      key: "workspace:workspace_api",
      layout: workspaceUILayout(6, "workspace_pane_0"),
      transientSnapshot: null,
    };

    expect(
      workspaceUILiveLayoutStateAfterUpdate(
        current,
        "workspace:workspace_api",
        workspaceUILayout(6, "workspace_pane_1"),
        "event",
      ),
    ).toBe(current);
  });

  test("accepts same-revision command responses as authoritative", () => {
    const current = {
      key: "workspace:workspace_api",
      layout: workspaceUILayout(6, "workspace_pane_0"),
      transientSnapshot: null,
    };
    const commandLayout = workspaceUILayout(6, "workspace_pane_1");
    const transientSnapshot = workspaceLayoutSnapshot("workspace_pane_1");

    expect(
      workspaceUILiveLayoutStateAfterUpdate(
        current,
        "workspace:workspace_api",
        commandLayout,
        "command",
        transientSnapshot,
      ),
    ).toEqual({
      key: "workspace:workspace_api",
      layout: commandLayout,
      transientSnapshot,
    });
  });

  test("ignores same-revision command responses when the layout is unchanged", () => {
    const layout = workspaceUILayout(6, "workspace_pane_1");
    const current = {
      key: "workspace:workspace_api",
      layout,
      transientSnapshot: null,
    };

    expect(
      workspaceUILiveLayoutStateAfterUpdate(
        current,
        "workspace:workspace_api",
        workspaceUILayout(6, "workspace_pane_1"),
        "command",
        workspaceLayoutSnapshot("workspace_pane_1"),
      ),
    ).toBe(current);
  });

  test("does not apply stale command responses or mismatched workspace keys", () => {
    const current = {
      key: "workspace:workspace_api",
      layout: workspaceUILayout(6, "workspace_pane_0"),
      transientSnapshot: null,
    };

    expect(
      workspaceUILiveLayoutStateAfterUpdate(
        current,
        "workspace:workspace_api",
        workspaceUILayout(5, "workspace_pane_1"),
        "command",
      ),
    ).toBe(current);
    expect(
      workspaceUILiveLayoutStateAfterUpdate(
        current,
        "workspace:workspace_other",
        workspaceUILayout(7, "workspace_pane_1"),
        "command",
      ),
    ).toBe(current);
  });

  test("clears command transient state when applying newer event replay", () => {
    const current = {
      key: "workspace:workspace_api",
      layout: workspaceUILayout(6, "workspace_pane_0"),
      transientSnapshot: workspaceLayoutSnapshot("workspace_pane_0"),
    };
    const eventLayout = workspaceUILayout(7, "workspace_pane_1");

    expect(
      workspaceUILiveLayoutStateAfterUpdate(
        current,
        "workspace:workspace_api",
        eventLayout,
        "event",
      ),
    ).toEqual({
      key: "workspace:workspace_api",
      layout: eventLayout,
      transientSnapshot: null,
    });
  });
});

function workspaceUILayout(revision: number, focusedPaneId: string): WorkspaceUILayout {
  return {
    columns: [
      {
        columnId: "workspace_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: [focusedPaneId],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId,
    panes: [
      {
        chatConfig: null,
        columnId: "workspace_column_0",
        heat: 0,
        heightPx: null,
        paneId: focusedPaneId,
        sequence: 0,
        subtitle: "workspace",
        surfaceId: "workspace_surface_0",
        surfaceKind: "chat-dom",
        terminalConfig: null,
        title: "Chat",
        tone: "cyan",
        weight: 1,
        workflowNodeDetailsConfig: null,
      },
    ],
    revision,
    schemaVersion: 4,
    workspaceId: "workspace_api",
  };
}

function workspaceLayoutSnapshot(focusedPaneId: string): WorkspaceLayoutTransientSnapshot {
  return {
    focusedColumnIndex: 1,
    focusedPaneId,
    focusRevealSuppressed: false,
    focusedRowIndex: 0,
    maximizedPaneId: null,
    overviewInsertPreviewTarget: null,
    overviewPanX: 0,
    overviewPanY: 0,
    overviewProgress: 0,
    overviewZoom: 1,
    presentationMode: "normal",
    revision: 6,
    scrollColumn: 0,
    scrollRow: 0,
    targetScrollColumn: 0,
    targetScrollRow: 0,
  };
}
