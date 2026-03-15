import {
  moveParamsWithBackend,
  moveSelectedParamsDown,
} from "state/actions/params/moveParams";
import { applyParamMove } from "state/actions/params/paramMoveMutations";
import {
  buildVisibleParamIdSet,
  buildVisibleSelectionGroups,
  orderParamIdsByParent,
  resolveSectionWithSelectedParams,
} from "state/actions/params/paramMoveQueries";
import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionEffectiveImpls";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_move_param_groups,
  route_move_params,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultDictSectionImpl,
  createVariant,
  isBaseParentCodeObjImpl,
  ParameterPassingStyleEnum,
  ParamNameTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_move_param_groups: vi.fn(async () => ({
      data: undefined,
      status: 200,
      hasResponse: true,
    })),
    route_move_params: vi.fn(async () => ({
      data: undefined,
      status: 200,
      hasResponse: true,
    })),
  };
});

type ParamNodeSpec = {
  children?: Array<string>;
  id: string;
  kind: "leaf" | "nested";
  name?: string;
};

type ParamSectionBundle = {
  codeObjImpls: ZustandProjectState["codeObjImpls"];
  codeObjs: ZustandProjectState["codeObjs"];
  codeObjVariants: ZustandProjectState["codeObjVariants"];
  rootId: string;
  sectionId: string;
  sectionImpls: ZustandProjectState["sectionImpls"];
  sectionVariantId: string;
  sectionVariants: ZustandProjectState["sectionVariants"];
  sections: ZustandProjectState["sections"];
  shownParamIds: ZustandProjectState["shownParamIds"];
};

function createNestedParamImpl(implId: string, node: ParamNodeSpec) {
  return {
    type: CodeObjTypeEnum.NestedParam,
    id: implId,
    name: node.name ?? node.id,
    description: "",
    isPreset: false,
    children: [...(node.children ?? [])],
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: false,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    typeAnnotation: "",
  };
}

function createParamSectionBundle({
  sectionId,
  selectedParams = [],
  edgeInputParams = [],
  nodes = [
    {
      id: "root-param",
      kind: "nested",
      children: ["param-a", "param-b", "param-c"],
    },
    { id: "param-a", kind: "leaf" },
    { id: "param-b", kind: "leaf" },
    { id: "param-c", kind: "leaf" },
  ],
  rootId = "root-param",
  visibleParamIds,
}: {
  edgeInputParams?: Array<string>;
  nodes?: Array<ParamNodeSpec>;
  rootId?: string;
  sectionId: string;
  selectedParams?: Array<string>;
  visibleParamIds?: Array<string>;
}): ParamSectionBundle {
  const rootNode = nodes.find((node) => node.id === rootId);
  if (!rootNode || rootNode.kind !== "nested") {
    throw new Error(`Section ${sectionId} is missing nested root ${rootId}.`);
  }

  const sectionVariantId = `${sectionId}-variant`;
  const sectionImplId = `${sectionId}-impl`;
  const visibleIds =
    visibleParamIds ??
    nodes.filter((node) => node.id !== rootId).map((node) => node.id);
  const topLevelVisibleParamIds = (rootNode.children ?? []).filter((id) =>
    visibleIds.includes(id),
  );

  const codeObjs: ZustandProjectState["codeObjs"] = {};
  const codeObjImpls: ZustandProjectState["codeObjImpls"] = {};
  const codeObjVariants: ZustandProjectState["codeObjVariants"] = {};
  const codeObjVariantMap: Record<string, string> = {};

  for (const node of nodes) {
    const variantId = `${sectionId}-${node.id}-variant`;
    const implId = `${sectionId}-${node.id}-impl`;
    codeObjVariantMap[node.id] = variantId;
    codeObjs[node.id] = createCore({
      id: node.id,
      name: node.name ?? node.id,
      variants: [variantId],
      defaultVariant: variantId,
      sharedModifier: {},
      unsharedKeys: [],
    });
    codeObjVariants[variantId] = createVariant({
      id: variantId,
      name: `${node.id} variant`,
      impl: implId,
      nonPresetImpls: [],
    });
    codeObjImpls[implId] =
      node.kind === "nested"
        ? createNestedParamImpl(implId, node)
        : createCodeParamCodeObjImpl(createUserDefaultCodeParamCodeObjImpl(), {
            id: implId,
            name: node.name ?? node.id,
          });
  }

  return {
    rootId,
    sectionId,
    sectionVariantId,
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: `${sectionId} section`,
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    },
    sectionImpls: {
      [sectionImplId]: createDictSectionImpl(
        createUserDefaultDictSectionImpl(),
        {
          id: sectionImplId,
          topLevelParamId: rootId,
          codeObjVariantMap,
          selectedParams,
          edgeInputParams,
        },
      ),
    },
    sectionVariants: {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        name: `${sectionId} variant`,
        impl: sectionImplId,
        nonPresetImpls: [],
      }),
    },
    codeObjs,
    codeObjImpls,
    codeObjVariants,
    shownParamIds: {
      [sectionVariantId]: {
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        unpinned: {
          requiredParamIdsToPaths: Object.fromEntries(
            visibleIds.map((id) => [id, [id]]),
          ),
          topLevelParamIds: topLevelVisibleParamIds,
        },
      },
    },
  };
}

