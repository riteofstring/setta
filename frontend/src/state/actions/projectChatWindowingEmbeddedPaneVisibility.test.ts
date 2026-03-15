import { useMisc } from "state/stores/layoutInteractionStores";
import {
  ChatWindowModeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import {
  reconcileProjectChatGitGraphEmbeddedPaneVisibility,
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject,
  toggleProjectChatGitGraphEmbeddedPaneVisibility,
} from "./projectChatWindowingEmbeddedPaneVisibility";
import { buildProjectChatEphemeralWindowInstanceKey } from "./projectChatWindowingEphemeralKeys";

describe("projectChatWindowingEmbeddedPaneVisibility", () => {
  beforeEach(() => {
    useMisc.getState().reset();
  });

  it("toggles embedded git-pane visibility for a project chat git graph window", () => {
    // The visibility owner should encapsulate the project-scoped misc store mutation.
    toggleProjectChatGitGraphEmbeddedPaneVisibility(
      "project-1",
      "graph-window-1",
    );
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-1",
        "graph-window-1",
      )]: true,
    });

    toggleProjectChatGitGraphEmbeddedPaneVisibility(
      "project-1",
      "graph-window-1",
    );
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
  });

  it("replaces project-scoped visibility while preserving other projects", () => {
    // Window-space restore should be able to rewrite one project's visibility without disturbing others.
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-1",
          "graph-window-1",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-2",
          "graph-window-9",
        )]: true,
      },
    });

    replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject("project-1", [
      "graph-window-2",
    ]);

    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-1",
        "graph-window-2",
      )]: true,
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-2",
        "graph-window-9",
      )]: true,
    });
  });

  it("reconciles away stale or closed git graph embedded-pane entries", () => {
    // Incoming authoritative window state should prune invalid per-window visibility leftovers.
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-1",
          "graph-window-1",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-1",
          "stale-window",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-2",
          "graph-window-9",
        )]: true,
      },
    });

    reconcileProjectChatGitGraphEmbeddedPaneVisibility(
      "project-1",
      createProjectChatWindowingState({
        instancesById: {
          "graph-window-1": createProjectChatWindowInstance({
            instanceId: "graph-window-1",
            mode: ChatWindowModeEnum.git_graph_mode,
            isClosed: true,
          }),
        },
        order: ["graph-window-1"],
        nextInstanceNumber: 2,
      }),
    );

    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-2",
        "graph-window-9",
      )]: true,
    });
  });
});
