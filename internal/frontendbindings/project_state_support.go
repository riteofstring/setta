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

type ProjectStateSingleConfig struct {
	Sections              map[string]Core                            `json:"sections"`
	SectionImpls          map[string]BaseSectionImplUnion            `json:"sectionImpls"`
	SectionCapabilities   map[string]projectview.SectionCapabilities `json:"sectionCapabilities"`
	SectionVariants       map[string]Variant                         `json:"sectionVariants"`
	CodeObjs              map[string]Core                            `json:"codeObjs"`
	CodeObjImpls          map[string]BaseCodeObjImplUnion            `json:"codeObjImpls"`
	CodeObjVariants       map[string]Variant                         `json:"codeObjVariants"`
	ProjectConfig         ProjectConfig                              `json:"projectConfig"`
	SingletonSections     SingletonSections                          `json:"singletonSections"`
	ParentSectionMap      map[string]*string                         `json:"parentSectionMap"`
	ShownParamIDs         map[string]ShownParamIds                   `json:"shownParamIds"`
	RequiredDecodedImages []string                                   `json:"requiredDecodedImages"`
	GenCodeBinding        *CodeFileBinding                           `json:"genCodeBinding,omitempty"`
	ProjectChatWindowing  projectstate.ProjectChatWindowingState     `json:"projectChatWindowing"`
	ArtifactGroups        map[string]any                             `json:"artifactGroups,omitempty"`
}

