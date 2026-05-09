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
  createProjectGpuRetainedParamDragPreview,
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

  it("resolves cross-parent retained row drops from tree metadata", () => {
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
        event: retainedRowHit("other-param", { y: 190 }),
        projectState,
        session: session!,
      }),
    ).toEqual({
      newIndex: 2,
      newParentId: "root-param",
      paramIds: ["child-a"],
      sectionId: "dict-a",
    });
  });

  it("rejects retained drops into the moving param subtree", () => {
    const projectState = projectStateWithParams({
      nestedChildrenByParent: { "parent-param": ["child-a", "child-b"] },
      rootChildren: ["parent-param", "other-param"],
      selectedParams: ["parent-param"],
    });
    const session = createProjectGpuRetainedParamDragSession({
      activeParamId: "parent-param",
      projectState,
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });

    expect(
      resolveProjectGpuRetainedParamDropMove({
        event: retainedRowHit("child-b", { y: 150 }),
        projectState,
        session: session!,
      }),
    ).toBeNull();
  });

  it("creates retained drag previews with row-target drop markers", () => {
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

    expect(
      createProjectGpuRetainedParamDragPreview({
        hit: retainedRowHit("other-param", { y: 180 }),
        projectState,
        session: session!,
      }),
    ).toEqual({
      draggingParamIds: ["child-a"],
      dropMarker: { edge: "before", rowId: "other-param" },
      pointerLocal: { x: 20, y: 180 },
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("keeps retained drag previews positioned when no row is under the pointer", () => {
    const projectState = projectStateWithParams({
      rootChildren: ["param-a", "param-b"],
      selectedParams: ["param-a"],
    });
    const session = createProjectGpuRetainedParamDragSession({
      activeParamId: "param-a",
      projectState,
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });

    expect(
      createProjectGpuRetainedParamDragPreview({
        hit: null,
        pointerLocal: { x: 20, y: 236 },
        projectState,
        session: session!,
      }),
    ).toEqual({
      draggingParamIds: ["param-a"],
      dropMarker: null,
      pointerLocal: { x: 20, y: 236 },
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("resolves retained control drops into empty nested parents", () => {
    const projectState = projectStateWithParams({
      nestedChildrenByParent: { "empty-parent": [] },
      rootChildren: ["empty-parent", "other-param"],
      selectedParams: ["other-param"],
    });
    const session = createProjectGpuRetainedParamDragSession({
      activeParamId: "other-param",
      projectState,
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });

    expect(
      resolveProjectGpuRetainedParamDropMove({
        event: retainedControlHit("empty-parent", { x: 220, y: 14 }),
        projectState,
        session: session!,
      }),
    ).toEqual({
      newIndex: 0,
      newParentId: "empty-parent",
      paramIds: ["other-param"],
      sectionId: "dict-a",
    });
    expect(
      createProjectGpuRetainedParamDragPreview({
        hit: retainedControlHit("empty-parent", { x: 220, y: 14 }),
        projectState,
        session: session!,
      }),
    ).toEqual({
      draggingParamIds: ["other-param"],
      dropMarker: { edge: "inside", rowId: "empty-parent" },
      pointerLocal: { x: 220, y: 14 },
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });
  });

  it("rejects retained empty-parent drops onto the dragged parent", () => {
    const projectState = projectStateWithParams({
      nestedChildrenByParent: { "empty-parent": [] },
      rootChildren: ["empty-parent", "other-param"],
      selectedParams: ["empty-parent"],
    });
    const session = createProjectGpuRetainedParamDragSession({
      activeParamId: "empty-parent",
      projectState,
      sectionId: "dict-a",
      surfaceId: "dict-a:param-content:unpinned",
    });

    expect(
      resolveProjectGpuRetainedParamDropMove({
        event: retainedControlHit("empty-parent", { x: 220, y: 14 }),
        projectState,
        session: session!,
      }),
    ).toBeNull();
  });
});

function retainedRowHit(
  paramId: string,
  localPoint: { readonly x?: number; readonly y: number },
): GpuRetainedContentInteractionHit {
  return retainedHit("row", paramId, localPoint);
}

function retainedControlHit(
  paramId: string,
  localPoint: { readonly x?: number; readonly y: number },
): GpuRetainedContentInteractionHit {
  return retainedHit("control", paramId, localPoint);
}

function retainedHit(
  kind: "control" | "row",
  paramId: string,
  localPoint: { readonly x?: number; readonly y: number },
): GpuRetainedContentInteractionHit {
  const rows = [
    "param-a",
    "param-b",
    "param-c",
    "parent-param",
    "child-a",
    "child-b",
    "other-param",
    "empty-parent",
  ];
  const retainedScene = createGpuRetainedRowContentScene({
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rowHeight: 28,
    rows: rows.map(retainedTestRow),
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 240, width: 260, x: 0, y: 0 },
  });
  const hit = retainedScene.hitRecords.find(
    (record) => record.id === `${kind}:${paramId}`,
  );
  if (!hit) {
    throw new Error(`missing retained test hit ${paramId}`);
  }
  const x = localPoint.x ?? 20;
  return {
    flowPoint: { x, y: localPoint.y },
    hit,
    localPoint: { x, y: localPoint.y },
    ownerSectionId: "dict-a",
    retainedScene,
    screenPoint: { x, y: localPoint.y },
    surfaceId: "dict-a:param-content:unpinned",
    zIndex: 1,
  };
}

function retainedTestRow(id: string) {
  const depth = id.startsWith("child") ? 1 : 0;
  if (id === "parent-param") {
    return {
      controlKind: "nested" as const,
      depth,
      id,
      label: id,
    };
  }
  if (id === "empty-parent") {
    return {
      control: retainedTextControl("nested"),
      controlKind: "nested" as const,
      depth,
      id,
      label: id,
    };
  }
  return {
    control: retainedTextControl(),
    controlKind: "text-like" as const,
    depth,
    id,
    label: id,
  };
}

function retainedTextControl(rendererFamily = "text-like") {
  return {
    commitPolicy: "native-island" as const,
    defaultDisplayValue: "",
    displayValue: "",
    editorKind: "text" as const,
    kind: "text-like" as const,
    rendererFamily,
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
  const allParamIds = collectParamIds(
    rootParamId,
    rootChildren,
    nestedChildrenByParent,
  );
  const codeObjs: ZustandProjectState["codeObjs"] = {};
  const codeObjVariants: ZustandProjectState["codeObjVariants"] = {};
  const codeObjImpls: ZustandProjectState["codeObjImpls"] = {};
  const codeObjVariantMap: Record<string, string> = {};
  addParamRecords({
    allParamIds,
    codeObjImpls,
    codeObjVariantMap,
    codeObjVariants,
    codeObjs,
    nestedChildrenByParent,
    rootChildren,
    rootParamId,
  });
  const requiredParamIdsToPaths = buildRequiredParamIdsToPaths(
    allParamIds,
    rootParamId,
    nestedChildrenByParent,
  );
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

function collectParamIds(
  rootParamId: string,
  rootChildren: readonly string[],
  nestedChildrenByParent: Record<string, readonly string[]>,
) {
  const allParamIds = new Set<string>([rootParamId, ...rootChildren]);
  for (const [parentId, children] of Object.entries(nestedChildrenByParent)) {
    allParamIds.add(parentId);
    for (const childId of children) {
      allParamIds.add(childId);
    }
  }
  return allParamIds;
}

function addParamRecords({
  allParamIds,
  codeObjImpls,
  codeObjVariantMap,
  codeObjVariants,
  codeObjs,
  nestedChildrenByParent,
  rootChildren,
  rootParamId,
}: {
  readonly allParamIds: Set<string>;
  readonly codeObjImpls: ZustandProjectState["codeObjImpls"];
  readonly codeObjVariantMap: Record<string, string>;
  readonly codeObjVariants: ZustandProjectState["codeObjVariants"];
  readonly codeObjs: ZustandProjectState["codeObjs"];
  readonly nestedChildrenByParent: Record<string, readonly string[]>;
  readonly rootChildren: readonly string[];
  readonly rootParamId: string;
}) {
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
    codeObjImpls[implId] = createParamImpl(
      paramId,
      implId,
      rootParamId,
      rootChildren,
      nestedChildrenByParent,
    );
    codeObjVariantMap[paramId] = variantId;
  }
}

function createParamImpl(
  paramId: string,
  implId: string,
  rootParamId: string,
  rootChildren: readonly string[],
  nestedChildrenByParent: Record<string, readonly string[]>,
) {
  if (paramId === rootParamId) {
    return createNestedParamImpl(implId, rootChildren);
  }
  const nestedChildren = nestedChildrenByParent[paramId];
  if (nestedChildren) {
    return createNestedParamImpl(implId, nestedChildren);
  }
  return createCodeParamCodeObjImpl({
    id: implId,
    name: paramId,
  });
}

function buildRequiredParamIdsToPaths(
  allParamIds: Set<string>,
  rootParamId: string,
  nestedChildrenByParent: Record<string, readonly string[]>,
) {
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
  return requiredParamIdsToPaths;
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
