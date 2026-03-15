import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useAllProjectMetadata } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import {
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createUserDefaultDictSectionImpl,
  createVariant,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  debouncedDispatchViewportUpdate,
  deleteAllActiveSections,
  groupActiveSections,
  toggleParamSelected,
  ungroupActiveGroups,
  unselectAllParams,
  updateAllProjectMetadata,
} from "./projectStateCommands";
import { getCurrEffectiveSectionImplWithTypeGuard } from "./sectionInfos";

vi.mock("forks/xyflow/core/hooks/useViewportHelper", async () => {
  const actual = await vi.importActual<
    typeof import("forks/xyflow/core/hooks/useViewportHelper")
  >("forks/xyflow/core/hooks/useViewportHelper");
  return {
    ...actual,
    getViewport: vi.fn(),
  };
});

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_delete_sections: vi.fn(),
    route_group_sections: vi.fn(),
    route_set_viewport: vi.fn(),
    route_toggle_param_selected: vi.fn(),
    route_ungroup_groups: vi.fn(),
    route_unselect_all_params: vi.fn(),
  };
});

const applyActiveSectionChangeMock = vi.fn();
vi.mock("./activeSectionController", () => ({
  applyActiveSectionChange: (...args: unknown[]) =>
    applyActiveSectionChangeMock(...args),
}));

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const paramInfoId = "param-1";

function seedSection(selectedParams: string[] = []) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: { [sectionId]: variantId },
      viewport: null,
      viewportInitialized: false,
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Dict",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: "Code Variant",
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [implId]: createDictSectionImpl(createUserDefaultDictSectionImpl(), {
        id: implId,
        selectedParams,
      }),
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
}

describe("projectStateCommands", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
    vi.useRealTimers();
  });

  it("deletes active sections when the share session allows edits", async () => {
    const { route_delete_sections } = await import("utils/generatedEndpoints");
    seedSection();
    useActiveSectionUI.setState({ activeIds: [sectionId] });

    deleteAllActiveSections();

    expect(route_delete_sections).toHaveBeenCalledWith({
      projectConfigId: projectConfigId,
      sectionIds: [sectionId],
    });
  });

  it("groups active sections and clears selection dims", async () => {
    const { route_group_sections } = await import("utils/generatedEndpoints");
    seedSection();
    useActiveSectionUI.setState({ activeIds: [sectionId] });
    useReactFlow.setState({ nodesSelectionDims: { x: 1, y: 2 } });

    await groupActiveSections();

    expect(route_group_sections).toHaveBeenCalledWith({
      projectConfigId: projectConfigId,
      sectionIds: [sectionId],
    });
    expect(useReactFlow.getState().nodesSelectionDims).toBeNull();
  });

  it("ungroups active groups when the share session allows edits", async () => {
    const { route_ungroup_groups } = await import("utils/generatedEndpoints");
    seedSection();
    useActiveSectionUI.setState({ activeIds: [sectionId] });

    await ungroupActiveGroups();

    expect(route_ungroup_groups).toHaveBeenCalledWith({
      projectConfigId: projectConfigId,
      groupIds: [sectionId],
    });
  });

  it("toggles param selection and records the active-section interaction", async () => {
    const { route_toggle_param_selected } = await import(
      "utils/generatedEndpoints"
    );
    seedSection();

    toggleParamSelected(sectionId, paramInfoId);

    expect(
      getCurrEffectiveSectionImplWithTypeGuard(
        useProjectState.getState(),
        sectionId,
        isBaseSectionWithParamsImpl,
      ).selectedParams,
    ).toEqual([paramInfoId]);
    expect(route_toggle_param_selected).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId,
        sectionId,
        paramInfoId,
      }),
    );
    expect(applyActiveSectionChangeMock).toHaveBeenCalledWith({
      interaction: "param-select",
      sectionId,
      hasSelectedParams: true,
    });
  });

  it("clears selected params only when the section currently has selections", async () => {
    const { route_unselect_all_params } = await import(
      "utils/generatedEndpoints"
    );
    seedSection([paramInfoId]);

    expect(unselectAllParams()).toBe(true);
    expect(
      getCurrEffectiveSectionImplWithTypeGuard(
        useProjectState.getState(),
        sectionId,
        isBaseSectionWithParamsImpl,
      ).selectedParams,
    ).toEqual([]);
    expect(route_unselect_all_params).toHaveBeenCalledWith(
      expect.objectContaining({ projectConfigId }),
    );

    vi.mocked(route_unselect_all_params).mockClear();
    expect(unselectAllParams()).toBe(false);
    expect(route_unselect_all_params).not.toHaveBeenCalled();
  });

  it("updates all-project metadata through the dedicated session store", () => {
    updateAllProjectMetadata({
      defaultProjectConfigId: projectConfigId,
      projectMetadata: [],
    });

    expect(useAllProjectMetadata.getState()).toMatchObject({
      defaultProjectConfigId: projectConfigId,
      projectMetadata: [],
    });
  });

  it("debounces viewport writes and persists the latest viewport", async () => {
    const { route_set_viewport } = await import("utils/generatedEndpoints");
    seedSection();
    vi.useFakeTimers();
    vi.mocked(getViewport).mockReturnValue({ x: 10, y: 20, zoom: 2 });
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    debouncedDispatchViewportUpdate();
    vi.runAllTimers();

    expect(route_set_viewport).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId,
        viewport: { x: 10, y: 20, zoom: 2 },
      }),
    );
  });
});