function createProjectState(
  bundles: Array<ParamSectionBundle>,
): ZustandProjectState {
  const sections: ZustandProjectState["sections"] = {};
  const sectionImpls: ZustandProjectState["sectionImpls"] = {};
  const sectionVariants: ZustandProjectState["sectionVariants"] = {};
  const codeObjs: ZustandProjectState["codeObjs"] = {};
  const codeObjImpls: ZustandProjectState["codeObjImpls"] = {};
  const codeObjVariants: ZustandProjectState["codeObjVariants"] = {};
  const shownParamIds: ZustandProjectState["shownParamIds"] = {};
  const sectionVariantMap: Record<string, string> = {};
  const parentSectionMap: Record<string, string | null> = {};

  for (const bundle of bundles) {
    Object.assign(sections, bundle.sections);
    Object.assign(sectionImpls, bundle.sectionImpls);
    Object.assign(sectionVariants, bundle.sectionVariants);
    Object.assign(codeObjs, bundle.codeObjs);
    Object.assign(codeObjImpls, bundle.codeObjImpls);
    Object.assign(codeObjVariants, bundle.codeObjVariants);
    Object.assign(shownParamIds, bundle.shownParamIds);
    sectionVariantMap[bundle.sectionId] = bundle.sectionVariantId;
    parentSectionMap[bundle.sectionId] = null;
  }

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap,
    }),
    sections,
    sectionImpls,
    sectionVariants,
    codeObjs,
    codeObjImpls,
    codeObjVariants,
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap,
    shownParamIds,
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;
}

function seedProjectState(
  bundles: Array<ParamSectionBundle>,
): ZustandProjectState {
  const state = createProjectState(bundles);
  useProjectState.setState(state);
  return state;
}

