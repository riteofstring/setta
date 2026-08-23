import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import * as workspace from "./index";

// Phase 5 ratifies one root runtime entry. This list makes additions/removals deliberate and keeps
// package-private stores, fork primitives, and DOM selectors from leaking through a broad export.
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
  "WorkspaceShell",
  "WorkspaceTooltip",
  "WORKSPACE_INSPECTOR_TAB_ID",
  "WORKSPACE_OUTLINE_TAB_ID",
  "activateItemSelect",
  "commitWorkspaceDocument",
  "createWorkspaceHost",
  "createWorkspaceCodeSection",
  "createWorkspaceCodeSectionData",
  "createWorkspaceTextSection",
  "createWorkspaceTextSectionData",
  "createWorkspaceShellViewState",
  "deactivateItemSelect",
  "deleteLastWorkspaceItem",
  "deleteSelectedWorkspaceItems",
  "deleteWorkspaceItems",
  "focusWorkspaceSection",
  "getWorkspaceCodeSectionData",
  "getWorkspaceTextSectionData",
  "getWorkspaceKeyBindingConflicts",
  "getWorkspaceKeyBindings",
  "insertWorkspaceItem",
  "registerSectionKinds",
  "registerItemHandlers",
  "registerWorkspaceCommands",
  "registerWorkspaceCreationCommands",
  "registerWorkspaceKeyBindings",
  "registerWorkspaceToolbarContributions",
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
  "setWorkspaceColorMode",
  "ungroupSections",
  "useItemSelectionMode",
  "useWorkspaceAppearance",
  "useWorkspaceCapabilities",
  "useWorkspaceHost",
  "useWorkspaceOptions",
] as const;

describe("public package API", () => {
  it("exports only the ratified runtime surface", () => {
    expect(Object.keys(workspace).sort()).toEqual([...RUNTIME_EXPORTS].sort());
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
      // The caller holding the draft is told when Escape abandoned it, so it can restore its own
      // canonical value; the package never guesses what that value is.
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
    // The adornment belongs to the section-field placement alone.
    const itemRow: ComponentProps<typeof workspace.TextValueEditor> = {
      ariaLabel: "Expression",
      controlId: "expression",
      onValueChange: () => {},
      presentation: "item-row",
      sectionId: "section-1",
      value: "draft",
    };
    // @ts-expect-error the item-row placement has no adornment slot.
    itemRow.endAdornment = null;
  });

  // The canvas renders the tooltip parent its editors use, so a consumer never passes, names, or
  // opts into one, and no CodeMirror element, extension, or tooltip option crosses the root.
  it("resolves the canvas tooltip parent without a public seam for it", () => {
    const field: ComponentProps<typeof workspace.TextValueEditor> = {
      ariaLabel: "Expression",
      controlId: "expression",
      onValueChange: () => {},
      presentation: "section-field",
      sectionId: "section-1",
      value: "draft",
    };
    // @ts-expect-error the package resolves its canvas tooltip parent from the host.
    field.tooltipParent = null;
    // `WorkspaceTooltip` is the package's own hover chrome and stays exported; nothing names the
    // editor's tooltip placement or the CodeMirror objects behind it.
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
    // Keyed by every public mode: adding, removing, or renaming one fails this exhaustiveness
    // proof at compile time, which counting a hand-written array never could.
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
    // Keyed by every public mode: adding, removing, or renaming one fails this exhaustiveness
    // proof at compile time.
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
    // The region belongs to the one mode that paints it, and the whole-document shape it
    // replaces is gone from the contract rather than accepted beside it.
    expect(dataByMode["read-only"]).not.toHaveProperty("generatedRegion");
    const ordinary = {
      mode: "read-only",
      // @ts-expect-error an ordinary mode cannot declare a generated region.
      generatedRegion,
    } satisfies workspace.WorkspaceCodeSectionDataOverrides;
    expect(ordinary.mode).toBe("read-only");
    // The reciprocal: a region is offsets into a document, so the mode that carries one cannot
    // fall back to the empty default text every other override may.
    // @ts-expect-error a generated document cannot omit the code its region indexes.
    const withoutCode: workspace.WorkspaceCodeSectionDataOverrides = {
      generatedRegion,
      mode: "generated-document",
    };
    expect(withoutCode.mode).toBe("generated-document");
  });
});
