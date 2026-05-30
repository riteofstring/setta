import { readFileSync } from "node:fs";
import {
  createCore,
  createDictSectionImpl,
  createGroupSectionImpl,
  createSingleConfig,
  createTextBlockSectionImpl,
  createVariant,
  createViewMode,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type DictSectionImpl,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  createWorkspaceCanvasControllerState,
  reduceActiveEditorSession,
  setWorkspaceControllerViewport,
  setWorkspaceSectionScrollOffset,
  syncWorkspaceControllerViewport,
  type ActiveEditorSession,
} from "./workspaceController";
import {
  beginWorkspaceCodeHighlightRequest,
  buildWorkspaceCodeHighlightCacheKey,
  completeWorkspaceCodeHighlightRequest,
  createWorkspaceCodeHighlightCacheState,
  getWorkspaceCodeHighlightTokenRuns,
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
import {
  beginWorkspaceTextMeasurementRequest,
  completeWorkspaceTextMeasurementRequest,
  createWorkspaceTextMeasurementCacheState,
} from "./workspaceTextMeasurementCache";

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

function sectionSize(width: number, height: number) {
  return {
    width: { Auto: false, Value: width },
    height: { Auto: false, Value: height },
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
      size: sectionSize(360, 240),
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
      size: sectionSize(500, 420),
    }),
    { layout: { x: 40, y: 60, w: 500, h: 420 } },
  );
}

