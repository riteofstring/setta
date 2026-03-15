import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { type ZustandProjectState } from "state/definitions";
import {
  createCore,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  DrawAreaBrushShapeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { setDrawAreaSectionSize } from "./sectionAspectRatioSizing";

function createDrawState(): ZustandProjectState {
  const sectionId = "draw-section-1";
  const variantId = "draw-variant-1";
  const implId = "draw-impl-1";

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        variants: [variantId],
        defaultVariant: variantId,
        sharedModifier: {},
        unsharedKeys: [],
      }),
    },
    sectionImpls: {
      [implId]: {
        type: SectionTypeEnum.Draw,
        id: implId,
        name: "Draw",
        isFrozen: false,
        isInOtherProjectConfigs: false,
        tagColor: null,
        size: { width: "auto", height: 320 },
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
        isMinimized: false,
        positionAndSizeLocked: false,
        isPreset: false,
        layers: [],
        activeLayerIndex: 0,
        selectedLayerItemIds: [],
        currentBrushColor: "#000000",
        currentBrushOpacity: 1,
        currentBrushShape: DrawAreaBrushShapeEnum.round,
        currentBrushSize: 4,
      },
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
        modifier: {},
        nonPresetImpls: [],
      }),
    },
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: {
      [sectionId]: null,
    },
    shownParamIds: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;
}

describe("setDrawAreaSectionSize", () => {
  it("materializes auto dimensions into explicit section size while returning canvas size", () => {
    const state = createDrawState();

    const canvasSize = setDrawAreaSectionSize(
      "draw-section-1",
      { width: "auto", height: 320 },
      state,
    );

    expect(canvasSize).toEqual({ width: 500, height: 200 });
    expect(getCurrEffectiveSectionImpl(state, "draw-section-1").size).toEqual({
      width: 524,
      height: 320,
    });
  });
});
