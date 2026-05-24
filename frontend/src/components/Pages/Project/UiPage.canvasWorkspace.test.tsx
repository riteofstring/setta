import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCore,
  createDictSectionImpl,
  createSingleConfig,
  createVariant,
  type BaseCodeObjImplUnion,
  type DictSectionImpl,
  type SingleConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UIPage } from "./UiPage";

describe("UIPage canvas workspace root", () => {
  beforeEach(() => {
    resetProjectStores();
    installDictFixture();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("mounts the single canvas workspace shell instead of xyflow or dnd-kit", () => {
    const markup = renderToStaticMarkup(<UIPage />);

    expect(countMatches(markup, "data-workspace-canvas-root")).toBe(1);
    expect(countMatches(markup, "data-workspace-canvas-surface")).toBe(1);
    expect(countMatches(markup, "<canvas")).toBe(1);
    expect(markup).toContain("data-workspace-canvas-overlay-host");
    expect(markup).toContain('id="setta-codemirror-tooltips"');
    expect(markup).toContain('id="setta-popover-portals"');

    expect(markup).not.toContain("react-flow");
    expect(markup).not.toContain("react-flow__minimap");
    expect(markup).not.toContain("data-section-id");
    expect(markup).not.toContain("data-section-type");
    expect(markup).not.toContain("data-param-row");
    expect(markup).not.toContain("ParamContainer");
    expect(markup).not.toContain('aria-roledescription="draggable"');
  });

  it("keeps the active workspace root source free of old workspace imports", () => {
    const source = [
      readFileSync(new URL("./UiPage.tsx", import.meta.url), "utf8"),
      readFileSync(
        new URL("../../WorkspaceCanvas/WorkspaceCanvas.tsx", import.meta.url),
        "utf8",
      ),
      readFileSync(
        new URL(
          "../../WorkspaceCanvas/workspaceCanvasRenderer.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ].join("\n");

    expect(source).not.toContain("forks/xyflow");
    expect(source).not.toContain("forks/dnd-kit");
    expect(source).not.toContain("@dnd-kit");
    expect(source).not.toContain("ReactFlow");
    expect(source).not.toContain("SectionDndContext");
    expect(source).not.toContain("ResponsiveMiniMap");
    expect(source).not.toContain("components/Section");
    expect(source).not.toContain("components/Params");
  });
});

function installDictFixture() {
  const projectState = buildDictProjectState();
  useProjectState.setState((state) => {
    Object.assign(state, projectState);
    state.previewSectionVariantMap = {};
  });
}

function buildDictProjectState(): SingleConfig {
  const state = createSingleConfig();
  state.projectConfig.id = "project-1";
  state.projectConfig.viewport = { x: 0, y: 0, zoom: 1 };
  state.projectConfig.viewportInitialized = true;
  state.projectConfig.showParamDisplayNames = true;

  const sectionId = "dict-a";
  const sectionVariantId = `${sectionId}-variant`;
  const sectionImplId = `${sectionId}-impl`;
  const sectionImpl = createDictSectionImpl({
    id: sectionImplId,
    name: "Dict A",
    topLevelParamId: "root",
    size: {
      width: { Auto: false, Value: 320 },
      height: { Auto: false, Value: 180 },
    },
  });

  state.sections[sectionId] = createCore({
    id: sectionId,
    name: sectionId,
    displayName: sectionId,
  });
  state.sectionImpls[sectionImplId] = sectionImpl;
  state.sectionVariants[sectionVariantId] = createVariant({
    id: sectionVariantId,
    impl: sectionImplId,
    name: "Dict A variant",
  });
  state.projectConfig.sectionVariantMap[sectionId] = sectionVariantId;
  state.projectConfig.topLevelSections[sectionId] = {
    x: 16,
    y: 24,
    w: 320,
    h: 180,
    zIndex: 0,
  };
  state.parentSectionMap[sectionId] = null;

  addParam(state, sectionImpl, "root", nestedParam(["title"]));
  addParam(state, sectionImpl, "title", textParam("Hello"), {
    displayName: "Title",
  });
  state.shownParamIds[sectionVariantId] = {
    pinned: {
      requiredParamIdsToPaths: {},
      topLevelParamIds: [],
    },
    unpinned: {
      requiredParamIdsToPaths: {
        title: ["title"],
      },
      topLevelParamIds: ["title"],
    },
  };
  return state;
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
  state.codeObjs[paramId] = createCore({
    id: paramId,
    name: paramId,
    displayName: options.displayName ?? paramId,
  });
  state.codeObjImpls[implId] = {
    ...impl,
    id: implId,
    name: impl.name || paramId,
  } as BaseCodeObjImplUnion;
  state.codeObjVariants[variantId] = createVariant({
    id: variantId,
    impl: implId,
    name: `${paramId} variant`,
  });
  sectionImpl.codeObjVariantMap[paramId] = variantId;
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

function textParam(value: string): BaseCodeObjImplUnion {
  return {
    coreNameEditable: false,
    coreNameType: "TEXT",
    defaultVal: "",
    description: "",
    id: "",
    isPreset: false,
    name: "",
    passingStyle: "DEFAULT",
    type: "TextParam",
    typeAnnotation: "",
    uiType: "TEXT",
    value,
  } as BaseCodeObjImplUnion;
}

function countMatches(value: string, needle: string) {
  return value.split(needle).length - 1;
}
