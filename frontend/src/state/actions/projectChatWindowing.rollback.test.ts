/* @vitest-environment jsdom */

import {
  useAIStore,
  usePendingOperations,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeSetProjectChatWindowingStateMock = vi.fn();
const routeSetProjectChatWindowChatIdMock = vi.fn();

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: {
    getState: () => ({
      transform: [0, 0, 1],
      d3Zoom: null,
      d3Selection: null,
      domNode: null,
    }),
  },
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_set_project_chat_window_chat_id: (...args: unknown[]) =>
    routeSetProjectChatWindowChatIdMock(...args),
  route_set_project_chat_windowing_state: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
}));

vi.mock("./sections/createSections", () => ({
  createTopLevelSectionWithResult: vi.fn(),
}));

import {
  focusProjectChatWindow,
  setProjectChatWindowChatId,
} from "./projectChatWindowing";

async function flushOptimisticMutation(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("project chat windowing rollback", () => {
  beforeEach(() => {
    resetProjectStores();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    useAIStore.setState({ activeChatId: undefined });
    useProjectState.setState((state) => {
      const projectWindow = createProjectChatWindowInstance({
        instanceId: "project-chat-window-1",
        mode: ChatWindowModeEnum.project_ai_mode,
        sectionIdOrNull: null,
        chatId: "chat-before",
        zIndex: 1,
      });
      const peerWindow = createProjectChatWindowInstance({
        instanceId: "project-chat-window-2",
        mode: ChatWindowModeEnum.project_ai_mode,
        sectionIdOrNull: null,
        chatId: "chat-peer",
        zIndex: 2,
      });
      state.projectConfig = createProjectConfig({ id: "project-config-1" });
      state.projectChatWindowing = createProjectChatWindowingState({
        instancesById: {
          [projectWindow.instanceId]: projectWindow,
          [peerWindow.instanceId]: peerWindow,
        },
        order: [projectWindow.instanceId, peerWindow.instanceId],
        nextInstanceNumber: 3,
      });
    });
  });

  it("rolls back focus and active chat selection when the windowing write has no response", async () => {
    useAIStore.setState({ activeChatId: "chat-peer" });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: null,
      status: 0,
      hasResponse: false,
    });

    focusProjectChatWindow("project-chat-window-1", 1234);
    await flushOptimisticMutation();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.zIndex,
    ).toBe(1);
    expect(useAIStore.getState().activeChatId).toBe("chat-peer");
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("rolls back chat assignment and active chat selection on a handled rejection", async () => {
    useAIStore.setState({ activeChatId: "chat-before" });
    routeSetProjectChatWindowChatIdMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });

    setProjectChatWindowChatId("project-chat-window-1", "chat-after");
    await flushOptimisticMutation();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.chatId,
    ).toBe("chat-before");
    expect(useAIStore.getState().activeChatId).toBe("chat-before");
    expect(usePendingOperations.getState().pending).toEqual([]);
  });
});
