import { describe, expect, it } from "vitest";

import { type ZustandProjectState } from "state/definitions";
import {
  type BaseSectionImplUnion,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  isManagedChatSection,
} from "./sectionEffectiveImplSelectors";

function buildChatState(managed: boolean): ZustandProjectState {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "chat-impl-1";

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
      }),
    },
    sectionImpls: {
      [implId]: createChatSectionImpl({
        id: implId,
        type: SectionTypeEnum.Chat,
        chatId: "chat-1",
        managed,
      }),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
        nonPresetImpls: [implId],
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

describe("section effective impl selectors", () => {
  it("returns the current effective section impl when the type guard passes", () => {
    const state = buildChatState(true);

    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      "section-1",
      (
        sectionImpl: BaseSectionImplUnion,
      ): sectionImpl is Extract<
        BaseSectionImplUnion,
        { type: SectionTypeEnum.Chat }
      > => sectionImpl.type === SectionTypeEnum.Chat,
    );

    expect(impl.type).toBe(SectionTypeEnum.Chat);
  });

  it("detects managed chat sections from the authoritative state", () => {
    expect(isManagedChatSection(buildChatState(true), "section-1")).toBe(true);
    expect(isManagedChatSection(buildChatState(false), "section-1")).toBe(
      false,
    );
  });
});
