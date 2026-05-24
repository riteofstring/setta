import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createTextParamCodeObjImpl,
  createTopLevelSectionLayout,
  createVariant,
  ParameterPassingStyleEnum,
  ParamNameTypeEnum,
  SectionTypeEnum,
  type BaseCodeObjImplUnion,
  type CodeObjType,
  type Core,
  type DictSectionImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  computeVisibleRowRange,
  deriveParamDictScene,
  PARAM_DICT_SCENE_DEFAULT_GEOMETRY,
  type ParamDictScene,
  type ParamDictSceneRect,
  type ParamDictSceneRow,
  type ParamDictSectionScene,
} from "./paramDictScene";

const sectionId = "preferences-dict";
const sectionVariantId = "preferences-variant";
const sectionImplId = "preferences-impl";
const rootParamId = "preferences-root";

function createParamCore(id: string, name: string, displayName = ""): Core {
  return createCore({
    id,
    name,
    displayName,
    variants: [`${id}-variant`],
    defaultVariant: `${id}-variant`,
  });
}

function createParamVariant(id: string) {
  return createVariant({
    id: `${id}-variant`,
    impl: `${id}-impl`,
    nonPresetImpls: [],
  });
}

function createDictSectionSize(
  width: number,
  height: number,
): DictSectionImpl["size"] {
  return { width, height } as unknown as DictSectionImpl["size"];
}

function createNestedParamImpl(
  id: string,
  children: string[],
): BaseCodeObjImplUnion {
  return {
    id: `${id}-impl`,
    type: CodeObjTypeEnum.NestedParam,
    name: id,
    description: "",
    isPreset: false,
    children,
    coreNameEditable: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    typeAnnotation: "",
  } as BaseCodeObjImplUnion;
}

function createChildlessParamImpl(
  id: string,
  type: CodeObjType,
  value: string,
): BaseCodeObjImplUnion {
  return {
    id: `${id}-impl`,
    type,
    name: id,
    description: "",
    isPreset: false,
    value,
    defaultVal: "",
    coreNameEditable: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    typeAnnotation: "",
  } as BaseCodeObjImplUnion;
}

function expectRectCloseTo(
  actual: ParamDictSceneRect | undefined,
  expected: ParamDictSceneRect,
) {
  expect(actual?.x).toBeCloseTo(expected.x);
  expect(actual?.y).toBeCloseTo(expected.y);
  expect(actual?.width).toBeCloseTo(expected.width);
  expect(actual?.height).toBeCloseTo(expected.height);
}

function getOnlySection(scene: ParamDictScene): ParamDictSectionScene {
  expect(scene.sections).toHaveLength(1);
  return scene.sections[0] as ParamDictSectionScene;
}

function getRow(
  section: ParamDictSectionScene,
  rowId: string,
): ParamDictSceneRow {
  const row = section.rows.find((candidate) => candidate.id === rowId);
  expect(row).toBeDefined();
  return row as ParamDictSceneRow;
}

