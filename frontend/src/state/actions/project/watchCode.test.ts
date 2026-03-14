import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingletonSections,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setWatchCodeEnabledAndRefreshProjectState,
  setWatchCodeInputsAndRefreshProjectState,
} from "./watchCode";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_latest_project_state: vi.fn(),
  route_set_watch_code_enabled: vi.fn(),
  route_set_watch_code_inputs: vi.fn(),
}));

vi.mock("state/actions/sectionInfos", () => ({
  processProjectStateUpdateFromBackend: vi.fn(),
}));

function latestProjectStateFixture(): ProjectStateSingleConfigWithCompletedOpIds {
  return {
    projectState: {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectConfig: createProjectConfig({
        id: "project-alpha",
        watchCodeEnabled: true,
        watchCodeFiles: ["pkg/watch_me.py"],
        watchCodeBaselineByPath: {
          "/tmp/workspace/pkg/watch_me.py": ["pkg.watch_me.existing:function"],
        },
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
}

describe("watchCode hydrate actions", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("rehydrates project state after a successful setWatchCodeEnabled mutation", async () => {
    const {
      route_get_latest_project_state,
      route_set_watch_code_enabled,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    const latestProjectState = latestProjectStateFixture();
    vi.mocked(route_set_watch_code_enabled).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    const updated = await setWatchCodeEnabledAndRefreshProjectState({
      projectConfigId: "project-alpha",
      enabled: true,
    });

    expect(updated).toBe(true);
    expect(route_set_watch_code_enabled).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      enabled: true,
    });
    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("does not rehydrate when setWatchCodeEnabled fails", async () => {
    const {
      route_get_latest_project_state,
      route_set_watch_code_enabled,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_set_watch_code_enabled).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeEnabledAndRefreshProjectState({
      projectConfigId: "project-alpha",
      enabled: false,
    });

    expect(updated).toBe(false);
    expect(route_get_latest_project_state).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("rehydrates project state after a successful setWatchCodeInputs mutation", async () => {
    const { route_get_latest_project_state, route_set_watch_code_inputs } =
      await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    const latestProjectState = latestProjectStateFixture();
    vi.mocked(route_set_watch_code_inputs).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    const updated = await setWatchCodeInputsAndRefreshProjectState({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });

    expect(updated).toBe(true);
    expect(route_set_watch_code_inputs).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });
    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("does not apply local state when the hydrate after setWatchCodeInputs fails", async () => {
    const { route_get_latest_project_state, route_set_watch_code_inputs } =
      await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_set_watch_code_inputs).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await setWatchCodeInputsAndRefreshProjectState({
      projectConfigId: "project-alpha",
      watchCodeFolders: [],
      watchCodeFiles: ["pkg/watch_me.py"],
    });

    expect(updated).toBe(false);
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
});
