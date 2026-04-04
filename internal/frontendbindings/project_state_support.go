package frontendbindings

import (
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/lspcompletion"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/scriptablechat"
	"setta/internal/settingsstate"
)

type ProjectStateSingleConfig projectview.SingleConfig

type ProjectStateSingleConfigWithCompletedOpIds = httpapi.ProjectStateSingleConfigWithCompletedOpIDs

type ClipboardDataType = projectstate.ClipboardDataType

type ClipboardProjectStateCore = projectstate.ClipboardProjectStateCore

type Core = projectview.Core

type Variant = projectview.Variant

type SingletonSections = projectview.SingletonSections

type ShownParamIdDetails projectview.ShownParamIDDetails

type ShownParamIds projectview.ShownParamIDs

type ChatWindowPlacement = projectstate.ChatWindowPlacement

type ChatWindowMode = projectstate.ChatWindowMode

type ChatWindowBounds = projectstate.ChatWindowBounds

type ChatWindowDockMetrics = projectstate.ChatWindowDockMetrics

type ProjectChatWindowInstance = projectstate.ProjectChatWindowInstance

type ProjectChatWindowingState = projectstate.ProjectChatWindowingState

type WindowSpaceSurfaceKind = projectstate.WindowSpaceSurfaceKind

type NormalizedFloatingWindowBounds = projectstate.NormalizedFloatingWindowBounds

type WindowSpaceWindow = projectstate.WindowSpaceWindow

type WindowSpaceState = projectstate.WindowSpaceState

type WindowSpaceConfig = projectstate.WindowSpaceConfig

type SectionsClipboardData = projectstate.SectionsClipboardData

type BaseClipboardDataUnionWithDiscriminator struct{}

type ProjectMetadataEntry projectstate.ProjectConfigMetadata

type AllProjectMetadata projectshell.AllProjectMetadata

type DeploymentType deployments.Type

type DeploymentListenerConfig deployments.ListenerConfig

type DeploymentManifest deployments.Manifest

type DeploymentMetadata httpapi.DeploymentMetadataResponse

type DeploymentMetadataList []DeploymentMetadata

type ShareDeploymentSessionResponse httpapi.ShareDeploymentSessionResponse

type AppDeploymentSessionResponse httpapi.AppDeploymentSessionResponse

type DeploymentVersionRouteParams struct {
	DeploymentName string `json:"deploymentName"`
	Version        string `json:"version"`
}

type DeploymentNameRouteParams struct {
	DeploymentName string `json:"deploymentName"`
}

type LoadDeploymentProjectConfigRequestInput httpapi.LoadDeploymentProjectConfigRequest

type AppDeploymentStateResponse httpapi.AppDeploymentStateResponse

type PublishShareDeploymentRequestInput struct {
	DeploymentName       string       `json:"deploymentName"`
	ProjectConfigID      string       `json:"projectConfigId"`
	SharePolicyOverrides *SharePolicy `json:"sharePolicyOverrides,omitempty"`
	ListenerEntrypoint   string       `json:"listenerEntrypoint"`
	ListenerEnabled      bool         `json:"listenerEnabled"`
}

type PublishAppDeploymentRequestInput struct {
	DeploymentName     string       `json:"deploymentName"`
	ProjectConfigID    string       `json:"projectConfigId"`
	AppPolicyOverrides *SharePolicy `json:"appPolicyOverrides,omitempty"`
	ListenerEntrypoint string       `json:"listenerEntrypoint"`
	ListenerEnabled    bool         `json:"listenerEnabled"`
}

type LoadProjectConfigRequestInput httpapi.ProjectLoadRequest

type SaveProjectRequestInput httpapi.ManualSaveRequest

type SaveAsNewProjectConfigRequestInput httpapi.SaveAsNewProjectConfigRequest

type CreateProjectConfigRequestInput httpapi.CreateProjectConfigRequest

type CreateProjectConfigResponse string

type DeleteProjectConfigsRequestInput httpapi.DeleteProjectConfigsRequest

type DeleteProjectConfigsResponse httpapi.DeleteProjectConfigsResponse

type SetProjectConfigNameRequestInput httpapi.SetProjectConfigNameRequest

type SetAsDefaultProjectRequestInput httpapi.SetDefaultProjectConfigRequest

type GetNotificationsRequestInput httpapi.GetNotificationsRequest

type DeleteNotificationRequestInput httpapi.DeleteNotificationRequest

type NotificationsResponse []SettaNotification

type DeleteNotificationResponse httpapi.DeleteNotificationResponse

