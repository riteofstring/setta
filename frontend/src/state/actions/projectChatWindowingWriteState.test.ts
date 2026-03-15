import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyProjectChatWindowingMutation,
  canMutateProjectChatWindowingLayout,
} from "./projectChatWindowingWriteState";

describe("projectChatWindowingWriteState", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      projectChatWindowing: createProjectChatWindowingState(),
    });
    useAIStore.setState({ activeChatId: "chat-before" });
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("respects deployment layout permissions", () => {
    // Layout writes should be blocked only when deployment policy explicitly disables them.
    expect(canMutateProjectChatWindowingLayout()).toBe(true);

    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });

    expect(canMutateProjectChatWindowingLayout()).toBe(false);
  });

  it("applies a local mutation and syncs the active chat id", () => {
    // Local mutation application should update both the windowing snapshot and active chat state.
    const instance = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      placement: ChatWindowPlacementEnum.bottom_docked,
      mode: ChatWindowModeEnum.project_ai_mode,
      chatId: "chat-before",
      isMinimized: false,
    });
    const initialWindowing = createProjectChatWindowingState({
      order: [instance.instanceId],
      instancesById: {
        [instance.instanceId]: instance,
      },
      nextInstanceNumber: 2,
    });
    const nextWindowing = createProjectChatWindowingState({
      ...initialWindowing,
      instancesById: {
        [instance.instanceId]: createProjectChatWindowInstance({
          ...instance,
          chatId: "chat-after",
        }),
      },
    });
    useProjectState.setState({ projectChatWindowing: initialWindowing });

    const result = applyProjectChatWindowingMutation(
      initialWindowing,
      null,
      () => ({
        nextProjectChatWindowing: nextWindowing,
        options: {
          syncActiveChatId: "chat-after",
        },
      }),
    );

    expect(result.nextProjectChatWindowing).toBe(nextWindowing);
    expect(useProjectState.getState().projectChatWindowing).toBe(nextWindowing);
    expect(useAIStore.getState().activeChatId).toBe("chat-after");
  });
});
