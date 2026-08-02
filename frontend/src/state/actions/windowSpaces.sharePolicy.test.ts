import {
  usePendingOperations,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  NotificationTypeEnum,
  createProjectChatWindowingState,
  createProjectConfig,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeCreateWindowSpaceMock = vi.fn();
const routeDeleteWindowSpaceMock = vi.fn();
const routeSetWindowSpaceNameMock = vi.fn();
const routeSetWindowSpaceSortOrderMock = vi.fn();
const routeSetProjectChatWindowingStateMock = vi.fn();
const routeSetProjectChatWindowChatIdMock = vi.fn();
const addTemporaryNotificationMock = vi.fn();

vi.mock("openapi/http", () => ({
  createWindowSpace: (...args: unknown[]) =>
    routeCreateWindowSpaceMock(...args),
  deleteWindowSpace: (...args: unknown[]) =>
    routeDeleteWindowSpaceMock(...args),
  setWindowSpaceSortOrder: (...args: unknown[]) =>
    routeSetWindowSpaceSortOrderMock(...args),
  setWindowSpaceName: (...args: unknown[]) =>
    routeSetWindowSpaceNameMock(...args),
  setProjectChatWindowingState: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
  setProjectChatWindowChatId: (...args: unknown[]) =>
    routeSetProjectChatWindowChatIdMock(...args),
  setSectionName: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: (...args: unknown[]) =>
    addTemporaryNotificationMock(...args),
}));

import {
  createWindowSpaceFromCurrentFloatingWindows,
  deleteWindowSpace,
  persistWindowSpaceSortOrder,
  restoreWindowSpaceInWorkspace,
  setWindowSpaceName,
} from "./windowSpaces";

async function flushOptimisticMutation(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function setDeploymentSharePolicy({
  allowLayoutChanges,
  allowLLM,
}: {
  allowLayoutChanges: boolean;
  allowLLM: boolean;
}) {
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: "share-session-1",
    sessionRunCount: 0,
    sharePolicy: {
      allowLLM,
      allowLayoutChanges,
      allowParamChanges: false,
      allowVariantChanges: false,
      allowRun: false,
      allowMultipleRuns: false,
    },
    shareDeploymentName: "deployment",
    shareDeploymentVersion: "v1",
    deploymentMode: "share",
  });
}

describe("window-space share policy gating", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
  });

  it("skips save when deployment policy disallows layout changes", async () => {
    setDeploymentSharePolicy({
      allowLayoutChanges: false,
      allowLLM: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-window"],
        instancesById: {
          "floating-window": {
            instanceId: "floating-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            chatId: "chat-live",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            bounds: {
              x: 120,
              y: 80,
              width: 420,
              height: 320,
            },
          },
        },
      }),
    });
    const previousProjectConfig = structuredClone(
      useProjectState.getState().projectConfig,
    );
    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    await expect(createWindowSpaceFromCurrentFloatingWindows()).resolves.toBe(
      null,
    );
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(routeCreateWindowSpaceMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig).toEqual(
      previousProjectConfig,
    );
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
  });

  it("skips rename, delete, and reorder when deployment policy disallows layout changes", async () => {
    setDeploymentSharePolicy({
      allowLayoutChanges: false,
      allowLLM: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    const previousWindowSpaces = structuredClone(
      useProjectState.getState().projectConfig.windowSpaces,
    );
    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    deleteWindowSpace("project-id", "beta-id");
    persistWindowSpaceSortOrder("project-id", ["beta-id", "alpha-id"]);
    await flushOptimisticMutation();
    expect(routeSetWindowSpaceNameMock).not.toHaveBeenCalled();
    expect(routeDeleteWindowSpaceMock).not.toHaveBeenCalled();
    expect(routeSetWindowSpaceSortOrderMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      previousWindowSpaces,
    );
  });

  it("blocks restore before layout mutation when saved thread rebinding needs disallowed LLM access", async () => {
    setDeploymentSharePolicy({
      allowLayoutChanges: true,
      allowLLM: false,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Saved Research",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-restored",
                zIndex: 3,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          }),
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Live Chat",
            chatId: "chat-live",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 120,
              y: 100,
              width: 320,
              height: 220,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Cannot restore this window space because deployment policy disallows restoring saved chat threads.",
      NotificationTypeEnum.error,
    );
  });
});
