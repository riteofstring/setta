import {
  BrowserAreaViewModeEnum,
  BrowserSearchScopeEnum,
  CodeFileAccessModeEnum,
  CodeLanguageEnum,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ControlCodeObjTypeSet,
  createBrowserSavedSearch,
  createBrowserSavedSearchTypeFilters,
  createBrowserSectionImpl,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCodeSectionImpl,
  createDictSectionImpl,
  createSectionSize,
  createTextBlockSectionImpl,
  createUserDefaultBrowserSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultCodeSectionImpl,
  createUserDefaultDictSectionImpl,
  createViewModeConfig,
  isBaseDictSectionImpl,
  ParamNameTypeEnum,
  RouteEnum,
  SectionParamCodeObjTypeSet,
  SectionSizeModeEnum,
  SectionTypeEnum,
  TextBlockFormatEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated project state factories", () => {
  it("treats a single argument with type/id as section impl overrides", () => {
    const sectionImpl = createTextBlockSectionImpl({
      id: "text-impl",
      type: SectionTypeEnum.TextBlock,
      text: "Hello",
      format: TextBlockFormatEnum.Markdown,
    });

    expect(sectionImpl.id).toBe("text-impl");
    expect(sectionImpl.type).toBe(SectionTypeEnum.TextBlock);
    expect(sectionImpl.text).toBe("Hello");
    expect(sectionImpl.format).toBe(TextBlockFormatEnum.Markdown);
    expect(sectionImpl.size).toEqual({ width: 500, height: 150 });
  });

  it("applies explicit user defaults before section impl overrides", () => {
    const sectionImpl = createCodeSectionImpl(
      createUserDefaultCodeSectionImpl({
        code: "echo hi",
        codeLanguage: CodeLanguageEnum.bash,
      }),
      {
        id: "code-impl",
        children: ["terminal-1"],
      },
    );

    expect(sectionImpl.id).toBe("code-impl");
    expect(sectionImpl.type).toBe(SectionTypeEnum.Code);
    expect(sectionImpl.code).toBe("echo hi");
    expect(sectionImpl.codeLanguage).toBe(CodeLanguageEnum.bash);
    expect(sectionImpl.children).toEqual(["terminal-1"]);
  });

  it("builds callable and code-param helpers from canonical defaults", () => {
    const callableImpl = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl({
        hideParams: true,
        configLanguage: ConfigLanguageEnum.json,
      }),
      {
        id: "callable-impl",
        callable: "callable-code-obj",
      },
    );
    const codeParamImpl = createCodeParamCodeObjImpl(
      createUserDefaultCodeParamCodeObjImpl({
        coreNameType: ParamNameTypeEnum.TEXT,
        value: "5",
      }),
      {
        id: "param-impl",
      },
    );

    expect(callableImpl.type).toBe(SectionTypeEnum.Callable);
    expect(callableImpl.hideParams).toBe(true);
    expect(callableImpl.configLanguage).toBe(ConfigLanguageEnum.json);
    expect(callableImpl.callable).toBe("callable-code-obj");

    expect(codeParamImpl.type).toBe(CodeObjTypeEnum.CodeParam);
    expect(codeParamImpl.id).toBe("param-impl");
    expect(codeParamImpl.coreNameType).toBe(ParamNameTypeEnum.TEXT);
    expect(codeParamImpl.value).toBe("5");
  });

  it("exports code file binding access-mode enums for section settings callers", () => {
    expect(CodeFileAccessModeEnum.read_write).toBe("read_write");
    expect(CodeFileAccessModeEnum.read_only).toBe("read_only");
    expect(CodeFileAccessModeEnum.write_only).toBe("write_only");
  });

  it("exports section-size helpers with explicit auto sizing support", () => {
    const autoSize = createSectionSize();
    const fixedSize = createSectionSize({ width: 360, height: 140 });

    expect(SectionSizeModeEnum.auto).toBe("auto");
    expect(autoSize).toEqual({ width: "auto", height: "auto" });
    expect(fixedSize).toEqual({ width: 360, height: 140 });
  });

  it("exports code object type filter sets for UI config callers", () => {
    expect(ControlCodeObjTypeSet.has(CodeObjTypeEnum.ButtonParam)).toBe(true);
    expect(ControlCodeObjTypeSet.has(CodeObjTypeEnum.NestedParam)).toBe(false);
    expect(SectionParamCodeObjTypeSet.has(CodeObjTypeEnum.NestedParam)).toBe(
      true,
    );
    expect(SectionParamCodeObjTypeSet.has(CodeObjTypeEnum.ButtonParam)).toBe(
      false,
    );
  });

  it("exports the canonical base-dict section helper for variant and edge-port callers", () => {
    const dictImpl = createDictSectionImpl(createUserDefaultDictSectionImpl(), {
      id: "dict-impl",
      topLevelParamId: "root-param",
      isJsonSource: true,
      jsonSourceKeys: ["payload", "items"],
    });
    const globalVariablesImpl = {
      ...createDictSectionImpl(createUserDefaultDictSectionImpl(), {
        id: "globals-impl",
        topLevelParamId: "globals-root",
      }),
      type: SectionTypeEnum.GlobalVariables,
    } satisfies BaseSectionImplUnion;
    const codeImpl = createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
      id: "code-impl",
    });

    expect(isBaseDictSectionImpl(dictImpl)).toBe(true);
    expect(isBaseDictSectionImpl(globalVariablesImpl)).toBe(true);
    expect(isBaseDictSectionImpl(codeImpl)).toBe(false);
    if (!isBaseDictSectionImpl(globalVariablesImpl)) {
      throw new Error("expected global variables section to satisfy base dict");
    }
    expect(globalVariablesImpl.topLevelParamId).toBe("globals-root");
  });

  it("exports browser-section helpers and saved-search defaults", () => {
    const browserImpl = createBrowserSectionImpl(
      createUserDefaultBrowserSectionImpl({
        viewMode: BrowserAreaViewModeEnum.thumbnail,
      }),
      {
        id: "browser-impl",
        hideColumn: true,
        savedSearches: [
          createBrowserSavedSearch({
            id: "saved-search-1",
            query: "png",
            searchScope: BrowserSearchScopeEnum.local,
            typeFilters: createBrowserSavedSearchTypeFilters({
              image: true,
              video: false,
              audio: false,
              text: false,
              data: false,
            }),
          }),
        ],
      },
    );

    expect(browserImpl.type).toBe(SectionTypeEnum.Browser);
    expect(browserImpl.id).toBe("browser-impl");
    expect(browserImpl.viewMode).toBe(BrowserAreaViewModeEnum.thumbnail);
    expect(browserImpl.hideColumn).toBe(true);
    expect(browserImpl.savedSearches[0]?.searchScope).toBe(
      BrowserSearchScopeEnum.local,
    );
    expect(browserImpl.savedSearches[0]?.typeFilters.video).toBe(false);
  });

  it("exports the canonical view-mode helper and route enum surface", () => {
    const viewMode = createViewModeConfig({
      id: "focus-mode",
      name: "Focus",
      isTab: true,
    });

    expect(viewMode.id).toBe("focus-mode");
    expect(viewMode.name).toBe("Focus");
    expect(viewMode.isTab).toBe(true);
    expect(viewMode.sortIndex).toBe(0);
    expect(viewMode.topLevelSections).toEqual({});
    expect(RouteEnum.CREATE_TOP_LEVEL_SECTION).toBe("/createTopLevelSection");
  });
});
