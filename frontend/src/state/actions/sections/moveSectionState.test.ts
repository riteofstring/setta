import { getCurrEffectiveSectionImpl } from "state/actions/sectionEffectiveImplSelectors";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createTerminalSectionImpl,
  createVariant,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moveSectionsToPane } from "./moveSectionPaneState";
import {
  moveSectionsIntoParent,
  removeSectionsFromParents,
} from "./moveSectionParentState";

describe("move section state owners", () => {
  const codeSectionId = "code-section";
  const terminalSectionId = "terminal-section";
  const codeVariantId = "code-variant";
  const terminalVariantId = "terminal-variant";
  const codeImplId = "code-impl";
  const terminalImplId = "terminal-impl";
  const viewModeId = "view-mode-1";

  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("moves sections into parents while attaching terminal metadata and width", () => {
    const codeCore: Core = createCore({
      id: codeSectionId,
      name: "Code Section",
      variants: [codeVariantId],
      defaultVariant: codeVariantId,
    });
    const terminalCore: Core = createCore({
      id: terminalSectionId,
      name: "Terminal Section",
      variants: [terminalVariantId],
      defaultVariant: terminalVariantId,
    });
    const codeVariant: Variant = createVariant({
      id: codeVariantId,
      name: "Code Variant",
      impl: codeImplId,
      nonPresetImpls: [],
    });
    const terminalVariant: Variant = createVariant({
      id: terminalVariantId,
      name: "Terminal Variant",
      impl: terminalImplId,
      nonPresetImpls: [],
    });

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [codeSectionId]: codeVariantId,
          [terminalSectionId]: terminalVariantId,
        },
      }),
      sections: {
        [codeSectionId]: codeCore,
        [terminalSectionId]: terminalCore,
      },
      sectionVariants: {
        [codeVariantId]: codeVariant,
        [terminalVariantId]: terminalVariant,
      },
      sectionImpls: {
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
          type: SectionTypeEnum.Code,
          size: { width: 480, height: 320 },
        }),
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
          size: { width: 200, height: 160 },
        }),
      },
      parentSectionMap: {
        [codeSectionId]: null,
        [terminalSectionId]: null,
      },
    });

    moveSectionsIntoParent({
      sectionIds: [terminalSectionId],
      newParentId: codeSectionId,
      newIndex: 0,
      state: useProjectState.getState(),
    });

    expect(useProjectState.getState().parentSectionMap[terminalSectionId]).toBe(
      codeSectionId,
    );
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), codeSectionId),
    ).toMatchObject({
      attachedTerminalSectionId: terminalSectionId,
    });
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), terminalSectionId)
        .size.width,
    ).toBe(480);
  });

  it("removes top-level pane state and view-mode layouts when moving into a parent", () => {
    const codeCore: Core = createCore({
      id: codeSectionId,
      name: "Code Section",
      variants: [codeVariantId],
      defaultVariant: codeVariantId,
    });
    const terminalCore: Core = createCore({
      id: terminalSectionId,
      name: "Terminal Section",
      variants: [terminalVariantId],
      defaultVariant: terminalVariantId,
    });
    const codeVariant: Variant = createVariant({
      id: codeVariantId,
      name: "Code Variant",
      impl: codeImplId,
      nonPresetImpls: [],
    });
    const terminalVariant: Variant = createVariant({
      id: terminalVariantId,
      name: "Terminal Variant",
      impl: terminalImplId,
      nonPresetImpls: [],
    });

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [codeSectionId]: codeVariantId,
          [terminalSectionId]: terminalVariantId,
        },
        topLevelSections: {
          [terminalSectionId]: { x: 20, y: 30, zIndex: 4 },
        },
        activeViewModeId: viewModeId,
        viewModes: {
          [viewModeId]: {
            id: viewModeId,
            topLevelSections: {
              [terminalSectionId]: { x: 20, y: 30, zIndex: 4 },
            },
          },
        },
      }),
      parentSectionMap: {
        [terminalSectionId]: codeSectionId,
      },
      sections: {
        [codeSectionId]: codeCore,
        [terminalSectionId]: terminalCore,
      },
      sectionVariants: {
        [codeVariantId]: codeVariant,
        [terminalVariantId]: terminalVariant,
      },
      sectionImpls: {
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
          type: SectionTypeEnum.Code,
          attachedTerminalSectionId: terminalSectionId,
        }),
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
    });
    useNodeInternals.setState({
      x: new Map([
        [
          terminalSectionId,
          {
            id: terminalSectionId,
            position: { x: 20, y: 30 },
            width: null,
            height: null,
            zIndex: 4,
            tempZIndex: 4,
          },
        ],
      ]),
    });

    removeSectionsFromParents({
      sectionIds: [terminalSectionId],
      parentsById: { [terminalSectionId]: codeSectionId },
      state: useProjectState.getState(),
      removeTopLevelNodes: true,
    });

    expect(
      useProjectState.getState().projectConfig.topLevelSections[
        terminalSectionId
      ],
    ).toBeUndefined();
    expect(
      useProjectState.getState().projectConfig.viewModes[viewModeId]
        ?.topLevelSections?.[terminalSectionId],
    ).toBeUndefined();
    expect(useNodeInternals.getState().x.has(terminalSectionId)).toBe(false);
  });

  it("adds pane nodes and syncs active view mode layouts when moving to the pane", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        activeViewModeId: viewModeId,
        viewModes: {
          [viewModeId]: {
            id: viewModeId,
            topLevelSections: {},
          },
        },
        topLevelSections: {},
      }),
      parentSectionMap: {
        [terminalSectionId]: codeSectionId,
      },
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
    });
    useNodeInternals.setState({ x: new Map() });

    moveSectionsToPane({
      sectionIds: [terminalSectionId],
      positionsById: {
        [terminalSectionId]: { x: 140, y: 180 },
      },
      state: useProjectState.getState(),
    });

    expect(useProjectState.getState().parentSectionMap[terminalSectionId]).toBe(
      null,
    );
    expect(
      useProjectState.getState().projectConfig.topLevelSections[
        terminalSectionId
      ],
    ).toMatchObject({
      x: 140,
      y: 180,
    });
    expect(
      useProjectState.getState().projectConfig.viewModes[viewModeId]
        ?.topLevelSections?.[terminalSectionId],
    ).toMatchObject({
      x: 140,
      y: 180,
    });
    expect(useNodeInternals.getState().x.get(terminalSectionId)).toMatchObject({
      position: { x: 140, y: 180 },
    });
  });
});
