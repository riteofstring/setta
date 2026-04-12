import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance as createProjectChatWindowInstanceModel,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectChatWindowInstance,
  flushPendingProjectChatWindowingWrites,
  focusProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  setProjectChatWindowChatId,
  showSectionInProjectChatWindow,
} from "./projectChatWindowing";
const routeSetProjectChatWindowingStateMock = vi.fn();
const routeSetProjectChatWindowChatIdMock = vi.fn();
vi.mock("openapi/http", () => ({
  setProjectChatWindowingState: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
  setProjectChatWindowChatId: (...args: unknown[]) =>
    routeSetProjectChatWindowChatIdMock(...args),
}));
function createOpenAPIDataResponse<TData>(
  data: TData,
  status: number = 200,
): {
  data: TData;
  response: Response;
} {
  return {
    data,
    response: new Response(null, { status }),
  };
}
function createOpenAPIErrorResponse<TError>(
  error: TError,
  status: number,
): {
  error: TError;
  response: Response;
} {
  return {
    error,
    response: new Response(null, { status }),
  };
}
describe("project chat windowing permissions", () => {
  beforeEach(() => {
    resetProjectStores();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockImplementation(async (request) =>
      createOpenAPIDataResponse(request.body.state),
    );
    routeSetProjectChatWindowChatIdMock.mockImplementation(async () =>
      createOpenAPIDataResponse(
        useProjectState.getState().projectChatWindowing,
      ),
    );
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
    routeSetProjectChatWindowChatIdMock.mockImplementation(async (request) =>
      createOpenAPIDataResponse(
        createProjectChatWindowingState({
          order: ["project-chat-window-1"],
          instancesById: {
            "project-chat-window-1": createProjectChatWindowInstanceModel({
              instanceId: "project-chat-window-1",
              placement: ChatWindowPlacementEnum.bottom_docked,
              chatId: request.body.chatId,
              isMinimized: false,
            }),
          },
        }),
      ),
    );
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
        body: expect.objectContaining({
          projectConfigId: "project-id",
          instanceId: "project-chat-window-1",
          chatId: "chat-after",
        }),
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
  it("reopens hidden windows locally when read-only deployments block layout edits", () => {
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
            placement: ChatWindowPlacementEnum.floating,
            chatId: "chat-a",
            isClosed: false,
            isMinimized: true,
            zIndex: 1,
          }),
        },
      }),
    });
    reopenProjectChatWindow("project-chat-window-1");
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ],
    ).toMatchObject({
      isClosed: false,
      isMinimized: false,
    });
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
  });
  it("rolls back rejected layout writes", async () => {
    routeSetProjectChatWindowingStateMock.mockResolvedValue(
      createOpenAPIErrorResponse(
        { detail: "Deployment policy disallows layout changes." },
        403,
      ),
    );
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
