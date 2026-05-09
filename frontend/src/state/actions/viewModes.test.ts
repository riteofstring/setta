import { usePendingOperations, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingleConfig,
  createViewMode,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";
import { deleteViewMode, persistViewModeSortOrder } from "./viewModes";
const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);
const routeDeleteViewModeMock = vi.fn();
const routeSetViewModeSortOrderMock = vi.fn();
vi.mock("openapi/http", () => ({
  deleteViewMode: (...args: unknown[]) => routeDeleteViewModeMock(...args),
  setViewModeSortOrder: (...args: unknown[]) =>
    routeSetViewModeSortOrderMock(...args),
}));
vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
  };
});
function createStateWithViewModes() {
  const alphaId = "alpha-id";
  const betaId = "beta-id";
  const gammaId = "gamma-id";
  return createProjectConfig({
    id: "project-id",
    name: "demo",
    activeViewModeId: alphaId,
    topLevelSections: {
      "section-1": { position: { x: 10, y: 20 } },
    },
    viewport: { x: 1, y: 2, zoom: 3 },
    viewportInitialized: true,
    viewModes: {
      [alphaId]: createViewMode({
        id: alphaId,
        name: "Alpha",
        sortIndex: 0,
        isUserFacing: false,
        isTab: true,
        visibilityBySectionId: {},
        viewport: { x: 1, y: 2, zoom: 3 },
        viewportInitialized: true,
        topLevelSections: {
          "section-1": { position: { x: 10, y: 20 } },
        },
      }),
      [betaId]: createViewMode({
        id: betaId,
        name: "Beta",
        sortIndex: 1,
        isUserFacing: false,
        isTab: true,
        visibilityBySectionId: {},
        viewport: { x: 4, y: 5, zoom: 6 },
        viewportInitialized: false,
        topLevelSections: {},
      }),
      [gammaId]: createViewMode({
        id: gammaId,
        name: "Gamma",
        sortIndex: 2,
        isUserFacing: false,
        isTab: false,
        visibilityBySectionId: {},
        viewport: { x: 7, y: 8, zoom: 9 },
        viewportInitialized: false,
        topLevelSections: {},
      }),
    },
  });
}
async function flushOptimisticMutation(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
describe("view mode canonical mutations", () => {
  beforeEach(() => {
    resetProjectStores();
    routeDeleteViewModeMock.mockReset();
    routeSetViewModeSortOrderMock.mockReset();
    callOpenAPIMock.mockClear();
    usePendingOperations.setState({ pending: [] });
  });
  it("waits for the backend project config when reordering view modes", async () => {
    useProjectState.setState({
      projectConfig: createStateWithViewModes(),
    });
    routeSetViewModeSortOrderMock.mockResolvedValue({
      data: {
        projectConfig: createProjectConfig({
          ...createStateWithViewModes(),
          viewModes: {
            "alpha-id": createViewMode({
              ...createStateWithViewModes().viewModes["alpha-id"],
              sortIndex: 1,
            }),
            "beta-id": createViewMode({
              ...createStateWithViewModes().viewModes["beta-id"],
              sortIndex: 2,
            }),
            "gamma-id": createViewMode({
              ...createStateWithViewModes().viewModes["gamma-id"],
              sortIndex: 0,
            }),
          },
        }),
      },
      status: 200,
      hasResponse: true,
    });
    persistViewModeSortOrder("project-id", ["gamma-id", "alpha-id", "beta-id"]);
    expect(
      useProjectState.getState().projectConfig.viewModes["alpha-id"]?.sortIndex,
    ).toBe(0);
    expect(
      useProjectState.getState().projectConfig.viewModes["gamma-id"]?.sortIndex,
    ).toBe(2);
    await flushOptimisticMutation();
    expect(routeSetViewModeSortOrderMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-id",
        orderedViewModeIds: ["gamma-id", "alpha-id", "beta-id"],
        frontendOpId: expect.any(String),
      },
    });
    expect(
      useProjectState.getState().projectConfig.viewModes["gamma-id"]?.sortIndex,
    ).toBe(0);
    expect(
      useProjectState.getState().projectConfig.viewModes["alpha-id"]?.sortIndex,
    ).toBe(1);
    expect(
      useProjectState.getState().projectConfig.viewModes["beta-id"]?.sortIndex,
    ).toBe(2);
  });
  it("adopts the backend-selected fallback when deleting the active view mode", async () => {
    useProjectState.setState({
      projectConfig: createStateWithViewModes(),
    });
    routeDeleteViewModeMock.mockResolvedValue({
      data: {
        projectConfig: createProjectConfig({
          ...createStateWithViewModes(),
          activeViewModeId: "beta-id",
          topLevelSections: {
            "section-1": { position: { x: 10, y: 20 } },
          },
          viewport: { x: 4, y: 5, zoom: 6 },
          viewportInitialized: false,
          viewModes: {
            "beta-id": createViewMode({
              ...createStateWithViewModes().viewModes["beta-id"],
              topLevelSections: {
                "section-1": { position: { x: 10, y: 20 } },
              },
              sortIndex: 0,
            }),
            "gamma-id": createViewMode({
              ...createStateWithViewModes().viewModes["gamma-id"],
              sortIndex: 1,
            }),
          },
        }),
      },
      status: 200,
      hasResponse: true,
    });
    deleteViewMode("project-id", "alpha-id");
    expect(useProjectState.getState().projectConfig.activeViewModeId).toBe(
      "alpha-id",
    );
    await flushOptimisticMutation();
    expect(routeDeleteViewModeMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-id",
        viewModeId: "alpha-id",
        frontendOpId: expect.any(String),
      },
    });
    const projectConfig = useProjectState.getState().projectConfig;
    expect(projectConfig.activeViewModeId).toBe("beta-id");
    expect(projectConfig.viewModes["alpha-id"]).toBeUndefined();
    expect(projectConfig.topLevelSections).toEqual({
      "section-1": { position: { x: 10, y: 20 } },
    });
    expect(projectConfig.viewport).toEqual({ x: 4, y: 5, zoom: 6 });
    expect(projectConfig.viewportInitialized).toBe(false);
  });
  it("preserves newer unrelated backend project config fields after an acknowledged reorder", async () => {
    useProjectState.setState({
      projectConfig: createStateWithViewModes(),
    });
    routeSetViewModeSortOrderMock.mockResolvedValue({
      data: {
        projectConfig: createProjectConfig({
          ...createStateWithViewModes(),
          viewModes: {
            "alpha-id": createViewMode({
              ...createStateWithViewModes().viewModes["alpha-id"],
              sortIndex: 1,
            }),
            "beta-id": createViewMode({
              ...createStateWithViewModes().viewModes["beta-id"],
              sortIndex: 2,
            }),
            "gamma-id": createViewMode({
              ...createStateWithViewModes().viewModes["gamma-id"],
              sortIndex: 0,
            }),
          },
        }),
      },
      status: 200,
      hasResponse: true,
    });
    persistViewModeSortOrder("project-id", ["gamma-id", "alpha-id", "beta-id"]);
    await flushOptimisticMutation();
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        pluginData: {
          ...useProjectState.getState().pluginData,
          "setta-watch-code": {
            baselineByPath: {},
            enabled: true,
            files: [],
            folders: [],
            registry: {},
          },
        },
        projectConfig: createProjectConfig({
          ...useProjectState.getState().projectConfig,
        }),
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });
    const state = useProjectState.getState();
    const projectConfig = state.projectConfig;
    expect(state.pluginData["setta-watch-code"]?.enabled).toBe(true);
    expect(projectConfig.viewModes["gamma-id"]?.sortIndex).toBe(0);
    expect(projectConfig.viewModes["alpha-id"]?.sortIndex).toBe(1);
    expect(projectConfig.viewModes["beta-id"]?.sortIndex).toBe(2);
  });
  it("rolls back a rejected delete without changing the current project config", async () => {
    useProjectState.setState({
      projectConfig: createStateWithViewModes(),
    });
    routeDeleteViewModeMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });
    deleteViewMode("project-id", "alpha-id");
    await flushOptimisticMutation();
    const projectConfig = useProjectState.getState().projectConfig;
    expect(projectConfig.activeViewModeId).toBe("alpha-id");
    expect(Object.keys(projectConfig.viewModes)).toEqual([
      "alpha-id",
      "beta-id",
      "gamma-id",
    ]);
  });
});
