import type { ZustandProjectState } from "state/definitions";
import {
  createCodeSectionImpl,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSingletonSections,
  createTopLevelSectionLayout,
  createUserDefaultCodeSectionImpl,
  createVariant,
  createViewModeConfig,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveActiveViewModeName,
  resolveSettingsGraphSubstrateCanarySections,
  selectSettingsGraphSubstrateCanaryLayoutSections,
  selectSettingsGraphSubstrateCanarySections,
  shouldUseSettingsGraphSubstrateCanary,
} from "./settingsGraphSubstrateCanaryModel";

function createProjectState(): ZustandProjectState {
  const projectConfig = createProjectConfig({
    id: "project-1",
    name: "settings",
  });
  projectConfig.activeViewModeId = "all-settings";
  projectConfig.sectionVariantMap = {
    "section-a": "variant-a",
    "section-b": "variant-b",
    hidden: "variant-hidden",
  };
  projectConfig.viewModes = {
    "all-settings": createViewModeConfig({
      id: "all-settings",
      name: "All Settings",
      visibilityBySectionId: {
        "section-a": true,
        "section-b": true,
        hidden: false,
      },
      topLevelSections: {
        "section-a": createTopLevelSectionLayout({
          x: 500,
          y: 200,
          zIndex: 2,
          w: 240,
          h: 160,
        }),
        "section-b": createTopLevelSectionLayout({
          x: 120,
          y: 100,
          zIndex: 1,
          w: 320,
          h: 240,
        }),
        hidden: createTopLevelSectionLayout({
          x: 80,
          y: 40,
          zIndex: 0,
          w: 180,
          h: 120,
        }),
      },
      isUserFacing: false,
    }),
  };
  return {
    ...createProjectStateSingleConfig({
      projectConfig,
      sections: {
        "section-a": createCore({
          id: "section-a",
          name: "A",
          variants: ["variant-a"],
          defaultVariant: "variant-a",
        }),
        "section-b": createCore({
          id: "section-b",
          name: "B",
          variants: ["variant-b"],
          defaultVariant: "variant-b",
        }),
        hidden: createCore({
          id: "hidden",
          name: "Hidden",
          variants: ["variant-hidden"],
          defaultVariant: "variant-hidden",
        }),
      },
      sectionVariants: {
        "variant-a": createVariant({
          id: "variant-a",
          impl: "impl-a",
          nonPresetImpls: [],
        }),
        "variant-b": createVariant({
          id: "variant-b",
          impl: "impl-b",
          nonPresetImpls: [],
        }),
        "variant-hidden": createVariant({
          id: "variant-hidden",
          impl: "impl-hidden",
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        "impl-a": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: "impl-a",
          positionAndSizeLocked: false,
        }),
        "impl-b": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: "impl-b",
          positionAndSizeLocked: true,
        }),
        "impl-hidden": createCodeSectionImpl(
          createUserDefaultCodeSectionImpl(),
          {
            id: "impl-hidden",
            positionAndSizeLocked: false,
          },
        ),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      projectChatWindowing: createProjectChatWindowingState(),
      requiredDecodedImages: [],
    }),
    projectConfig,
    previewSectionVariantMap: {},
  };
}

