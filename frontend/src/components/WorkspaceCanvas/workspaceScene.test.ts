import { readFileSync } from "node:fs";
import {
  createCore,
  createDictSectionImpl,
  createGroupSectionImpl,
  createSingleConfig,
  createTextBlockSectionImpl,
  createVariant,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type DictSectionImpl,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  createWorkspaceCanvasControllerState,
  reduceActiveEditorSession,
  setWorkspaceSectionScrollOffset,
  type ActiveEditorSession,
} from "./workspaceController";
import {
  beginWorkspaceCodeHighlightRequest,
  buildWorkspaceCodeHighlightCacheKey,
  completeWorkspaceCodeHighlightRequest,
  createWorkspaceCodeHighlightCacheState,
  hashWorkspaceCodePreviewValue,
} from "./workspaceHighlightCache";
import {
  WORKSPACE_SCENE_GEOMETRY,
  deriveWorkspaceScene,
  getWorkspaceParamSupportDeclaration,
  hitTestWorkspaceScene,
  screenToWorkspace,
  workspaceToScreen,
  type WorkspaceDictScene,
  type WorkspaceScene,
} from "./workspaceScene";

type AddedSection<T extends BaseSectionImplUnion> = {
  variantId: string;
  impl: T;
};

function addSection<T extends BaseSectionImplUnion>(
  state: SingleConfig,
  sectionId: string,
  impl: T,
  options: {
    parentId?: string | null;
    layout?: { x: number; y: number; w: number; h: number; zIndex?: number };
  } = {},
): AddedSection<T> {
  const parentId = resolveTestParentId(options);
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  const nextImpl = {
    ...impl,
    id: implId,
    name: resolveTestName(impl.name, sectionId),
  };
  state.sections[sectionId] = createCore({
    id: sectionId,
    name: sectionId,
    displayName: sectionId,
  });
  state.sectionImpls[implId] = nextImpl;
  state.sectionVariants[variantId] = createVariant({
    id: variantId,
    impl: implId,
    name: `${sectionId} variant`,
  });
  state.projectConfig.sectionVariantMap[sectionId] = variantId;
  state.parentSectionMap[sectionId] = parentId;
  if (parentId === null) {
    state.projectConfig.topLevelSections[sectionId] = resolveTestLayout(
      options.layout,
    );
  }
  return { variantId, impl: nextImpl };
}

function resolveTestParentId(options: { parentId?: string | null }) {
  return options.parentId ?? null;
}

function resolveTestName(name: string, fallback: string) {
  return name || fallback;
}

function resolveTestLayout(
  layout: { x: number; y: number; w: number; h: number; zIndex?: number } = {
    x: 0,
    y: 0,
    w: 300,
    h: 180,
  },
) {
  return {
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
    zIndex: layout.zIndex ?? 0,
  };
}

function addParam(
  state: SingleConfig,
  sectionImpl: DictSectionImpl,
  paramId: string,
  impl: BaseCodeObjImplUnion,
  options: { displayName?: string } = {},
) {
  const variantId = `${paramId}-variant`;
  const implId = `${paramId}-impl`;
  const nextImpl = {
    ...impl,
    id: implId,
    name: impl.name || paramId,
  } as BaseCodeObjImplUnion;
  state.codeObjs[paramId] = createCore({
    id: paramId,
    name: paramId,
    displayName: options.displayName ?? paramId,
  });
  state.codeObjImpls[implId] = nextImpl;
  state.codeObjVariants[variantId] = createVariant({
    id: variantId,
    impl: implId,
    name: `${paramId} variant`,
  });
  sectionImpl.codeObjVariantMap[paramId] = variantId;
  return nextImpl;
}

function setShownParams(
  state: SingleConfig,
  variantId: string,
  unpinned: Record<string, Array<string>>,
  unpinnedTopLevel: Array<string>,
  pinned: Record<string, Array<string>> = {},
  pinnedTopLevel: Array<string> = [],
) {
  state.shownParamIds[variantId] = {
    pinned: {
      requiredParamIdsToPaths: pinned,
      topLevelParamIds: pinnedTopLevel,
    },
    unpinned: {
      requiredParamIdsToPaths: unpinned,
      topLevelParamIds: unpinnedTopLevel,
    },
  };
}

function valueParam(
  type: string,
  value: string,
  extras: Record<string, unknown> = {},
): BaseCodeObjImplUnion {
  return {
    coreNameEditable: false,
    coreNameType: "TEXT",
    defaultVal: "",
    description: "",
    id: "",
    isPreset: false,
    name: "",
    passingStyle: "DEFAULT",
    type,
    typeAnnotation: "",
    value,
    ...extras,
  } as BaseCodeObjImplUnion;
}

