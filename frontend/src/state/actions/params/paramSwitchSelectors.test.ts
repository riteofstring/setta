import { describe, expect, it } from "vitest";
import type { ZustandProjectState } from "state/definitions";
import {
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createVariant,
} from "utils/generatedTypes";
import {
  buildParamSwitchProjectState,
  createParamSwitchProjectStateSelector,
} from "./paramSwitchSelectors";

function createParamSwitchSelectorState(): ZustandProjectState {
  const sectionId = "settings-section__dictSectionDefault";
  const sectionVariantId = "section-variant";
  const sectionImplId = "section-impl";
  const paramInfoId = "param-code";
  const paramVariantId = "param-variant";
  const paramImplId = "param-impl";
  const siblingParamInfoId = "param-sibling";
  const siblingParamVariantId = "param-sibling-variant";
  const siblingParamImplId = "param-sibling-impl";

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Dict",
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    },
    sectionImpls: {
      [sectionImplId]: createDictSectionImpl({
        id: sectionImplId,
        positionAndSizeLocked: false,
        selectedParams: [],
        codeObjVariantMap: {
          [paramInfoId]: paramVariantId,
          [siblingParamInfoId]: siblingParamVariantId,
        },
      }),
    },
    sectionVariants: {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        impl: sectionImplId,
        nonPresetImpls: [sectionImplId],
      }),
    },
    codeObjs: {
      [paramInfoId]: createCore({
        id: paramInfoId,
        name: "Code Param",
        variants: [paramVariantId],
        defaultVariant: paramVariantId,
      }),
      [siblingParamInfoId]: createCore({
        id: siblingParamInfoId,
        name: "Sibling Param",
        variants: [siblingParamVariantId],
        defaultVariant: siblingParamVariantId,
      }),
    },
    codeObjImpls: {
      [paramImplId]: createCodeParamCodeObjImpl({
        id: paramImplId,
        coreNameEditable: false,
      }),
      [siblingParamImplId]: createCodeParamCodeObjImpl({
        id: siblingParamImplId,
        coreNameEditable: false,
      }),
    },
    codeObjVariants: {
      [paramVariantId]: createVariant({
        id: paramVariantId,
        impl: paramImplId,
        nonPresetImpls: [paramImplId],
      }),
      [siblingParamVariantId]: createVariant({
        id: siblingParamVariantId,
        impl: siblingParamImplId,
        nonPresetImpls: [siblingParamImplId],
      }),
    },
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: { [sectionId]: null },
    shownParamIds: {},
    projectChatWindowing: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;
}

describe("paramSwitchSelectors", () => {
  it("reuses the param switch state when unrelated project config fields change", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const paramInfoId = "param-code";
    const selector = createParamSwitchProjectStateSelector(
      sectionId,
      paramInfoId,
    );
    const state = createParamSwitchSelectorState();

    const first = selector(state);
    const unrelatedState = {
      ...state,
      projectConfig: {
        ...state.projectConfig,
        viewport: { x: 32, y: -18, zoom: 1.4 },
        viewportInitialized: true,
      },
    } as ZustandProjectState;

    expect(selector(unrelatedState)).toBe(first);
  });

  it("reuses the param switch state when an unrelated sibling param changes", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const paramInfoId = "param-code";
    const selector = createParamSwitchProjectStateSelector(
      sectionId,
      paramInfoId,
    );
    const state = createParamSwitchSelectorState();

    const first = selector(state);
    const updatedState = {
      ...state,
      codeObjImpls: {
        ...state.codeObjImpls,
        "param-sibling-impl": createCodeParamCodeObjImpl({
          ...state.codeObjImpls["param-sibling-impl"],
          coreNameEditable: true,
        }),
      },
    } as ZustandProjectState;

    expect(selector(updatedState)).toBe(first);
  });

  it("invalidates the param switch state when selection changes", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const paramInfoId = "param-code";
    const selector = createParamSwitchProjectStateSelector(
      sectionId,
      paramInfoId,
    );
    const state = createParamSwitchSelectorState();

    const first = selector(state);
    const selectedState = {
      ...state,
      sectionImpls: {
        ...state.sectionImpls,
        "section-impl": createDictSectionImpl({
          ...state.sectionImpls["section-impl"],
          selectedParams: [paramInfoId],
        }),
      },
    } as ZustandProjectState;

    const second = selector(selectedState);

    expect(second).not.toBe(first);
    expect(buildParamSwitchProjectState(selectedState, sectionId, paramInfoId))
      .toEqual(second);
    expect(second?.paramIsSelected).toBe(true);
  });

  it("invalidates the param switch state when the code object impl changes", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const paramInfoId = "param-code";
    const selector = createParamSwitchProjectStateSelector(
      sectionId,
      paramInfoId,
    );
    const state = createParamSwitchSelectorState();

    const first = selector(state);
    const updatedState = {
      ...state,
      codeObjImpls: {
        ...state.codeObjImpls,
        "param-impl": createCodeParamCodeObjImpl({
          ...state.codeObjImpls["param-impl"],
          coreNameEditable: true,
        }),
      },
    } as ZustandProjectState;

    const second = selector(updatedState);

    expect(second).not.toBe(first);
    expect(buildParamSwitchProjectState(updatedState, sectionId, paramInfoId))
      .toEqual(second);
    expect(second?.isKwarg).toBe(true);
    expect(second?.hasChildren).toBe(false);
  });
});
