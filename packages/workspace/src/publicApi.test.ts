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

  it("types the section-field placement with its own optional end adornment", () => {
    const presentation: workspace.TextValueEditorPresentation = "section-field";
    const props = {
      ariaLabel: "Expression",
      controlId: "expression",
      endAdornment: null,
      onValueChange: () => {},
      presentation,
      sectionId: "section-1",
      singleLine: true,
      value: "draft",
    } satisfies ComponentProps<typeof workspace.TextValueEditor>;

    expect(props.presentation).toBe("section-field");
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
});
