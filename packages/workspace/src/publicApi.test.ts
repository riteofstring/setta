import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import * as workspace from "./index";

type IsExactly<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? true
    : false;

type IsRequiredProperty<Value, Key extends keyof Value> =
  object extends Pick<Value, Key> ? false : true;

const RUNTIME_EXPORTS = [
  "ColorValueControl",
  "DEFAULT_SECTION_TAG_COLOR_PALETTE",
  "DEFAULT_META_CONTROL_SIZE",
  "DROPZONE_META_CONTROL_SIZE",
  "DateValueControl",
  "DropdownValueControl",
  "DropzoneValueControl",
  "GROUP_SECTION_KIND",
  "ItemDndContext",
  "ItemNameEditor",
  "MetaControl",
  "MANUAL_WHEEL_CLASS_NAME",
  "NO_DRAG_CLASS_NAME",
  "NO_PAN_CLASS_NAME",
  "NO_WHEEL_CLASS_NAME",
  "PasswordValueControl",
  "RotaryValueControl",
  "SliderValueControl",
  "StandaloneWorkspaceWindowSpaceSurface",
  "SwitchValueControl",
  "TEXTAREA_META_CONTROL_SIZE",
  "TextValueEditor",
  "TimeValueControl",
  "WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH",
  "WORKSPACE_CODE_SECTION_KIND",
  "WORKSPACE_CODE_SECTION_LANGUAGES",
  "WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH",
  "WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH",
  "WORKSPACE_CODE_SECTION_MODES",
  "WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE",
  "WORKSPACE_TEXT_SECTION_DISPLAY_MODES",
  "WORKSPACE_TEXT_SECTION_FORMATS",
  "WORKSPACE_TEXT_SECTION_KIND",
  "WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE",
  "WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE",
  "WorkspaceCanvas",
  "WorkspaceControls",
  "WorkspaceProvider",
  "WorkspaceItemLabel",
  "WorkspaceItemList",
  "WorkspaceNavigator",
  "WorkspaceParameterConfigurationIcon",
  "WorkspaceParameterConfigurationView",
  "WorkspaceShell",
  "WorkspaceSectionEditor",
  "WorkspaceSectionSettingsIcon",
  "WorkspaceTooltip",
  "WorkspaceWindowManager",
  "WorkspaceWindowSurface",
  "WorkspaceWindowSpacesPane",
  "WorkspaceWindowingError",
  "WORKSPACE_INSPECTOR_TAB_ID",
  "WORKSPACE_OUTLINE_TAB_ID",
  "activateItemSelect",
  "buildWorkspaceFloatingSnapBounds",
  "buildWorkspaceFloatingSnapResizeBounds",
  "buildWorkspaceFloatingSnapResizeSeams",
  "canSnapshotWorkspaceWindowSpace",
  "classifyWorkspaceFloatingSnapPreset",
  "closeWorkspaceNavigator",
  "closeWorkspaceWindow",
  "commitWorkspaceDocument",
  "createWorkspaceHost",
  "createWorkspaceCodeSection",
  "createWorkspaceCodeSectionData",
  "createWorkspaceTextSection",
  "createWorkspaceTextSectionData",
  "createWorkspaceShellViewState",
  "createWorkspaceFloatingWindow",
  "createWorkspaceWindowBoundaryInsets",
  "createWorkspaceWindowBounds",
  "createWorkspaceWindowingState",
  "createWorkspaceWindowSpace",
  "createWorkspaceWindowViewport",
  "deactivateItemSelect",
  "denormalizeWorkspaceWindowBounds",
  "deleteLastWorkspaceItem",
  "deleteSelectedWorkspaceItems",
  "deleteWorkspaceItems",
  "dockWorkspaceWindow",
  "focusWorkspaceSection",
  "focusWorkspaceWindow",
  "getWorkspaceCodeSectionData",
  "getWorkspaceTextSectionData",
  "getWorkspaceKeyBindingConflicts",
  "getWorkspaceKeyBindings",
  "insertWorkspaceItem",
  "maximizeWorkspaceWindow",
  "minimizeWorkspaceWindow",
  "moveWorkspaceFloatingWindow",
  "moveWorkspaceWindowToCanvasSection",
  "normalizeWorkspaceWindowBounds",
  "openWorkspaceFloatingWindow",
  "openWorkspaceNavigator",
  "registerSectionKinds",
  "registerItemHandlers",
  "registerWorkspaceCommands",
  "registerWorkspaceCreationCommands",
  "registerWorkspaceKeyBindings",
  "registerWorkspaceToolbarContributions",
  "renameWorkspaceWindow",
  "reopenWorkspaceWindow",
  "resizeWorkspaceFloatingWindow",
  "resolveWorkspaceFloatingSnapPresetFromPointer",
  "resolveWorkspaceWindowWorkArea",
  "restoreWorkspaceWindow",
  "restoreWorkspaceWindowSpace",
  "setItemData",
  "setItemControlConfiguration",
  "setItemHelpText",
  "setItemLabel",
  "setItemPresentation",
  "setItemValue",
  "setGroupOverflowMode",
  "setSectionData",
  "setSectionTagColor",
  "setWorkspaceSectionSize",
  "setWorkspaceCodeSectionData",
  "setWorkspaceTextSectionData",
  "setWorkspaceWindowBoundsAtomically",
  "setWorkspaceWindowDockLayoutAtomically",
  "setWorkspaceColorMode",
  "ungroupSections",
  "subscribeWorkspaceCanvasPanScrolling",
  "snapWorkspaceFloatingWindow",
  "snapshotWorkspaceWindowSpace",
  "showWorkspaceSectionInFloatingWindow",
  "undockWorkspaceWindow",
  "useItemSelectionMode",
  "useWorkspaceAppearance",
  "useWorkspaceCapabilities",
  "useWorkspaceDocumentSnapshot",
  "useWorkspaceHost",
  "useWorkspaceOptions",
] as const;

