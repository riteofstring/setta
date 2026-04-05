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
  createSingleConfig,
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
  route_set_project_chat_windowing_state: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
  route_set_project_chat_window_chat_id: (...args: unknown[]) =>
    routeSetProjectChatWindowChatIdMock(...args),
}));

vi.mock("./sections/createSections", () => ({
  createTopLevelSectionWithResult: vi.fn(),
}));

import {
  focusProjectChatWindow,
  setProjectChatWindowChatId,
  setProjectChatWindowTitle,
} from "./projectChatWindowing";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";

async function flushOptimisticMutation(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("project chat windowing rollback", () => {
  beforeEach(() => {
    resetProjectStores();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    useAIStore.setState({ activeChatId: undefined });
    routeSetProjectChatWindowingStateMock.mockImplementation(
      async (request: {
        state: ReturnType<typeof createProjectChatWindowingState>;
      }) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
    );
    routeSetProjectChatWindowChatIdMock.mockImplementation(
      async (request: { chatId: string | null }) => ({
        data: createProjectChatWindowingState({
          instancesById: {
            "project-chat-window-1": createProjectChatWindowInstance({
              instanceId: "project-chat-window-1",
              mode: ChatWindowModeEnum.project_ai_mode,
              sectionIdOrNull: null,
              chatId: request.chatId,
              zIndex: 1,
            }),
            "project-chat-window-2": createProjectChatWindowInstance({
              instanceId: "project-chat-window-2",
              mode: ChatWindowModeEnum.project_ai_mode,
              sectionIdOrNull: null,
              chatId: "chat-peer",
              zIndex: 2,
            }),
          },
          order: ["project-chat-window-1", "project-chat-window-2"],
          nextInstanceNumber: 3,
        }),
        status: 200,
        hasResponse: true,
      }),
    );
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
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
  });

  it("replays a later accepted chat-id update after an earlier focus write fails out of order", async () => {
    let resolveFocusWrite:
      | ((value: {
          data:
            | { detail: string }
            | ReturnType<typeof createProjectChatWindowingState>;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    routeSetProjectChatWindowingStateMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFocusWrite = resolve;
        }),
      )
      .mockImplementationOnce(
        async (request: {
          state: ReturnType<typeof createProjectChatWindowingState>;
        }) => ({
          data: request.state,
          status: 200,
          hasResponse: true,
        }),
      );
    routeSetProjectChatWindowChatIdMock.mockImplementation(
      async (request: { chatId: string | null }) => ({
        data: createProjectChatWindowingState({
          instancesById: {
            "project-chat-window-1": createProjectChatWindowInstance({
              instanceId: "project-chat-window-1",
              mode: ChatWindowModeEnum.project_ai_mode,
              sectionIdOrNull: null,
              chatId: request.chatId,
              zIndex: 1,
            }),
            "project-chat-window-2": createProjectChatWindowInstance({
              instanceId: "project-chat-window-2",
              mode: ChatWindowModeEnum.project_ai_mode,
              sectionIdOrNull: null,
              chatId: "chat-peer",
              zIndex: 2,
            }),
          },
          order: ["project-chat-window-1", "project-chat-window-2"],
          nextInstanceNumber: 3,
        }),
        status: 200,
        hasResponse: true,
      }),
    );
    useAIStore.setState({ activeChatId: "chat-peer" });

    focusProjectChatWindow("project-chat-window-1", 1234);
    setProjectChatWindowChatId("project-chat-window-1", "chat-after");
    await flushOptimisticMutation();

    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();

    resolveFocusWrite?.({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });
    await flushOptimisticMutation();

    const windowing = useProjectState.getState().projectChatWindowing;
    expect(windowing.instancesById["project-chat-window-1"]?.chatId).toBe(
      "chat-after",
    );
    expect(windowing.instancesById["project-chat-window-1"]?.zIndex).toBe(1);
    expect(useAIStore.getState().activeChatId).toBe("chat-after");
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
    expect(routeSetProjectChatWindowChatIdMock).toHaveBeenCalledTimes(1);
  });

  it("does not roll back focus into a different project after navigation", async () => {
    const projectBWindowing = createProjectChatWindowingState({
      instancesById: {
        "project-chat-window-9": createProjectChatWindowInstance({
          instanceId: "project-chat-window-9",
          mode: ChatWindowModeEnum.project_ai_mode,
          sectionIdOrNull: null,
          chatId: "chat-project-b",
          zIndex: 7,
        }),
      },
      order: ["project-chat-window-9"],
      nextInstanceNumber: 10,
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });
    useAIStore.setState({ activeChatId: "chat-peer" });

    focusProjectChatWindow("project-chat-window-1", 1234);
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-b" });
      state.projectChatWindowing = projectBWindowing;
    });
    useAIStore.setState({ activeChatId: "chat-project-b" });

    await flushOptimisticMutation();

    expect(useProjectState.getState().projectConfig.id).toBe("project-b");
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      projectBWindowing,
    );
    expect(useAIStore.getState().activeChatId).toBe("chat-project-b");
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("sends the later windowing write from post-rollback state instead of a stale whole-state snapshot", async () => {
    let resolveFocusWrite:
      | ((value: {
          data:
            | { detail: string }
            | ReturnType<typeof createProjectChatWindowingState>;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    routeSetProjectChatWindowingStateMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFocusWrite = resolve;
        }),
      )
      .mockImplementationOnce(
        async (request: {
          state: ReturnType<typeof createProjectChatWindowingState>;
        }) => ({
          data: request.state,
          status: 200,
          hasResponse: true,
        }),
      );

    focusProjectChatWindow("project-chat-window-1", 1234);
    setProjectChatWindowTitle("project-chat-window-1", "Renamed");
    await flushOptimisticMutation();

    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);

    resolveFocusWrite?.({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });
    await flushOptimisticMutation();

    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(2);
    const secondRequest =
      routeSetProjectChatWindowingStateMock.mock.calls[1]?.[0];
    expect(
      secondRequest?.state.instancesById["project-chat-window-1"]?.title,
    ).toBe("Renamed");
    expect(
      secondRequest?.state.instancesById["project-chat-window-1"]?.zIndex,
    ).toBe(1);

    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        projectConfig: createProjectConfig({
          id: "project-config-1",
        }),
        projectChatWindowing: secondRequest.state,
      }),
      completedOpIds: [secondRequest.frontendOpId],
      pendingOpIds: [],
    });

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.title,
    ).toBe("Renamed");
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.zIndex,
    ).toBe(1);
  });
});
