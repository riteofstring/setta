import { beforeEach, describe, expect, it } from "vitest";

import { type ZustandProjectState } from "state/definitions";
import { useToolArgumentPreview } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { clearToolArgumentPreviewForProjectState } from "./sectionToolArgumentPreview";

function buildProjectState(code: string): ZustandProjectState {
  const sectionId = "code-section";
  const variantId = "code-variant";
  const implId = "code-impl";

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
      [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
        id: implId,
        code,
      }),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
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
  } as ZustandProjectState;
}

describe("clearToolArgumentPreviewForProjectState", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("drops matching code previews and removes empty project entries", () => {
    useToolArgumentPreview.setState({
      byProjectConfigId: {
        "project-1": {
          previewCodeBySectionId: {
            "code-section": {
              value: "print('hello')",
              toolCallId: "tool-1",
            },
          },
          previewCallableNameBySectionId: {},
          previewParamValueBySectionAndParamId: {},
        },
      },
    });

    clearToolArgumentPreviewForProjectState(
      "project-1",
      buildProjectState("print('hello')"),
    );

    expect(useToolArgumentPreview.getState().byProjectConfigId).toEqual({});
  });

  it("keeps previews whose value no longer matches the current code", () => {
    useToolArgumentPreview.setState({
      byProjectConfigId: {
        "project-1": {
          previewCodeBySectionId: {
            "code-section": {
              value: "print('preview')",
              toolCallId: "tool-1",
            },
          },
          previewCallableNameBySectionId: {},
          previewParamValueBySectionAndParamId: {},
        },
      },
    });

    clearToolArgumentPreviewForProjectState(
      "project-1",
      buildProjectState("print('current')"),
    );

    expect(
      useToolArgumentPreview.getState().byProjectConfigId["project-1"]
        ?.previewCodeBySectionId["code-section"],
    ).toEqual({
      value: "print('preview')",
      toolCallId: "tool-1",
    });
  });
});
