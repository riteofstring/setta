import {
  indentParams,
  moveParamGroups,
  moveParams,
  unindentParams,
} from "openapi/http";
import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  ParameterPassingStyleEnum,
  ParamNameTypeEnum,
  type BaseCodeObjImplUnion,
  type ShownParamIDs,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  indentSelectedParams,
  moveParamsWithBackend,
  moveSelectedParamsDown,
  unindentSelectedParams,
} from "./moveParams";
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    moveParams: vi.fn(),
    moveParamGroups: vi.fn(),
    indentParams: vi.fn(),
    unindentParams: vi.fn(),
  };
});
const mockedRouteMoveParams = vi.mocked(moveParams);
const mockedRouteMoveParamGroups = vi.mocked(moveParamGroups);
const mockedRouteIndentParams = vi.mocked(indentParams);
const mockedRouteUnindentParams = vi.mocked(unindentParams);
const sectionId = "dict-section";
const sectionVariantId = "dict-variant";
const sectionImplId = "dict-impl";
const rootParamId = "root-param";
function createNestedParamImpl(
  id: string,
  children: Array<string>,
): BaseCodeObjImplUnion {
  return {
    type: CodeObjTypeEnum.NestedParam,
    id,
    name: id,
    description: "",
    isPreset: false,
    children,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    typeAnnotation: "",
  };
}
function createShownParamIds(
  rootChildren: Array<string>,
  requiredParamIdsToPaths: Record<string, Array<string>>,
): ShownParamIDs {
  return {
    pinned: {
      requiredParamIdsToPaths: {},
      topLevelParamIds: [],
    },
    unpinned: {
      requiredParamIdsToPaths,
      topLevelParamIds: rootChildren,
    },
  };
}
function seedDictParamState({
  rootChildren,
  selectedParams,
  nestedChildrenByParent = {},
}: {
  rootChildren: Array<string>;
  selectedParams: Array<string>;
  nestedChildrenByParent?: Record<string, Array<string>>;
}) {
  const allIds = new Set<string>([rootParamId, ...rootChildren]);
  for (const [parentId, children] of Object.entries(nestedChildrenByParent)) {
    allIds.add(parentId);
    for (const childId of children) {
      allIds.add(childId);
    }
  }
  const codeObjs: Record<string, ReturnType<typeof createCore>> = {};
  const codeObjVariants: Record<string, ReturnType<typeof createVariant>> = {};
  const codeObjImpls: Record<string, BaseCodeObjImplUnion> = {
    "root-param-impl": createNestedParamImpl("root-param-impl", rootChildren),
  };
  const codeObjVariantMap: Record<string, string> = {
    [rootParamId]: "root-param-variant",
  };
  codeObjs[rootParamId] = createCore({
    id: rootParamId,
    name: "root",
    variants: ["root-param-variant"],
    defaultVariant: "root-param-variant",
  });
  codeObjVariants["root-param-variant"] = createVariant({
    id: "root-param-variant",
    impl: "root-param-impl",
    nonPresetImpls: ["root-param-impl"],
  });
  for (const id of allIds) {
    if (id === rootParamId) {
      continue;
    }
    const variantId = `${id}-variant`;
    const implId = `${id}-impl`;
    codeObjs[id] = createCore({
      id,
      name: id,
      variants: [variantId],
      defaultVariant: variantId,
    });
    codeObjVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
    });
    codeObjVariantMap[id] = variantId;
    const nestedChildren = nestedChildrenByParent[id];
    codeObjImpls[implId] = nestedChildren
      ? createNestedParamImpl(implId, nestedChildren)
      : createCodeParamCodeObjImpl({
          id: implId,
          value: id,
        });
  }
  const requiredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const id of allIds) {
    if (id === rootParamId) {
      continue;
    }
    const path = [id];
    for (const [parentId, children] of Object.entries(nestedChildrenByParent)) {
      if (children.includes(id)) {
        path.unshift(parentId);
      }
    }
    requiredParamIdsToPaths[id] = path;
  }
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Dict",
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    };
    state.sectionVariants = {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        impl: sectionImplId,
        nonPresetImpls: [sectionImplId],
      }),
    };
    state.sectionImpls = {
      [sectionImplId]: createDictSectionImpl({
        id: sectionImplId,
        topLevelParamId: rootParamId,
        selectedParams,
        edgeInputParams: [],
        pinnedParams: [],
        paramFilter: "",
        codeObjVariantMap,
      }),
    };
    state.codeObjs = codeObjs;
    state.codeObjVariants = codeObjVariants;
    state.codeObjImpls = codeObjImpls;
    state.artifactGroups = {};
    state.singletonSections = createSingletonSections();
    state.parentSectionMap = { [sectionId]: null };
    state.shownParamIds = {
      [sectionVariantId]: createShownParamIds(
        rootChildren,
        requiredParamIdsToPaths,
      ),
    };
    state.previewSectionVariantMap = {};
    state.requiredDecodedImages = [];
  });
}
describe("moveParams", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    mockedRouteMoveParams.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteMoveParamGroups.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteIndentParams.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteUnindentParams.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
  });
  afterEach(() => {
    resetProjectStores();
  });
  it("posts moveParams with the canonical payload and applies the optimistic reorder", () => {
    seedDictParamState({
      rootChildren: ["param-a", "param-b"],
      selectedParams: [],
    });
    moveParamsWithBackend({
      sectionId,
      paramIds: ["param-b"],
      newParentId: rootParamId,
      newIndex: 0,
    });
    expect(mockedRouteMoveParams).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
      paramIds: ["param-b"],
      newParentId: rootParamId,
      newIndex: 0,
      frontendOpId: expect.any(String),
    });
    const rootImpl = getCurrEffectiveCodeObjImpl(
      useProjectState.getState(),
      sectionId,
      rootParamId,
    );
    if (rootImpl.type !== CodeObjTypeEnum.NestedParam) {
      throw new Error("expected root param impl to stay nested");
    }
    expect(rootImpl.children).toEqual(["param-b", "param-a"]);
  });
  it("posts indentParams with the selected root param ids", () => {
    seedDictParamState({
      rootChildren: ["param-a", "param-b", "param-c"],
      selectedParams: ["param-b", "param-c"],
    });
    expect(indentSelectedParams()).toBe(true);
    expect(mockedRouteIndentParams).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
      paramIds: ["param-b", "param-c"],
    });
  });
  it("posts unindentParams for the selected nested param ids", () => {
    seedDictParamState({
      rootChildren: ["parent-param", "other-param"],
      selectedParams: ["nested-child"],
      nestedChildrenByParent: {
        "parent-param": ["nested-child"],
      },
    });
    expect(unindentSelectedParams()).toBe(true);
    expect(mockedRouteUnindentParams).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
      paramIds: ["nested-child"],
    });
  });
  it("posts moveParamGroups for visible keyboard moves and reapplies the optimistic order", () => {
    seedDictParamState({
      rootChildren: ["param-a", "param-b", "param-c"],
      selectedParams: ["param-a"],
    });
    expect(moveSelectedParamsDown()).toBe(true);
    expect(mockedRouteMoveParamGroups).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
      moves: [
        {
          paramIds: ["param-a"],
          newParentId: rootParamId,
          newIndex: 1,
        },
      ],
      frontendOpId: expect.any(String),
    });
    const rootImpl = getCurrEffectiveCodeObjImpl(
      useProjectState.getState(),
      sectionId,
      rootParamId,
    );
    if (rootImpl.type !== CodeObjTypeEnum.NestedParam) {
      throw new Error("expected root param impl to stay nested");
    }
    expect(rootImpl.children).toEqual(["param-b", "param-a", "param-c"]);
  });
});