function buildNonSettingsDictState({
  sectionHeight = 170,
}: {
  sectionHeight?: number;
} = {}): ZustandProjectState {
  const titleParamId = "pref-title";
  const advancedParamId = "pref-advanced";
  const enabledParamId = "pref-enabled";
  const modeParamId = "pref-mode";
  const accentParamId = "pref-accent";
  const sectionCore = createCore({
    id: sectionId,
    name: "Preferences",
    displayName: "Preferences",
    variants: [sectionVariantId],
    defaultVariant: sectionVariantId,
  });
  const sectionVariant = createVariant({
    id: sectionVariantId,
    impl: sectionImplId,
    nonPresetImpls: [],
  });
  const sectionImpl = createDictSectionImpl({
    id: sectionImplId,
    name: "Preferences",
    type: SectionTypeEnum.Dict,
    size: createDictSectionSize(360, sectionHeight),
    columnWidth: 140,
    configLanguage: ConfigLanguageEnum.python,
    codeObjVariantMap: {
      [rootParamId]: `${rootParamId}-variant`,
      [titleParamId]: `${titleParamId}-variant`,
      [advancedParamId]: `${advancedParamId}-variant`,
      [enabledParamId]: `${enabledParamId}-variant`,
      [modeParamId]: `${modeParamId}-variant`,
      [accentParamId]: `${accentParamId}-variant`,
    },
    selectedParams: [enabledParamId],
    topLevelParamId: rootParamId,
  });
  return {
    projectConfig: createProjectConfig({
      id: "non-settings-project",
      name: "Non Settings Project",
      showParamDisplayNames: true,
      viewport: { x: -100, y: -50, zoom: 2 },
      sectionVariantMap: { [sectionId]: sectionVariantId },
      topLevelSections: {
        [sectionId]: createTopLevelSectionLayout({
          x: 100,
          y: 40,
          w: 360,
          h: sectionHeight,
          zIndex: 3,
        }),
      },
    }),
    sections: {
      [sectionId]: sectionCore,
    },
    sectionVariants: {
      [sectionVariantId]: sectionVariant,
    },
    sectionImpls: {
      [sectionImplId]: sectionImpl,
    },
    codeObjs: {
      [rootParamId]: createParamCore(rootParamId, "root"),
      [titleParamId]: createParamCore(titleParamId, "title", "Window Title"),
      [advancedParamId]: createParamCore(
        advancedParamId,
        "advanced",
        "Advanced",
      ),
      [enabledParamId]: createParamCore(enabledParamId, "enabled", "Enabled"),
      [modeParamId]: createParamCore(modeParamId, "mode", "Mode"),
      [accentParamId]: createParamCore(accentParamId, "accent", "Accent"),
    },
    codeObjVariants: {
      [`${rootParamId}-variant`]: createParamVariant(rootParamId),
      [`${titleParamId}-variant`]: createParamVariant(titleParamId),
      [`${advancedParamId}-variant`]: createParamVariant(advancedParamId),
      [`${enabledParamId}-variant`]: createParamVariant(enabledParamId),
      [`${modeParamId}-variant`]: createParamVariant(modeParamId),
      [`${accentParamId}-variant`]: createParamVariant(accentParamId),
    },
    codeObjImpls: {
      [`${rootParamId}-impl`]: createNestedParamImpl(rootParamId, [
        titleParamId,
        advancedParamId,
        accentParamId,
      ]),
      [`${titleParamId}-impl`]: createTextParamCodeObjImpl({
        id: `${titleParamId}-impl`,
        type: CodeObjTypeEnum.TextParam,
        value: "Editor",
      }),
      [`${advancedParamId}-impl`]: createNestedParamImpl(advancedParamId, [
        enabledParamId,
        modeParamId,
      ]),
      [`${enabledParamId}-impl`]: createChildlessParamImpl(
        enabledParamId,
        CodeObjTypeEnum.SwitchParam,
        "true",
      ),
      [`${modeParamId}-impl`]: createChildlessParamImpl(
        modeParamId,
        CodeObjTypeEnum.DropdownParam,
        "compact",
      ),
      [`${accentParamId}-impl`]: createChildlessParamImpl(
        accentParamId,
        CodeObjTypeEnum.ColorPickerParam,
        "#3366ff",
      ),
    },
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: { [sectionId]: null },
    shownParamIds: {
      [sectionVariantId]: {
        pinned: {
          requiredParamIdsToPaths: {
            [accentParamId]: [accentParamId],
          },
          topLevelParamIds: [accentParamId],
        },
        unpinned: {
          requiredParamIdsToPaths: {
            [titleParamId]: [titleParamId],
            [advancedParamId]: [advancedParamId],
            [enabledParamId]: [advancedParamId, enabledParamId],
            [modeParamId]: [advancedParamId, modeParamId],
          },
          topLevelParamIds: [titleParamId, advancedParamId],
        },
      },
    },
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as unknown as ZustandProjectState;
}

describe("Param Dict scene derivation", () => {
  it("flattens non-Settings nested Dict params into stable row records", () => {
    const scene = deriveParamDictScene(buildNonSettingsDictState(), {
      typeErrors: {
        [sectionId]: {
          params: {
            "pref-mode": ["Invalid mode"],
          },
        },
      },
    });

    const section = getOnlySection(scene);
    expect(section.id).toBe(sectionId);
    expect(section.rows.map((row) => row.id)).toEqual([
      "pref-accent",
      "pref-title",
      "pref-advanced",
      "pref-enabled",
      "pref-mode",
    ]);
    expect(section.rows.map((row) => [row.id, row.depth, row.listKey])).toEqual(
      [
        ["pref-accent", 0, "pinned"],
        ["pref-title", 0, "unpinned"],
        ["pref-advanced", 0, "unpinned"],
        ["pref-enabled", 1, "unpinned"],
        ["pref-mode", 1, "unpinned"],
      ],
    );
    expect(getRow(section, "pref-title").label).toBe("Window Title");
    expect(getRow(section, "pref-enabled")).toMatchObject({
      controlKind: "switch",
      isSelected: true,
      valuePreview: "true",
    });
    expect(getRow(section, "pref-mode")).toMatchObject({
      controlKind: "dropdown",
      errorMessages: ["Invalid mode"],
      path: ["pref-advanced", "pref-mode"],
    });
    expect(getRow(section, "pref-accent")).toMatchObject({
      controlKind: "color",
      listKey: "pinned",
    });
  });

  it("computes deterministic section, row, and control geometry", () => {
    const scene = deriveParamDictScene(buildNonSettingsDictState(), {
      overscanRows: 0,
    });
    const section = getOnlySection(scene);
    const geometry = PARAM_DICT_SCENE_DEFAULT_GEOMETRY;

    expect(section.bounds).toEqual({ x: 100, y: 40, width: 360, height: 170 });
    expect(section.headerRect).toEqual({
      x: 100,
      y: 40,
      width: 360,
      height: geometry.sectionHeaderHeight,
    });
    expect(section.bodyRect).toEqual({
      x: 100,
      y: 74,
      width: 360,
      height: 136,
    });

    const title = getRow(section, "pref-title");
    const enabled = getRow(section, "pref-enabled");
    expect(title.rect).toEqual({
      x: 106,
      y: 120,
      width: 348,
      height: 22,
    });
    expect(enabled.rect).toEqual({
      x: 106,
      y: 172,
      width: 348,
      height: 22,
    });
    expect(enabled.labelRect.x).toBe(
      title.labelRect.x + geometry.rowIndentWidth,
    );
    expect(enabled.controlRect).toEqual({
      x: 424,
      y: 178,
      width: geometry.switchControlWidth,
      height: geometry.switchControlHeight,
    });
  });

  it("computes visible row ranges and clamps section scroll offsets", () => {
    expect(
      computeVisibleRowRange({
        rowCount: 20,
        rowHeight: 10,
        rowGap: 2,
        viewportHeight: 30,
        scrollOffset: 24,
        paddingTop: 0,
        overscanRows: 1,
      }),
    ).toEqual({ start: 1, end: 6 });

    const scene = deriveParamDictScene(
      buildNonSettingsDictState({ sectionHeight: 148 }),
      {
        overscanRows: 0,
        scrollOffsets: { [sectionId]: 1000 },
        geometry: {
          rowHeight: 20,
          rowGap: 0,
        },
      },
    );
    const section = getOnlySection(scene);
    expect(section.unpinned.maxScrollOffset).toBe(12);
    expect(section.unpinned.scrollOffset).toBe(12);
    expect(section.unpinned.visibleRange).toEqual({ start: 0, end: 4 });
    expect(section.visibleRows.map((row) => row.id)).toEqual([
      "pref-accent",
      "pref-title",
      "pref-advanced",
      "pref-enabled",
      "pref-mode",
    ]);
  });

  it("derives minimap section previews and viewport mask from scene geometry", () => {
    const scene = deriveParamDictScene(buildNonSettingsDictState(), {
      viewportSize: { width: 400, height: 200 },
      minimapSize: { width: 100, height: 50 },
    });
    expect(scene.minimap.sections).toHaveLength(1);
    expect(scene.minimap.sections[0]?.sectionId).toBe(sectionId);
    expectRectCloseTo(scene.minimap.sections[0]?.rect, {
      x: 1,
      y: 1.8611111111111143,
      width: 98,
      height: 46.27777777777777,
    });
    expectRectCloseTo(scene.minimap.viewportMask ?? undefined, {
      x: -12.611111111111104,
      y: -2.2222222222222197,
      width: 54.44444444444444,
      height: 27.22222222222222,
    });
  });
});