type ProjectStateSingleConfigWithCompletedOpIds struct {
	ProjectState   ProjectStateSingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

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

type ProjectConfig struct {
	ID                      string                                         `json:"id"`
	Name                    string                                         `json:"name"`
	ShowParamDisplayNames   bool                                           `json:"showParamDisplayNames"`
	AllowJSONSourceKeyEdits bool                                           `json:"allowJsonSourceKeyEdits"`
	PreviewImgColor         string                                         `json:"previewImgColor,omitempty"`
	Viewport                *projectstate.Viewport                         `json:"viewport,omitempty"`
	ViewportInitialized     bool                                           `json:"viewportInitialized"`
	ViewModes               map[string]projectstate.ViewMode               `json:"viewModes"`
	ActiveViewModeID        *string                                        `json:"activeViewModeId,omitempty"`
	IsEditingViewMode       bool                                           `json:"isEditingViewMode"`
	HasPythonCodegenTarget  bool                                           `json:"hasPythonCodegenTarget"`
	RunCapabilities         projectview.ProjectRunCapabilities             `json:"runCapabilities"`
	CodegenTargets          []ProjectCodegenTarget                         `json:"codegenTargets"`
	WatchCodeEnabled        bool                                           `json:"watchCodeEnabled"`
	WatchCodeFolders        []projectstate.WatchCodeFolder                 `json:"watchCodeFolders"`
	WatchCodeFiles          []string                                       `json:"watchCodeFiles"`
	WatchCodeRegistry       map[string]projectstate.WatchCodeRegistryEntry `json:"watchCodeRegistry"`
	WatchCodeBaselineByPath map[string][]string                            `json:"watchCodeBaselineByPath"`
	EntryCodeBlockID        *string                                        `json:"entryCodeBlockId,omitempty"`
	SectionPathSlugsByID    map[string]string                              `json:"sectionPathSlugsById"`
	SectionIDsByPathSlug    map[string][]string                            `json:"sectionIdsByPathSlug"`
	TopLevelSections        map[string]projectstate.TopLevelSectionLayout  `json:"topLevelSections"`
	WindowSpaceSlugsByID    map[string]string                              `json:"windowSpaceSlugsById"`
	WindowSpaceIDsBySlug    map[string][]string                            `json:"windowSpaceIdsBySlug"`
	WindowSpaces            map[string]projectstate.WindowSpaceConfig      `json:"windowSpaces"`
	SectionVariantMap       map[string]string                              `json:"sectionVariantMap"`
	ActiveIDs               []string                                       `json:"activeIds"`
	Edges                   []projectstate.Edge                            `json:"edges"`
	AgenticEdges            []projectstate.AgenticEdge                     `json:"agenticEdges"`
	StateMachineEdges       []projectstate.StateMachineEdge                `json:"stateMachineEdges"`
}

func frontendDefaultProjectStateSingleConfigValue() map[string]any {
	defaults := mustTSLiteralObjectFromGoValue(
		"frontend default project state single config",
		projectview.FrontendDefaultSingleConfig(),
	)
	defaults["artifactGroups"] = map[string]any{}
	return defaults
}

func frontendDefaultProjectStateSingleConfigWithCompletedOpIdsValue() map[string]any {
	return map[string]any{
		"projectState":   frontendDefaultProjectStateSingleConfigValue(),
		"completedOpIds": []string{},
		"pendingOpIds":   []string{},
	}
}

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

type SectionType projectstate.FrontendSectionType

type CodeObjType projectstate.FrontendCodeObjType

type CodeLanguage projectstate.CodeLanguage

type BuiltinCodeLanguage struct{}

type ConfigLanguage projectstate.FrontendConfigLanguage

type ParameterPassingStyle projectstate.FrontendParameterPassingStyle

type ParamNameType projectstate.FrontendParamNameType

type ButtonActionMode projectstate.FrontendButtonActionMode

type HttpRequestMethod projectstate.FrontendHTTPRequestMethod

type DropzoneMode projectstate.FrontendDropzoneMode

type TextParamInputUIType projectstate.FrontendTextParamInputUIType

type TimeDisplayFormat projectstate.FrontendTimeDisplayFormat

type TimeControlMode projectstate.FrontendTimeControlMode

type TimeDisplayFont projectstate.FrontendTimeDisplayFont

type DateDisplayFormat projectstate.FrontendDateDisplayFormat

type DateControlMode projectstate.FrontendDateControlMode

type DateSelectionMode projectstate.FrontendDateSelectionMode

type DateCalendarWeekStart projectstate.FrontendDateCalendarWeekStart

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

type TaskBoardTaskRecurrence projectstate.FrontendTaskBoardTaskRecurrence

type TaskBoardRecurringWeekday projectstate.FrontendTaskBoardRecurringWeekday

type TaskBoardRecurringMonth projectstate.FrontendTaskBoardRecurringMonth

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

type CodeFileBinding projectstate.FrontendCodeFileBinding

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

type ChatSectionBranch projectstate.ChatSectionBranch

type ChatSectionState projectstate.ChatSectionState

type UserDefaultChatSectionImpl struct{}

type ChatSectionImpl projectstate.FrontendChatSectionImpl

type UserDefaultBrowserSectionImpl struct{}

type BrowserSectionImpl projectstate.FrontendBrowserSectionImpl

type BaseSectionImpl projectstate.FrontendBaseSectionImpl

type UserDefaultListRootSectionImpl struct{}

type ListRootSectionImpl projectstate.FrontendListRootSectionImpl

type UserDefaultGroupSectionImpl struct{}

type GroupSectionImpl projectstate.FrontendGroupSectionImpl

type UserDefaultStateMachineStartSectionImpl struct{}

type StateMachineStartSectionImpl projectstate.FrontendStateMachineStartSectionImpl

type UserDefaultStateMachineGateSectionImpl struct{}

type StateMachineGateSectionImpl projectstate.FrontendStateMachineGateSectionImpl

type UserDefaultStateMachineEndSectionImpl struct{}

type StateMachineEndSectionImpl projectstate.FrontendStateMachineEndSectionImpl

type UserDefaultTextBlockSectionImpl struct{}

type TextBlockSectionImpl projectstate.FrontendTextBlockSectionImpl

type UserDefaultPromptSectionImpl struct{}

type PromptSectionImpl projectstate.FrontendPromptSectionImpl

type CodeSectionDiagnosticsIgnoreState projectstate.CodeSectionDiagnosticsIgnoreState

type UserDefaultCodeSectionImpl struct{}

type CodeSectionImpl projectstate.FrontendCodeSectionImpl

type UserDefaultTerminalSectionImpl struct{}

type TerminalSectionImpl projectstate.FrontendTerminalSectionImpl

type BaseSectionImplUnion struct{}

type CallableSectionImpl projectstate.FrontendCallableSectionImpl

type BaseParentSectionImplUnion struct{}

type BaseSectionWithParamsImplUnion struct{}

type DictSectionImpl projectstate.FrontendDictSectionImpl

type UserDefaultCallableSectionImpl struct{}

type UserDefaultDictSectionImpl struct{}

type BaseDictSectionImplUnion struct{}

type BaseCodeObjImpl projectstate.FrontendBaseCodeObjImpl

type CodeParamCodeObjImpl projectstate.FrontendCodeParamCodeObjImpl

type CodeCallableCodeObjImpl projectstate.FrontendCodeCallableCodeObjImpl

type NestedParamCodeObjImpl projectstate.FrontendNestedParamCodeObjImpl

type BaseCodeObjImplUnion struct{}

type BaseChildlessCodeObjImplUnion struct{}

type BaseParamCodeObjImplUnion struct{}

type BaseParentCodeObjImplUnion struct{}

type UserDefaultCodeParamCodeObjImpl struct{}

type ColorPickerChoice settingsstate.FrontendColorPickerChoice

type TextParamCodeObjImpl projectstate.FrontendTextParamCodeObjImpl

type DateParamCodeObjImpl projectstate.FrontendDateParamCodeObjImpl

type TimeParamCodeObjImpl projectstate.FrontendTimeParamCodeObjImpl

type ButtonParamCodeObjImpl projectstate.FrontendButtonParamCodeObjImpl

type SliderParamCodeObjImpl projectstate.FrontendSliderParamCodeObjImpl

type RotaryParamCodeObjImpl projectstate.FrontendRotaryParamCodeObjImpl

type SwitchParamCodeObjImpl projectstate.FrontendSwitchParamCodeObjImpl

type ColorPickerParamCodeObjImpl projectstate.FrontendColorPickerParamCodeObjImpl

type DropdownParamCodeObjImpl projectstate.FrontendDropdownParamCodeObjImpl

type PasswordParamCodeObjImpl projectstate.FrontendPasswordParamCodeObjImpl

type TextAreaParamCodeObjImpl projectstate.FrontendTextAreaParamCodeObjImpl

type DropzoneParamCodeObjImpl projectstate.FrontendDropzoneParamCodeObjImpl

type UserDefaultTaskBoardSectionImpl struct{}

type TaskBoardSectionImpl projectstate.FrontendTaskBoardSectionImpl

type UserDefaultChartSectionImpl struct{}

type ChartSectionImpl projectstate.FrontendChartSectionImpl

type UserDefaultSpreadsheetSectionImpl struct{}

type SpreadsheetSectionImpl projectstate.FrontendSpreadsheetSectionImpl

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
