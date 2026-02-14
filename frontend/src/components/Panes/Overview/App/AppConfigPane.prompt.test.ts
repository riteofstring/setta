import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  HttpRequestMethodEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";

import { formatSectionsForAppPrompt } from "./AppConfigPane";

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

  it("omits non-leaf params (NestedParam/ButtonParam) from the prompt list", () => {
    const sectionId = "section-core-1";
    const sectionImplId = "section-impl-1";
    const sectionVariantId = "section-variant-1";

    const callableCodeObjId = "callable-code-obj";
    const callableCodeObjVariantId = "callable-code-obj-variant";
    const callableCodeObjImplId = "callable-code-obj-impl";

    const leafParamCodeObjId = "leaf-param-code-obj";
    const leafParamCodeObjVariantId = "leaf-param-code-obj-variant";
    const leafParamCodeObjImplId = "leaf-param-code-obj-impl";

    const buttonParamCodeObjId = "button-param-code-obj";
    const buttonParamCodeObjVariantId = "button-param-code-obj-variant";
    const buttonParamCodeObjImplId = "button-param-code-obj-impl";

    const nestedParamCodeObjId = "nested-param-code-obj";
    const nestedParamCodeObjVariantId = "nested-param-code-obj-variant";
    const nestedParamCodeObjImplId = "nested-param-code-obj-impl";

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
              [leafParamCodeObjId]: leafParamCodeObjVariantId,
              [buttonParamCodeObjId]: buttonParamCodeObjVariantId,
              [nestedParamCodeObjId]: nestedParamCodeObjVariantId,
            },
          },
        ),
      };
      state.codeObjs = {
        [callableCodeObjId]: createCore({
          id: callableCodeObjId,
          name: "math.sqrt",
        }),
        [leafParamCodeObjId]: createCore({
          id: leafParamCodeObjId,
          name: "x",
        }),
        [buttonParamCodeObjId]: createCore({
          id: buttonParamCodeObjId,
          name: "trigger",
        }),
        [nestedParamCodeObjId]: createCore({
          id: nestedParamCodeObjId,
          name: "nested",
        }),
      };
      state.codeObjVariants = {
        [callableCodeObjVariantId]: createVariant({
          id: callableCodeObjVariantId,
          impl: callableCodeObjImplId,
          nonPresetImpls: [callableCodeObjImplId],
        }),
        [leafParamCodeObjVariantId]: createVariant({
          id: leafParamCodeObjVariantId,
          impl: leafParamCodeObjImplId,
          nonPresetImpls: [leafParamCodeObjImplId],
        }),
        [buttonParamCodeObjVariantId]: createVariant({
          id: buttonParamCodeObjVariantId,
          impl: buttonParamCodeObjImplId,
          nonPresetImpls: [buttonParamCodeObjImplId],
        }),
        [nestedParamCodeObjVariantId]: createVariant({
          id: nestedParamCodeObjVariantId,
          impl: nestedParamCodeObjImplId,
          nonPresetImpls: [nestedParamCodeObjImplId],
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
        [leafParamCodeObjImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          { id: leafParamCodeObjImplId, name: "x", value: "5" },
        ),
        [buttonParamCodeObjImplId]: {
          type: CodeObjTypeEnum.ButtonParam,
          id: buttonParamCodeObjImplId,
          name: "trigger",
          description: "",
          isPreset: false,
          coreNameType: ParamNameTypeEnum.TEXT,
          coreNameEditable: false,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          label: "Trigger",
          actionMode: ButtonActionModeEnum.WEBSOCKET_LISTENER,
          requestMethod: HttpRequestMethodEnum.POST,
          requestUrl: "",
          requestHeaderKey: "",
          requestHeaderValue: "",
          requestBody: "",
        },
        [nestedParamCodeObjImplId]: {
          type: CodeObjTypeEnum.NestedParam,
          id: nestedParamCodeObjImplId,
          name: "nested",
          description: "",
          isPreset: false,
          children: [],
          coreNameType: ParamNameTypeEnum.TEXT,
          coreNameEditable: false,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
        },
      };
    });

    const prompt = formatSectionsForAppPrompt(useProjectState.getState());

    expect(prompt).toContain(`x (${leafParamCodeObjId}, type=CodeParam)`);
    expect(prompt).not.toContain(`trigger (${buttonParamCodeObjId}`);
    expect(prompt).not.toContain(`nested (${nestedParamCodeObjId}`);
  });
});