describe("public package API", () => {
  it("exports only the ratified runtime surface", () => {
    expect(Object.keys(workspace).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });

  it("exposes the navigator through one host-scoped public contract", () => {
    const mode: workspace.WorkspaceNavigatorMode = "commands";
    const configuration = {
      defaultMode: mode,
      showTrigger: true,
    } satisfies workspace.WorkspaceNavigatorConfiguration;
    const closeParametersAreHostOnly: IsExactly<
      Parameters<typeof workspace.closeWorkspaceNavigator>,
      [host: workspace.WorkspaceHost]
    > = true;

    expect(configuration).toEqual({
      defaultMode: "commands",
      showTrigger: true,
    });
    expect(closeParametersAreHostOnly).toBe(true);
  });

  it("commits an app-owned section size through the canonical resize funnel", () => {
    const host = workspace.createWorkspaceHost();
    workspace.registerSectionKinds(host, {
      leaf: { renderContent: () => null },
    });
    host.loadDocument({
      activeIds: [],
      sections: {
        leaf: {
          children: [],
          id: "leaf",
          isHorizontalOrientation: false,
          isMinimized: false,
          kind: "leaf",
          name: "Leaf",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { height: 100, width: 200 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelSections: { leaf: { h: 100, w: 200, x: 0, y: 0, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const publications: Array<workspace.WorkspaceDocument> = [];
    const unsubscribe = host.subscribe((document) =>
      publications.push(document),
    );
    workspace.setWorkspaceSectionSize(host, "leaf", { height: 320 });

    expect(host.getSnapshot().sections["leaf"]?.size).toEqual({
      height: 320,
      width: 200,
    });
    expect(publications).toHaveLength(1);
    unsubscribe();
    host.dispose();
  });

  it("exposes the text editor commit callback through the public root", () => {
    const onCommit = (value: string) => value;
    const completionProvider: workspace.TextValueCompletionProvider = async (
      request,
    ) => ({
      from: request.cursorOffset,
      options: [{ label: "choice" }],
    });
    const props = {
      ariaLabel: "Name",
      completionProvider,
      controlId: "item-1",
      onCommit,
      onValueChange: () => {},
      presentation: "item-row",
      sectionId: "section-1",
      singleLine: true,
      value: "draft",
    } satisfies ComponentProps<typeof workspace.TextValueEditor>;

    expect(props.onCommit("draft")).toBe("draft");
    return expect(
      props.completionProvider({
        cursorOffset: 5,
        explicit: false,
        signal: new AbortController().signal,
        value: "draft",
      }),
    ).resolves.toEqual({ from: 5, options: [{ label: "choice" }] });
  });

  it("types Code-section completion as a registration capability rather than document data", async () => {
    const completionProvider: workspace.WorkspaceCodeSectionCompletionProvider =
      async (request) => ({
        from: request.cursorOffsetUtf16,
        options: [{ insertText: "math", label: "math" }],
        to: request.cursorOffsetUtf16,
      });
    const registration = {
      completionProvider,
      languages: ["python"],
    } satisfies workspace.WorkspaceCodeSectionRegistration;
    expect(
      await registration.completionProvider({
        cursorOffsetUtf16: 0,
        generatedRegion: null,
        language: "python",
        sectionId: "section-1",
        signal: new AbortController().signal,
        text: "",
        trigger: "explicit",
      }),
    ).toEqual({
      from: 0,
      options: [{ insertText: "math", label: "math" }],
      to: 0,
    });
  });

  it("types the section-field placement with its own optional end adornment", () => {
    const presentation: workspace.TextValueEditorPresentation = "section-field";
    let abandonedDraft = false;
    const props = {
      ariaLabel: "Expression",
      controlId: "expression",
      endAdornment: null,

      onEscape: () => {
        abandonedDraft = true;
      },
      onValueChange: () => {},
      presentation,
      sectionId: "section-1",
      singleLine: true,
      value: "draft",
    } satisfies ComponentProps<typeof workspace.TextValueEditor>;

    expect(props.presentation).toBe("section-field");
    props.onEscape();
    expect(abandonedDraft).toBe(true);

    type ItemRowProps = Extract<
      ComponentProps<typeof workspace.TextValueEditor>,
      { presentation: "item-row" }
    >;
    const itemRowEndAdornmentIsUndefined: IsExactly<
      ItemRowProps["endAdornment"],
      undefined
    > = true;

    expect(itemRowEndAdornmentIsUndefined).toBe(true);
  });

  it("resolves the canvas tooltip parent without a public seam for it", () => {
    const hasTooltipParent: "tooltipParent" extends keyof ComponentProps<
      typeof workspace.TextValueEditor
    >
      ? true
      : false = false;

    expect(hasTooltipParent).toBe(false);
    expect(
      RUNTIME_EXPORTS.filter((name) =>
        /codemirror|editorview|tooltipparent|extension/i.test(name),
      ),
    ).toStrictEqual([]);
  });

  it("keeps the item-area presentation generic and content-agnostic", () => {
    const itemArea = {
      renderLeadingContent: () => null,
      toolbar: "filter-only",
    } satisfies workspace.WorkspaceItemAreaPresentation;
    const definition = {
      itemArea,
      renderContent: () => null,
    } satisfies workspace.SectionKindDefinition;

    const presentationsByMode = {
      "authoring-and-filter": { toolbar: "authoring-and-filter" },
      "filter-only": itemArea,
      hidden: { toolbar: "hidden" },
    } satisfies Record<
      workspace.WorkspaceItemToolbarMode,
      workspace.WorkspaceItemAreaPresentation
    >;

    expect(definition.itemArea.toolbar).toBe("filter-only");
    expect(presentationsByMode[definition.itemArea.toolbar]).toBe(itemArea);
  });

  it("closes the built-in Code section on one required presentation mode", () => {
    const generatedRegion = {
      from: 1,
      to: 3,
    } satisfies workspace.WorkspaceGeneratedRegion;
    const generated = workspace.createWorkspaceCodeSectionData({
      code: "a\nb\nc",
      generatedRegion,
      mode: "generated-document",
    });

    const dataByMode = {
      editable: workspace.createWorkspaceCodeSectionData(),
      "read-only": workspace.createWorkspaceCodeSectionData({
        mode: "read-only",
      }),
      "generated-document": generated,
    } satisfies Record<
      workspace.WorkspaceCodeSectionMode,
      workspace.WorkspaceCodeSectionData
    >;

    expect(dataByMode[generated.mode]).toBe(generated);
    expect([...workspace.WORKSPACE_CODE_SECTION_MODES].sort()).toStrictEqual(
      Object.keys(dataByMode).sort(),
    );

    type OrdinaryOverrides = Exclude<
      workspace.WorkspaceCodeSectionDataOverrides,
      { mode: "generated-document" }
    >;
    type GeneratedOverrides = Extract<
      workspace.WorkspaceCodeSectionDataOverrides,
      { mode: "generated-document" }
    >;
    const ordinaryHasGeneratedRegion: "generatedRegion" extends keyof OrdinaryOverrides
      ? true
      : false = false;
    const generatedCodeIsRequired: IsRequiredProperty<
      GeneratedOverrides,
      "code"
    > = true;
    const generatedRegionIsRequired: IsRequiredProperty<
      GeneratedOverrides,
      "generatedRegion"
    > = true;

    expect(dataByMode["read-only"]).not.toHaveProperty("generatedRegion");
    expect(ordinaryHasGeneratedRegion).toBe(false);
    expect(generatedCodeIsRequired).toBe(true);
    expect(generatedRegionIsRequired).toBe(true);
  });
});
