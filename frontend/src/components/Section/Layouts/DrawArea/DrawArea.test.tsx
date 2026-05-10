/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createDrawAreaLayer,
  createProjectConfig,
  DrawAreaBrushShapeEnum,
  DrawAreaModeEnum,
  SectionTypeEnum,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DrawArea } from "./DrawArea";
import { DrawAreaControls } from "./DrawAreaControls";

const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

const sectionCore: Core = {
  id: sectionId,
  name: "Draw",
  displayName: "",
  variants: [variantId],
  defaultVariant: variantId,
  sharedModifier: {},
  unsharedKeys: [],
};

const sectionVariant: Variant = {
  id: variantId,
  name: "Variant",
  impl: implId,
  nonPresetImpls: [],
  modifier: {},
  isFrozen: false,
};

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function setDrawSectionState() {
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = {
      [implId]: {
        activeLayerIdx: 0,
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
        brushColor: "#111827",
        brushOpacity: 1,
        brushShape: DrawAreaBrushShapeEnum.round,
        brushSize: 8,
        canvasMode: DrawAreaModeEnum.draw,
        colorChoices: [{ color: "#111827", description: "Ink" }],
        drawThrottleDelay: 0,
        eraserBrushSize: 16,
        id: implId,
        isFrozen: false,
        isInOtherProjectConfigs: false,
        isMinimized: false,
        isPreset: false,
        layers: [
          createDrawAreaLayer({
            layerOpacity: 1,
            name: "Layer 1",
          }),
        ],
        name: "Draw",
        positionAndSizeLocked: false,
        renderedImagePath: "",
        size: { width: 500, height: 320 },
        styleColor: null,
        tagColor: null,
        type: SectionTypeEnum.Draw,
      },
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
}

function tagWithGpuControl(markup: string, value: string): string | undefined {
  return markup.match(
    new RegExp(`<[^>]+data-gpu-flow-control="${value}"[^>]*>`),
  )?.[0];
}

describe("DrawArea GPU flow ownership", () => {
  beforeEach(() => {
    resetProjectStores();
    setDrawSectionState();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("marks the draw toolbar as a GPU flow interactive nodrag region", () => {
    const markup = renderToStaticMarkup(
      <DrawAreaControls
        sectionId={sectionId}
        activeLayerIdx={0}
        brushColor="#111827"
        brushOpacity={1}
        brushSize={8}
        brushShape={DrawAreaBrushShapeEnum.round}
        eraserBrushSize={16}
        layerOpacity={1}
        canvasMode={DrawAreaModeEnum.draw}
        clearStrokes={() => {}}
      />,
    );
    const toolbarTag = tagWithGpuControl(markup, `draw-controls:${sectionId}`);

    expect(toolbarTag).toBeDefined();
    expect(toolbarTag).toContain('data-gpu-flow-interactive="true"');
    expect(toolbarTag).toContain("nodrag");
    expect(toolbarTag).toContain("nopan");
    expect(toolbarTag).toContain("nowheel");
  });

  it("marks the draw canvas surface as a GPU flow interactive nodrag region", () => {
    const markup = renderToStaticMarkup(<DrawArea sectionId={sectionId} />);
    const canvasSurfaceTag = tagWithGpuControl(
      markup,
      `draw-canvas:${sectionId}`,
    );
    const activeCanvasTag = tagWithGpuControl(
      markup,
      `draw-canvas-layer:${sectionId}:0`,
    );

    expect(canvasSurfaceTag).toBeDefined();
    expect(canvasSurfaceTag).toContain('data-gpu-flow-interactive="true"');
    expect(canvasSurfaceTag).toContain("nodrag");
    expect(canvasSurfaceTag).toContain("nopan");
    expect(canvasSurfaceTag).toContain("nowheel");
    expect(activeCanvasTag).toBeDefined();
    expect(activeCanvasTag).toContain('data-gpu-flow-interactive="true"');
    expect(activeCanvasTag).toContain("nodrag");
    expect(activeCanvasTag).toContain("nopan");
    expect(activeCanvasTag).toContain("nowheel");
  });
});