type DocstringToMarkdownResponse string

type AgenticSummaryCacheStatus struct {
	MaxSummariesPerRun     int      `json:"maxSummariesPerRun"`
	SummarySectionIDs      []string `json:"summarySectionIds"`
	CachedSectionIDs       []string `json:"cachedSectionIds"`
	MissingSectionIDs      []string `json:"missingSectionIds"`
	EmptySourceSectionIDs  []string `json:"emptySourceSectionIds"`
	ConsideredSectionIDs   []string `json:"consideredSectionIds"`
	WouldAttemptSectionIDs []string `json:"wouldAttemptSectionIds"`
}

type AIFollowToolArgumentsUpdateContent realtime.AIFollowToolArgumentsUpdateContent

type AIFollowToolResultUpdateContent realtime.AIFollowToolResultUpdateContent

type AIFollowSnapshotResponse []AIFollowToolArgumentsUpdateContent

type CodeMirrorCompletion lspcompletion.CodeMirrorCompletion

type CodeMirrorCompletionResponse []CodeMirrorCompletion

type CreateNewSectionVariantRequestInput httpapi.CreateNewSectionVariantRequest

type CreateNewSectionVariantResponse projectstate.CreateNewSectionVariantResult

type SetSectionVariantRequestInput httpapi.SetSectionVariantRequest

type SetDefaultSectionVariantRequestInput httpapi.SetDefaultSectionVariantRequest

type SetSectionVariantSortOrderRequestInput httpapi.SetSectionVariantSortOrderRequest

type ToggleVariantFrozenRequestInput httpapi.ToggleVariantFrozenRequest

type ToggleVariantJSONSourceRequestInput httpapi.ToggleVariantJSONSourceRequest

type SetVariantJSONSourceKeysRequestInput httpapi.SetVariantJSONSourceKeysRequest

type SetSectionVariantNameRequestInput httpapi.SetSectionVariantNameRequest

type DeleteSectionVariantOrAskResponse string

type CreateChildSectionsRequestInput struct {
	FrontendOpID    *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId"`
	ParentID        string      `json:"parentId"`
	ImplType        SectionType `json:"implType"`
	NumChildren     int         `json:"numChildren"`
	StartIdx        *int        `json:"startIdx,omitempty"`
}

type CreateChildSectionsViaIncrementerRequestInput struct {
	FrontendOpID    *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId"`
	CalledBy        string      `json:"calledBy"`
	ImplType        SectionType `json:"implType"`
	NumChildren     int         `json:"numChildren"`
}

type CreateChildSectionsResponse projectstate.CreateChildSectionsResult

type DeleteChildSectionsViaDecrementerRequestInput httpapi.DeleteChildSectionsViaDecrementerRequest

type DeleteChildSectionsViaDecrementerResponse projectstate.DeleteSectionsResult

type DeleteSectionsRequestInput httpapi.DeleteSectionsRequest

type DeleteSelectedParamsRequestInput httpapi.DeleteSelectedParamsRequest

type PrepareSectionsForCopyRequestInput httpapi.PrepareSectionsForCopyRequest

type PasteSectionsRequestInput httpapi.PasteSectionsRequest

type SectionsClipboardDataResponse struct{}

type CreateEdgeRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	SourceSectionID string         `json:"sourceSectionId"`
	SourceVariantID string         `json:"sourceVariantId"`
	SourcePortID    string         `json:"sourcePortId"`
	TargetSectionID string         `json:"targetSectionId"`
	TargetVariantID string         `json:"targetVariantId"`
	TargetPortID    string         `json:"targetPortId"`
	Type            *string        `json:"type,omitempty"`
	Label           *string        `json:"label,omitempty"`
	Style           map[string]any `json:"style,omitempty"`
	Animated        *bool          `json:"animated,omitempty"`
	Hidden          *bool          `json:"hidden,omitempty"`
	ZIndex          *int           `json:"zIndex,omitempty"`
	Data            map[string]any `json:"data,omitempty"`
}

type UpdateEdgeRequestInput httpapi.UpdateEdgeRequest

type DeleteEdgesRequestInput httpapi.DeleteEdgesRequest

type ReconnectEdgeRequestInput httpapi.ReconnectEdgeRequest

type SetEdgesRequestInput httpapi.SetEdgesRequest

