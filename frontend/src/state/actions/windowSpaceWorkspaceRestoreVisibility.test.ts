import { buildProjectChatEphemeralWindowInstanceKey } from "state/actions/projectChatWindowingEphemeral";
import { useMisc } from "state/stores/layoutInteractionStores";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkspaceRestoreGitPaneVisibleInstanceIds } from "./windowSpaceWorkspaceRestoreVisibility";

describe("buildWorkspaceRestoreGitPaneVisibleInstanceIds", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("merges restored git-pane visibility with still-visible live git windows", () => {
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "live-git-window",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "closed-live-git-window",
        )]: true,
        [buildProjectChatEphemeralWindowInstanceKey(
          "foreign-project",
          "foreign-window",
        )]: true,
      },
    });

    const nextWindowing = createProjectChatWindowingState({
      order: [
        "live-git-window",
        "closed-live-git-window",
        "restored-git-window",
        "restored-hidden-git-window",
      ],
      instancesById: {
        "live-git-window": createProjectChatWindowInstance({
          instanceId: "live-git-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.git_graph_mode,
        }),
        "closed-live-git-window": {
          ...createProjectChatWindowInstance({
            instanceId: "closed-live-git-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
          }),
          isClosed: true,
        },
        "restored-git-window": createProjectChatWindowInstance({
          instanceId: "restored-git-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.git_graph_mode,
        }),
        "restored-hidden-git-window": createProjectChatWindowInstance({
          instanceId: "restored-hidden-git-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.git_graph_mode,
        }),
      },
    });

    const visibleInstanceIds = buildWorkspaceRestoreGitPaneVisibleInstanceIds({
      windowSpace: createWindowSpaceConfig({
        id: "space-1",
        name: "Git Layout",
        sortIndex: 0,
        windowsById: {
          "saved-git-window": {
            surfaceKind: "project_chat",
            mode: ChatWindowModeEnum.git_graph_mode,
            title: "Saved Git Graph",
            embeddedGitPaneVisible: true,
            zIndex: 1,
            normalizedBounds: {
              x: 0,
              y: 0,
              width: 0.4,
              height: 0.4,
            },
          },
          "saved-hidden-git-window": {
            surfaceKind: "project_chat",
            mode: ChatWindowModeEnum.git_graph_mode,
            title: "Hidden Git Graph",
            embeddedGitPaneVisible: false,
            zIndex: 2,
            normalizedBounds: {
              x: 0.4,
              y: 0,
              width: 0.4,
              height: 0.4,
            },
          },
        },
        order: ["saved-git-window", "saved-hidden-git-window"],
      }),
      projectConfigId: "project-id",
      nextWindowing,
      restoredWindowing: createProjectChatWindowingState({
        order: ["restored-git-window", "restored-hidden-git-window"],
        instancesById: {
          "restored-git-window":
            nextWindowing.instancesById["restored-git-window"],
          "restored-hidden-git-window":
            nextWindowing.instancesById["restored-hidden-git-window"],
        },
      }),
      remappedInstanceIdByOriginalId: {
        "saved-git-window": "restored-git-window",
        "saved-hidden-git-window": "restored-hidden-git-window",
      },
    });

    expect(visibleInstanceIds).toEqual([
      "live-git-window",
      "restored-git-window",
    ]);
  });
});
