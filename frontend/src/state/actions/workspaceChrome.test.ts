import {
  useLocalStorage,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  OverviewTabNameEnum,
} from "utils/constants";
import {
  createProjectChatWindowInstance,
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

import { flushPendingProjectChatWindowingWrites } from "./projectChatWindowing";
import { resetProjectWorkspaceChromeToDefaultLayout } from "./workspaceChrome";

describe("resetProjectWorkspaceChromeToDefaultLayout", () => {
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
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
      }),
    });
    useLocalStorage.setState({
      overviewVis: false,
      overviewTab: OverviewTabNameEnum.ProjectAIChat,
      overviewWidth: 1400,
      overviewTrueWidth: CLOSED_PANE_WIDTH,
      uiEditorVis: true,
      uiEditorWidth: 1400,
      uiEditorTrueWidth: 1400,
    });
  });

  it("restores the default overview chrome and clears project chat windows", async () => {
    resetProjectWorkspaceChromeToDefaultLayout();
    await flushPendingProjectChatWindowingWrites();

    const localStorageState = useLocalStorage.getState();
    expect(localStorageState.overviewVis).toBe(true);
    expect(localStorageState.overviewTab).toBe(OverviewTabNameEnum.Overview);
    expect(localStorageState.overviewWidth).toBe(INITIAL_OVERVIEW_WIDTH);
    expect(localStorageState.overviewTrueWidth).toBe(INITIAL_OVERVIEW_WIDTH);
    expect(localStorageState.uiEditorVis).toBe(false);
    expect(localStorageState.uiEditorWidth).toBe(INITIAL_UI_EDITOR_WIDTH);
    expect(localStorageState.uiEditorTrueWidth).toBe(CLOSED_PANE_WIDTH);

    const expectedWindowing = createProjectChatWindowingState({
      order: ["project-chat-window-1"],
      nextInstanceNumber: 2,
      instancesById: {
        "project-chat-window-1": createProjectChatWindowInstance({
          instanceId: "project-chat-window-1",
          isClosed: true,
        }),
      },
    });
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      expectedWindowing,
    );
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);
    expect(
      routeSetProjectChatWindowingStateMock.mock.calls[0][0].state,
    ).toEqual(expectedWindowing);
  });
});