function buttonParam(label: string): BaseCodeObjImplUnion {
  return {
    actionMode: "NO_ACTION",
    coreNameEditable: false,
    coreNameType: "TEXT",
    description: "",
    id: "",
    isPreset: false,
    label,
    name: "",
    passingStyle: "DEFAULT",
    requestBody: "",
    requestHeaderKey: "",
    requestHeaderValue: "",
    requestMethod: "GET",
    requestUrl: "",
    type: "ButtonParam",
    typeAnnotation: "",
  } as BaseCodeObjImplUnion;
}

function nestedParam(children: Array<string>): BaseCodeObjImplUnion {
  return {
    children,
    coreNameEditable: false,
    coreNameType: "TEXT",
    description: "",
    id: "",
    isPreset: false,
    name: "",
    passingStyle: "DEFAULT",
    type: "NestedParam",
    typeAnnotation: "",
  } as BaseCodeObjImplUnion;
}

function buildDictFixture() {
  const state = createSingleConfig();
  state.projectConfig.viewport = { x: 10, y: 20, zoom: 2 };
  state.projectConfig.viewportInitialized = true;
  state.projectConfig.showParamDisplayNames = true;
  const section = addSection(
    state,
    "dict-a",
    createDictSectionImpl({
      name: "Generic Dict",
      topLevelParamId: "root",
      edgeOutputPorts: [{ id: "dict-out", accessor: "value" }],
      size: { width: 360, height: 240 },
    }),
    { layout: { x: 100, y: 50, w: 360, h: 240 } },
  );
  addParam(state, section.impl, "root", nestedParam(["group", "enabled"]));
  addParam(state, section.impl, "group", nestedParam(["title", "script"]));
  addParam(
    state,
    section.impl,
    "title",
    valueParam("TextParam", "hello", { uiType: "TEXT" }),
    { displayName: "Title" },
  );
  addParam(state, section.impl, "script", valueParam("CodeParam", "print(1)"));
  addParam(state, section.impl, "enabled", valueParam("SwitchParam", "true"));
  setShownParams(
    state,
    section.variantId,
    {
      group: ["group"],
      title: ["group", "title"],
      script: ["group", "script"],
      enabled: ["enabled"],
    },
    ["group", "enabled"],
  );
  return { state, section };
}

function must<T>(value: T | null | undefined, label: string): T {
  if (value == null) {
    throw new Error(`missing ${label}`);
  }
  return value;
}

function buildNestedSectionScene() {
  const state = createSingleConfig();
  const parent = addNestedParentSection(state);
  addNestedChildSection(state, "child-a", { width: 220, height: 120 });
  addNestedChildSection(state, "child-b", { width: 240, height: 130 });
  parent.impl.children = ["child-a", "child-b"];
  return deriveWorkspaceScene({
    projectState: state,
    viewportSize: { width: 1000, height: 800 },
  });
}

function addNestedParentSection(state: SingleConfig) {
  return addSection(
    state,
    "group",
    createGroupSectionImpl({
      children: ["child-a", "child-b"],
      size: { width: 500, height: 420 },
    }),
    { layout: { x: 40, y: 60, w: 500, h: 420 } },
  );
}

function addNestedChildSection(
  state: SingleConfig,
  sectionId: string,
  size: { width: number; height: number },
) {
  addSection(state, sectionId, createTextBlockSectionImpl({ size }), {
    parentId: "group",
  });
}

function assertNestedSectionScene(scene: WorkspaceScene) {
  const group = must(scene.sectionsById.group, "group section");
  const child = must(scene.sectionsById["child-a"], "child-a section");

  expect(group.childIds).toEqual(["child-a", "child-b"]);
  expect(child.parentId).toBe("group");
  expect(child.sectionPath).toEqual(["group", "child-a"]);
  expect(child.localBounds.x).toBe(WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding);
  expect(child.worldBounds.x).toBe(group.worldBounds.x + child.localBounds.x);
  expect(group.geometry.clipRegion).toEqual(group.geometry.childContentRegion);
  expect(group.nestedDropZones.map((zone) => zone.kind)).toEqual([
    "before-child",
    "before-child",
    "after-child",
  ]);
}

function buildScrollableDictScene() {
  const { state } = buildScrollableDictFixture();
  const controller = setWorkspaceSectionScrollOffset(
    createWorkspaceCanvasControllerState(),
    "dict-scroll",
    240,
  );
  return deriveWorkspaceScene({
    projectState: state,
    viewportSize: { width: 900, height: 700 },
    controllerState: controller,
  });
}

function buildScrollableDictFixture() {
  const state = createSingleConfig();
  const section = addScrollableDictSection(state);
  const childIds: Array<string> = [];
  const paths: Record<string, Array<string>> = {};
  addParam(state, section.impl, "root", nestedParam(childIds));
  addScrollableParams(state, section.impl, childIds, paths);
  setShownParams(state, section.variantId, paths, childIds);
  return { state, section };
}

