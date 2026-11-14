export { createWorkspaceHost } from "./workspaceHost.js";
export type { WorkspaceHost, WorkspaceHostOptions } from "./workspaceHost.js";
export {
  DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP,
  planWorkspaceTopLevelAutoLayout,
} from "./auto-layout/planner.js";
export type {
  WorkspaceTopLevelAutoLayoutOptions,
  WorkspaceTopLevelAutoLayoutPlan,
  WorkspaceTopLevelAutoLayoutRectangle,
} from "./auto-layout/planner.js";
export {
  autoLayoutTopLevelSections,
  getWorkspaceTopLevelAutoLayoutDisabledReason,
} from "./auto-layout/topLevelAutoLayout.js";
export type { WorkspaceTopLevelAutoLayoutResult } from "./auto-layout/topLevelAutoLayout.js";
export {
  copyWorkspaceSelection,
  duplicateWorkspaceSelection,
  getWorkspaceClipboardAvailability,
  pasteWorkspaceClipboard,
} from "./clipboard/operations.js";
export type {
  WorkspaceClipboardAvailability,
  WorkspaceClipboardOperationResult,
} from "./clipboard/operations.js";
export { registerWorkspaceClipboardAuthority } from "./clipboard/registry.js";
export type {
  JsonValue,
  WorkspaceClipboardAuthority,
  WorkspaceClipboardCopyabilityRequest,
  WorkspaceClipboardIdMaps,
  WorkspaceClipboardItemDataCloneContext,
  WorkspaceClipboardPastePlacement,
  WorkspaceClipboardPasteRequest,
  WorkspaceClipboardPasteResult,
  WorkspaceClipboardPrepareCopyRequest,
  WorkspaceClipboardSectionDataCloneContext,
  WorkspaceDelegatedClipboardAuthority,
  WorkspaceLocalClipboardAuthority,
} from "./clipboard/types.js";
export {
  getWorkspaceHistoryState,
  recordWorkspaceHistoryEntry,
  redoWorkspace,
  subscribeWorkspaceHistory,
  undoWorkspace,
} from "./history/workspaceHistory.js";
export type {
  WorkspaceHistoryAuthority,
  WorkspaceHistoryChangeKind,
  WorkspaceHistoryEntry,
  WorkspaceHistoryState,
  WorkspaceHistorySynchronization,
  WorkspaceHistoryTransaction,
} from "./history/workspaceHistoryTypes.js";
export { WorkspaceProvider, useWorkspaceHost } from "./workspaceHostContext.js";
export {
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
} from "./builtin/codeSectionActions.js";
export {
  WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_KIND,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MODES,
  createWorkspaceCodeSectionData,
} from "./builtin/codeSectionData.js";
export type {
  WorkspaceCodeSectionData,
  WorkspaceCodeSectionDataOverrides,
  WorkspaceCodeSectionDiagnostic,
  WorkspaceCodeSectionDiagnosticSeverity,
  WorkspaceCodeSectionLanguage,
  WorkspaceCodeSectionMode,
  WorkspaceGeneratedRegion,
} from "./builtin/codeSectionData.js";
export { createWorkspaceCodeSection } from "./builtin/codeSectionKind.js";
export type { WorkspaceCodeSectionRegistration } from "./builtin/codeSectionKind.js";
export type {
  WorkspaceCodeSectionCompletionOption,
  WorkspaceCodeSectionCompletionProvider,
  WorkspaceCodeSectionCompletionRequest,
  WorkspaceCodeSectionCompletionResult,
} from "./builtin/codeSectionCompletion.js";
export {
  getWorkspaceTextSectionData,
  setWorkspaceTextSectionData,
} from "./builtin/textSectionActions.js";
export {
  WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
  WORKSPACE_TEXT_SECTION_FORMATS,
  WORKSPACE_TEXT_SECTION_KIND,
  WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
  createWorkspaceTextSectionData,
} from "./builtin/textSectionData.js";
export type {
  WorkspaceTextSectionData,
  WorkspaceTextSectionDisplayMode,
  WorkspaceTextSectionFormat,
} from "./builtin/textSectionData.js";
export { createWorkspaceTextSection } from "./builtin/textSectionKind.js";
export type { WorkspaceTextSectionRegistration } from "./builtin/textSectionKind.js";
export {
  setWorkspaceMiniMapVisibility,
  useWorkspaceOptions,
} from "./canvas/options.js";
export { subscribeWorkspaceCanvasPanScrolling } from "./canvas/store.js";
export { useIsScrollable } from "./useIsScrollable.js";
export type {
  MiniMapSide,
  WorkspaceGridPattern,
  WorkspaceInteractionOptions,
} from "./canvas/options.js";

