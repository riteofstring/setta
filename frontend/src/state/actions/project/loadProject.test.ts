import {
  useAllProjectMetadata,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  type ProjectStateSingleConfigInput,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeLoadAllProjectMetadataMock = vi.fn();
const initializeServerModeMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_create_project_config: vi.fn(),
  route_get_latest_lsp_diagnostics: vi.fn(),
  route_load_all_project_metadata: (...args: unknown[]) =>
    routeLoadAllProjectMetadataMock(...args),
  route_load_project_config: vi.fn(),
}));

vi.mock("../serverMode", () => ({
  initializeServerMode: (...args: unknown[]) =>
    initializeServerModeMock(...args),
}));

import { loadAllProjectMetadata, loadProjectState } from "./loadProject";

describe("loadAllProjectMetadata", () => {
  beforeEach(() => {
    resetProjectStores();
    useAllProjectMetadata.setState({
      defaultProjectConfigId: null,
      projectMetadata: [],
    });
    routeLoadAllProjectMetadataMock.mockReset();
    initializeServerModeMock.mockReset();
  });

  it("returns false and skips loading when server mode is not ide", async () => {
    initializeServerModeMock.mockResolvedValue("launcher");

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(false);
    expect(routeLoadAllProjectMetadataMock).not.toHaveBeenCalled();
  });

  it("returns true and updates metadata store after a successful response", async () => {
    const project = createProjectConfig({
      id: "project-1",
      name: "Project One",
    });
    initializeServerModeMock.mockResolvedValue("ide");
    routeLoadAllProjectMetadataMock.mockResolvedValue({
      data: {
        defaultProjectConfigId: project.id,
        projectMetadata: [project],
      },
      status: 200,
      hasResponse: true,
    });

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(true);
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBe(
      project.id,
    );
    expect(useAllProjectMetadata.getState().projectMetadata).toEqual([project]);
  });

  it("returns false when metadata request fails", async () => {
    initializeServerModeMock.mockResolvedValue("ide");
    routeLoadAllProjectMetadataMock.mockResolvedValue({
      data: undefined,
      status: 503,
      hasResponse: true,
    });

    const loaded = await loadAllProjectMetadata();

    expect(loaded).toBe(false);
    expect(useAllProjectMetadata.getState().projectMetadata).toEqual([]);
    expect(useAllProjectMetadata.getState().defaultProjectConfigId).toBeNull();
  });
});

describe("loadProjectState", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({ projectChatWindowingByProjectConfigId: {} });
  });

  it("normalizes legacy project configs that omit window spaces", async () => {
    const legacyProjectState: ProjectStateSingleConfigInput = {
      projectConfig: {
        id: "project-legacy",
        name: "Legacy Project",
      },
    };

    await loadProjectState(legacyProjectState);

    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual({});
  });

  it("rehydrates persisted project chat windowing from local storage", async () => {
    const persistedWindow = createProjectChatWindowInstance({
      instanceId: "project-chat-window-2",
      placement: ChatWindowPlacementEnum.floating,
      title: "Persisted Notes",
      bounds: {
        x: 240,
        y: 160,
        width: 520,
        height: 320,
      },
    });
    useLocalStorage.setState({
      projectChatWindowingByProjectConfigId: {
        "project-restore": createProjectChatWindowingState({
          instancesById: {
            [persistedWindow.instanceId]: persistedWindow,
          },
          order: [persistedWindow.instanceId],
          nextInstanceNumber: 3,
        }),
      },
    });

    const backendProjectState: ProjectStateSingleConfigInput = {
      projectConfig: createProjectConfig({
        id: "project-restore",
        name: "Restore Project",
      }),
      projectChatWindowing: createProjectChatWindowingState({
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.bottom_docked,
            title: "Docked Chat",
          }),
        },
        order: ["project-chat-window-1"],
        nextInstanceNumber: 2,
      }),
    };

    await loadProjectState(backendProjectState);

    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-2",
      "project-chat-window-1",
    ]);
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-2"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Persisted Notes",
    });
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Docked Chat",
    });
    expect(
      useLocalStorage.getState().projectChatWindowingByProjectConfigId[
        "project-restore"
      ]?.order,
    ).toEqual(["project-chat-window-2", "project-chat-window-1"]);
  });
});