type CreateStateMachineEdgeRequestInput struct {
	FrontendOpID                   *string                                     `json:"frontendOpId,omitempty"`
	ProjectConfigID                string                                      `json:"projectConfigId"`
	ID                             *string                                     `json:"id,omitempty"`
	MachineGroupID                 string                                      `json:"machineGroupId"`
	SourceSectionID                string                                      `json:"sourceSectionId"`
	SourcePortID                   string                                      `json:"sourcePortId"`
	TargetSectionID                string                                      `json:"targetSectionId"`
	TargetPortID                   string                                      `json:"targetPortId"`
	SourceFilter                   *StateMachineSourceFilter                   `json:"sourceFilter,omitempty"`
	SourceActivationCountCondition *StateMachineSourceActivationCountCondition `json:"sourceActivationCountCondition,omitempty"`
	TargetAction                   *StateMachineTargetAction                   `json:"targetAction,omitempty"`
	Style                          map[string]any                              `json:"style,omitempty"`
	Hidden                         *bool                                       `json:"hidden,omitempty"`
	ZIndex                         *int                                        `json:"zIndex,omitempty"`
	Selected                       *bool                                       `json:"selected,omitempty"`
}

type UpdateStateMachineEdgeRequestInput httpapi.UpdateStateMachineEdgeRequest

type DeleteStateMachineEdgesRequestInput httpapi.DeleteStateMachineEdgesRequest

type SetStateMachineEdgesRequestInput httpapi.SetStateMachineEdgesRequest

type CreateAgenticEdgeRequestInput struct {
	FrontendOpID    *string                 `json:"frontendOpId,omitempty"`
	ProjectConfigID string                  `json:"projectConfigId"`
	ID              *string                 `json:"id,omitempty"`
	SourceSectionID string                  `json:"sourceSectionId"`
	TargetSectionID string                  `json:"targetSectionId"`
	Kind            AgenticEdgeKind         `json:"kind"`
	ContextMode     *AgenticEdgeContextMode `json:"contextMode,omitempty"`
	Style           map[string]any          `json:"style,omitempty"`
	Hidden          *bool                   `json:"hidden,omitempty"`
	ZIndex          *int                    `json:"zIndex,omitempty"`
}

type UpdateAgenticEdgeRequestInput httpapi.UpdateAgenticEdgeRequest

type DeleteAgenticEdgesRequestInput httpapi.DeleteAgenticEdgesRequest

type SetAgenticEdgesRequestInput httpapi.SetAgenticEdgesRequest

type MoveSectionsRequestInput httpapi.MoveSectionsRequest

type MoveParamGroup httpapi.MoveParamGroupRequest

type MoveParamsRequestInput httpapi.MoveParamsRequest

type MoveParamGroupsRequestInput httpapi.MoveParamGroupsRequest

type IndentParamsRequestInput httpapi.IndentParamsRequest

type UnindentParamsRequestInput httpapi.UnindentParamsRequest

type AddKwargRequestInput httpapi.AddKwargRequest

type DeleteKwargRequestInput httpapi.DeleteKwargRequest

type SetParamEnteredValueRequestInput httpapi.SetParamEnteredValueRequest

type UpdateParamImplConfigRequestInput httpapi.UpdateParamImplConfigRequest

type SetCodeSectionAttachedTerminalRequestInput httpapi.SetCodeSectionAttachedTerminalRequest

type SetGenCodePrefixRequestInput httpapi.SetGenCodePrefixRequest

type SetGenCodeSuffixRequestInput httpapi.SetGenCodeSuffixRequest

type SetCodeObjNameRequestInput httpapi.SetCodeObjNameRequest

type SetCodeObjDisplayNameRequestInput httpapi.SetCodeObjDisplayNameRequest

type Position projectstate.Position

type RunSnapshotMode deployments.RunSnapshotMode

type RenameRefactorMode projectstate.RenameRefactorMode

type BackgroundVariant string

type SelectionMode string

type PanOnScrollMode string

type MetaControlSizeMode string

type SectionSizeMode string

type ProjectCodegenLanguage = projectview.ProjectCodegenLanguage

type SectionCodegenMode = projectview.SectionCodegenMode

type SectionRepresentationMode = projectview.SectionRepresentationMode

type CodeObjValueRepresentationMode = projectview.CodeObjValueRepresentationMode

type SectionSizeValue projectstate.SectionSizeValue

type SectionSize projectstate.SectionSize

type SectionSizingPolicyTypeEntry projectstate.FrontendSectionSizingPolicyTypeEntry

type SectionSizingPolicyCallableTypeEntry projectstate.FrontendSectionSizingPolicyCallableTypeEntry

type MetaControlSizingPolicyTypeEntry projectstate.FrontendMetaControlSizingPolicyTypeEntry

