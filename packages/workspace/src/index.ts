// Provisional Phase 1 surface. The ratified public API is a post-parity decision; these exports
// exist so the playground can drive the extracted slice, and they may change freely.
export { useWorkspaceOptions } from "./canvas/options";
export type {
  MiniMapSide,
  WorkspaceGridPattern,
  WorkspaceInteractionOptions,
} from "./canvas/options";
// These two string unions appear in WorkspaceInteractionOptions; riding the index keeps
// consumers off deep canvas-internal import paths.
export type { PanOnScrollMode, SelectionMode } from "./canvas/types";
export { WorkspaceCanvas } from "./canvas/WorkspaceCanvas";
export { ColorValueControl } from "./controls/color/ColorValueControl";
export type { ColorValueChoice, ColorValueControlProps } from "./controls/color/ColorValueControl";
export { DropdownValueControl } from "./controls/dropdown/DropdownValueControl";
export type {
  DropdownValueChoiceGroup,
  DropdownValueControlProps,
} from "./controls/dropdown/DropdownValueControl";
export { ItemNameEditor } from "./controls/name/ItemNameEditor";
export type { ItemNameEditorProps } from "./controls/name/ItemNameEditor";
export { RotaryValueControl } from "./controls/rotary/RotaryValueControl";
export type { RotaryValueControlProps } from "./controls/rotary/RotaryValueControl";
export { SliderValueControl } from "./controls/slider/SliderValueControl";
export type { SliderValueControlProps } from "./controls/slider/SliderValueControl";
export { SwitchValueControl } from "./controls/switch/SwitchValueControl";
export type { SwitchValueControlProps } from "./controls/switch/SwitchValueControl";
export { TextValueEditor } from "./controls/text/TextValueEditor";
export type { TextValueEditorProps } from "./controls/text/TextValueEditor";
export type { TextValueLanguage } from "./controls/text/textValueLanguages";
export { ItemDndContext } from "./dnd/ItemDndContext";
export { useWorkspaceCapabilities } from "./document/capabilities";
export type { WorkspaceCapabilitiesState } from "./document/capabilities";
export {
  getWorkspaceDocument,
  setWorkspaceDocumentChangeCallback,
} from "./document/documentChangeCallback";
export type { WorkspaceDocumentChangeCallback } from "./document/documentChangeCallback";
export { GROUP_SECTION_KIND } from "./document/documentSelectors";
export { setItemData } from "./document/itemData";
export {
  activateItemSelect,
  deactivateItemSelect,
  useItemSelectionMode,
} from "./document/itemSelectionMode";
export type { ItemSelectionModeState } from "./document/itemSelectionMode";
export { loadWorkspaceDocument } from "./document/loadWorkspaceDocument";
export { registerSectionKinds } from "./document/sectionKindRegistry";
export type { SectionKindDefinition } from "./document/sectionKindRegistry";
export { useWorkspaceAppearance } from "./document/stores";
export type { WorkspaceAppearanceState } from "./document/stores";
export type {
  Position,
  SectionSize,
  SectionSizeValue,
  TopLevelSectionLayout,
  Viewport,
  WorkspaceDocument,
  WorkspaceDocumentInput,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionData,
  WorkspaceSectionInput,
  WorkspaceSectionItemTree,
} from "./document/types";
export {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "./interaction";
export type { ItemRowRenderContext } from "./items/ItemListContext";
export { WorkspaceItemList } from "./items/WorkspaceItemList";
export type { WorkspaceItemListProps } from "./items/WorkspaceItemList";
export { WorkspaceControls } from "./toolbar/WorkspaceControls";
export { WorkspaceTooltip } from "./tooltip/WorkspaceTooltip";
