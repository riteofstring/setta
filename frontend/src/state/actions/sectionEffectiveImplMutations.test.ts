import {
  setCurrEffectiveCodeObjImplValue,
  setCurrEffectiveSectionImplValue,
  setSectionVariantImplValue,
} from "state/actions/sectionEffectiveImplMutations";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionEffectiveImpls";
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
import { describe, expect, it } from "vitest";

function createChatMutationState(options?: {
  isPreset?: boolean;
  unsharedKeys?: string[];
  variantIds?: string[];
}): {
  implId: string;
  sectionId: string;
  state: ZustandProjectState;
  variantIds: string[];
} {
  const sectionId = "chat-section-1";
  const variantIds = options?.variantIds ?? ["chat-variant-1"];
  const implId = "chat-impl-1";
  return {
    implId,
    sectionId,
    state: {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantIds[0] },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          variants: variantIds,
          defaultVariant: variantIds[0],
          sharedModifier: {},
          unsharedKeys: options?.unsharedKeys ?? [],
        }),
      },
      sectionImpls: {
        [implId]: createChatSectionImpl({
          id: implId,
          type: SectionTypeEnum.Chat,
          inputText: "base",
          isPreset: options?.isPreset ?? false,
        }),
      },
      sectionVariants: Object.fromEntries(
        variantIds.map((variantId) => [
          variantId,
          createVariant({
            id: variantId,
            impl: implId,
            modifier: {},
            nonPresetImpls: [],
          }),
        ]),
      ),
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
    } as ZustandProjectState,
    variantIds,
  };
}

function createCodeObjMutationState(): {
  codeObjId: string;
  codeObjImplId: string;
  sectionId: string;
  state: ZustandProjectState;
} {
  const sectionId = "callable-section-1";
  const sectionVariantId = "callable-variant-1";
  const sectionImplId = "callable-impl-1";
  const codeObjId = "param-1";
  const codeObjVariantId = "param-variant-1";
  const codeObjImplId = "param-impl-1";
  return {
    codeObjId,
    codeObjImplId,
    sectionId,
    state: {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: sectionVariantId },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          variants: [sectionVariantId],
          defaultVariant: sectionVariantId,
        }),
      },
      sectionImpls: {
        [sectionImplId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: sectionImplId,
            type: SectionTypeEnum.Callable,
            codeObjVariantMap: { [codeObjId]: codeObjVariantId },
          },
        ),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          modifier: {},
          nonPresetImpls: [],
        }),
      },
      codeObjs: {
        [codeObjId]: createCore({
          id: codeObjId,
          variants: [codeObjVariantId],
          defaultVariant: codeObjVariantId,
          sharedModifier: {},
          unsharedKeys: ["value"],
        }),
      },
      codeObjImpls: {
        [codeObjImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: codeObjImplId,
            value: "initial",
          },
        ),
      },
      codeObjVariants: {
        [codeObjVariantId]: createVariant({
          id: codeObjVariantId,
          impl: codeObjImplId,
          modifier: {},
          nonPresetImpls: [],
        }),
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {
        [sectionId]: null,
      },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState,
  };
}

describe("sectionEffectiveImplMutations", () => {
  it("writes shared keys into the section core shared modifier", () => {
    const { implId, sectionId, state, variantIds } = createChatMutationState();

    setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
      inputText: "shared-update",
    });

    expect(state.sections[sectionId]?.sharedModifier.inputText).toBe(
      "shared-update",
    );
    expect(state.sectionImpls[implId]?.inputText).toBe("base");
    expect(state.sectionVariants[variantIds[0]]?.modifier.inputText).toBe(
      undefined,
    );
    expect(getCurrEffectiveSectionImpl(state, sectionId).inputText).toBe(
      "shared-update",
    );
  });

  it("writes preset unshared keys into the targeted variant modifier", () => {
    const { implId, sectionId, state, variantIds } = createChatMutationState({
      isPreset: true,
      unsharedKeys: ["inputText"],
      variantIds: ["chat-variant-1", "chat-variant-2"],
    });

    setSectionVariantImplValue<"ChatSection">(state, sectionId, variantIds[1], {
      inputText: "variant-update",
    });

    expect(state.sectionVariants[variantIds[1]]?.modifier.inputText).toBe(
      "variant-update",
    );
    expect(state.sectionVariants[variantIds[0]]?.modifier.inputText).toBe(
      undefined,
    );
    expect(state.sectionImpls[implId]?.inputText).toBe("base");
  });

  it("writes non-preset code object unshared keys into the code object impl", () => {
    const { codeObjId, codeObjImplId, sectionId, state } =
      createCodeObjMutationState();

    expect(getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId).value).toBe(
      "initial",
    );

    setCurrEffectiveCodeObjImplValue<"CodeParamCodeObj">(
      state,
      sectionId,
      codeObjId,
      { value: "updated" },
    );

    expect(state.codeObjImpls[codeObjImplId]?.value).toBe("updated");
    expect(getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId).value).toBe(
      "updated",
    );
  });
});
