import {
  useAllProjectMetadata,
  useMisc,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createWindowSpaceConfig,
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
  });

  it("throws when loaded project config is missing window spaces", async () => {
    const invalidProjectState: ProjectStateSingleConfigInput = {
      projectConfig: {
        id: "project-invalid",
        name: "Invalid Project",
      },
    };

    await expect(loadProjectState(invalidProjectState)).rejects.toThrow(
      "projectConfig.windowSpaces",
    );
  });

  it("throws when loaded project state is missing project chat windowing", async () => {
    const invalidProjectState: ProjectStateSingleConfigInput = {
      projectConfig: createProjectConfig({
        id: "project-missing-windowing",
        name: "Missing Windowing",
      }),
    };

    await expect(loadProjectState(invalidProjectState)).rejects.toThrow(
      "projectChatWindowing",
    );
  });

  it("keeps backend project chat windowing authoritative on load", async () => {
    const backendProjectState: ProjectStateSingleConfigInput = {
      projectConfig: createProjectConfig({
        id: "project-restore",
        name: "Restore Project",
        windowSpaces: {
          "window-space-1": createWindowSpaceConfig({
            id: "window-space-1",
            name: "Saved Layout",
            windowsById: {},
            order: [],
          }),
        },
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
      "project-chat-window-1",
    ]);
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-1"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Docked Chat",
    });
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      backendProjectState.projectConfig.windowSpaces,
    );
  });

  it("prunes stale git graph ephemeral state on full project load", async () => {
    // Seed leftovers from an earlier project so the load path has to reconcile
    // them against the incoming authoritative window model.
    useMisc.setState({
      projectChatTrackedGitPaneGraphWindowInstanceId: "project-chat-window-1",
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        "project-chat-window-1": true,
        "stale-window": true,
      },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-prune",
        name: "Project Prune",
      }),
      projectChatWindowing: createProjectChatWindowingState(),
    });

    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBeNull();
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
  });

  it("keeps the active maximized git graph window when full project load reuses its id", async () => {
    // A matching maximized git graph window should survive reconciliation while
    // unrelated embedded-pane visibility entries are still pruned.
    useMisc.setState({
      projectChatTrackedGitPaneGraphWindowInstanceId: "project-chat-window-1",
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        "project-chat-window-1": true,
        "stale-window": true,
      },
    });

    await loadProjectState({
      projectConfig: createProjectConfig({
        id: "project-keep",
        name: "Project Keep",
      }),
      projectChatWindowing: createProjectChatWindowingState({
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            mode: ChatWindowModeEnum.git_graph_mode,
            placement: ChatWindowPlacementEnum.maximized,
            isClosed: false,
            isMinimized: false,
          }),
        },
        order: ["project-chat-window-1"],
        nextInstanceNumber: 2,
      }),
    });

    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBe("project-chat-window-1");
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      "project-chat-window-1": true,
    });
  });
});