function addScrollableDictSection(state: SingleConfig) {
  return addSection(
    state,
    "dict-scroll",
    createDictSectionImpl({
      topLevelParamId: "root",
      size: { width: 320, height: 150 },
    }),
    { layout: { x: 0, y: 0, w: 320, h: 150 } },
  );
}

function addScrollableParams(
  state: SingleConfig,
  sectionImpl: DictSectionImpl,
  childIds: Array<string>,
  paths: Record<string, Array<string>>,
) {
  for (let idx = 0; idx < 18; idx += 1) {
    const paramId = `param-${idx}`;
    childIds.push(paramId);
    paths[paramId] = [paramId];
    addParam(state, sectionImpl, paramId, createScrollableParam(idx));
  }
}

function createScrollableParam(index: number): BaseCodeObjImplUnion {
  if (index === 0) {
    return valueParam("SwitchParam", "false");
  }
  return valueParam("TextParam", `value-${index}`, { uiType: "TEXT" });
}

function getRequiredDictScene(
  scene: WorkspaceScene,
  sectionId: string,
): WorkspaceDictScene {
  const renderModel = must(
    scene.sectionsById[sectionId],
    `${sectionId} section`,
  ).renderModel;
  if (renderModel.kind !== "dict") {
    throw new Error(`expected ${sectionId} dict render model`);
  }
  return renderModel.dict;
}

function assertScrollableDictScene(scene: WorkspaceScene) {
  const dict = getRequiredDictScene(scene, "dict-scroll");
  const firstRow = must(dict.rows[0], "first scroll row");

  expect(dict.visibleRowRange.start).toBeGreaterThan(0);
  expect(dict.visibleRowRange.end).toBeLessThan(18);
  expect(dict.scrollbar).not.toBeNull();
  expect(firstRow.controlRect.width).toBe(48);
  expect(hitFirstRowControl(scene, firstRow)?.intent).toBe("toggle-immediate");
  expect(getHitRegionIntent(scene, "section:dict-scroll:header")).toBe(
    "drag-section",
  );
}

function hitFirstRowControl(
  scene: WorkspaceScene,
  row: WorkspaceDictScene["rows"][number],
) {
  const rowPoint = workspaceToScreen(
    {
      x: row.controlRect.x,
      y: row.controlRect.y,
    },
    scene.viewport,
  );
  return hitTestWorkspaceScene(scene, {
    x: rowPoint.x + 1,
    y: rowPoint.y + 1,
  });
}

function getHitRegionIntent(scene: WorkspaceScene, id: string) {
  return scene.hitRegions.find((region) => region.id === id)?.intent;
}