type MetaControlSizingPolicyByType projectstate.FrontendMetaControlSizingPolicyByType

type SectionSizingPolicyGlobals projectstate.FrontendSectionSizingPolicyGlobals

type SectionSizingPolicyByType projectstate.FrontendSectionSizingPolicyByType

type SectionSizingPolicy projectstate.FrontendSectionSizingPolicy

type SharePolicy deployments.Policy

type SettingsShortcuts settingsstate.FrontendSettingsShortcuts

type SettingsGUI settingsstate.FrontendSettingsGUI

type SettingsBackend settingsstate.FrontendSettingsBackend

type SettingsState settingsstate.FrontendSettingsState

type SaveSettingsRequestInput struct {
	Settings SettingsState `json:"settings"`
}

type SectionTypeCodegenPolicy = projectview.SectionTypeCodegenPolicy

type SectionCodegenOverride = projectview.SectionCodegenOverride

type SectionCodegenPolicy = projectview.SectionCodegenPolicy

type CodeObjTypeValuePolicy = projectview.CodeObjTypeValuePolicy

type CodeObjValueOverride = projectview.CodeObjValueOverride

type CodeObjValuePolicy = projectview.CodeObjValuePolicy

type ProjectCodegenPythonTarget = projectview.ProjectCodegenPythonTarget

type ProjectCodegenPluginTarget = projectview.ProjectCodegenPluginTarget

type ProjectCodegenTarget = projectview.ProjectCodegenTarget

type ProjectConfig = projectview.ProjectConfig

type ClipboardProjectStateCoreWithSectionVariantMap = projectstate.ClipboardProjectStateCoreWithSectionVariantMap

type CreateTopLevelSectionRequestInput httpapi.CreateTopLevelSectionRequest

type CreateTopLevelSectionResponse projectstate.CreateTopLevelSectionResult

type CreateViewModeRequestInput httpapi.CreateViewModeRequest

type CreateViewModeResponse string

type SetActiveViewModeRequestInput httpapi.SetActiveViewModeRequest

type ToggleIsEditingViewModeRequestInput httpapi.ToggleIsEditingViewModeRequest

type ToggleViewModeUserFacingRequestInput httpapi.ToggleViewModeUserFacingRequest

type ToggleViewModeTabRequestInput httpapi.ToggleViewModeTabRequest

type SetViewModeNameRequestInput httpapi.SetViewModeNameRequest

type SetViewModeSortOrderRequestInput httpapi.SetViewModeSortOrderRequest

type DeleteViewModeRequestInput httpapi.DeleteViewModeRequest

type SetSectionNameRequestInput httpapi.SetSectionNameRequest

type AcceptRenameRefactorRequestInput httpapi.AcceptRenameRefactorRequest

type DeclineRenameRefactorRequestInput httpapi.DeclineRenameRefactorRequest

type ToggleSectionVisibilityRequestInput httpapi.ToggleSectionVisibilityRequest

type AutoLayoutTopLevelSectionsRequestInput httpapi.AutoLayoutTopLevelSectionsRequest

type SetShowParamDisplayNamesRequestInput httpapi.SetShowParamDisplayNamesRequest

type TogglePositionLocksRequestInput httpapi.TogglePositionLocksRequest

type ToggleMinimizedRequestInput httpapi.ToggleMinimizedRequest

type SetSectionTagColorRequestInput httpapi.SetSectionTagColorRequest

type SetSectionStyleColorRequestInput httpapi.SetSectionStyleColorRequest

type GetLatestProjectStateRequestInput httpapi.GetLatestProjectStateRequest

type UndoRequestInput httpapi.UndoRequest

type RedoRequestInput httpapi.RedoRequest

type SetCallableChildCodeObj projectstate.SetCallableChildCodeObj

type SignatureHelpStatus projectstate.SignatureHelpStatus

type SetCallableResponse projectstate.SetCallableResponse

type SetCallableRequestInput httpapi.SetCallableRequest

type SetCodeRequestInput httpapi.SetCodeRequest

type FormatCodeRequestInput httpapi.FormatCodeRequest

type SetCallableHideParamsRequestInput httpapi.SetCallableHideParamsRequest

type SetSectionHideUnpinnedParamsRequestInput httpapi.SetSectionHideUnpinnedParamsRequest

type SetSectionPinnedParamsRequestInput httpapi.SetSectionPinnedParamsRequest

type SetProjectConfigCodegenTargetsRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	CodegenTargets  []ProjectCodegenTarget `json:"codegenTargets"`
}

