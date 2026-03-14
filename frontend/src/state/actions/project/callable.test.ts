import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingletonSections,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableAndRefreshProjectState } from "./callable";

vi.mock("utils/generatedEndpoints", () => ({
  route_set_callable: vi.fn(),
  route_get_latest_project_state: vi.fn(),
}));

vi.mock("state/actions/sectionInfos", () => ({
  processProjectStateUpdateFromBackend: vi.fn(),
}));

describe("setCallableAndRefreshProjectState", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("rehydrates project state after a successful setCallable mutation", async () => {
    const { route_set_callable, route_get_latest_project_state } = await import(
      "utils/generatedEndpoints"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    const latestProjectState: ProjectStateSingleConfigWithCompletedOpIds = {
      projectState: {
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        projectConfig: createProjectConfig({
          id: "project-alpha",
          sectionVariantMap: {},
          topLevelSections: {},
          activeIds: [],
        }),
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
      },
      completedOpIds: [],
      pendingOpIds: [],
    };

    vi.mocked(route_set_callable).mockResolvedValue({
      status: 200,
      data: {
        callableId: "callable-1",
        childCodeObjs: [],
        lspStatus: "matched",
      },
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    const updated = await setCallableAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: true,
    });

    expect(updated).toBe(true);
    expect(route_set_callable).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: true,
    });
    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("does not rehydrate when setCallable fails", async () => {
    const { route_set_callable, route_get_latest_project_state } = await import(
      "utils/generatedEndpoints"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_set_callable).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setCallableAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: false,
    });

    expect(updated).toBe(false);
    expect(route_get_latest_project_state).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("does not apply partial local state when the follow-up hydrate fails", async () => {
    const { route_set_callable, route_get_latest_project_state } = await import(
      "utils/generatedEndpoints"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_set_callable).mockResolvedValue({
      status: 200,
      data: {
        callableId: "callable-1",
        childCodeObjs: [],
        lspStatus: "matched",
      },
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setCallableAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "section-1",
      callableName: "sorted",
      refetchParams: false,
    });

    expect(updated).toBe(false);
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
});