function addNestedChildSection(
  state: SingleConfig,
  sectionId: string,
  size: { width: number; height: number },
) {
  addSection(
    state,
    sectionId,
    createTextBlockSectionImpl({
      size: sectionSize(size.width, size.height),
    }),
    {
      parentId: "group",
    },
  );
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

function buildEmptyNestedSectionScene() {
  const state = createSingleConfig();
  addSection(
    state,
    "empty-group",
    createGroupSectionImpl({
      children: [],
      size: sectionSize(420, 260),
    }),
    { layout: { x: 25, y: 35, w: 420, h: 260 } },
  );
  return deriveWorkspaceScene({
    projectState: state,
    viewportSize: { width: 900, height: 700 },
  });
}

function buildScrollableDictScene() {
  const { state } = buildScrollableDictFixture();
  const controller = setWorkspaceSectionScrollOffset(
    createWorkspaceCanvasControllerState(),
    "dict-scroll",
    168,
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
      size: sectionSize(320, 150),
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
  if (index === 8) {
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
  const visibleSwitchRow = must(
    dict.rows.find((row) => row.paramId === "param-8"),
    "visible switch row",
  );

  expect(dict.visibleRowRange.start).toBeGreaterThan(0);
  expect(dict.visibleRowRange.end).toBeLessThan(18);
  expect(dict.scrollbar).not.toBeNull();
  expect(firstRow.visible).toBe(false);
  expect(firstRow.visibleRect).toBeNull();
  expect(firstRow.hitRegions).toHaveLength(0);
  expect(
    scene.hitRegions.some((region) => region.id.startsWith(firstRow.id)),
  ).toBe(false);
  expect(hitRowControl(scene, firstRow)?.target.kind).not.toBe("control");
  expect(visibleSwitchRow.visible).toBe(true);
  expect(visibleSwitchRow.visibleRect).not.toBeNull();
  expect(visibleSwitchRow.controlRect.width).toBe(48);
  expect(hitRowControl(scene, visibleSwitchRow)?.intent).toBe(
    "toggle-immediate",
  );
  expect(getHitRegionIntent(scene, "section:dict-scroll:header")).toBe(
    "drag-section",
  );
}

function hitRowControl(
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
  it("derives viewport transforms from canvas controller state", () => {
    const { state } = buildDictFixture();
    const syncedController = syncWorkspaceControllerViewport(
      createWorkspaceCanvasControllerState(),
      state,
      { width: 800, height: 600 },
    );
    const controller = setWorkspaceControllerViewport(syncedController, {
      x: 30,
      y: 40,
      zoom: 0.5,
    });
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      controllerState: controller,
    });

    expect(syncedController.viewport?.viewport).toEqual({
      x: 10,
      y: 20,
      zoom: 2,
    });
    expect(scene.viewport).toEqual({ x: 30, y: 40, zoom: 0.5 });
    expect(screenToWorkspace({ x: 45, y: 60 }, scene.viewport)).toEqual({
      x: 30,
      y: 40,
    });
    expect(workspaceToScreen({ x: 30, y: 40 }, scene.viewport)).toEqual({
      x: 45,
      y: 60,
    });
  });

  it("syncs controller viewport from active view mode source changes", () => {
    const { state } = buildDictFixture();
    state.projectConfig.viewport = { x: 1, y: 2, zoom: 3 };
    state.projectConfig.activeViewModeId = "view-a";
    state.projectConfig.viewModes["view-a"] = createViewMode({
      id: "view-a",
      viewport: { x: 70, y: 80, zoom: 0.25 },
      viewportInitialized: true,
    });

    const syncedController = syncWorkspaceControllerViewport(
      createWorkspaceCanvasControllerState(),
      state,
      { width: 800, height: 600 },
    );
    const transientController = setWorkspaceControllerViewport(
      syncedController,
      {
        x: 90,
        y: 100,
        zoom: 0.75,
      },
    );
    const unchangedSourceController = syncWorkspaceControllerViewport(
      transientController,
      state,
      { width: 800, height: 600 },
    );

    expect(syncedController.viewport?.sourceKey).toContain("view-mode:view-a");
    expect(syncedController.viewport?.viewport).toEqual({
      x: 70,
      y: 80,
      zoom: 0.25,
    });
    expect(unchangedSourceController).toBe(transientController);
    expect(unchangedSourceController.viewport?.viewport).toEqual({
      x: 90,
      y: 100,
      zoom: 0.75,
    });

    state.projectConfig.viewModes["view-a"] = createViewMode({
      id: "view-a",
      viewport: { x: 110, y: 120, zoom: 0.4 },
      viewportInitialized: true,
    });
    const changedSourceController = syncWorkspaceControllerViewport(
      unchangedSourceController,
      state,
      { width: 800, height: 600 },
    );

    expect(changedSourceController).not.toBe(unchangedSourceController);
    expect(changedSourceController.viewport?.viewport).toEqual({
      x: 110,
      y: 120,
      zoom: 0.4,
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
      y: 110,
      width: 360,
      height: 180,
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

  it("fits short auto-sized Dict sections to rows and caps tall ones", () => {
    const { state, section } = buildDictFixture();
    const layout = state.projectConfig.topLevelSections["dict-a"];
    if (!layout) {
      throw new Error("missing dict-a layout");
    }
    delete layout.h;
    section.impl.size = {
      width: { Auto: false, Value: 360 },
      height: { Auto: true, Value: 0 },
    };
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
    });

    expect(scene.sectionsById["dict-a"]?.worldBounds.height).toBe(
      WORKSPACE_SCENE_GEOMETRY.sectionHeaderHeight +
        4 *
          (WORKSPACE_SCENE_GEOMETRY.dictRowHeight +
            WORKSPACE_SCENE_GEOMETRY.dictRowGap) -
        WORKSPACE_SCENE_GEOMETRY.dictRowGap +
        WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding * 2,
    );

    const { state: tallState, section: tallSection } =
      buildScrollableDictFixture();
    const tallLayout = tallState.projectConfig.topLevelSections["dict-scroll"];
    if (!tallLayout) {
      throw new Error("missing dict-scroll layout");
    }
    delete tallLayout.h;
    tallSection.impl.size = {
      width: { Auto: false, Value: 320 },
      height: { Auto: true, Value: 0 },
    };
    const tallScene = deriveWorkspaceScene({
      projectState: tallState,
      viewportSize: { width: 800, height: 600 },
    });

    expect(tallScene.sectionsById["dict-scroll"]?.worldBounds.height).toBe(
      WORKSPACE_SCENE_GEOMETRY.sectionAutoHeight,
    );
  });

  it("fits all visible sections when the view has no saved viewport", () => {
    const { state } = buildDictFixture();
    state.projectConfig.viewport = null;
    state.projectConfig.viewportInitialized = false;
    state.projectConfig.activeIds = ["dict-a"];
    const syncedController = syncWorkspaceControllerViewport(
      createWorkspaceCanvasControllerState(),
      state,
      { width: 800, height: 600 },
    );

    expect(syncedController.viewport?.viewport).toEqual({
      x: 120,
      y: 130,
      zoom: 1,
    });
  });

  it("centers the visible section bounds as the default unsaved viewport", () => {
    const state = createSingleConfig();
    state.projectConfig.viewport = null;
    state.projectConfig.viewportInitialized = false;
    addSection(
      state,
      "left",
      createTextBlockSectionImpl({ size: sectionSize(100, 100) }),
      { layout: { x: 0, y: 0, w: 100, h: 100 } },
    );
    addSection(
      state,
      "center",
      createTextBlockSectionImpl({ size: sectionSize(100, 100) }),
      { layout: { x: 200, y: 0, w: 100, h: 100 } },
    );
    addSection(
      state,
      "right",
      createTextBlockSectionImpl({ size: sectionSize(100, 100) }),
      { layout: { x: 400, y: 0, w: 100, h: 100 } },
    );

    const syncedController = syncWorkspaceControllerViewport(
      createWorkspaceCanvasControllerState(),
      state,
      { width: 800, height: 600 },
    );

    expect(syncedController.viewport?.viewport).toEqual({
      x: 150,
      y: 250,
      zoom: 1,
    });
  });

  it("ignores uninitialized active view mode viewport values", () => {
    const { state } = buildDictFixture();
    state.projectConfig.viewport = null;
    state.projectConfig.viewportInitialized = false;
    state.projectConfig.activeViewModeId = "view-a";
    state.projectConfig.viewModes["view-a"] = createViewMode({
      id: "view-a",
      viewport: { x: 70, y: 80, zoom: 0.25 },
      viewportInitialized: false,
      visibilityBySectionId: { "dict-a": true },
      topLevelSections: {
        "dict-a": { x: 100, y: 50, w: 360, h: 240, zIndex: 0 },
      },
    });

    const syncedController = syncWorkspaceControllerViewport(
      createWorkspaceCanvasControllerState(),
      state,
      { width: 800, height: 600 },
    );

    expect(syncedController.viewport?.sourceKey).toContain(
      "view-mode:view-a:pending",
    );
    expect(syncedController.viewport?.viewport).toEqual({
      x: 120,
      y: 130,
      zoom: 1,
    });
  });

  it("derives nested section paths, local bounds, parent clips, and drop zones", () => {
    assertNestedSectionScene(buildNestedSectionScene());

    const emptyScene = buildEmptyNestedSectionScene();
    const emptyGroup = must(
      emptyScene.sectionsById["empty-group"],
      "empty group section",
    );
    expect(emptyGroup.nestedDropZones).toEqual([
      {
        id: "drop-zone:empty-group:inside",
        parentSectionId: "empty-group",
        index: 0,
        kind: "inside-parent",
        childSectionId: null,
        rect: emptyGroup.geometry.childContentRegion,
      },
    ]);
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

  it("keys scene, row, and visible-range caches from explicit revision inputs", () => {
    const { state } = buildDictFixture();
    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: {
        projectRevision: "project-1",
        viewportRevision: "viewport-1",
        sectionScrollRevision: "scroll-1",
        themeRevision: "theme-1",
        fontRevision: "font-1",
        devicePixelRatioRevision: "dpr-1",
        textMeasurementRevision: "measure-1",
        highlighterRevision: "highlight-1",
      },
    });
    const nextScrollScene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: {
        projectRevision: "project-1",
        viewportRevision: "viewport-1",
        sectionScrollRevision: "scroll-2",
        themeRevision: "theme-1",
        fontRevision: "font-1",
        devicePixelRatioRevision: "dpr-1",
        textMeasurementRevision: "measure-1",
        highlighterRevision: "highlight-1",
      },
    });
    const dict = getRequiredDictScene(scene, "dict-a");
    const titleRow = must(
      dict.rows.find((row) => row.paramId === "title"),
      "title row",
    );

    expect(scene.cacheKeys.scene).toContain(
      "project-1:viewport-1:scroll-1:theme-1:font-1:dpr-1:measure-1:highlight-1",
    );
    expect(titleRow.cacheKeys.textMeasurement).toContain("measure-1");
    expect(titleRow.cacheKeys.valuePreview).toContain("hello");
    expect(nextScrollScene.cacheKeys.scene).not.toBe(scene.cacheKeys.scene);
  });

  it("threads ready text measurements through section and Dict text previews", () => {
    const { state } = buildDictFixture();
    const initialScene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: {
        textMeasurementRevision: "measure-1",
      },
    });
    const initialDict = getRequiredDictScene(initialScene, "dict-a");
    const titleRow = must(
      initialDict.rows.find((row) => row.paramId === "title"),
      "title row",
    );
    const valuePreview = titleRow.textPreviews.value;
    const sectionTitlePreview =
      initialScene.sectionsById["dict-a"]?.titleTextPreview;
    if (!sectionTitlePreview) {
      throw new Error("missing section title text preview");
    }

    const pending = beginWorkspaceTextMeasurementRequest(
      beginWorkspaceTextMeasurementRequest(
        createWorkspaceTextMeasurementCacheState(),
        valuePreview.cacheKey,
        "value-request",
      ),
      sectionTitlePreview.cacheKey,
      "title-request",
    );
    const completedValue = completeWorkspaceTextMeasurementRequest(
      pending,
      valuePreview.cacheKey,
      "value-request",
      {
        measuredWidth: 80,
        displayText: "hel...",
        displayWidth: 42,
        truncated: true,
      },
    );
    const completedTitle = completeWorkspaceTextMeasurementRequest(
      completedValue.cache,
      sectionTitlePreview.cacheKey,
      "title-request",
      {
        measuredWidth: 88,
        displayText: "Generic...",
        displayWidth: 56,
        truncated: true,
      },
    );

    const measuredScene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: {
        textMeasurementRevision: "measure-1",
      },
      textMeasurementCache: completedTitle.cache,
    });
    const measuredDict = getRequiredDictScene(measuredScene, "dict-a");
    const measuredTitleRow = must(
      measuredDict.rows.find((row) => row.paramId === "title"),
      "measured title row",
    );

    expect(valuePreview.ready).toBe(false);
    expect(measuredTitleRow.textPreviews.value).toMatchObject({
      ready: true,
      displayText: "hel...",
      truncated: true,
    });
    expect(
      measuredScene.sectionsById["dict-a"]?.titleTextPreview,
    ).toMatchObject({
      ready: true,
      displayText: "Generic...",
    });
  });

  it("defines Param support declarations for first Dict Param kinds", () => {
    expect(
      getWorkspaceParamSupportDeclaration(valueParam("SwitchParam", "true")),
    ).toMatchObject({
      canvasSupport: {
        passive: "preview",
        active: "canvas-immediate",
      },
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
      canvasSupport: {
        passive: "preview",
        active: "dom-native-overlay",
      },
      activeInputStrategy: "dom-native-overlay",
      commitMode: "onExplicitApply",
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
      rectKey: "100,100,240,28",
      initialValue: "old",
      draftValue: "old",
      commitMode: "onBlurOrEnter",
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
    const cancelled = reduceActiveEditorSession(session, { type: "cancel" });
    expect(cancelled.session).toBeNull();
    expect(cancelled.outcome).toMatchObject({
      kind: "cancel",
      session,
    });

    const controlTarget = {
      kind: "control" as const,
      sectionId: "dict-a",
      sectionPath: ["dict-a"],
      rowId: "dict-row:dict-a:unpinned:enabled",
      paramId: "enabled",
      controlId: "dict-row:dict-a:unpinned:enabled:control",
    };
    const controller = createWorkspaceCanvasControllerState({
      activeControlState: {
        id: "control-1",
        target: controlTarget,
        phase: "pressed",
        draftValue: true,
      },
      keyboardFocusedTarget: controlTarget,
    });
    expect(controller.activeControlState?.target).toEqual(controlTarget);
    expect(controller.keyboardFocusedTarget).toEqual(controlTarget);
  });

  it("keys passive code highlighting and discards stale async results", () => {
    const revisions = {
      themeRevision: "dark",
      fontRevision: "font",
      highlighterRevision: "highlighter",
    };
    const { state } = buildDictFixture();
    const initialScene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: revisions,
    });
    const initialDict = getRequiredDictScene(initialScene, "dict-a");
    const initialCodeRow = must(
      initialDict.rows.find((row) => row.paramId === "script"),
      "initial code row",
    );
    const key = must(
      initialCodeRow.codePreview?.cacheKey,
      "code preview cache key",
    );

    expect(key).toBe(
      buildWorkspaceCodeHighlightCacheKey({
        sectionId: "dict-a",
        paramId: "script",
        codeHash: hashWorkspaceCodePreviewValue("print(1)"),
        language: "python",
        themeRevision: "dark",
        fontRevision: "font",
        highlighterRevision: "highlighter",
        previewWidth: initialCodeRow.valueRect.width,
        previewLineLimit: 6,
      }),
    );
    expect(key).toContain(
      hashWorkspaceCodePreviewValue(initialCodeRow.passiveValue.text),
    );
    const mismatchedWidthKey = buildWorkspaceCodeHighlightCacheKey({
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
    expect(mismatchedWidthKey).not.toBe(key);

    const pending = beginWorkspaceCodeHighlightRequest(
      createWorkspaceCodeHighlightCacheState(),
      key,
      "request-1",
    );
    const stale = completeWorkspaceCodeHighlightRequest(pending, key, "old", [
      {
        line: 0,
        fromColumn: 0,
        toColumn: 5,
        text: "print",
        color: "#c678dd",
        fontWeight: "bold",
      },
    ]);
    const complete = completeWorkspaceCodeHighlightRequest(
      stale.cache,
      key,
      "request-1",
      [
        {
          line: 0,
          fromColumn: 0,
          toColumn: 5,
          text: "print",
          color: "#c678dd",
          fontWeight: "bold",
        },
      ],
    );

    expect(stale.applied).toBe(false);
    expect(complete.applied).toBe(true);
    expect(
      getWorkspaceCodeHighlightTokenRuns(complete.cache, key)?.[0],
    ).toMatchObject({
      line: 0,
      fromColumn: 0,
      toColumn: 5,
      text: "print",
      color: "#c678dd",
      fontWeight: "bold",
    });

    const scene = deriveWorkspaceScene({
      projectState: state,
      viewportSize: { width: 800, height: 600 },
      revisionKeys: revisions,
      highlightCache: complete.cache,
    });
    const dict = getRequiredDictScene(scene, "dict-a");
    const codeRow = dict.rows.find((row) => row.paramId === "script");
    expect(codeRow?.codePreview?.cacheKey).toContain("script");
    expect(codeRow?.codePreview?.tokenRuns?.[0]).toMatchObject({
      line: 0,
      fromColumn: 0,
      toColumn: 5,
      color: "#c678dd",
    });
  });

  it("keeps the scene model free of xyflow, dnd-kit, and section DOM imports", () => {
    const files = [
      new URL("./workspaceSceneTypes.ts", import.meta.url),
      new URL("./workspaceScene.ts", import.meta.url),
      new URL("./workspaceSceneProject.ts", import.meta.url),
      new URL("./workspaceSceneGeometry.ts", import.meta.url),
      new URL("./workspaceDictScene.ts", import.meta.url),
      new URL("./workspaceDictParamPreview.ts", import.meta.url),
      new URL("./workspaceController.ts", import.meta.url),
      new URL("./workspaceHighlightCache.ts", import.meta.url),
      new URL("./workspaceTextMeasurementCache.ts", import.meta.url),
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toContain("forks/xyflow");
    expect(source).not.toContain("forks/dnd-kit");
    expect(source).not.toContain("state/actions/sectionInfos");
    expect(source).not.toContain("components/Section");
    expect(source).not.toContain("components/Params");
  });
});
