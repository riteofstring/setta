import { type ZustandProjectState } from "state/definitions";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getAttachedTerminalParentIdForTerminalSection,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
} from "./sectionTerminalAttachmentQueries";

describe("sectionTerminalAttachmentQueries", () => {
  const codeSectionId = "code-1";
  const terminalSectionId = "terminal-1";
  const codeVariantId = "code-variant-1";
  const terminalVariantId = "terminal-variant-1";
  const codeImplId = "code-impl-1";
  const terminalImplId = "terminal-impl-1";

  function createStateForEmbeddedLookup(
    codeChildren: string[],
  ): ZustandProjectState {
    const sectionVariantMap = {
      [codeSectionId]: codeVariantId,
      [terminalSectionId]: terminalVariantId,
    };
    return {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap,
      }),
      sections: {
        [codeSectionId]: createCore({
          id: codeSectionId,
          name: "Code Section",
          variants: [codeVariantId],
          defaultVariant: codeVariantId,
          sharedModifier: {
            attachedTerminalSectionId: terminalSectionId,
            children: codeChildren,
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
  }

  it("returns embedded attachment details for a single attached terminal child", () => {
    const state = createStateForEmbeddedLookup([terminalSectionId]);

    expect(
      getAttachedTerminalParentIdForTerminalSection(state, terminalSectionId),
    ).toBe(codeSectionId);
    expect(
      getEmbeddedAttachedTerminalParentIdForTerminalSection(
        state,
        terminalSectionId,
      ),
    ).toBe(codeSectionId);
    expect(
      getEmbeddedAttachedTerminalForCodeSection(state, codeSectionId),
    ).toEqual({
      attachedTerminalId: terminalSectionId,
      isTerminalMinimized: false,
    });
  });

  it("treats second-child terminals as attached but not embedded", () => {
    const state = createStateForEmbeddedLookup([
      terminalSectionId,
      "section-2",
    ]);

    expect(
      getAttachedTerminalParentIdForTerminalSection(state, terminalSectionId),
    ).toBe(codeSectionId);
    expect(
      getEmbeddedAttachedTerminalParentIdForTerminalSection(
        state,
        terminalSectionId,
      ),
    ).toBeNull();
    expect(
      getEmbeddedAttachedTerminalForCodeSection(state, codeSectionId),
    ).toBeNull();
  });
});
