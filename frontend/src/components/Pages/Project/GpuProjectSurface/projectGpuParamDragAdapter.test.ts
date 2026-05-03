import type { GpuRetainedContentInteractionHit } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createShownParamIDs,
  createSingleConfig,
  createVariant,
  type BaseCodeObjImplUnion,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  createProjectGpuRetainedParamDragSession,
  getProjectGpuParamListKeyFromSurfaceId,
  resolveProjectGpuRetainedParamDropMove,
} from "./projectGpuParamDragAdapter";

describe("project GPU retained param drag adapter", () => {
  it("parses retained param content list keys from surface ids", () => {
    expect(
      getProjectGpuParamListKeyFromSurfaceId("dict-a:param-content:unpinned"),
    ).toBe("unpinned");
    expect(
      getProjectGpuParamListKeyFromSurfaceId("dict-a:param-content:pinned"),
    ).toBe("pinned");
    expect(getProjectGpuParamListKeyFromSurfaceId("dict-a")).toBeNull();
  });

  it("resolves same-parent retained row drops without DOM row state", () => {
    const projectState = projectStateWithParams({
      rootChildren: ["param-a", "param-b", "param-c"],
      selectedParams: ["param-a"],
    });
    const session = createProjectGpuRetainedParamDragSession({
      activeParamId: "param-a",
      projectState,
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });

    expect(session).toMatchObject({
      activeParamId: "param-a",
      draggingParamIds: ["param-a"],
      oldParentId: "root-param",
    });
    expect(
      resolveProjectGpuRetainedParamDropMove({
        event: retainedRowHit("param-c", { y: 76 }),
        projectState,
        session: session!,
      }),
    ).toEqual({
      newIndex: 2,
      newParentId: "root-param",
      paramIds: ["param-a"],
      sectionId: "dict-a",
    });
  });

  it("keeps this retained slice to same-parent drops", () => {
    const projectState = projectStateWithParams({
      nestedChildrenByParent: { "parent-param": ["child-a", "child-b"] },
      rootChildren: ["parent-param", "other-param"],
      selectedParams: ["child-a"],
    });
    const session = createProjectGpuRetainedParamDragSession({
      activeParamId: "child-a",
      projectState,
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });

    expect(session).toMatchObject({
      draggingParamIds: ["child-a"],
      oldParentId: "parent-param",
    });
    expect(
      resolveProjectGpuRetainedParamDropMove({
        event: retainedRowHit("other-param", { y: 104 }),
        projectState,
        session: session!,
      }),
    ).toBeNull();
  });
});

function retainedRowHit(
  paramId: string,
  localPoint: { readonly y: number },
): GpuRetainedContentInteractionHit {
  const rows = [
    "param-a",
    "param-b",
    "param-c",
    "parent-param",
    "child-a",
    "child-b",
    "other-param",
  ];
  const retainedScene = createGpuRetainedRowContentScene({
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rowHeight: 28,
    rows: rows.map((id) => ({
      controlKind: "text-like",
      depth: id.startsWith("child") ? 1 : 0,
      id,
      label: id,
    })),
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 240, width: 260, x: 0, y: 0 },
  });
  const hit = retainedScene.hitRecords.find(
    (record) => record.id === `row:${paramId}`,
  );
  if (!hit) {
    throw new Error(`missing retained test hit ${paramId}`);
  }
  return {
    flowPoint: { x: 20, y: localPoint.y },
    hit,
    localPoint: { x: 20, y: localPoint.y },
    ownerSectionId: "dict-a",
    retainedScene,
    screenPoint: { x: 20, y: localPoint.y },
    surfaceId: "dict-a:param-content:unpinned",
    zIndex: 1,
  };
}

function projectStateWithParams({
  nestedChildrenByParent = {},
  rootChildren,
  selectedParams,
}: {
  readonly nestedChildrenByParent?: Record<string, readonly string[]>;
  readonly rootChildren: readonly string[];
  readonly selectedParams: readonly string[];
}): ZustandProjectState {
  const sectionId = "dict-a";
  const sectionVariantId = "dict-a-variant";
  const sectionImplId = "dict-a-impl";
  const rootParamId = "root-param";
  const allParamIds = new Set<string>([rootParamId, ...rootChildren]);
  for (const [parentId, children] of Object.entries(nestedChildrenByParent)) {
    allParamIds.add(parentId);
    for (const childId of children) {
      allParamIds.add(childId);
    }
  }
  const codeObjs: ZustandProjectState["codeObjs"] = {};
  const codeObjVariants: ZustandProjectState["codeObjVariants"] = {};
  const codeObjImpls: ZustandProjectState["codeObjImpls"] = {};
  const codeObjVariantMap: Record<string, string> = {};
  for (const paramId of allParamIds) {
    const variantId = `${paramId}-variant`;
    const implId = `${paramId}-impl`;
    codeObjs[paramId] = createCore({
      defaultVariant: variantId,
      id: paramId,
      name: paramId,
      variants: [variantId],
    });
    codeObjVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: variantId,
      nonPresetImpls: [implId],
    });
    codeObjImpls[implId] =
      paramId === rootParamId || nestedChildrenByParent[paramId]
        ? createNestedParamImpl(
            implId,
            paramId === rootParamId
              ? rootChildren
              : nestedChildrenByParent[paramId] ?? [],
          )
        : createCodeParamCodeObjImpl({
            id: implId,
            name: paramId,
          });
    codeObjVariantMap[paramId] = variantId;
  }
  const requiredParamIdsToPaths: Record<string, string[]> = {};
  for (const paramId of allParamIds) {
    if (paramId === rootParamId) {
      continue;
    }
    requiredParamIdsToPaths[paramId] = getParamPath(
      paramId,
      nestedChildrenByParent,
    );
  }
  const state = createSingleConfig({
    codeObjImpls,
    codeObjVariants,
    codeObjs,
    parentSectionMap: { [sectionId]: null },
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    }),
    sectionImpls: {
      [sectionImplId]: createDictSectionImpl({
        codeObjVariantMap,
        edgeInputParams: [],
        id: sectionImplId,
        paramFilter: "",
        selectedParams: [...selectedParams],
        topLevelParamId: rootParamId,
      }),
    },
    sectionVariants: {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        impl: sectionImplId,
        name: sectionVariantId,
        nonPresetImpls: [sectionImplId],
      }),
    },
    sections: {
      [sectionId]: createCore({
        defaultVariant: sectionVariantId,
        id: sectionId,
        name: sectionId,
        variants: [sectionVariantId],
      }),
    },
    shownParamIds: {
      [sectionVariantId]: createShownParamIDs({
        unpinned: {
          requiredParamIdsToPaths,
          topLevelParamIds: [...rootChildren],
        },
      }),
    },
  }) as ZustandProjectState;
  state.previewSectionVariantMap = {};
  return state;
}

function createNestedParamImpl(
  id: string,
  children: readonly string[],
): BaseCodeObjImplUnion {
  return {
    children: [...children],
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    description: "",
    id,
    isPreset: false,
    name: id,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.NestedParam,
    typeAnnotation: "",
  };
}

function getParamPath(
  paramId: string,
  nestedChildrenByParent: Record<string, readonly string[]>,
): string[] {
  for (const [parentId, children] of Object.entries(nestedChildrenByParent)) {
    if (children.includes(paramId)) {
      return [parentId, paramId];
    }
  }
  return [paramId];
}
