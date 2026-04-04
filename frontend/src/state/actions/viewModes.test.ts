import { usePendingOperations, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingleConfig,
  createViewModeConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeDeleteViewModeMock = vi.fn();
const routeSetViewModeSortOrderMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_delete_view_mode: (...args: unknown[]) =>
    routeDeleteViewModeMock(...args),
  route_set_view_mode_sort_order: (...args: unknown[]) =>
    routeSetViewModeSortOrderMock(...args),
}));

import { processProjectStateUpdateFromBackend } from "./sectionInfos";
import { deleteViewMode, persistViewModeSortOrder } from "./viewModes";

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
      [alphaId]: createViewModeConfig({
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
      [betaId]: createViewModeConfig({
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
      [gammaId]: createViewModeConfig({
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
            "alpha-id": createViewModeConfig({
              ...createStateWithViewModes().viewModes["alpha-id"],
              sortIndex: 1,
            }),
            "beta-id": createViewModeConfig({
              ...createStateWithViewModes().viewModes["beta-id"],
              sortIndex: 2,
            }),
            "gamma-id": createViewModeConfig({
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
            "beta-id": createViewModeConfig({
              ...createStateWithViewModes().viewModes["beta-id"],
              topLevelSections: {
                "section-1": { position: { x: 10, y: 20 } },
              },
              sortIndex: 0,
            }),
            "gamma-id": createViewModeConfig({
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
            "alpha-id": createViewModeConfig({
              ...createStateWithViewModes().viewModes["alpha-id"],
              sortIndex: 1,
            }),
            "beta-id": createViewModeConfig({
              ...createStateWithViewModes().viewModes["beta-id"],
              sortIndex: 2,
            }),
            "gamma-id": createViewModeConfig({
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
        projectConfig: createProjectConfig({
          ...useProjectState.getState().projectConfig,
          watchCodeEnabled: true,
        }),
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });

    const projectConfig = useProjectState.getState().projectConfig;
    expect(projectConfig.watchCodeEnabled).toBe(true);
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