type SetChatSectionSettingsRequestInput httpapi.SetChatSectionSettingsRequest

type SetStateMachineSectionSettingsRequestInput httpapi.SetStateMachineSectionSettingsRequest

type SetWatchCodeEnabledRequestInput httpapi.SetWatchCodeEnabledRequest

type SetWatchCodeInputsRequestInput httpapi.SetWatchCodeInputsRequest

type GroupSectionsRequestInput httpapi.GroupSectionsRequest

type UngroupGroupsRequestInput httpapi.UngroupGroupsRequest

type SetSectionSizesRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionSizes    map[string]SectionSize `json:"sectionSizes"`
}

type ToggleParamSelectedRequestInput httpapi.ToggleParamSelectedRequest

type UnselectAllParamsRequestInput httpapi.UnselectAllParamsRequest

type SectionType string

type CodeObjType string

type CodeLanguage projectstate.CodeLanguage

type BuiltinCodeLanguage struct{}

type ConfigLanguage string

type ParameterPassingStyle string

type ParamNameType string

type ButtonActionMode string

type HttpRequestMethod string

type DropzoneMode string

type TextParamInputUIType string

type TimeDisplayFormat string

type TimeControlMode string

type TimeDisplayFont string

type DateDisplayFormat string

type DateControlMode string

type DateSelectionMode string

type DateCalendarWeekStart string

type ListRootViewMode projectstate.ListRootViewMode

type BrowserAreaViewMode projectstate.BrowserAreaViewMode

type BrowserSearchScope projectstate.BrowserSearchScope

type SpreadsheetGridDensity projectstate.SpreadsheetGridDensity

type ChartType = projectstate.ChartType

type LineChartSettings = projectstate.LineChartSettings

type ScatterChartSettings = projectstate.ScatterChartSettings

type BaseChartSettingsUnion struct{}

type TextBlockDisplayMode projectstate.TextBlockDisplayMode

type TextBlockFormat projectstate.TextBlockFormat

type CodeFileAccessMode projectstate.CodeFileAccessMode

type TaskBoardViewMode projectstate.TaskBoardViewMode

type TaskBoardTaskRecurrence string

type TaskBoardRecurringWeekday string

type TaskBoardRecurringMonth string

type StateMachineGateType = projectstate.StateMachineGateType

type StateMachineTargetActionType = projectstate.StateMachineTargetActionType

type StateMachineThreadStrategy = projectstate.StateMachineThreadStrategy

type StateMachineSourceFilterType = projectstate.StateMachineSourceFilterType

type StateMachineCountOperator = projectstate.StateMachineCountOperator

type AgenticEdgeKind string

type AgenticEdgeContextMode string

type StateMachineGateUIState projectstate.StateMachineGateUIState

type StateMachineSourceFilter = projectstate.StateMachineSourceFilter

type StateMachineSourceActivationCountCondition = projectstate.StateMachineSourceActivationCountCondition

type StateMachineTargetAction = projectstate.StateMachineTargetAction

type EdgePort = projectstate.EdgePort

type TypeErrorIgnoreState projectstate.TypeErrorIgnoreState

type ChartData struct{}

type ChartDataType struct{}

type BrowserSavedSearchTypeFilters projectstate.BrowserSavedSearchTypeFilters

type BrowserSavedSearch projectstate.BrowserSavedSearch

type CodeFileBindingUpdate httpapi.CodeFileBindingUpdate

type TaskBoardColumn projectstate.TaskBoardColumn

type TaskBoardTask projectstate.TaskBoardTask

type Edge = projectstate.Edge

type StateMachineEdge = projectstate.StateMachineEdge

type AgenticEdge = projectstate.AgenticEdge

type Viewport = projectstate.Viewport

type TopLevelSectionLayout = projectstate.TopLevelSectionLayout

type ViewMode = projectstate.ViewMode

type ViewModeConfig projectstate.ViewMode

type WatchCodeFolder = projectstate.WatchCodeFolder

type WatchCodeRegistryEntry = projectstate.WatchCodeRegistryEntry

type CodeFileBinding = projectview.CodeFileBinding

type ChatRole = scriptablechat.ChatRole

type ChatSendAction = scriptablechat.ChatSendAction

type ChatStopAction = scriptablechat.ChatStopAction

type ChatSendEvent = scriptablechat.ChatSendEvent

type ChatStopEvent = scriptablechat.ChatStopEvent

type ChatPermissionMode = projectstate.ChatPermissionMode

type ChatDictationMode = projectstate.ChatDictationMode