describe("settingsGraphSubstrateCanaryModel", () => {
  it("enables the canary only for the settings All Settings surface", () => {
    expect(
      shouldUseSettingsGraphSubstrateCanary("settings", "All Settings"),
    ).toBe(true);
    expect(shouldUseSettingsGraphSubstrateCanary("settings", "Core")).toBe(
      false,
    );
    expect(
      shouldUseSettingsGraphSubstrateCanary("project", "All Settings"),
    ).toBe(false);
  });

  it("resolves the active view mode name from project state", () => {
    const state = createProjectState();
    expect(resolveActiveViewModeName(state)).toBe("All Settings");
  });

  it("returns no canary layout sections outside the settings All Settings route", () => {
    const state = createProjectState();
    state.projectConfig.name = "project";

    expect(selectSettingsGraphSubstrateCanaryLayoutSections(state)).toEqual([]);
  });

  it("selects all visible canary sections in legacy display order while preserving layout size as fallback state", () => {
    const state = createProjectState();

    expect(selectSettingsGraphSubstrateCanarySections(state)).toEqual([
      {
        isActiveSection: false,
        isInOtherProjectConfigs: false,
        sectionId: "section-a",
        sectionTypeName: SectionTypeEnum.Code,
        position: { x: 500, y: 200 },
        sizeAuthority: "layout",
        zIndex: 2,
        styleColor: null,
        tempZIndex: 2,
        textBlockMetaControlStyle: false,
        width: 240,
        height: 160,
        positionAndSizeLocked: false,
      },
      {
        isActiveSection: false,
        isInOtherProjectConfigs: false,
        sectionId: "section-b",
        sectionTypeName: SectionTypeEnum.Code,
        position: { x: 120, y: 100 },
        sizeAuthority: "layout",
        zIndex: 1,
        styleColor: null,
        tempZIndex: 1,
        textBlockMetaControlStyle: false,
        width: 320,
        height: 240,
        positionAndSizeLocked: true,
      },
    ]);
  });

  it("keeps layout z-order authoritative until the scene snapshot applies transient drag ownership", () => {
    const state = createProjectState();
    state.projectConfig.viewModes["all-settings"]!.topLevelSections[
      "section-a"
    ] = {
      x: 760,
      y: 420,
      zIndex: 8,
      w: 240,
      h: 160,
    };

    expect(selectSettingsGraphSubstrateCanarySections(state)).toEqual([
      {
        isActiveSection: false,
        isInOtherProjectConfigs: false,
        sectionId: "section-a",
        sectionTypeName: SectionTypeEnum.Code,
        position: { x: 760, y: 420 },
        sizeAuthority: "layout",
        zIndex: 8,
        styleColor: null,
        tempZIndex: 8,
        textBlockMetaControlStyle: false,
        width: 240,
        height: 160,
        positionAndSizeLocked: false,
      },
      {
        isActiveSection: false,
        isInOtherProjectConfigs: false,
        sectionId: "section-b",
        sectionTypeName: SectionTypeEnum.Code,
        position: { x: 120, y: 100 },
        sizeAuthority: "layout",
        zIndex: 1,
        styleColor: null,
        tempZIndex: 1,
        textBlockMetaControlStyle: false,
        width: 320,
        height: 240,
        positionAndSizeLocked: true,
      },
    ]);
  });

  it("promotes shared node-internals size into the canary sections when layout size is missing", () => {
    const sections = resolveSettingsGraphSubstrateCanarySections(
      [
        {
          height: null,
          position: { x: 120, y: 100 },
          positionAndSizeLocked: false,
          sectionId: "section-a",
          sectionTypeName: SectionTypeEnum.Code,
          styleColor: null,
          tempZIndex: 1,
          textBlockMetaControlStyle: false,
          width: null,
          zIndex: 1,
        },
      ],
      new Map([
        [
          "section-a",
          {
            width: 280,
            height: 190,
          },
        ],
      ]),
    );

    expect(sections).toEqual([
      {
        height: 190,
        position: { x: 120, y: 100 },
        positionAndSizeLocked: false,
        sectionId: "section-a",
        sectionTypeName: SectionTypeEnum.Code,
        sizeAuthority: "sharedNode",
        styleColor: null,
        tempZIndex: 1,
        textBlockMetaControlStyle: false,
        width: 280,
        zIndex: 1,
      },
    ]);
  });

  it("does not synthesize a shared-node size from partial layout and node-internals dimensions", () => {
    const sections = resolveSettingsGraphSubstrateCanarySections(
      [
        {
          height: null,
          position: { x: 120, y: 100 },
          positionAndSizeLocked: false,
          sectionId: "section-a",
          sectionTypeName: SectionTypeEnum.Code,
          styleColor: null,
          tempZIndex: 1,
          textBlockMetaControlStyle: false,
          width: 280,
          zIndex: 1,
        },
      ],
      new Map([
        [
          "section-a",
          {
            width: null,
            height: 190,
          },
        ],
      ]),
    );

    expect(sections).toEqual([
      {
        height: null,
        position: { x: 120, y: 100 },
        positionAndSizeLocked: false,
        sectionId: "section-a",
        sectionTypeName: SectionTypeEnum.Code,
        sizeAuthority: "none",
        styleColor: null,
        tempZIndex: 1,
        textBlockMetaControlStyle: false,
        width: null,
        zIndex: 1,
      },
    ]);
  });
});
