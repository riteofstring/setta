import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createListRootSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createUserDefaultListRootSectionImpl,
  createVariant,
  ListRootViewModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getSectionChildren,
  getSectionIsHorizontalOrientation,
  getSectionType,
  isBaseCodeSectionType,
} from "./sectionStructureQueries";

describe("sectionStructureQueries", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("treats list root kanban view as horizontal", () => {
    const sectionId = "list-root-1";
    const variantId = "variant-1";
    const implId = "impl-1";
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {
        [implId]: createListRootSectionImpl(
          createUserDefaultListRootSectionImpl(),
          {
            id: implId,
            viewMode: ListRootViewModeEnum.kanban,
          },
        ),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState);

    expect(getSectionIsHorizontalOrientation(sectionId)).toBe(true);
  });

  it("supports the existing getSectionType call signatures", () => {
    const codeSectionId = "code-1";
    const terminalSectionId = "terminal-1";
    const codeVariantId = "code-variant-1";
    const terminalVariantId = "terminal-variant-1";
    const codeImplId = "code-impl-1";
    const terminalImplId = "terminal-impl-1";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [codeSectionId]: codeVariantId,
          [terminalSectionId]: terminalVariantId,
        },
      }),
      sections: {
        [codeSectionId]: createCore({
          id: codeSectionId,
          name: "Code Section",
          variants: [codeVariantId],
          defaultVariant: codeVariantId,
          sharedModifier: {
            attachedTerminalSectionId: terminalSectionId,
            children: [terminalSectionId],
          },
          unsharedKeys: [],
        }),
        [terminalSectionId]: createCore({
          id: terminalSectionId,
          name: "Terminal Section",
          variants: [terminalVariantId],
          defaultVariant: terminalVariantId,
          sharedModifier: {},
          unsharedKeys: [],
        }),
      },
      sectionImpls: {
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
          type: SectionTypeEnum.Code,
        }),
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
          isMinimized: false,
        }),
      },
      sectionVariants: {
        [codeVariantId]: createVariant({
          id: codeVariantId,
          name: "Code Variant",
          impl: codeImplId,
          nonPresetImpls: [],
        }),
        [terminalVariantId]: createVariant({
          id: terminalVariantId,
          name: "Terminal Variant",
          impl: terminalImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [codeSectionId]: null,
        [terminalSectionId]: codeSectionId,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;
    useProjectState.setState(state);

    expect(getSectionType(state, codeSectionId)).toBe(SectionTypeEnum.Code);
    expect(getSectionType(codeSectionId, state)).toBe(SectionTypeEnum.Code);
    expect(getSectionType(codeSectionId)).toBe(SectionTypeEnum.Code);
    expect(getSectionChildren(state, codeSectionId)).toEqual([
      terminalSectionId,
    ]);
  });

  it("treats code and generated python sections as base code types", () => {
    expect(isBaseCodeSectionType(SectionTypeEnum.Code)).toBe(true);
    expect(isBaseCodeSectionType(SectionTypeEnum.GenPythonCode)).toBe(true);
    expect(isBaseCodeSectionType(SectionTypeEnum.GenPythonMetadata)).toBe(true);
    expect(isBaseCodeSectionType(SectionTypeEnum.Chat)).toBe(false);
  });
});
