import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  BrowserAreaViewModeEnum,
  BrowserSearchScopeEnum,
  ClipboardDataTypeEnum,
  CodeLanguageEnum,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ControlCodeObjTypeSet,
  createAgenticEdge,
  createBrowserSavedSearch,
  createBrowserSavedSearchTypeFilters,
  createBrowserSectionImpl,
  createCallableSectionImpl,
  createClipboardProjectStateCore,
  createCodeParamCodeObjImpl,
  createCodeSectionImpl,
  createCore,
  createDictSectionImpl,
  createGroupSectionImpl,
  createListRootSectionImpl,
  createProjectConfig,
  createProjectStateSingleConfig,
  createPromptSectionImpl,
  createSectionsClipboardData,
  createSectionSize,
  createSingletonSections,
  createTerminalSectionImpl,
  createTextBlockSectionImpl,
  createTopLevelSectionLayout,
  createUserDefaultBrowserSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultCodeSectionImpl,
  createUserDefaultDictSectionImpl,
  createUserDefaultGroupSectionImpl,
  createUserDefaultListRootSectionImpl,
  createUserDefaultPromptSectionImpl,
  createUserDefaultTerminalSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createViewModeConfig,
  isBaseChildlessCodeObjImpl,
  isBaseDictSectionImpl,
  isBaseParamCodeObjImpl,
  isBaseParentCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ListRootViewModeEnum,
  ParameterPassingStyleEnum,
  ParamNameTypeEnum,
  SectionParamCodeObjTypeSet,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
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
        diagnosticsIgnoreState: {
          muted: true,
          suppressedCodes: ["E1", 404],
        },
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
    expect(sectionImpl.diagnosticsIgnoreState).toEqual({
      muted: true,
      suppressedCodes: ["E1", 404],
    });
  });

  it("exports list-root helpers with canonical defaults and overrides", () => {
    const sectionImpl = createListRootSectionImpl(
      createUserDefaultListRootSectionImpl({
        viewMode: ListRootViewModeEnum.kanban,
      }),
      {
        id: "list-root-impl",
        children: ["child-1", "child-2"],
      },
    );

    expect(sectionImpl.type).toBe(SectionTypeEnum.ListRoot);
    expect(sectionImpl.id).toBe("list-root-impl");
    expect(sectionImpl.viewMode).toBe(ListRootViewModeEnum.kanban);
    expect(sectionImpl.children).toEqual(["child-1", "child-2"]);
    expect(sectionImpl.defaultChildSectionType).toBe(SectionTypeEnum.Callable);
  });

  it("exports group and prompt helpers with canonical user defaults", () => {
    const groupImpl = createGroupSectionImpl(
      createUserDefaultGroupSectionImpl({
        isHorizontalOrientation: true,
      }),
      {
        id: "group-impl",
        children: ["child-1"],
      },
    );
    const promptImpl = createPromptSectionImpl(
      createUserDefaultPromptSectionImpl({
        template: "Hello {{ name }}",
      }),
      {
        id: "prompt-impl",
      },
    );

    expect(groupImpl.type).toBe(SectionTypeEnum.Group);
    expect(groupImpl.id).toBe("group-impl");
    expect(groupImpl.children).toEqual(["child-1"]);
    expect(groupImpl.isHorizontalOrientation).toBe(true);
    expect(groupImpl.defaultChildSectionType).toBe(SectionTypeEnum.Callable);

    expect(promptImpl.type).toBe(SectionTypeEnum.Prompt);
    expect(promptImpl.id).toBe("prompt-impl");
    expect(promptImpl.promptTemplateId).toBeNull();
    expect(promptImpl.template).toBe("Hello {{ name }}");
    expect(promptImpl.renderedText).toBe("");
    expect(promptImpl.missingVariables).toEqual([]);
  });

  it("applies text-block user defaults before impl overrides", () => {
    const sectionImpl = createTextBlockSectionImpl(
      createUserDefaultTextBlockSectionImpl({
        textDisplayMode: TextBlockDisplayModeEnum.Edit,
        headingAsSectionName: true,
      }),
      {
        id: "text-impl-2",
        text: "Updated",
      },
    );

    expect(sectionImpl.type).toBe(SectionTypeEnum.TextBlock);
    expect(sectionImpl.id).toBe("text-impl-2");
    expect(sectionImpl.textDisplayMode).toBe(TextBlockDisplayModeEnum.Edit);
    expect(sectionImpl.headingAsSectionName).toBe(true);
    expect(sectionImpl.text).toBe("Updated");
  });

  it("exports terminal helpers with canonical defaults and overrides", () => {
    const sectionImpl = createTerminalSectionImpl(
      createUserDefaultTerminalSectionImpl({
        isFrozen: true,
      }),
      {
        id: "terminal-impl",
      },
    );

    expect(sectionImpl.type).toBe(SectionTypeEnum.Terminal);
    expect(sectionImpl.id).toBe("terminal-impl");
    expect(sectionImpl.isFrozen).toBe(true);
    expect(sectionImpl.size).toEqual({ width: 250, height: 150 });
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

  it("exports section-size helpers with explicit auto sizing support", () => {
    const autoSize = createSectionSize();
    const fixedSize = createSectionSize({ width: 360, height: 140 });

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

  it("exports the canonical base-section guards for section-info and sizing callers", () => {
    const callableImpl = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: "callable-impl",
      },
    );
    const listRootImpl = createListRootSectionImpl(
      createUserDefaultListRootSectionImpl(),
      {
        id: "list-root-impl",
        children: ["child-1"],
      },
    );
    const textBlockImpl = createTextBlockSectionImpl(
      createUserDefaultTextBlockSectionImpl(),
      {
        id: "text-block-impl",
      },
    );

    expect(isBaseParentSectionImpl(listRootImpl)).toBe(true);
    expect(isBaseParentSectionImpl(callableImpl)).toBe(false);
    expect(isBaseSectionWithParamsImpl(callableImpl)).toBe(true);
    expect(isBaseSectionWithParamsImpl(textBlockImpl)).toBe(false);
    if (!isBaseParentSectionImpl(listRootImpl)) {
      throw new Error("expected list-root section to satisfy base parent");
    }
    expect(listRootImpl.children).toEqual(["child-1"]);
  });

  it("exports the canonical base-parent code object helper for param tree callers", () => {
    const codeCallableImpl = {
      type: CodeObjTypeEnum.CodeCallable,
      id: "callable-code-obj",
      name: "callable",
      description: "",
      isPreset: false,
      children: ["child-1"],
    } satisfies BaseCodeObjImplUnion;
    const nestedParamImpl = {
      type: CodeObjTypeEnum.NestedParam,
      id: "nested-param",
      name: "nested",
      description: "",
      isPreset: false,
      children: ["child-1"],
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: "",
    } satisfies BaseCodeObjImplUnion;
    const codeParamImpl = createCodeParamCodeObjImpl(
      createUserDefaultCodeParamCodeObjImpl(),
      {
        id: "code-param",
      },
    );

    expect(isBaseParentCodeObjImpl(codeCallableImpl)).toBe(true);
    expect(isBaseParentCodeObjImpl(nestedParamImpl)).toBe(true);
    expect(isBaseParentCodeObjImpl(codeParamImpl)).toBe(false);
    expect(isBaseParamCodeObjImpl(codeCallableImpl)).toBe(false);
    expect(isBaseParamCodeObjImpl(nestedParamImpl)).toBe(true);
    expect(isBaseParamCodeObjImpl(codeParamImpl)).toBe(true);
    expect(isBaseChildlessCodeObjImpl(codeCallableImpl)).toBe(false);
    expect(isBaseChildlessCodeObjImpl(nestedParamImpl)).toBe(false);
    expect(isBaseChildlessCodeObjImpl(codeParamImpl)).toBe(true);
    if (!isBaseParentCodeObjImpl(nestedParamImpl)) {
      throw new Error("expected nested param to satisfy base parent code obj");
    }
    expect(nestedParamImpl.children).toEqual(["child-1"]);
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

  it("exports the canonical view-mode helper", () => {
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
  });

  it("exports canonical project-shell helper defaults for layouts and agentic edges", () => {
    const layout = createTopLevelSectionLayout({
      x: 12,
    });
    const edge = createAgenticEdge({
      sourceSectionId: "source",
      targetSectionId: "target",
      contextMode: AgenticEdgeContextModeEnum.summary,
    });

    expect(layout).toEqual({
      x: 12,
      y: 0,
      zIndex: 0,
      w: null,
      h: null,
    });
    expect(edge.kind).toBe(AgenticEdgeKindEnum.section_chat);
    expect(edge.contextMode).toBe(AgenticEdgeContextModeEnum.summary);
    expect(edge.style).toEqual({});
    expect(edge.hidden).toBe(false);
    expect(edge.zIndex).toBe(0);
    expect(edge.selected).toBe(false);
  });

  it("exports canonical project-state core and clipboard defaults", () => {
    const clipboardCore = createClipboardProjectStateCore({
      sections: {
        "section-1": createCore({ id: "section-1" }),
      },
    });
    const projectState = createProjectStateSingleConfig({
      projectConfig: createProjectConfig({ id: "project-1" }),
    });
    const clipboardData = createSectionsClipboardData({
      data: {
        core: clipboardCore,
        sectionVariantMap: {},
      },
    });

    expect(clipboardCore.sectionVariants).toEqual({});
    expect(clipboardCore.codeObjs).toEqual({});
    expect(projectState.projectConfig.id).toBe("project-1");
    expect(projectState.singletonSections).toEqual(createSingletonSections());
    expect(projectState.parentSectionMap).toEqual({});
    expect(projectState.requiredDecodedImages).toEqual([]);
    expect(clipboardData.type).toBe(ClipboardDataTypeEnum.Sections);
    expect(clipboardData.data.core.sections["section-1"]?.id).toBe("section-1");
  });
});