type JSONValue struct{}

type ChatFileAttachment = scriptablechat.ChatFileAttachment

type MessageTextContent = scriptablechat.MessageTextContent

type MessageImageURL = scriptablechat.MessageImageURL

type MessageImageURLContent = scriptablechat.MessageImageURLContent

type MessageThinkingContent = scriptablechat.MessageThinkingContent

type MessageContent struct{}

type ToolReferenceContent = scriptablechat.ToolReferenceContent

type ToolCallFunction = scriptablechat.ToolCallFunction

type ToolCall = scriptablechat.ToolCall

type SystemChatMessage = scriptablechat.SystemChatMessage

type AssistantChatMessage = scriptablechat.AssistantChatMessage

type UserChatMessage = scriptablechat.UserChatMessage

type ToolChatMessage = scriptablechat.ToolChatMessage

type BaseChatMessageUnion struct{}

type ChatSectionBranch = projectstate.ChatSectionBranch

type ChatSectionState = projectstate.ChatSectionState

type UserDefaultChatSectionImpl struct{}

type ChatSectionImpl struct{}

type UserDefaultBrowserSectionImpl struct{}

type BrowserSectionImpl struct{}

type BaseSectionImpl struct{}

type UserDefaultListRootSectionImpl struct{}

type ListRootSectionImpl struct{}

type UserDefaultGroupSectionImpl struct{}

type GroupSectionImpl struct{}

type UserDefaultStateMachineStartSectionImpl struct{}

type StateMachineStartSectionImpl struct{}

type UserDefaultStateMachineGateSectionImpl struct{}

type StateMachineGateSectionImpl struct{}

type UserDefaultStateMachineEndSectionImpl struct{}

type StateMachineEndSectionImpl struct{}

type UserDefaultTextBlockSectionImpl struct{}

type TextBlockSectionImpl struct{}

type UserDefaultPromptSectionImpl struct{}

type PromptSectionImpl struct{}

type CodeSectionDiagnosticsIgnoreState projectstate.CodeSectionDiagnosticsIgnoreState

type UserDefaultCodeSectionImpl struct{}

type CodeSectionImpl projectstate.CodeSectionImpl

type UserDefaultTerminalSectionImpl struct{}

type TerminalSectionImpl projectstate.TerminalSectionImpl

type BaseSectionImplUnion struct{}

type CallableSectionImpl struct{}

type BaseParentSectionImplUnion struct{}

type BaseSectionWithParamsImplUnion struct{}

type DictSectionImpl struct{}

type UserDefaultCallableSectionImpl struct{}

type UserDefaultDictSectionImpl struct{}

type BaseDictSectionImplUnion struct{}

type BaseCodeObjImpl struct{}

type CodeParamCodeObjImpl struct{}

type CodeCallableCodeObjImpl struct{}

type NestedParamCodeObjImpl struct{}

type BaseCodeObjImplUnion struct{}

type BaseChildlessCodeObjImplUnion struct{}

type BaseParamCodeObjImplUnion struct{}

type BaseParentCodeObjImplUnion struct{}

type UserDefaultCodeParamCodeObjImpl struct{}

type ColorPickerChoice settingsstate.FrontendColorPickerChoice

type TextParamCodeObjImpl struct{}

type DateParamCodeObjImpl struct{}

type TimeParamCodeObjImpl struct{}

type ButtonParamCodeObjImpl struct{}

type SliderParamCodeObjImpl struct{}

type RotaryParamCodeObjImpl struct{}

type SwitchParamCodeObjImpl struct{}

type ColorPickerParamCodeObjImpl struct{}

type DropdownParamCodeObjImpl struct{}

type PasswordParamCodeObjImpl struct{}

type TextAreaParamCodeObjImpl struct{}

type DropzoneParamCodeObjImpl struct{}

type UserDefaultTaskBoardSectionImpl struct{}

type TaskBoardSectionImpl struct{}

type UserDefaultChartSectionImpl struct{}

type ChartSectionImpl struct{}

type UserDefaultSpreadsheetSectionImpl struct{}

type SpreadsheetSectionImpl struct{}

type SetSectionParamFilterRequestInput httpapi.SetSectionParamFilterRequest

type SetMetaControlShowSectionTitleRequestInput httpapi.SetMetaControlShowSectionTitleRequest

type SetSectionColumnWidthRequestInput httpapi.SetSectionColumnWidthRequest

type SetSectionEdgeInputsRequestInput httpapi.SetSectionEdgeInputsRequest

type SetSectionEdgeOutputsRequestInput httpapi.SetSectionEdgeOutputsRequest

