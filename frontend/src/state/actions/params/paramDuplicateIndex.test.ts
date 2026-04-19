import { describe, expect, it } from "vitest";
import type { ZustandProjectState } from "state/definitions";
import {
  createProjectConfig,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createSingletonSections,
  createVariant,
} from "utils/generatedTypes";
import {
  buildParamDuplicateIndex,
  createParamDuplicateIndexSelector,
} from "./paramDuplicateIndex";

function createParamDuplicateIndexState(): ZustandProjectState {
  const sectionId = "settings-section__callableSectionDefault";
  const sectionVariantId = "section-variant";
  const sectionImplId = "section-impl";
  const rootParamId = "param-root";
  const rootParamVariantId = "param-root-variant";
  const rootParamImplId = "param-root-impl";
  const firstChildId = "param-first";
  const firstChildVariantId = "param-first-variant";
  const firstChildImplId = "param-first-impl";
  const secondChildId = "param-second";
  const secondChildVariantId = "param-second-variant";
  const secondChildImplId = "param-second-impl";

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Callable",
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    },
    sectionImpls: {
      [sectionImplId]: createCallableSectionImpl({
        id: sectionImplId,
        callable: rootParamId,
        codeObjVariantMap: {
          [rootParamId]: rootParamVariantId,
          [firstChildId]: firstChildVariantId,
          [secondChildId]: secondChildVariantId,
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
      [rootParamId]: createCore({
        id: rootParamId,
        name: "root",
        variants: [rootParamVariantId],
        defaultVariant: rootParamVariantId,
      }),
      [firstChildId]: createCore({
        id: firstChildId,
        name: "duplicate",
        variants: [firstChildVariantId],
        defaultVariant: firstChildVariantId,
      }),
      [secondChildId]: createCore({
        id: secondChildId,
        name: "duplicate",
        variants: [secondChildVariantId],
        defaultVariant: secondChildVariantId,
      }),
    },
    codeObjImpls: {
      [rootParamImplId]: {
        children: [firstChildId, secondChildId],
        coreNameEditable: false,
        coreNameType: "TEXT",
        defaultVal: "",
        description: "",
        id: rootParamImplId,
        isPreset: false,
        name: "root",
        passingStyle: "DEFAULT",
        type: "CodeCallable",
        typeAnnotation: "",
        value: "",
      },
      [firstChildImplId]: createCodeParamCodeObjImpl({
        id: firstChildImplId,
        value: "1",
      }),
      [secondChildImplId]: createCodeParamCodeObjImpl({
        id: secondChildImplId,
        value: "2",
      }),
    },
    codeObjVariants: {
      [rootParamVariantId]: createVariant({
        id: rootParamVariantId,
        impl: rootParamImplId,
        nonPresetImpls: [rootParamImplId],
      }),
      [firstChildVariantId]: createVariant({
        id: firstChildVariantId,
        impl: firstChildImplId,
        nonPresetImpls: [firstChildImplId],
      }),
      [secondChildVariantId]: createVariant({
        id: secondChildVariantId,
        impl: secondChildImplId,
        nonPresetImpls: [secondChildImplId],
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

describe("createParamDuplicateIndexSelector", () => {
  it("reuses the previous result when unrelated project config fields change", () => {
    const sectionId = "settings-section__callableSectionDefault";
    const selector = createParamDuplicateIndexSelector(sectionId);
    const state = createParamDuplicateIndexState();

    const first = selector(state);
    const unrelatedState = {
      ...state,
      projectConfig: {
        ...state.projectConfig,
        viewport: { x: 120, y: 48, zoom: 1.25 },
        viewportInitialized: true,
      },
    } as ZustandProjectState;

    expect(selector(unrelatedState)).toBe(first);
  });

  it("invalidates the cached result when param names change", () => {
    const sectionId = "settings-section__callableSectionDefault";
    const selector = createParamDuplicateIndexSelector(sectionId);
    const state = createParamDuplicateIndexState();

    const first = selector(state);
    const renamedState = {
      ...state,
      codeObjs: {
        ...state.codeObjs,
        "param-second": {
          ...state.codeObjs["param-second"],
          name: "renamed",
        },
      },
    } as ZustandProjectState;

    const second = selector(renamedState);

    expect(second).not.toBe(first);
    expect(buildParamDuplicateIndex(renamedState, sectionId)).toEqual(second);
    expect(second.namesByParent["param-root"]?.duplicate).toEqual([
      "param-first",
    ]);
    expect(second.namesByParent["param-root"]?.renamed).toEqual([
      "param-second",
    ]);
  });
});
