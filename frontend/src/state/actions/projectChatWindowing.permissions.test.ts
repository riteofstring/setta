import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance as createProjectChatWindowInstanceModel,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeSetProjectChatWindowingStateMock = vi.fn();
const routeSetProjectChatWindowChatIdMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_set_project_chat_windowing_state: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
  route_set_project_chat_window_chat_id: (...args: unknown[]) =>
    routeSetProjectChatWindowChatIdMock(...args),
}));

import {
  createProjectChatWindowInstance,
  flushPendingProjectChatWindowingWrites,
  focusProjectChatWindow,
  minimizeProjectChatWindow,
  setProjectChatWindowChatId,
  showSectionInProjectChatWindow,
} from "./projectChatWindowing";

describe("project chat windowing permissions", () => {
  beforeEach(() => {
    resetProjectStores();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockImplementation(
      async (request) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
    );
    routeSetProjectChatWindowChatIdMock.mockImplementation(async () => ({
      data: useProjectState.getState().projectChatWindowing,
      status: 200,
      hasResponse: true,
    }));
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
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

  it("blocks layout mutations when deployment policy disallows layout edits", () => {
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

    expect(createProjectChatWindowInstance()).toBe("");
    showSectionInProjectChatWindow("section-1");

    expect(useProjectState.getState().projectChatWindowing.order).toEqual([]);
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
  });

  it("allows project chat thread binding writes when LLM access is allowed but layout edits are blocked", async () => {
    // Thread selection should remain usable even when layout controls are removed.
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
    useProjectState.setState({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstanceModel({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.bottom_docked,
            chatId: null,
            isMinimized: false,
          }),
        },
      }),
    });
    routeSetProjectChatWindowChatIdMock.mockImplementation(async (request) => ({
      data: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstanceModel({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.bottom_docked,
            chatId: request.chatId,
            isMinimized: false,
          }),
        },
      }),
      status: 200,
      hasResponse: true,
    }));

    setProjectChatWindowChatId("project-chat-window-1", "chat-after");
    await flushPendingProjectChatWindowingWrites();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.chatId,
    ).toBe("chat-after");
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(routeSetProjectChatWindowChatIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-id",
        instanceId: "project-chat-window-1",
        chatId: "chat-after",
      }),
    );
  });

  it("updates focus locally when read-only deployments block layout edits", () => {
    // Visible windows still need usable z-order even when layout persistence is disabled.
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
    useProjectState.setState({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1", "project-chat-window-2"],
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstanceModel({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            chatId: "chat-a",
            zIndex: 1,
            isMinimized: false,
          }),
          "project-chat-window-2": createProjectChatWindowInstanceModel({
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.floating,
            chatId: "chat-b",
            zIndex: 2,
            isMinimized: false,
          }),
        },
      }),
    });

    focusProjectChatWindow("project-chat-window-1", 1234);

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.zIndex,
    ).toBeGreaterThan(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-2"
      ]?.zIndex ?? 0,
    );
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
  });

  it("rolls back rejected layout writes", async () => {
    routeSetProjectChatWindowingStateMock.mockResolvedValue({
      data: { detail: "Deployment policy disallows layout changes." },
      status: 403,
      hasResponse: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstanceModel({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.bottom_docked,
            isMinimized: false,
          }),
        },
        nextInstanceNumber: 2,
      }),
    });

    minimizeProjectChatWindow("project-chat-window-1");
    await flushPendingProjectChatWindowingWrites();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.isMinimized,
    ).toBe(false);
  });
});