describe("workspace scene model", () => {
  it("derives viewport transforms and coordinate conversion", () => {
    const { state } = buildDictFixture();
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
    });

    expect(scene.viewport).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(screenToWorkspace({ x: 30, y: 60 }, scene.viewport)).toEqual({
      x: 10,
      y: 20,
    });
    expect(workspaceToScreen({ x: 10, y: 20 }, scene.viewport)).toEqual({
      x: 30,
      y: 60,
    });
  });

  it("derives section geometry, project bounds, and minimap geometry", () => {
    const { state } = buildDictFixture();
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
    });
    const section = scene.sectionsById["dict-a"];

    expect(scene.projectBounds).toEqual({
      x: 100,
      y: 50,
      width: 360,
      height: 240,
    });
    expect(section?.geometry.header.height).toBe(
      WORKSPACE_SCENE_GEOMETRY.sectionHeaderHeight,
    );
    expect(section?.geometry.body).toMatchObject({
      x: 100,
      y: 86,
      width: 360,
      height: 204,
    });
    expect(section?.edgePortRegions).toHaveLength(1);
    expect(section?.edgePortRegions[0]?.intent).toBe("edge-or-port");
    expect(scene.minimap.sectionPreviews).toHaveLength(1);
    expect(scene.minimap.viewportMask.width).toBeGreaterThan(0);
    expect(scene.minimap.hitRegions.map((region) => region.intent)).toEqual([
      "minimap-jump",
      "minimap-pan",
    ]);
  });

  it("derives nested section paths, local bounds, parent clips, and drop zones", () => {
    assertNestedSectionScene(buildNestedSectionScene());
  });

  it("flattens non-Settings Dict params with stable nested rows and code previews", () => {
    const { state } = buildDictFixture();
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
    });
    const dict = scene.sectionsById["dict-a"]?.renderModel;
    expect(dict?.kind).toBe("dict");
    if (dict?.kind !== "dict") {
      throw new Error("expected dict render model");
    }

    expect(dict.dict.rows.map((row) => row.paramId)).toEqual([
      "group",
      "title",
      "script",
      "enabled",
    ]);
    expect(dict.dict.rows.map((row) => row.depth)).toEqual([0, 1, 1, 0]);
    expect(dict.dict.rows[1]?.label).toBe("Title");
    expect(dict.dict.rows[2]?.codePreview?.language).toBe("python");
    expect(dict.dict.rows[3]?.passiveValue.text).toBe("On");
  });

  it("computes row geometry, visible row ranges, scrollbars, hit regions, and intents", () => {
    assertScrollableDictScene(buildScrollableDictScene());
  });

  it("defines Param support declarations for first Dict Param kinds", () => {
    expect(
      getWorkspaceParamSupportDeclaration(valueParam("SwitchParam", "true")),
    ).toMatchObject({
      canvasSupport: "canvas-native",
      activeInputStrategy: "canvas-immediate",
      commitMode: "immediate",
      controlKind: "toggle",
      primaryHitIntent: "toggle-immediate",
    });
    expect(
      getWorkspaceParamSupportDeclaration(
        valueParam("DropdownParam", "A", { choices: ["A", "B"] }),
      ),
    ).toMatchObject({
      activeInputStrategy: "canvas-popup",
      primaryHitIntent: "open-canvas-popup",
    });
    expect(
      getWorkspaceParamSupportDeclaration(
        valueParam("ColorPickerParam", "#ff0000", { colorChoices: [] }),
      ),
    ).toMatchObject({
      activeInputStrategy: "dom-overlay",
      primaryHitIntent: "open-dom-overlay",
    });
    expect(
      getWorkspaceParamSupportDeclaration(buttonParam("Run")),
    ).toMatchObject({
      controlKind: "button",
      commitMode: "immediate",
    });
  });

  it("tracks active editor session transitions in controller state", () => {
    const session: ActiveEditorSession = {
      id: "editor-1",
      kind: "text",
      target: {
        kind: "dict-row",
        sectionId: "dict-a",
        sectionPath: ["dict-a"],
        rowId: "dict-row:dict-a:unpinned:title",
        paramId: "title",
      },
      initialValue: "old",
      draftValue: "old",
      openedAtSceneRevision: "scene:1",
    };

    const opened = reduceActiveEditorSession(null, {
      type: "open",
      session,
    });
    const updated = reduceActiveEditorSession(opened.session, {
      type: "update-draft",
      draftValue: "new",
    });
    const committed = reduceActiveEditorSession(updated.session, {
      type: "commit",
    });

    expect(updated.session?.draftValue).toBe("new");
    expect(committed.session).toBeNull();
    expect(committed.outcome).toMatchObject({
      kind: "commit",
      value: "new",
    });
  });

  it("keys passive code highlighting and discards stale async results", () => {
    const key = buildWorkspaceCodeHighlightCacheKey({
      sectionId: "dict-a",
      paramId: "script",
      codeHash: hashWorkspaceCodePreviewValue("print(1)"),
      language: "python",
      themeRevision: "dark",
      fontRevision: "font",
      highlighterRevision: "highlighter",
      previewWidth: 120,
      previewLineLimit: 6,
    });
    const pending = beginWorkspaceCodeHighlightRequest(
      createWorkspaceCodeHighlightCacheState(),
      key,
      "request-1",
    );
    const stale = completeWorkspaceCodeHighlightRequest(pending, key, "old", [
      { text: "print", tokenType: "function" },
    ]);
    const complete = completeWorkspaceCodeHighlightRequest(
      stale.cache,
      key,
      "request-1",
      [{ text: "print", tokenType: "function" }],
    );

    expect(stale.applied).toBe(false);
    expect(complete.applied).toBe(true);

    const { state } = buildDictFixture();
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: {
        themeRevision: "dark",
        fontRevision: "font",
        highlighterRevision: "highlighter",
      },
      highlightCache: complete.cache,
    });
    const dict = scene.sectionsById["dict-a"]?.renderModel;
    if (dict?.kind !== "dict") {
      throw new Error("expected dict render model");
    }
    const codeRow = dict.dict.rows.find((row) => row.paramId === "script");
    expect(codeRow?.codePreview?.cacheKey).toContain("script");
  });

  it("keeps the scene model free of xyflow, dnd-kit, and section DOM imports", () => {
    const files = [
      new URL("./workspaceScene.ts", import.meta.url),
      new URL("./workspaceController.ts", import.meta.url),
      new URL("./workspaceHighlightCache.ts", import.meta.url),
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toContain("forks/xyflow");
    expect(source).not.toContain("forks/dnd-kit");
    expect(source).not.toContain("state/actions/sectionInfos");
    expect(source).not.toContain("components/Section");
    expect(source).not.toContain("components/Params");
  });
});