type SetParentDefaultChildSectionTypeRequestInput struct {
	FrontendOpID            *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID         string      `json:"projectConfigId"`
	SectionID               string      `json:"sectionId"`
	DefaultChildSectionType SectionType `json:"defaultChildSectionType"`
}

type SetListRootViewModeRequestInput httpapi.SetListRootViewModeRequest

type ToggleGroupOrientationRequestInput httpapi.ToggleGroupOrientationRequest

type SetGroupOverflowModeRequestInput httpapi.SetGroupOverflowModeRequest

type SetBrowserColumnWidthsRequestInput httpapi.SetBrowserColumnWidthsRequest

type SetBrowserAreaViewModeRequestInput httpapi.SetBrowserAreaViewModeRequest

type SetBrowserHideColumnRequestInput httpapi.SetBrowserHideColumnRequest

type SetBrowserSavedSearchesRequestInput httpapi.SetBrowserSavedSearchesRequest

type SetSpreadsheetFilePathRequestInput httpapi.SetSpreadsheetFilePathRequest

type SetSpreadsheetSectionSettingsRequestInput httpapi.SetSpreadsheetSectionSettingsRequest

type SetTaskBoardSectionStateRequestInput httpapi.SetTaskBoardSectionStateRequest

type SetImageAreaImagePathRequestInput httpapi.SetImageAreaImagePathRequest

type SetSocialURLRequestInput httpapi.SetSocialURLRequest

type AppendDrawAreaLayerItemRequestInput httpapi.AppendDrawAreaLayerItemRequest

type SetChartAreaDataPathRequestInput httpapi.SetChartAreaDataPathRequest

type SetChartTypeRequestInput httpapi.SetChartTypeRequest

type SetChartSettingsRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionID       string                 `json:"sectionId"`
	ChartSettings   BaseChartSettingsUnion `json:"chartSettings"`
	ChangedSettings []string               `json:"changedSettings"`
}

type SetTextBlockTextRequestInput httpapi.SetTextBlockTextRequest

type SetTextBlockDisplayModeRequestInput httpapi.SetTextBlockDisplayModeRequest

type SetTextBlockFormatRequestInput httpapi.SetTextBlockFormatRequest

type SetTextBlockHeadingAsSectionNameRequestInput httpapi.SetTextBlockHeadingAsSectionNameRequest

type SetTextBlockMetaControlStyleRequestInput httpapi.SetTextBlockMetaControlStyleRequest

type SetTextBlockMasterFontSizeRequestInput httpapi.SetTextBlockMasterFontSizeRequest

type SetCodeFileBindingRequestInput httpapi.SetCodeFileBindingRequest

type ViewportInput projectstate.Viewport

type ViewportBoundsInput projectstate.ViewportBounds

type TopLevelSectionLayoutInput projectstate.TopLevelSectionLayout

type SetTopLevelSectionLayoutRequestInput httpapi.SetTopLevelSectionLayoutRequest

type SetViewportRequestInput httpapi.SetViewportRequest

type SetActiveIDsRequestInput httpapi.SetActiveIDsRequest

type generatedTypeSetSpec struct {
	Name     string
	TypeExpr string
	Members  []string
	Exported bool
}

type generatedTypeGuardSpec struct {
	Name           string
	InputTypeExpr  string
	ReturnTypeExpr string
	TypeSetName    string
}

var projectStateTypeGuardTypeSets = []generatedTypeSetSpec{
	{
		Name:     "BaseChildlessCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.TimeParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParamCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.TimeParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParentCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeCallable",
			"CodeObjTypeEnum.NestedParam",
		},
	},
	{
		Name:     "ControlCodeObjTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.DropzoneParam",
		},
		Exported: true,
	},
	{
		Name:     "SectionParamCodeObjTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParentSectionImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Code",
			"SectionTypeEnum.GenPythonCode",
			"SectionTypeEnum.GenPythonMetadata",
			"SectionTypeEnum.Group",
			"SectionTypeEnum.ListRoot",
		},
	},
	{
		Name:     "BaseDictSectionImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		},
	},
	{
		Name:     "BaseSectionWithParamsImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Callable",
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		},
	},
}

