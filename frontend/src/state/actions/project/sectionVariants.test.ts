import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSingletonSections,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteJSONSourceFileAndVariantAndRefreshProjectState,
  deleteSectionVariantOrAskAndRefreshProjectState,
} from "./sectionVariants";

vi.mock("utils/generatedEndpoints", () => ({
  route_delete_json_source_file_and_variant: vi.fn(),
  route_delete_section_variant_or_ask: vi.fn(),
  route_get_latest_project_state: vi.fn(),
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
}

describe("section variant delete hydrate actions", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("returns the filepath and skips rehydration when deleteSectionVariantOrAsk needs confirmation", async () => {
    const {
      route_delete_section_variant_or_ask,
      route_get_latest_project_state,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_delete_section_variant_or_ask).mockResolvedValue({
      status: 200,
      data: "/tmp/workspace/data/source.json",
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAskAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
    });

    expect(filepath).toBe("/tmp/workspace/data/source.json");
    expect(route_get_latest_project_state).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("rehydrates project state after a direct non-json variant delete", async () => {
    const {
      route_delete_section_variant_or_ask,
      route_get_latest_project_state,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    const latestProjectState = latestProjectStateFixture();
    vi.mocked(route_delete_section_variant_or_ask).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAskAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "plain-section",
      variantId: "plain-variant-b",
    });

    expect(filepath).toBeNull();
    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("does not rehydrate when deleteSectionVariantOrAsk fails", async () => {
    const {
      route_delete_section_variant_or_ask,
      route_get_latest_project_state,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_delete_section_variant_or_ask).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAskAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "plain-section",
      variantId: "plain-variant-b",
    });

    expect(filepath).toBeNull();
    expect(route_get_latest_project_state).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("rehydrates project state after deleting a json-source file and variant", async () => {
    const {
      route_delete_json_source_file_and_variant,
      route_get_latest_project_state,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    const latestProjectState = latestProjectStateFixture();
    vi.mocked(route_delete_json_source_file_and_variant).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    const updated = await deleteJSONSourceFileAndVariantAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });

    expect(updated).toBe(true);
    expect(route_delete_json_source_file_and_variant).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });
    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("does not rehydrate when deleteJsonSourceFileAndVariant fails", async () => {
    const {
      route_delete_json_source_file_and_variant,
      route_get_latest_project_state,
    } = await import("utils/generatedEndpoints");
    const { processProjectStateUpdateFromBackend } = await import(
      "state/actions/sectionInfos"
    );

    vi.mocked(route_delete_json_source_file_and_variant).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await deleteJSONSourceFileAndVariantAndRefreshProjectState({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });

    expect(updated).toBe(false);
    expect(route_get_latest_project_state).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
});
