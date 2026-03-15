import { describe, expect, it } from "vitest";

import { type ZustandProjectState } from "state/definitions";
import {
  createCallableSectionImpl,
  createChatSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getParamDisplayName,
  isManagedChatSection,
} from "./sectionFeatureSelectors";

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

function buildParamDisplayState({
  showParamDisplayNames,
  coreNameEditable,
  displayName,
}: {
  showParamDisplayNames: boolean;
  coreNameEditable: boolean;
  displayName: string;
}): ZustandProjectState {
  const sectionId = "section-callable";
  const sectionVariantId = "variant-callable";
  const sectionImplId = "impl-callable";
  const paramId = "param-1";
  const paramVariantId = "variant-param";
  const paramImplId = "impl-param";

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      showParamDisplayNames,
      sectionVariantMap: {
        [sectionId]: sectionVariantId,
      },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Callable",
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    },
    sectionVariants: {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        name: "Callable Variant",
        impl: sectionImplId,
        nonPresetImpls: [],
      }),
    },
    sectionImpls: {
      [sectionImplId]: createCallableSectionImpl(
        createUserDefaultCallableSectionImpl(),
        {
          id: sectionImplId,
          codeObjVariantMap: { [paramId]: paramVariantId },
        },
      ),
    },
    codeObjs: {
      [paramId]: createCore({
        id: paramId,
        name: "Param name",
        displayName,
        variants: [paramVariantId],
        defaultVariant: paramVariantId,
      }),
    },
    codeObjVariants: {
      [paramVariantId]: createVariant({
        id: paramVariantId,
        name: "Param Variant",
        impl: paramImplId,
        nonPresetImpls: [],
      }),
    },
    codeObjImpls: {
      [paramImplId]: createCodeParamCodeObjImpl(
        createUserDefaultCodeParamCodeObjImpl(),
        {
          id: paramImplId,
          name: "Param impl",
          coreNameEditable,
        },
      ),
    },
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

describe("section feature selectors", () => {
  it("detects managed chat sections from the authoritative state", () => {
    expect(isManagedChatSection(buildChatState(true), "section-1")).toBe(true);
    expect(isManagedChatSection(buildChatState(false), "section-1")).toBe(
      false,
    );
  });

  it("uses the param core name when the effective param keeps the core name editable", () => {
    const state = buildParamDisplayState({
      showParamDisplayNames: true,
      coreNameEditable: true,
      displayName: "Display name",
    });

    expect(getParamDisplayName(state, "section-callable", "param-1")).toBe(
      "Param name",
    );
  });

  it("uses the configured param display name when the effective param is not core-name editable", () => {
    const state = buildParamDisplayState({
      showParamDisplayNames: true,
      coreNameEditable: false,
      displayName: "Display name",
    });

    expect(getParamDisplayName(state, "section-callable", "param-1")).toBe(
      "Display name",
    );
  });
});
