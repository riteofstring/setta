// Public package surface. Package-relative modules stay implementation details unless they are
// re-exported here; consumers use this entry and the compiled stylesheet export only.
export { useWorkspaceOptions } from "./canvas/options";
export type {
  MiniMapSide,
  WorkspaceGridPattern,
  WorkspaceInteractionOptions,
} from "./canvas/options";
// These two string unions appear in WorkspaceInteractionOptions; riding the index keeps
// consumers off deep canvas-internal import paths.
export type { PanOnScrollMode, SelectionMode } from "./canvas/types";
export { focusWorkspaceSection } from "./canvas/viewportHelpers";
export { WorkspaceCanvas } from "./canvas/WorkspaceCanvas";
export { registerWorkspaceCommands } from "./commands/workspaceCommandRegistry";
export type {
  WorkspaceCommandContext,
  WorkspaceCommandDefinition,
  WorkspaceCommandIconProps,
  WorkspaceCommandScope,
  WorkspaceCommandSurface,
  WorkspaceItemCommandContext,
  WorkspacePaneCommandContext,
  WorkspaceSectionCommandContext,
} from "./commands/workspaceCommandTypes";
export { registerWorkspaceCreationCommands } from "./context-menu/workspaceMenuRegistry";
export type {
  WorkspaceCreationCommand,
  WorkspaceCreationContext,
} from "./context-menu/workspaceMenuTypes";
export { ColorValueControl } from "./controls/color/ColorValueControl";
export type { ColorValueChoice, ColorValueControlProps } from "./controls/color/ColorValueControl";
export type {
  DateCalendarWeekStart,
  DateControlMode,
  DateDisplayFormat,
  DateSelectionMode,
  DateValueControlProps,
  TimeControlMode,
  TimeDisplayFont,
  TimeDisplayFormat,
  TimeValueControlProps,
} from "./controls/date-time/dateTimeTypes";
export { DateValueControl, TimeValueControl } from "./controls/date-time/DateTimeValueControl";
export { DropdownValueControl } from "./controls/dropdown/DropdownValueControl";
export type {
  DropdownValueChoiceGroup,
  DropdownValueControlProps,
} from "./controls/dropdown/DropdownValueControl";
export type {
  DropzoneAcceptedResult,
  DropzoneAttachment,
  DropzoneFileRejection,
  DropzoneFileRejectionReason,
  DropzonePolicy,
  DropzoneRejection,
  DropzoneServerPickerRequest,
  DropzoneTextRejection,
  DropzoneValueControlProps,
} from "./controls/dropzone/dropzoneTypes";
export { DropzoneValueControl } from "./controls/dropzone/DropzoneValueControl";
export { MetaControl } from "./controls/meta/MetaControl";
export type {
  ButtonMetaControl,
  ColorMetaControl,
  DateMetaControl,
  DropdownMetaControl,
  DropzoneMetaControl,
  MetaControlDefinition,
  MetaControlProps,
  PasswordMetaControl,
  RotaryMetaControl,
  SliderMetaControl,
  SwitchMetaControl,
  TextAreaMetaControl,
  TextMetaControl,
  TimeMetaControl,
} from "./controls/meta/MetaControl";
export {
  DEFAULT_META_CONTROL_SIZE,
  DROPZONE_META_CONTROL_SIZE,
  TEXTAREA_META_CONTROL_SIZE,
} from "./controls/meta/metaControlTypes";
export type { MetaControlKind } from "./controls/meta/metaControlTypes";
export { ItemNameEditor } from "./controls/name/ItemNameEditor";
export type { ItemNameEditorProps } from "./controls/name/ItemNameEditor";
export { PasswordValueControl } from "./controls/password/PasswordValueControl";
export type {
  PasswordSavedValueAction,
  PasswordValueControlProps,
} from "./controls/password/PasswordValueControl";
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
export { setWorkspaceColorMode } from "./document/appearance";
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
  setItemControlConfiguration,
  setItemHelpText,
  setItemLabel,
  setItemPresentation,
  setItemValue,
} from "./document/itemPresentationMutations";
export {
  activateItemSelect,
  deactivateItemSelect,
  useItemSelectionMode,
} from "./document/itemSelectionMode";
export type { ItemSelectionModeState } from "./document/itemSelectionMode";
export { loadWorkspaceDocument } from "./document/loadWorkspaceDocument";
export { setSectionData } from "./document/sectionData";
export { registerSectionKinds } from "./document/sectionKindRegistry";
export type {
  MetaControlSectionPresentation,
  SectionKindDefinition,
  WorkspaceInspectorContributionContext,
  WorkspaceItemFactory,
  WorkspaceItemFactoryContext,
  WorkspaceItemSearchContext,
  WorkspaceItemSearchableText,
} from "./document/sectionKindRegistry";
export { useWorkspaceAppearance } from "./document/stores";
export type { WorkspaceAppearanceState, WorkspaceColorMode } from "./document/stores";
export type {
  Position,
  SectionSize,
  SectionSizeValue,
  TopLevelSectionLayout,
  Viewport,
  WorkspaceCodeItemControlConfiguration,
  WorkspaceColorChoice,
  WorkspaceColorItemControlConfiguration,
  WorkspaceDateItemControlConfiguration,
  WorkspaceDocument,
  WorkspaceDocumentInput,
  WorkspaceDropdownChoiceGroup,
  WorkspaceDropdownItemControlConfiguration,
  WorkspaceDropzoneAttachment,
  WorkspaceDropzoneItemControlConfiguration,
  WorkspaceDropzonePolicy,
  WorkspaceItem,
  WorkspaceItemAutocompletePolicy,
  WorkspaceItemControlBaseConfiguration,
  WorkspaceItemControlConfiguration,
  WorkspaceItemControlKind,
  WorkspaceItemControlPresentation,
  WorkspaceItemPresentation,
  WorkspaceItemTextLanguage,
  WorkspaceNumericItemControlConfiguration,
  WorkspacePasswordItemControlConfiguration,
  WorkspaceSection,
  WorkspaceSectionData,
  WorkspaceSectionInput,
  WorkspaceSectionItemTree,
  WorkspaceSwitchItemControlConfiguration,
  WorkspaceTextAreaItemControlConfiguration,
  WorkspaceTextItemControlConfiguration,
  WorkspaceTimeItemControlConfiguration,
} from "./document/types";
export {
  MANUAL_WHEEL_CLASS_NAME,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "./interaction";
export {
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  deleteWorkspaceItems,
  insertWorkspaceItem,
} from "./items/itemAuthoringActions";
export type {
  WorkspaceItemDiagnostic,
  WorkspaceItemDiagnosticRegistry,
  WorkspaceItemDiagnosticSeverity,
} from "./items/itemDiagnostics";
export { registerItemHandlers } from "./items/itemHandlerRegistry";
export type {
  WorkspaceDropzoneItemHandlerRegistration,
  WorkspaceItemHandlerRegistration,
  WorkspacePasswordItemHandlerRegistration,
} from "./items/itemHandlerRegistry";
export type { ItemRowRenderContext } from "./items/ItemListContext";
export { WorkspaceItemLabel } from "./items/WorkspaceItemLabel";
export type { WorkspaceItemLabelProps } from "./items/WorkspaceItemLabel";
export { WorkspaceItemList } from "./items/WorkspaceItemList";
export type { WorkspaceItemListProps } from "./items/WorkspaceItemList";
export { setGroupOverflowMode } from "./section/groupOverflowAction";
export { DEFAULT_SECTION_TAG_COLOR_PALETTE } from "./section/sectionTagColors";
export type {
  WorkspaceSectionTagColorChoice,
  WorkspaceSectionTagColorPalette,
} from "./section/sectionTagColors";
export { setSectionTagColor } from "./section/tagColorAction";
export { ungroupSections } from "./section/ungroupAction";
export { WorkspaceShell } from "./shell/WorkspaceShell";
export {
  WORKSPACE_INSPECTOR_TAB_ID,
  WORKSPACE_OUTLINE_TAB_ID,
  createWorkspaceShellViewState,
} from "./shell/workspaceShellLayout";
export type {
  WorkspaceShellOutlineViewState,
  WorkspaceShellPane,
  WorkspaceShellPaneViewState,
  WorkspaceShellProps,
  WorkspaceShellTabContentProps,
  WorkspaceShellTabDefinition,
  WorkspaceShellTabIconProps,
  WorkspaceShellViewState,
} from "./shell/workspaceShellTypes";
export { WorkspaceControls } from "./toolbar/WorkspaceControls";
export { WorkspaceTooltip } from "./tooltip/WorkspaceTooltip";
