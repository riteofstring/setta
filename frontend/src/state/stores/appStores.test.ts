import { resetProjectStores } from "state/utils";
import {
  createAppDefinition,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppConfigs, useAppDefinition, useAppPreview } from "./appStores";

describe("appStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("resets extracted app stores back to their default state", () => {
    // Exercise each extracted app store so the reset contract stays attached
    // to the new owner module instead of depending on definitions.ts.
    useAppDefinition.setState({
      appDefinition: createAppDefinition({ catalogId: "demo.catalog" }),
      appSpec: { root: { key: "root" } },
    });
    useAppConfigs.setState({
      configs: {
        "config-a": {
          projectConfig: createProjectConfig({
            id: "config-a",
            name: "Config A",
          }),
          sections: {},
          sectionImpls: {},
          sectionVariants: {},
          codeObjs: {},
          codeObjImpls: {},
          codeObjVariants: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: {},
          shownParamIds: {},
          projectChatWindowing: createProjectChatWindowingState(),
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
        },
      },
    });
    useAppPreview.setState({
      isPreviewEnabled: true,
      previewConfigId: "config-a",
      previewSpecOverride: { root: { key: "preview" } },
      aiPreviewSpecOverride: { root: { key: "stream" } },
      previewThemeOverride: { mode: "dark" },
      previewAssetsOverride: [{ name: "asset" }],
    });

    resetProjectStores();

    expect(useAppDefinition.getState()).toMatchObject({
      appDefinition: null,
      appSpec: null,
    });
    expect(useAppConfigs.getState().configs).toEqual({});
    expect(useAppPreview.getState()).toEqual(
      expect.objectContaining({
        isPreviewEnabled: false,
        previewConfigId: null,
        previewSpecOverride: undefined,
        aiPreviewSpecOverride: undefined,
        previewThemeOverride: undefined,
        previewAssetsOverride: undefined,
      }),
    );
  });
});
