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
  "WorkspaceCanvas",
  "WorkspaceControls",
  "WorkspaceItemLabel",
  "WorkspaceItemList",
  "WorkspaceShell",
  "WorkspaceTooltip",
  "WORKSPACE_INSPECTOR_TAB_ID",
  "WORKSPACE_OUTLINE_TAB_ID",
  "activateItemSelect",
  "createWorkspaceShellViewState",
  "deactivateItemSelect",
  "focusWorkspaceSection",
  "getWorkspaceDocument",
  "loadWorkspaceDocument",
  "registerSectionKinds",
  "registerItemHandlers",
  "registerWorkspaceCreationCommands",
  "registerWorkspaceMenuActions",
  "setItemData",
  "setItemControlConfiguration",
  "setItemLabel",
  "setItemPresentation",
  "setItemValue",
  "setGroupOverflowMode",
  "setSectionData",
  "setSectionTagColor",
  "setWorkspaceDocumentChangeCallback",
  "setWorkspaceColorMode",
  "setWorkspacePanDiagnosticLogger",
  "ungroupSections",
  "useItemSelectionMode",
  "useWorkspaceAppearance",
  "useWorkspaceCapabilities",
  "useWorkspaceOptions",
] as const;

describe("public package API", () => {
  it("exports only the ratified runtime surface", () => {
    expect(Object.keys(workspace).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });
});
