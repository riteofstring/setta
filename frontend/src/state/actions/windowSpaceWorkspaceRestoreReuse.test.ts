import { describe, expect, it } from "vitest";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { buildWorkspaceRestoreFloatingReusePlan } from "./windowSpaceWorkspaceRestoreReuse";

describe("buildWorkspaceRestoreFloatingReusePlan", () => {
  it("reuses the live floating instance id for a matching project chat thread", () => {
    // Matching floating project-chat windows should keep the live instance id so existing bindings stay stable.
    const restoredFloatingWindowing = createProjectChatWindowingState({
      order: ["saved-window"],
      instancesById: {
        "saved-window": createProjectChatWindowInstance({
          instanceId: "saved-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "chat-saved",
        }),
      },
    });
    const currentWindowing = createProjectChatWindowingState({
      order: ["project-chat-window-7"],
      instancesById: {
        "project-chat-window-7": createProjectChatWindowInstance({
          instanceId: "project-chat-window-7",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "chat-saved",
        }),
      },
    });

    expect(
      buildWorkspaceRestoreFloatingReusePlan(
        restoredFloatingWindowing,
        currentWindowing,
      ),
    ).toEqual({
      preferredRestoredInstanceIdByOriginalId: {
        "saved-window": "project-chat-window-7",
      },
      supersededFloatingInstanceIds: new Set(["project-chat-window-7"]),
    });
  });

  it("marks matching floating git graph windows as superseded without trying to reuse their instance id", () => {
    // Git graph windows should replace matching floating windows, but they are not part of the project-chat instance-id reuse path.
    const restoredFloatingWindowing = createProjectChatWindowingState({
      order: ["saved-git-window"],
      instancesById: {
        "saved-git-window": createProjectChatWindowInstance({
          instanceId: "saved-git-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.git_graph_mode,
        }),
      },
    });
    const currentWindowing = createProjectChatWindowingState({
      order: ["live-git-window"],
      instancesById: {
        "live-git-window": createProjectChatWindowInstance({
          instanceId: "live-git-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.git_graph_mode,
        }),
      },
    });

    expect(
      buildWorkspaceRestoreFloatingReusePlan(
        restoredFloatingWindowing,
        currentWindowing,
      ),
    ).toEqual({
      preferredRestoredInstanceIdByOriginalId: {},
      supersededFloatingInstanceIds: new Set(["live-git-window"]),
    });
  });
});
