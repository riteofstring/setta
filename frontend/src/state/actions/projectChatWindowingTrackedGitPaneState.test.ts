import { useMisc } from "state/stores/layoutInteractionStores";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProjectChatEphemeralWindowInstanceKey } from "./projectChatWindowingEphemeralKeys";
import {
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
} from "./projectChatWindowingTrackedGitPaneState";

describe("projectChatWindowingTrackedGitPaneState", () => {
  beforeEach(() => {
    useMisc.getState().reset();
  });

  it("keeps the tracked git graph window when the maximized pane-following instance is still valid", () => {
    // A tracked git graph window should be reusable only while it stays maximized and open.
    const windowing = createProjectChatWindowingState({
      instancesById: {
        "graph-window-1": createProjectChatWindowInstance({
          instanceId: "graph-window-1",
          mode: ChatWindowModeEnum.git_graph_mode,
          placement: ChatWindowPlacementEnum.maximized,
          isClosed: false,
          isMinimized: false,
        }),
      },
      order: ["graph-window-1"],
      nextInstanceNumber: 2,
    });
    setTrackedGitPaneGraphWindowInstanceId("project-1", "graph-window-1");

    const trackedInstanceId = resolveTrackedGitPaneGraphWindowInstanceId(
      windowing,
      "project-1",
    );

    expect(trackedInstanceId).toBe("graph-window-1");
    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBe(
      buildProjectChatEphemeralWindowInstanceKey("project-1", "graph-window-1"),
    );
  });

  it("clears the tracked git graph window when the stored instance leaves the pane-following state", () => {
    // Stale tracked ids should drop as soon as the authoritative window model no longer matches.
    const windowing = createProjectChatWindowingState({
      instancesById: {
        "graph-window-1": createProjectChatWindowInstance({
          instanceId: "graph-window-1",
          mode: ChatWindowModeEnum.git_graph_mode,
          placement: ChatWindowPlacementEnum.floating,
          isClosed: false,
          isMinimized: false,
        }),
      },
      order: ["graph-window-1"],
      nextInstanceNumber: 2,
    });
    setTrackedGitPaneGraphWindowInstanceId("project-1", "graph-window-1");

    const trackedInstanceId = resolveTrackedGitPaneGraphWindowInstanceId(
      windowing,
      "project-1",
    );

    expect(trackedInstanceId).toBeNull();
    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBeNull();
  });
});