export type { PanOnScrollMode, SelectionMode } from "./canvas/types.js";
export type { WorkspaceCanvasConfiguration } from "./canvas/configuration.js";
export type {
  WorkspaceExternalDropCallback,
  WorkspaceExternalDropCanDrop,
  WorkspaceExternalDropConfiguration,
} from "./canvas/external-drop/types.js";
export {
  fitWorkspaceSections,
  setWorkspaceSectionAttention,
} from "./attention/workspaceSectionAttention.js";
export type { WorkspaceSectionFitOptions } from "./attention/workspaceSectionAttention.js";
export { focusWorkspaceSection } from "./canvas/viewportHelpers.js";
export { WorkspaceCanvas } from "./canvas/WorkspaceCanvas.js";
export type { WorkspaceCanvasProps } from "./canvas/WorkspaceCanvas.js";
export type {
  WorkspaceGraphConfiguration,
  WorkspaceGraphConnection,
  WorkspaceGraphConnectionValidator,
  WorkspaceGraphEdge,
  WorkspaceGraphEdgePattern,
  WorkspaceGraphEdgeStatus,
  WorkspaceGraphFamily,
  WorkspaceGraphPort,
  WorkspaceGraphPortReference,
  WorkspaceGraphPortSide,
  WorkspaceGraphPortType,
  WorkspaceGraphReconnect,
  WorkspaceGraphReconnectValidator,
} from "./graph/types.js";
export { registerWorkspaceCommands } from "./commands/workspaceCommandRegistry.js";
export type {
  WorkspaceCommandContext,
  WorkspaceCommandDefinition,
  WorkspaceCommandIconProps,
  WorkspaceCommandScope,
  WorkspaceCommandSurface,
  WorkspaceItemCommandContext,
  WorkspacePaneCommandContext,
  WorkspaceSectionCommandContext,
} from "./commands/workspaceCommandTypes.js";
export { registerWorkspaceCreationCommands } from "./context-menu/workspaceMenuRegistry.js";
export type {
  WorkspaceCreationCommand,
  WorkspaceCreationContext,
} from "./context-menu/workspaceMenuTypes.js";
export { WorkspaceDropdownMenu } from "./context-menu/WorkspaceDropdownMenu.js";
export type {
  WorkspaceDropdownMenuGroup,
  WorkspaceDropdownMenuItem,
  WorkspaceDropdownMenuProps,
} from "./context-menu/WorkspaceDropdownMenu.js";
export { ColorValueControl } from "./controls/color/ColorValueControl.js";
export type {
  ColorValueChoice,
  ColorValueControlProps,
} from "./controls/color/ColorValueControl.js";
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
} from "./controls/date-time/dateTimeTypes.js";
export {
  DateValueControl,
  TimeValueControl,
} from "./controls/date-time/DateTimeValueControl.js";
export { DropdownValueControl } from "./controls/dropdown/DropdownValueControl.js";
export type {
  DropdownValueChoiceGroup,
  DropdownValueControlProps,
} from "./controls/dropdown/DropdownValueControl.js";
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
} from "./controls/dropzone/dropzoneTypes.js";
export { DropzoneValueControl } from "./controls/dropzone/DropzoneValueControl.js";
export { MetaControl } from "./controls/meta/MetaControl.js";
export type {
  ButtonMetaControl,
  ColorMetaControl,
  CustomMetaControl,
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
} from "./controls/meta/MetaControl.js";
export {
  DEFAULT_META_CONTROL_SIZE,
  DROPZONE_META_CONTROL_SIZE,
  TEXTAREA_META_CONTROL_SIZE,
} from "./controls/meta/metaControlTypes.js";
export type { MetaControlKind } from "./controls/meta/metaControlTypes.js";
export { ItemNameEditor } from "./controls/name/ItemNameEditor.js";
export type { ItemNameEditorProps } from "./controls/name/ItemNameEditor.js";
export { PasswordValueControl } from "./controls/password/PasswordValueControl.js";
export type {
  PasswordSavedValueAction,
  PasswordValueControlProps,
} from "./controls/password/PasswordValueControl.js";
export { RotaryValueControl } from "./controls/rotary/RotaryValueControl.js";
export type { RotaryValueControlProps } from "./controls/rotary/RotaryValueControl.js";
export { SliderValueControl } from "./controls/slider/SliderValueControl.js";
export type { SliderValueControlProps } from "./controls/slider/SliderValueControl.js";
export { SwitchValueControl } from "./controls/switch/SwitchValueControl.js";
export type { SwitchValueControlProps } from "./controls/switch/SwitchValueControl.js";
export { TextValueEditor } from "./controls/text/TextValueEditor.js";
export type {
  TextValueEditorPresentation,
  TextValueEditorProps,
} from "./controls/text/TextValueEditor.js";
export type {
  TextValueCompletionOption,
  TextValueCompletionProvider,
  TextValueCompletionRequest,
  TextValueCompletionResult,
} from "./controls/text/textValueCompletion.js";
export type { TextValueLanguage } from "./controls/text/editorLanguages.js";
export { ItemDndContext } from "./dnd/ItemDndContext.js";
export { setWorkspaceColorMode } from "./document/appearance.js";
export {
  setWorkspaceCapabilities,
  useWorkspaceCapabilities,
} from "./document/capabilities.js";
export type { WorkspaceCapabilitiesState } from "./document/capabilities.js";
export type { WorkspaceDocumentSubscription } from "./document/documentChangeCallback.js";
export { useWorkspaceDocumentSnapshot } from "./document/useWorkspaceDocumentSnapshot.js";
export { commitWorkspaceDocument } from "./document/loadWorkspaceDocument.js";
export { insertWorkspaceSection } from "./document/insertWorkspaceSection.js";
export {
  activateWorkspaceSavedView,
  createWorkspaceSavedView,
  deleteWorkspaceSavedView,
  enableWorkspaceSavedViews,
  getWorkspaceSavedViewsOperationDisabledReason,
  getWorkspaceSavedViewsState,
  renameWorkspaceSavedView,
  reorderWorkspaceSavedView,
  setWorkspaceSavedViewSectionVisibility,
  setWorkspaceSavedViewTabVisibility,
} from "./saved-views/operations.js";
export {
  createWorkspaceSavedViewsState,
  getOrderedWorkspaceSavedViews,
  isWorkspaceSavedViewSectionVisible,
  parseWorkspaceSavedViewsState,
  projectWorkspaceDocumentSavedViews,
} from "./saved-views/state.js";
export type {
  WorkspaceSavedViewCreateInput,
  WorkspaceSavedViewsEnableInput,
  WorkspaceSavedViewsOperation,
  WorkspaceSavedViewsOperationResult,
} from "./saved-views/types.js";
export { GROUP_SECTION_KIND } from "./document/documentSelectors.js";
export { setItemData } from "./document/itemData.js";
export {
  setItemControlConfiguration,
  setItemHelpText,
  setItemLabel,
  setItemPresentation,
  setItemValue,
} from "./document/itemPresentationMutations.js";
export {
  activateItemSelect,
  deactivateItemSelect,
  useItemSelectionMode,
} from "./document/itemSelectionMode.js";
export type { ItemSelectionModeState } from "./document/itemSelectionMode.js";
export { setSectionData } from "./document/sectionData.js";
export { registerSectionKinds } from "./document/sectionKindRegistry.js";
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
  WorkspaceSectionSearchableText,
  WorkspaceSectionKindIconProps,
} from "./document/sectionKindRegistry.js";
export type { WorkspaceSectionSizeConstraints } from "./section/resize/sectionSizingBounds.js";
export { WorkspaceSectionHeaderAction } from "./section/header/WorkspaceSectionHeaderAction.js";
export { WorkspaceCarousel } from "./section/WorkspaceCarousel.js";
export type {
  WorkspaceCarouselItem,
  WorkspaceCarouselProps,
} from "./section/WorkspaceCarousel.js";
export type { WorkspaceSectionHeaderActionProps } from "./section/header/WorkspaceSectionHeaderAction.js";
export { setWorkspaceSectionSize } from "./section/sectionSizes.js";
export { useWorkspaceAppearance } from "./document/stores.js";
export type {
  WorkspaceAppearanceState,
  WorkspaceColorMode,
} from "./document/stores.js";
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
  WorkspaceSavedView,
  WorkspaceSavedViewsState,
  WorkspaceSwitchItemControlConfiguration,
  WorkspaceTextAreaItemControlConfiguration,
  WorkspaceTextItemControlConfiguration,
  WorkspaceTimeItemControlConfiguration,
} from "./document/types.js";
export {
  MANUAL_WHEEL_CLASS_NAME,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "./interaction.js";
export {
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  deleteWorkspaceItems,
  insertWorkspaceItem,
} from "./items/itemAuthoringActions.js";
export type {
  WorkspaceItemDiagnostic,
  WorkspaceItemDiagnosticRegistry,
  WorkspaceItemDiagnosticSeverity,
} from "./items/itemDiagnostics.js";
export { registerItemHandlers } from "./items/itemHandlerRegistry.js";
export type {
  WorkspaceDropzoneItemHandlerRegistration,
  WorkspaceItemHandlerRegistration,
  WorkspacePasswordItemHandlerRegistration,
} from "./items/itemHandlerRegistry.js";
export type { ItemRowRenderContext } from "./items/ItemListContext.js";
export { WorkspaceItemLabel } from "./items/WorkspaceItemLabel.js";
export type { WorkspaceItemLabelProps } from "./items/WorkspaceItemLabel.js";
export { WorkspaceItemList } from "./items/WorkspaceItemList.js";
export type { WorkspaceItemListProps } from "./items/WorkspaceItemList.js";
export { WorkspaceNavigator } from "./navigator/WorkspaceNavigator.js";
export {
  closeWorkspaceNavigator,
  openWorkspaceNavigator,
} from "./navigator/workspaceNavigatorState.js";
export type {
  WorkspaceNavigatorConfiguration,
  WorkspaceNavigatorMode,
  WorkspaceNavigatorProps,
} from "./navigator/workspaceNavigatorTypes.js";
export { WorkspaceParameterConfigurationView } from "./shell/WorkspaceParameterConfigurationView.js";
export {
  getWorkspaceKeyBindingConflicts,
  getWorkspaceKeyBindings,
  registerWorkspaceKeyBindings,
} from "./keybindings/workspaceKeyBindingRegistry.js";
export type {
  WorkspaceKeyBinding,
  WorkspaceKeyBindingConflict,
  WorkspaceKeyBindingDescriptor,
} from "./keybindings/workspaceKeyBindingTypes.js";
export { setGroupOverflowMode } from "./section/groupOverflowAction.js";
export { WorkspaceNormalizedStrokeSurface } from "./section/WorkspaceNormalizedStrokeSurface.js";
export type {
  WorkspaceNormalizedPoint,
  WorkspaceNormalizedStroke,
  WorkspaceNormalizedStrokeSurfaceProps,
} from "./section/WorkspaceNormalizedStrokeSurface.js";
export { DEFAULT_SECTION_TAG_COLOR_PALETTE } from "./section/sectionTagColors.js";
export type {
  WorkspaceSectionTagColorChoice,
  WorkspaceSectionTagColorPalette,
} from "./section/sectionTagColors.js";
export { setSectionTagColor } from "./section/tagColorAction.js";
export { ungroupSections } from "./section/ungroupAction.js";
export { WorkspaceShell } from "./shell/WorkspaceShell.js";
export {
  WorkspaceParameterConfigurationIcon,
  WorkspaceSavedViewsIcon,
  WorkspaceSectionSettingsIcon,
} from "./shell/WorkspaceShellIcons.js";
export { WorkspaceSavedViewsPane } from "./shell/WorkspaceSavedViewsPane.js";
export {
  WorkspaceQuickStart,
  WorkspaceQuickStartIcon,
} from "./shell/WorkspaceQuickStart.js";
export type {
  WorkspaceQuickStartProps,
  WorkspaceQuickStartStep,
} from "./shell/WorkspaceQuickStart.js";
export type { WorkspaceSavedViewsPaneProps } from "./shell/WorkspaceSavedViewsPane.js";
export {
  WorkspaceInspectorSettingsGroup,
  WorkspaceSectionEditor,
} from "./shell/WorkspaceInspector.js";
export type {
  WorkspaceInspectorSettingsGroupProps,
  WorkspaceSectionEditorProps,
} from "./shell/WorkspaceInspector.js";
export {
  WORKSPACE_INSPECTOR_TAB_ID,
  WORKSPACE_OUTLINE_TAB_ID,
  WORKSPACE_SAVED_VIEWS_TAB_ID,
  createWorkspaceShellViewState,
} from "./shell/workspaceShellLayout.js";
export type {
  WorkspaceShellOutlineViewState,
  WorkspaceShellPane,
  WorkspaceShellPaneViewState,
  WorkspaceShellProps,
  WorkspaceShellTabContentProps,
  WorkspaceShellTabDefinition,
  WorkspaceShellTabIconProps,
  WorkspaceShellViewState,
} from "./shell/workspaceShellTypes.js";
export {
  loadWorkspaceSavedViews,
  loadWorkspaceShellViewState,
  saveWorkspaceSavedViews,
  saveWorkspaceShellViewState,
} from "./shell/workspaceBrowserStorage.js";
export type {
  LoadWorkspaceShellViewStateOptions,
  WorkspaceBrowserStorage,
  WorkspaceBrowserStorageOptions,
} from "./shell/workspaceBrowserStorage.js";
export type { WorkspaceShellWindowingConfiguration } from "./windowing/workspaceWindowingContext.js";
export { WorkspaceWindowManager } from "./windowing/WorkspaceWindowManager.js";
export type {
  WorkspaceWindowManagerProps,
  WorkspaceWindowRenderer,
  WorkspaceWindowRenderers,
} from "./windowing/WorkspaceWindowManager.js";
export { WorkspaceWindowSurface } from "./windowing/WorkspaceWindowSurface.js";
export type {
  WorkspaceWindowSurfaceAction,
  WorkspaceWindowSurfaceActionTone,
  WorkspaceWindowSurfaceProps,
} from "./windowing/WorkspaceWindowSurface.js";
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
} from "./windowing/windowingSnapLayout.js";
export type {
  ResolveWorkspaceFloatingSnapPresetFromPointerInput,
  WorkspaceFloatingSnapResizeSeam,
  WorkspaceNormalizedWindowBounds,
  WorkspaceSnappedWindow,
  WorkspaceWindowWorkArea,
} from "./windowing/windowingSnapLayout.js";
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
} from "./windowing/windowingState.js";
export type {
  OpenWorkspaceFloatingWindowInput,
  ShowWorkspaceSectionInFloatingWindowInput,
  WorkspaceWindowBoundsUpdate,
  WorkspaceWindowDockLayoutUpdate,
  WorkspaceWindowPosition,
} from "./windowing/windowingState.js";
export {
  createWorkspaceFloatingWindow,
  createWorkspaceWindowBounds,
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  WorkspaceWindowingError,
} from "./windowing/windowingTypes.js";
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
} from "./windowing/windowingTypes.js";
export {
  canSnapshotWorkspaceWindowSpace,
  createWorkspaceWindowSpace,
  restoreWorkspaceWindowSpace,
  snapshotWorkspaceWindowSpace,
} from "./windowing/windowSpaces.js";
export type {
  WorkspaceWindowSpace,
  WorkspaceWindowSpaceInput,
  WorkspaceWindowSpaceMetadata,
  WorkspaceWindowSpaceRestoreResult,
  WorkspaceWindowSpaceWindow,
} from "./windowing/windowSpaces.js";
export { WorkspaceWindowSpacesPane } from "./windowing/WorkspaceWindowSpacesPane.js";
export type {
  WorkspaceWindowSpaceErrors,
  WorkspaceWindowSpacePending,
  WorkspaceWindowSpacesPaneProps,
} from "./windowing/WorkspaceWindowSpacesPane.js";
export { StandaloneWorkspaceWindowSpaceSurface } from "./windowing/StandaloneWorkspaceWindowSpaceSurface.js";
export type { StandaloneWorkspaceWindowSpaceSurfaceProps } from "./windowing/StandaloneWorkspaceWindowSpaceSurface.js";
export { StandaloneWorkspaceSectionSurface } from "./standalone/StandaloneWorkspaceSectionSurface.js";
export type { StandaloneWorkspaceSectionSurfaceProps } from "./standalone/StandaloneWorkspaceSectionSurface.js";
export { WorkspaceControls } from "./toolbar/WorkspaceControls.js";
export { registerWorkspaceToolbarContributions } from "./toolbar/workspaceToolbarRegistry.js";
export type {
  WorkspaceToolbarContribution,
  WorkspaceToolbarPlacement,
} from "./toolbar/workspaceToolbarTypes.js";
export { WorkspaceTooltip } from "./tooltip/WorkspaceTooltip.js";