var projectStateTypeGuards = []generatedTypeGuardSpec{
	{
		Name:           "isBaseChildlessCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseChildlessCodeObjImplUnion",
		TypeSetName:    "BaseChildlessCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParamCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseParamCodeObjImplUnion",
		TypeSetName:    "BaseParamCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParentCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseParentCodeObjImplUnion",
		TypeSetName:    "BaseParentCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParentSectionImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseParentSectionImplUnion",
		TypeSetName:    "BaseParentSectionImplTypeSet",
	},
	{
		Name:           "isBaseDictSectionImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseDictSectionImplUnion",
		TypeSetName:    "BaseDictSectionImplTypeSet",
	},
	{
		Name:           "isBaseSectionWithParamsImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseSectionWithParamsImplUnion",
		TypeSetName:    "BaseSectionWithParamsImplTypeSet",
	},
}

func projectStateTypeGuardDeclarations() []TypeDeclaration {
	declarations := make([]TypeDeclaration, 0, len(projectStateTypeGuardTypeSets)+len(projectStateTypeGuards))
	for _, spec := range projectStateTypeGuardTypeSets {
		declarations = append(
			declarations,
			setDeclaration(spec.Name, spec.TypeExpr, spec.Exported, spec.Members...),
		)
	}
	for _, spec := range projectStateTypeGuards {
		declarations = append(
			declarations,
			typeGuardDeclaration(spec.Name, spec.InputTypeExpr, spec.ReturnTypeExpr, spec.TypeSetName),
		)
	}
	return declarations
}

func buildDefaultSharePolicyCreateExprTS() string {
	return buildSharePolicyCreateExprTS(deployments.DefaultPolicy())
}

func buildSharePolicyCreateExprTS(policy deployments.Policy) string {
	return buildTSMergeGeneratedOptionsExprFromGoValueTS(
		"frontend share policy defaults",
		policy,
		goJSONFieldOrder(policy),
		"options",
	)
}

func defaultAppPolicyDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createDefaultAppPolicy",
		"SharePolicy",
		buildDefaultAppPolicyFunctionBodyTS(),
		TypeProperty{Name: "options", TypeExpr: "Partial<SharePolicy>", DefaultValue: "{}"},
	)
}

func buildDefaultAppPolicyFunctionBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyFromGoValueTS(
		"frontend default app policy",
		deployments.DefaultAppPolicy(),
		goJSONFieldOrder(deployments.Policy{}),
		"options",
	)
}

func projectStateSupportDeclarations() []TypeDeclaration {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"ImplArgsBundleMap",
			`{
  BaseSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImplUnion;
    args: {
      [K in keyof BaseSectionWithParamsImplUnion]?: BaseSectionWithParamsImplUnion[K] | ((prev: BaseSectionWithParamsImplUnion[K]) => BaseSectionWithParamsImplUnion[K]);
    };
  };
  BaseParentSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  BaseCodeSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  ChatSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  CodeSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  GroupSection: {
    impl: GroupSectionImpl;
    args: {
      [K in keyof GroupSectionImpl]?: GroupSectionImpl[K] | ((prev: GroupSectionImpl[K]) => GroupSectionImpl[K]);
    };
  };
  ListRootSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  BrowserSection: {
    impl: BrowserSectionImpl;
    args: {
      [K in keyof BrowserSectionImpl]?: BrowserSectionImpl[K] | ((prev: BrowserSectionImpl[K]) => BrowserSectionImpl[K]);
    };
  };
  TextBlockSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  PromptSection: {
    impl: PromptSectionImpl;
    args: {
      [K in keyof PromptSectionImpl]?: PromptSectionImpl[K] | ((prev: PromptSectionImpl[K]) => PromptSectionImpl[K]);
    };
  };
  BaseDictSection: {
    impl: BaseDictSectionImplUnion;
    args: {
      [K in keyof BaseDictSectionImplUnion]?: BaseDictSectionImplUnion[K] | ((prev: BaseDictSectionImplUnion[K]) => BaseDictSectionImplUnion[K]);
    };
  };
  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImplUnion;
    args: {
      [K in keyof BaseChildlessCodeObjImplUnion]?: BaseChildlessCodeObjImplUnion[K] | ((prev: BaseChildlessCodeObjImplUnion[K]) => BaseChildlessCodeObjImplUnion[K]);
    };
  };
  BaseCodeObj: {
    impl: BaseCodeObjImplUnion;
    args: {
      [K in keyof BaseCodeObjImplUnion]?: BaseCodeObjImplUnion[K] | ((prev: BaseCodeObjImplUnion[K]) => BaseCodeObjImplUnion[K]);
    };
  };
}`,
		),
		defaultAppPolicyDeclaration(),
	}
	declarations = append(declarations, projectStateTypeGuardDeclarations()...)
	return declarations
}
