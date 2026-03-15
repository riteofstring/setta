import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkspaceRestoreThreadState,
  getBlockedWindowSpaceRestoreMessage,
} from "./windowSpaceProjectChatThreadRestore";

describe("buildWorkspaceRestoreThreadState", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("strips saved project-chat thread ids from the layout state and records rebound targets", () => {
    const currentWindowing = createProjectChatWindowingState({
      order: ["project-chat", "section-chat"],
      instancesById: {
        "project-chat": createProjectChatWindowInstance({
          instanceId: "project-chat",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "current-project-thread",
        }),
        "section-chat": createProjectChatWindowInstance({
          instanceId: "section-chat",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: "section-1",
          chatId: "current-section-thread",
        }),
      },
    });
    const restoredWindowing = createProjectChatWindowingState({
      order: ["project-chat", "section-chat"],
      instancesById: {
        "project-chat": createProjectChatWindowInstance({
          instanceId: "project-chat",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: "saved-project-thread",
        }),
        "section-chat": createProjectChatWindowInstance({
          instanceId: "section-chat",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: "section-1",
          chatId: "saved-section-thread",
        }),
      },
    });

    const { layoutWindowing, threadBindings } =
      buildWorkspaceRestoreThreadState(currentWindowing, restoredWindowing);

    expect(layoutWindowing.instancesById["project-chat"]?.chatId).toBe(
      "current-project-thread",
    );
    expect(layoutWindowing.instancesById["section-chat"]?.chatId).toBe(
      "current-section-thread",
    );
    expect(threadBindings).toEqual([
      {
        instanceId: "project-chat",
        chatId: "saved-project-thread",
        sectionIdOrNull: null,
      },
      {
        instanceId: "section-chat",
        chatId: "saved-section-thread",
        sectionIdOrNull: "section-1",
      },
    ]);
  });
});

describe("getBlockedWindowSpaceRestoreMessage", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("blocks rebinding saved chat threads when deployment policy disallows llm", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: false,
        allowLayoutChanges: true,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });

    expect(
      getBlockedWindowSpaceRestoreMessage([
        {
          instanceId: "project-chat",
          chatId: "saved-project-thread",
          sectionIdOrNull: null,
        },
      ]),
    ).toBe(
      "Cannot restore this window space because deployment policy disallows restoring saved chat threads.",
    );
  });
});
