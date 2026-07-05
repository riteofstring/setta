import type { WorkspaceUIPaneDescriptor, WorkspaceUIPaneListResult } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { workspacePaneMetadataSnapshotFromList } from "./workspace-pane-metadata";

describe("workspace pane metadata", () => {
  test("maps backend pane descriptors by stable pane id", () => {
    const terminal = paneDescriptor({
      contentRefs: {
        terminal: {
          cwdOverride: "/tmp/project",
          profileId: "terminal_profile_default",
          sessionId: "",
          titleOverride: "Build",
        },
      },
      focused: true,
      paneId: "workspace_pane_terminal",
      surfaceKind: "terminal",
      writeModes: [],
    });
    const chat = paneDescriptor({
      contentRefs: {
        chat: { conversationId: "conversation_api" },
      },
      focused: false,
      paneId: "workspace_pane_chat",
      surfaceKind: "chat-dom",
      writeModes: ["chat_send"],
    });

    const snapshot = workspacePaneMetadataSnapshotFromList({
      layoutPresent: true,
      panes: [terminal, chat],
      schema: workspaceUISchema(),
      workspaceId: "workspace_api",
    });

    expect(snapshot.workspaceId).toBe("workspace_api");
    expect(snapshot.layoutPresent).toBe(true);
    expect(snapshot.focusedPaneId).toBe("workspace_pane_terminal");
    expect(snapshot.paneCount).toBe(2);
    expect(snapshot.paneIds).toEqual(["workspace_pane_terminal", "workspace_pane_chat"]);
    expect(snapshot.readablePaneCount).toBe(2);
    expect(snapshot.writablePaneCount).toBe(1);
    expect(snapshot.panesById.get("workspace_pane_terminal")?.contentRefs.terminal).toEqual({
      cwdOverride: "/tmp/project",
      profileId: "terminal_profile_default",
      sessionId: "",
      titleOverride: "Build",
    });
    expect(snapshot.panesById.get("workspace_pane_chat")?.contentRefs.chat).toEqual({
      conversationId: "conversation_api",
    });
  });

  test("rejects duplicate pane ids", () => {
    const pane = paneDescriptor({ paneId: "workspace_pane_duplicate" });

    expect(() =>
      workspacePaneMetadataSnapshotFromList({
        layoutPresent: true,
        panes: [pane, pane],
        schema: workspaceUISchema(),
        workspaceId: "workspace_api",
      }),
    ).toThrow("workspace pane metadata contains duplicate pane id workspace_pane_duplicate");
  });

  test("rejects multiple focused descriptors", () => {
    expect(() =>
      workspacePaneMetadataSnapshotFromList({
        layoutPresent: true,
        panes: [
          paneDescriptor({ focused: true, paneId: "workspace_pane_1" }),
          paneDescriptor({ focused: true, paneId: "workspace_pane_2" }),
        ],
        schema: workspaceUISchema(),
        workspaceId: "workspace_api",
      }),
    ).toThrow(
      "workspace pane metadata contains multiple focused panes: workspace_pane_1, workspace_pane_2",
    );
  });
});

type PaneDescriptorOverrides = Omit<
  Partial<WorkspaceUIPaneDescriptor>,
  "contentRefs" | "paneId"
> & {
  contentRefs?: Partial<WorkspaceUIPaneDescriptor["contentRefs"]>;
  paneId: string;
};

function paneDescriptor(overrides: PaneDescriptorOverrides): WorkspaceUIPaneDescriptor {
  const { contentRefs, paneId, ...paneOverrides } = overrides;
  return {
    canClosePane: false,
    canFocus: false,
    canMove: false,
    contentRefs: {
      chat: null,
      semanticNodeDetails: null,
      terminal: null,
      workflowGraph: null,
      workflowNodeDetails: null,
      ...contentRefs,
    },
    focused: false,
    location: {
      columnId: "workspace_column_0",
      columnIndex: 0,
      idealWidthSpec: { unit: "px", value: 520 },
      paneCount: 1,
      paneIndex: 0,
      planeIndex: 0,
      sequence: 0,
      slotIndex: 0,
      weight: 1,
      widthSpec: { unit: "px", value: 520 },
    },
    paneId,
    readModes: ["metadata"],
    runtimeState: { status: "layout_only" },
    subtitle: "",
    surfaceCloseModes: [],
    surfaceId: `surface_${paneId}`,
    surfaceKind: "chat-dom",
    title: "Pane",
    writeModes: [],
    ...paneOverrides,
  };
}

function workspaceUISchema(): WorkspaceUIPaneListResult["schema"] {
  return {
    columnWidthUnits: [],
    layoutSchemaVersion: 1,
    paneReadModes: [],
    paneRuntimeStatuses: [],
    paneTones: [],
    paneWriteModes: [],
    schemaVersion: 1,
    surfaceCloseModes: [],
    surfaceKinds: [],
  };
}
