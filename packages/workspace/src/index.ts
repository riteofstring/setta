export { createWorkspaceHost } from "./workspaceHost";
export type { WorkspaceHost } from "./workspaceHost";
export { WorkspaceProvider, useWorkspaceHost } from "./workspaceHostContext";
export {
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
} from "./builtin/codeSectionActions";
export {
  WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_KIND,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MODES,
  createWorkspaceCodeSectionData,
} from "./builtin/codeSectionData";
export type {
  WorkspaceCodeSectionData,
  WorkspaceCodeSectionDataOverrides,
  WorkspaceCodeSectionDiagnostic,
  WorkspaceCodeSectionDiagnosticSeverity,
  WorkspaceCodeSectionLanguage,
  WorkspaceCodeSectionMode,
  WorkspaceGeneratedRegion,
} from "./builtin/codeSectionData";
export { createWorkspaceCodeSection } from "./builtin/codeSectionKind";
export type { WorkspaceCodeSectionRegistration } from "./builtin/codeSectionKind";
export type {
  WorkspaceCodeSectionCompletionOption,
  WorkspaceCodeSectionCompletionProvider,
  WorkspaceCodeSectionCompletionRequest,
  WorkspaceCodeSectionCompletionResult,
} from "./builtin/codeSectionCompletion";
export {
  getWorkspaceTextSectionData,
  setWorkspaceTextSectionData,
} from "./builtin/textSectionActions";
export {
  WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
  WORKSPACE_TEXT_SECTION_FORMATS,
  WORKSPACE_TEXT_SECTION_KIND,
  WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
  createWorkspaceTextSectionData,
} from "./builtin/textSectionData";
export type {
  WorkspaceTextSectionData,
  WorkspaceTextSectionDisplayMode,
  WorkspaceTextSectionFormat,
} from "./builtin/textSectionData";
export { createWorkspaceTextSection } from "./builtin/textSectionKind";
export type { WorkspaceTextSectionRegistration } from "./builtin/textSectionKind";
export { useWorkspaceOptions } from "./canvas/options";
export { subscribeWorkspaceCanvasPanScrolling } from "./canvas/store";
export type {
  MiniMapSide,
  WorkspaceGridPattern,
  WorkspaceInteractionOptions,
} from "./canvas/options";

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
export type {
  ColorValueChoice,
  ColorValueControlProps,
} from "./controls/color/ColorValueControl";
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
export {
  DateValueControl,
  TimeValueControl,
} from "./controls/date-time/DateTimeValueControl";
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
export type {
  TextValueEditorPresentation,
  TextValueEditorProps,
} from "./controls/text/TextValueEditor";
export type {
  TextValueCompletionOption,
  TextValueCompletionProvider,
  TextValueCompletionRequest,
  TextValueCompletionResult,
} from "./controls/text/textValueCompletion";
export type { TextValueLanguage } from "./controls/text/textValueLanguages";
export { ItemDndContext } from "./dnd/ItemDndContext";
export { setWorkspaceColorMode } from "./document/appearance";
export { useWorkspaceCapabilities } from "./document/capabilities";
export type { WorkspaceCapabilitiesState } from "./document/capabilities";
export type { WorkspaceDocumentSubscription } from "./document/documentChangeCallback";
export { useWorkspaceDocumentSnapshot } from "./document/useWorkspaceDocumentSnapshot";
export { commitWorkspaceDocument } from "./document/loadWorkspaceDocument";
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
export { setSectionData } from "./document/sectionData";
export { registerSectionKinds } from "./document/sectionKindRegistry";
export type {
  MetaControlSectionPresentation,
  SectionKindDefinition,
  WorkspaceInspectorContributionContext,
  WorkspaceItemAreaPresentation,
  WorkspaceItemFactory,
  WorkspaceItemFactoryContext,
  WorkspaceItemSearchContext,
  WorkspaceItemSearchableText,
  WorkspaceItemToolbarMode,
  WorkspaceSectionKindIconProps,
} from "./document/sectionKindRegistry";
export type { WorkspaceSectionSizeConstraints } from "./section/resize/sectionSizingBounds";
export { setWorkspaceSectionSize } from "./section/sectionSizes";
export { useWorkspaceAppearance } from "./document/stores";
export type {
  WorkspaceAppearanceState,
  WorkspaceColorMode,
} from "./document/stores";
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
export { WorkspaceParameterConfigurationView } from "./shell/WorkspaceParameterConfigurationView";
export {
  getWorkspaceKeyBindingConflicts,
  getWorkspaceKeyBindings,
  registerWorkspaceKeyBindings,
} from "./keybindings/workspaceKeyBindingRegistry";
export type {
  WorkspaceKeyBinding,
  WorkspaceKeyBindingConflict,
  WorkspaceKeyBindingDescriptor,
} from "./keybindings/workspaceKeyBindingTypes";
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
  WorkspaceParameterConfigurationIcon,
  WorkspaceSectionSettingsIcon,
} from "./shell/WorkspaceShellIcons";
export { WorkspaceSectionEditor } from "./shell/WorkspaceInspector";
export type { WorkspaceSectionEditorProps } from "./shell/WorkspaceInspector";
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
export type { WorkspaceShellWindowingConfiguration } from "./windowing/workspaceWindowingContext";
export { WorkspaceWindowManager } from "./windowing/WorkspaceWindowManager";
export type {
  WorkspaceWindowManagerProps,
  WorkspaceWindowRenderer,
  WorkspaceWindowRenderers,
} from "./windowing/WorkspaceWindowManager";
export { WorkspaceWindowSurface } from "./windowing/WorkspaceWindowSurface";
export type {
  WorkspaceWindowSurfaceAction,
  WorkspaceWindowSurfaceActionTone,
  WorkspaceWindowSurfaceProps,
} from "./windowing/WorkspaceWindowSurface";
export {
  buildWorkspaceFloatingSnapBounds,
  buildWorkspaceFloatingSnapResizeBounds,
  buildWorkspaceFloatingSnapResizeSeams,
  classifyWorkspaceFloatingSnapPreset,
  createWorkspaceWindowBoundaryInsets,
  denormalizeWorkspaceWindowBounds,
  normalizeWorkspaceWindowBounds,
  resolveWorkspaceFloatingSnapPresetFromPointer,
  resolveWorkspaceWindowWorkArea,
} from "./windowing/windowingSnapLayout";
export type {
  ResolveWorkspaceFloatingSnapPresetFromPointerInput,
  WorkspaceFloatingSnapResizeSeam,
  WorkspaceNormalizedWindowBounds,
  WorkspaceSnappedWindow,
  WorkspaceWindowWorkArea,
} from "./windowing/windowingSnapLayout";
export {
  closeWorkspaceWindow,
  dockWorkspaceWindow,
  focusWorkspaceWindow,
  maximizeWorkspaceWindow,
  minimizeWorkspaceWindow,
  moveWorkspaceWindowToCanvasSection,
  moveWorkspaceFloatingWindow,
  openWorkspaceFloatingWindow,
  renameWorkspaceWindow,
  reopenWorkspaceWindow,
  resizeWorkspaceFloatingWindow,
  restoreWorkspaceWindow,
  setWorkspaceWindowBoundsAtomically,
  setWorkspaceWindowDockLayoutAtomically,
  showWorkspaceSectionInFloatingWindow,
  snapWorkspaceFloatingWindow,
  undockWorkspaceWindow,
} from "./windowing/windowingState";
export type {
  OpenWorkspaceFloatingWindowInput,
  ShowWorkspaceSectionInFloatingWindowInput,
  WorkspaceWindowBoundsUpdate,
  WorkspaceWindowDockLayoutUpdate,
  WorkspaceWindowPosition,
} from "./windowing/windowingState";
export {
  createWorkspaceFloatingWindow,
  createWorkspaceWindowBounds,
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowing/windowingTypes";
export type {
  WorkspaceFloatingSnapPreset,
  WorkspaceFloatingWindow,
  WorkspaceFloatingWindowInput,
  WorkspaceWindowBoundaryInsets,
  WorkspaceWindowBounds,
  WorkspaceWindowDockMetrics,
  WorkspaceWindowDockMetricsInput,
  WorkspaceWindowingErrorCode,
  WorkspaceWindowingMutationOptions,
  WorkspaceWindowingState,
  WorkspaceWindowingStateInput,
  WorkspaceWindowJsonValue,
  WorkspaceWindowPlacement,
  WorkspaceWindowRestorePlacement,
  WorkspaceWindowViewport,
} from "./windowing/windowingTypes";
export {
  canSnapshotWorkspaceWindowSpace,
  createWorkspaceWindowSpace,
  restoreWorkspaceWindowSpace,
  snapshotWorkspaceWindowSpace,
} from "./windowing/windowSpaces";
export type {
  WorkspaceWindowSpace,
  WorkspaceWindowSpaceInput,
  WorkspaceWindowSpaceMetadata,
  WorkspaceWindowSpaceRestoreResult,
  WorkspaceWindowSpaceWindow,
} from "./windowing/windowSpaces";
export { WorkspaceWindowSpacesPane } from "./windowing/WorkspaceWindowSpacesPane";
export type {
  WorkspaceWindowSpaceErrors,
  WorkspaceWindowSpacePending,
  WorkspaceWindowSpacesPaneProps,
} from "./windowing/WorkspaceWindowSpacesPane";
export { StandaloneWorkspaceWindowSpaceSurface } from "./windowing/StandaloneWorkspaceWindowSpaceSurface";
export type { StandaloneWorkspaceWindowSpaceSurfaceProps } from "./windowing/StandaloneWorkspaceWindowSpaceSurface";
export { WorkspaceControls } from "./toolbar/WorkspaceControls";
export { registerWorkspaceToolbarContributions } from "./toolbar/workspaceToolbarRegistry";
export type {
  WorkspaceToolbarContribution,
  WorkspaceToolbarPlacement,
} from "./toolbar/workspaceToolbarTypes";
export { WorkspaceTooltip } from "./tooltip/WorkspaceTooltip";
