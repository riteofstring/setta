import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";

import { formatSectionsForAppPrompt } from "./appConfigPromptUtils";

describe("formatSectionsForAppPrompt", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("lists core section ids + param ids (not section impl ids)", () => {
    const sectionId = "section-core-1";
    const sectionImplId = "section-impl-1";
    const sectionVariantId = "section-variant-1";

    const callableCodeObjId = "callable-code-obj";
    const callableCodeObjVariantId = "callable-code-obj-variant";
    const callableCodeObjImplId = "callable-code-obj-impl";

    const paramCodeObjId = "param-code-obj";
    const paramCodeObjVariantId = "param-code-obj-variant";
    const paramCodeObjImplId = "param-code-obj-impl";

    useProjectState.setState((state) => {
      state.sections = {
        [sectionId]: createCore({ id: sectionId, name: "dull_ocean" }),
      };
      state.projectConfig = createProjectConfig({
        id: "config-1",
        sectionVariantMap: { [sectionId]: sectionVariantId },
      });
      state.sectionVariants = {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          nonPresetImpls: [sectionImplId],
        }),
      };
      state.sectionImpls = {
        [sectionImplId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: sectionImplId,
            name: "quick_quiet",
            callable: callableCodeObjId,
            codeObjVariantMap: {
              [callableCodeObjId]: callableCodeObjVariantId,
              [paramCodeObjId]: paramCodeObjVariantId,
            },
          },
        ),
      };
      state.codeObjs = {
        [callableCodeObjId]: createCore({
          id: callableCodeObjId,
          name: "math.sqrt",
        }),
        [paramCodeObjId]: createCore({ id: paramCodeObjId, name: "x" }),
      };
      state.codeObjVariants = {
        [callableCodeObjVariantId]: createVariant({
          id: callableCodeObjVariantId,
          impl: callableCodeObjImplId,
          nonPresetImpls: [callableCodeObjImplId],
        }),
        [paramCodeObjVariantId]: createVariant({
          id: paramCodeObjVariantId,
          impl: paramCodeObjImplId,
          nonPresetImpls: [paramCodeObjImplId],
        }),
      };
      state.codeObjImpls = {
        [callableCodeObjImplId]: {
          type: CodeObjTypeEnum.CodeCallable,
          id: callableCodeObjImplId,
          name: "callable",
          description: "",
          isPreset: false,
          children: [],
        },
        [paramCodeObjImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          { id: paramCodeObjImplId, name: "x", value: "5" },
        ),
      };
    });

    const prompt = formatSectionsForAppPrompt(useProjectState.getState());

    expect(prompt).toContain(`dull_ocean (${sectionId})`);
    expect(prompt).toContain(`x (${paramCodeObjId}, type=CodeParam)`);
    expect(prompt).not.toContain(`quick_quiet (${sectionImplId})`);
    expect(prompt).not.toContain(`math.sqrt (${callableCodeObjId})`);
  });
});
