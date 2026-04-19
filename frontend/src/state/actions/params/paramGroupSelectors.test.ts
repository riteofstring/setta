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
  buildEdgeStripState,
  buildPinnedParamsState,
  buildUnpinnedParamsState,
  createEdgeStripStateSelector,
  createPinnedParamsStateSelector,
  createUnpinnedParamsStateSelector,
} from "./paramGroupSelectors";

function createParamGroupSelectorState(): ZustandProjectState {
  const sectionId = "settings-section__dictSectionDefault";
  const sectionVariantId = "section-variant";
  const sectionImplId = "section-impl";
  const edgeParamId = "param-edge";
  const edgeParamVariantId = "param-edge-variant";
  const edgeParamImplId = "param-edge-impl";
  const pinnedParamId = "param-pinned";
  const pinnedParamVariantId = "param-pinned-variant";
  const pinnedParamImplId = "param-pinned-impl";
  const unpinnedParamId = "param-unpinned";
  const unpinnedParamVariantId = "param-unpinned-variant";
  const unpinnedParamImplId = "param-unpinned-impl";

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
      showParamDisplayNames: false,
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
        hideUnpinnedParams: true,
        positionAndSizeLocked: false,
        styleColor: "sky",
        edgeInputParams: [edgeParamId],
        edgeOutputPorts: [{ id: "output-1", accessor: "" }],
        selectedParams: [edgeParamId],
        codeObjVariantMap: {
          [edgeParamId]: edgeParamVariantId,
          [pinnedParamId]: pinnedParamVariantId,
          [unpinnedParamId]: unpinnedParamVariantId,
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
      [edgeParamId]: createCore({
        id: edgeParamId,
        name: "Edge Param",
        variants: [edgeParamVariantId],
        defaultVariant: edgeParamVariantId,
      }),
      [pinnedParamId]: createCore({
        id: pinnedParamId,
        name: "Pinned Param",
        variants: [pinnedParamVariantId],
        defaultVariant: pinnedParamVariantId,
      }),
      [unpinnedParamId]: createCore({
        id: unpinnedParamId,
        name: "Unpinned Param",
        variants: [unpinnedParamVariantId],
        defaultVariant: unpinnedParamVariantId,
      }),
    },
    codeObjImpls: {
      [edgeParamImplId]: createCodeParamCodeObjImpl({
        id: edgeParamImplId,
        value: "edge",
      }),
      [pinnedParamImplId]: createCodeParamCodeObjImpl({
        id: pinnedParamImplId,
        value: "pinned",
      }),
      [unpinnedParamImplId]: createCodeParamCodeObjImpl({
        id: unpinnedParamImplId,
        value: "unpinned",
      }),
    },
    codeObjVariants: {
      [edgeParamVariantId]: createVariant({
        id: edgeParamVariantId,
        impl: edgeParamImplId,
        nonPresetImpls: [edgeParamImplId],
      }),
      [pinnedParamVariantId]: createVariant({
        id: pinnedParamVariantId,
        impl: pinnedParamImplId,
        nonPresetImpls: [pinnedParamImplId],
      }),
      [unpinnedParamVariantId]: createVariant({
        id: unpinnedParamVariantId,
        impl: unpinnedParamImplId,
        nonPresetImpls: [unpinnedParamImplId],
      }),
    },
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: { [sectionId]: null },
    shownParamIds: {
      [sectionVariantId]: {
        pinned: {
          requiredParamIdsToPaths: {
            [edgeParamId]: [edgeParamId],
            [pinnedParamId]: [pinnedParamId],
          },
          topLevelParamIds: [edgeParamId, pinnedParamId],
        },
        unpinned: {
          requiredParamIdsToPaths: {
            [unpinnedParamId]: [unpinnedParamId],
          },
          topLevelParamIds: [unpinnedParamId],
        },
      },
    },
    projectChatWindowing: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;
}

describe("paramGroupSelectors", () => {
  it("reuses the pinned params result when unrelated viewport fields change", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const selector = createPinnedParamsStateSelector(sectionId);
    const state = createParamGroupSelectorState();

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

  it("invalidates the unpinned params result when edge inputs change", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const selector = createUnpinnedParamsStateSelector(sectionId);
    const state = createParamGroupSelectorState();

    const first = selector(state);
    const updatedState = {
      ...state,
      sectionImpls: {
        ...state.sectionImpls,
        "section-impl": createDictSectionImpl({
          ...state.sectionImpls["section-impl"],
          edgeInputParams: ["param-edge", "param-unpinned"],
        }),
      },
    } as ZustandProjectState;

    const second = selector(updatedState);

    expect(second).not.toBe(first);
    expect(buildUnpinnedParamsState(updatedState, sectionId)).toEqual(second);
    expect(second.topLevelParamIds).toEqual([]);
    expect(second.hasPinnedParams).toBe(true);
  });

  it("reuses the edge strip result when unrelated project config fields change", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const selector = createEdgeStripStateSelector(sectionId);
    const state = createParamGroupSelectorState();

    const first = selector(state);
    const unrelatedState = {
      ...state,
      projectConfig: {
        ...state.projectConfig,
        viewport: { x: -40, y: 88, zoom: 0.9 },
        viewportInitialized: true,
      },
    } as ZustandProjectState;

    expect(selector(unrelatedState)).toBe(first);
  });

  it("invalidates the edge strip result when edge input labels change", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const selector = createEdgeStripStateSelector(sectionId);
    const state = createParamGroupSelectorState();

    const first = selector(state);
    const renamedState = {
      ...state,
      codeObjs: {
        ...state.codeObjs,
        "param-edge": {
          ...state.codeObjs["param-edge"],
          name: "Renamed Edge Param",
        },
      },
    } as ZustandProjectState;

    const second = selector(renamedState);

    expect(second).not.toBe(first);
    expect(buildEdgeStripState(renamedState, sectionId)).toEqual(second);
    expect(second.inputPorts).toEqual([
      { id: "param-edge", label: "Renamed Edge Param" },
    ]);
    expect(second.outputPorts[0]?.label).toBe("value");
  });

  it("builds the pinned params state from the filtered shown param ids", () => {
    const sectionId = "settings-section__dictSectionDefault";
    const state = createParamGroupSelectorState();

    expect(buildPinnedParamsState(state, sectionId)).toEqual({
      requiredParamIdsToPaths: {
        "param-pinned": ["param-pinned"],
      },
      topLevelParamIds: ["param-pinned"],
      shouldRoundBottom: false,
      positionAndSizeLocked: false,
      styleColor: "sky",
    });
  });
});
