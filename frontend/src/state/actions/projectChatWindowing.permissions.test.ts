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

vi.mock("utils/generatedEndpoints", () => ({
  route_set_project_chat_windowing_state: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
}));

import {
  createProjectChatWindowInstance,
  minimizeProjectChatWindow,
  showSectionInProjectChatWindow,
} from "./projectChatWindowing";

describe("project chat windowing permissions", () => {
  beforeEach(() => {
    resetProjectStores();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockImplementation(
      async (request) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
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
    await Promise.resolve();
    await Promise.resolve();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ]?.isMinimized,
    ).toBe(false);
  });
});