describe("moveParams feature split", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("orders moved param ids by the parent's current child order", () => {
    // Drag/drop reorder should preserve the parent's canonical child ordering.
    const bundle = createParamSectionBundle({ sectionId: "section-order" });
    const state = createProjectState([bundle]);

    expect(
      orderParamIdsByParent(state, bundle.sectionId, bundle.rootId, [
        "param-c",
        "param-a",
      ]),
    ).toEqual(["param-a", "param-c"]);
  });

  it("groups contiguous visible selections without merging separated siblings", () => {
    // Keyboard moves operate on contiguous visible groups rather than each param independently.
    expect(
      buildVisibleSelectionGroups(
        ["param-a", "param-b", "param-c", "param-d", "param-e"],
        new Set(["param-a", "param-b", "param-d"]),
      ),
    ).toEqual([["param-a", "param-b"], ["param-d"]]);
  });

  it("prefers the active section when multiple sections have selected params", () => {
    // Param commands should target the active section first instead of whichever section is visited first.
    const primary = createParamSectionBundle({
      sectionId: "section-primary",
      selectedParams: ["param-a"],
    });
    const secondary = createParamSectionBundle({
      sectionId: "section-secondary",
      selectedParams: ["param-b"],
    });
    const state = createProjectState([primary, secondary]);

    useActiveSectionUI.setState({ activeIds: ["section-secondary"] });

    expect(resolveSectionWithSelectedParams(state)).toBe("section-secondary");
  });

  it("filters edge-input params out of the visible param id set", () => {
    // Hidden edge-input params should never participate in keyboard moves.
    const bundle = createParamSectionBundle({
      sectionId: "section-visible",
      nodes: [
        {
          id: "root-param",
          kind: "nested",
          children: ["param-a", "param-edge", "param-b"],
        },
        { id: "param-a", kind: "leaf" },
        { id: "param-edge", kind: "leaf" },
        { id: "param-b", kind: "leaf" },
      ],
      edgeInputParams: ["param-edge"],
      visibleParamIds: ["param-a", "param-edge", "param-b"],
    });
    const state = createProjectState([bundle]);

    expect([...buildVisibleParamIdSet(state, bundle.sectionId)]).toEqual([
      "param-a",
      "param-b",
    ]);
  });

  it("reorders siblings and keeps shown top-level order in sync", () => {
    // Local optimistic moves should keep both the root children and shown-param order aligned.
    const bundle = createParamSectionBundle({ sectionId: "section-reorder" });
    const state = createProjectState([bundle]);

    applyParamMove(state, bundle.sectionId, {
      paramIds: ["param-c"],
      newParentId: bundle.rootId,
      newIndex: 1,
    });

    expect(
      getCurrEffectiveCodeObjImpl(state, bundle.sectionId, bundle.rootId),
    ).toMatchObject({
      children: ["param-a", "param-c", "param-b"],
    });
    expect(
      state.shownParamIds[bundle.sectionVariantId]?.unpinned.topLevelParamIds,
    ).toEqual(["param-a", "param-c", "param-b"]);
  });

  it("promotes a leaf target to a nested parent when reparents move into it", () => {
    // Reparenting into a leaf param should upgrade that param into a nested parent before inserting children.
    const bundle = createParamSectionBundle({ sectionId: "section-reparent" });
    const state = createProjectState([bundle]);

    applyParamMove(state, bundle.sectionId, {
      paramIds: ["param-a"],
      newParentId: "param-c",
      newIndex: 0,
    });

    expect(
      getCurrEffectiveCodeObjImpl(state, bundle.sectionId, bundle.rootId),
    ).toMatchObject({
      children: ["param-b", "param-c"],
    });
    const nextParent = getCurrEffectiveCodeObjImpl(
      state,
      bundle.sectionId,
      "param-c",
    );
    expect(isBaseParentCodeObjImpl(nextParent)).toBe(true);
    if (!isBaseParentCodeObjImpl(nextParent)) {
      throw new Error("Expected param-c to become a nested parent.");
    }
    expect(nextParent.children).toEqual(["param-a"]);
    expect(
      state.shownParamIds[bundle.sectionVariantId]?.unpinned.topLevelParamIds,
    ).toEqual(["param-b", "param-c"]);
  });

  it("applies optimistic single-param moves before sending the backend request", () => {
    // Direct drag/drop moves should update local state immediately and send the exact backend payload.
    const bundle = createParamSectionBundle({
      sectionId: "section-single-move",
    });
    seedProjectState([bundle]);

    moveParamsWithBackend({
      sectionId: bundle.sectionId,
      paramIds: ["param-c"],
      newParentId: bundle.rootId,
      newIndex: 0,
    });

    expect(route_move_params).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: bundle.sectionId,
      paramIds: ["param-c"],
      newParentId: bundle.rootId,
      newIndex: 0,
      frontendOpId: expect.any(String),
    });
    expect(
      getCurrEffectiveCodeObjImpl(
        useProjectState.getState(),
        bundle.sectionId,
        bundle.rootId,
      ),
    ).toMatchObject({
      children: ["param-c", "param-a", "param-b"],
    });
  });

  it("builds grouped keyboard moves from the visible sibling order", () => {
    // Keyboard move-down should move the entire contiguous selected group as one backend operation.
    const bundle = createParamSectionBundle({
      sectionId: "section-keyboard",
      selectedParams: ["param-a", "param-b"],
    });
    seedProjectState([bundle]);
    useActiveSectionUI.setState({ activeIds: [bundle.sectionId] });

    expect(moveSelectedParamsDown()).toBe(true);
    expect(route_move_param_groups).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: bundle.sectionId,
      moves: [
        {
          paramIds: ["param-a", "param-b"],
          newParentId: bundle.rootId,
          newIndex: 1,
        },
      ],
      frontendOpId: expect.any(String),
    });
    expect(
      getCurrEffectiveCodeObjImpl(
        useProjectState.getState(),
        bundle.sectionId,
        bundle.rootId,
      ),
    ).toMatchObject({
      children: ["param-c", "param-a", "param-b"],
    });
  });
});
