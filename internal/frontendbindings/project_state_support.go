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
)

type ProjectStateSingleConfig projectview.SingleConfig

type ProjectStateSingleConfigWithCompletedOpIds struct{}

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

type LoadProjectConfigRequestInput struct {
	ProjectConfigName string `json:"projectConfigName"`
}

type SaveProjectRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type SaveAsNewProjectConfigRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	NewConfigName   string  `json:"newConfigName"`
	WithRefs        bool    `json:"withRefs"`
}

type CreateProjectConfigRequestInput struct {
	PreviewImgColor string `json:"previewImgColor"`
}

type CreateProjectConfigResponse string

type DeleteProjectConfigsRequestInput struct {
	IDs []string `json:"ids"`
}

type DeleteProjectConfigsResponse httpapi.DeleteProjectConfigsResponse

type SetProjectConfigNameRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	NewName         string `json:"newName"`
}

type SetAsDefaultProjectRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type GetNotificationsRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type DeleteNotificationRequestInput struct {
	NotificationID string `json:"notificationId"`
}

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

type CreateNewSectionVariantRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
}

type CreateNewSectionVariantResponse projectstate.CreateNewSectionVariantResult

type SetSectionVariantRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	VariantID       string  `json:"variantId"`
}

type SetDefaultSectionVariantRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	VariantID       string  `json:"variantId"`
}

type SetSectionVariantSortOrderRequestInput struct {
	FrontendOpID      *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID   string   `json:"projectConfigId"`
	SectionID         string   `json:"sectionId"`
	OrderedVariantIDs []string `json:"orderedVariantIds"`
}

type ToggleVariantFrozenRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	VariantID       string  `json:"variantId"`
}

type ToggleVariantJSONSourceRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	VariantID       string  `json:"variantId"`
}

type SetVariantJSONSourceKeysRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	VariantID       string   `json:"variantId"`
	JSONSourceKeys  []string `json:"jsonSourceKeys"`
}

type SetSectionVariantNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	VariantID       string  `json:"variantId"`
	Name            string  `json:"name"`
}

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

type DeleteChildSectionsViaDecrementerRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	CalledBy        string  `json:"calledBy"`
	NumChildren     int     `json:"numChildren"`
}

type DeleteChildSectionsViaDecrementerResponse projectstate.DeleteSectionsResult

type DeleteSectionsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type DeleteSelectedParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamInfoIDs    []string `json:"paramInfoIds"`
}

type PrepareSectionsForCopyRequestInput struct {
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type PasteSectionsRequestInput struct {
	ProjectConfigID string                                         `json:"projectConfigId"`
	Data            ClipboardProjectStateCoreWithSectionVariantMap `json:"data"`
	Position        Position                                       `json:"position"`
	AsRef           bool                                           `json:"asRef"`
}

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

type UpdateEdgeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	Edge            Edge    `json:"edge"`
}

type DeleteEdgesRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	EdgeIDs         []string `json:"edgeIds"`
}

type ReconnectEdgeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	EdgeID          string  `json:"edgeId"`
	SourceSectionID string  `json:"sourceSectionId"`
	SourceVariantID string  `json:"sourceVariantId"`
	SourcePortID    string  `json:"sourcePortId"`
	TargetSectionID string  `json:"targetSectionId"`
	TargetVariantID string  `json:"targetVariantId"`
	TargetPortID    string  `json:"targetPortId"`
}

type SetEdgesRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	Edges           []Edge  `json:"edges"`
}

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

type UpdateStateMachineEdgeRequestInput struct {
	FrontendOpID    *string          `json:"frontendOpId,omitempty"`
	ProjectConfigID string           `json:"projectConfigId"`
	Edge            StateMachineEdge `json:"edge"`
}

type DeleteStateMachineEdgesRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	EdgeIDs         []string `json:"edgeIds"`
}

type SetStateMachineEdgesRequestInput struct {
	FrontendOpID    *string            `json:"frontendOpId,omitempty"`
	ProjectConfigID string             `json:"projectConfigId"`
	Edges           []StateMachineEdge `json:"edges"`
}

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

type UpdateAgenticEdgeRequestInput struct {
	FrontendOpID    *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId"`
	Edge            AgenticEdge `json:"edge"`
}

type DeleteAgenticEdgesRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	EdgeIDs         []string `json:"edgeIds"`
}

type SetAgenticEdgesRequestInput struct {
	FrontendOpID    *string       `json:"frontendOpId,omitempty"`
	ProjectConfigID string        `json:"projectConfigId"`
	Edges           []AgenticEdge `json:"edges"`
}

type MoveSectionsRequestInput struct {
	FrontendOpID    *string             `json:"frontendOpId,omitempty"`
	ProjectConfigID string              `json:"projectConfigId"`
	SectionIDs      []string            `json:"sectionIds"`
	NewParentID     *string             `json:"newParentId"`
	NewIndex        *int                `json:"newIndex"`
	PositionsByID   map[string]Position `json:"positionsById"`
}

type MoveParamGroup struct {
	ParamIDs    []string `json:"paramIds"`
	NewParentID string   `json:"newParentId"`
	NewIndex    int      `json:"newIndex"`
}

type MoveParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamIDs        []string `json:"paramIds"`
	NewParentID     string   `json:"newParentId"`
	NewIndex        int      `json:"newIndex"`
}

type MoveParamGroupsRequestInput struct {
	FrontendOpID    *string          `json:"frontendOpId,omitempty"`
	ProjectConfigID string           `json:"projectConfigId"`
	SectionID       string           `json:"sectionId"`
	Moves           []MoveParamGroup `json:"moves"`
}

type IndentParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamIDs        []string `json:"paramIds"`
}

type UnindentParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamIDs        []string `json:"paramIds"`
}

type AddKwargRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	SectionID       string `json:"sectionId"`
}

type DeleteKwargRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	SectionID       string `json:"sectionId"`
}

type SetParamEnteredValueRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ParamInfoID     string  `json:"paramInfoId"`
	Value           string  `json:"value"`
}

type UpdateParamImplConfigRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	SectionID       string         `json:"sectionId"`
	ParamInfoID     string         `json:"paramInfoId"`
	NewConfig       map[string]any `json:"newConfig"`
}

type SetCodeSectionAttachedTerminalRequestInput struct {
	FrontendOpID      *string `json:"frontendOpId,omitempty"`
	ProjectConfigID   string  `json:"projectConfigId"`
	SectionID         string  `json:"sectionId"`
	TerminalSectionID *string `json:"terminalSectionId,omitempty"`
}

type SetGenCodePrefixRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	GenCodePrefix   string  `json:"genCodePrefix"`
}

type SetGenCodeSuffixRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	GenCodeSuffix   string  `json:"genCodeSuffix"`
}

type SetCodeObjNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	CodeObjID       string  `json:"codeObjId"`
	Name            string  `json:"name"`
}

type SetCodeObjDisplayNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	CodeObjID       string  `json:"codeObjId"`
	DisplayName     string  `json:"displayName"`
}

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

type SectionSizingPolicyTypeEntry struct{}

type SectionSizingPolicyCallableTypeEntry struct{}

type MetaControlSizingPolicyTypeEntry struct{}

type MetaControlSizingPolicyByType struct{}

type SectionSizingPolicyGlobals struct{}

type SectionSizingPolicyByType struct{}

type SectionSizingPolicy struct{}

type SharePolicy deployments.Policy

type SettingsShortcuts struct{}

type SettingsGUI struct{}

type SettingsBackend struct{}

type SettingsState struct{}

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

type CreateTopLevelSectionRequestInput struct {
	FrontendOpID       *string                               `json:"frontendOpId,omitempty"`
	ProjectConfigID    string                                `json:"projectConfigId"`
	ImplType           string                                `json:"implType"`
	ControlCodeObjType *string                               `json:"controlCodeObjType,omitempty"`
	ImplOverrides      *map[string]any                       `json:"implOverrides,omitempty"`
	Position           *Position                             `json:"position,omitempty"`
	Name               *string                               `json:"name,omitempty"`
	TopLevelSections   map[string]TopLevelSectionLayoutInput `json:"topLevelSections,omitempty"`
	ViewportBounds     *ViewportBoundsInput                  `json:"viewportBounds,omitempty"`
}

type CreateTopLevelSectionResponse projectstate.CreateTopLevelSectionResult

type CreateViewModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

type CreateViewModeResponse string

type SetActiveViewModeRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	ActiveViewModeID string  `json:"activeViewModeId"`
}

type ToggleIsEditingViewModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

type ToggleViewModeUserFacingRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
}

type ToggleViewModeTabRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
}

type SetViewModeNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
	Name            string  `json:"name"`
}

type SetViewModeSortOrderRequestInput struct {
	FrontendOpID       *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID    string   `json:"projectConfigId"`
	OrderedViewModeIDs []string `json:"orderedViewModeIds"`
}

type DeleteViewModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
}

type SetSectionNameRequestInput httpapi.SetSectionNameRequest

type AcceptRenameRefactorRequestInput httpapi.AcceptRenameRefactorRequest

type DeclineRenameRefactorRequestInput httpapi.DeclineRenameRefactorRequest

type ToggleSectionVisibilityRequestInput httpapi.ToggleSectionVisibilityRequest

type AutoLayoutTopLevelSectionsRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	Margin          *int    `json:"margin,omitempty"`
}

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

type SetCallableHideParamsRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	HideParams      bool    `json:"hideParams"`
}

type SetSectionHideUnpinnedParamsRequestInput struct {
	FrontendOpID       *string `json:"frontendOpId,omitempty"`
	ProjectConfigID    string  `json:"projectConfigId"`
	SectionID          string  `json:"sectionId"`
	HideUnpinnedParams bool    `json:"hideUnpinnedParams"`
}

type SetSectionPinnedParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	PinnedParams    []string `json:"pinnedParams"`
}

type SetProjectConfigCodegenTargetsRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	CodegenTargets  []ProjectCodegenTarget `json:"codegenTargets"`
}

type SetChatSectionSettingsRequestInput struct {
	FrontendOpID           *string            `json:"frontendOpId,omitempty"`
	ProjectConfigID        string             `json:"projectConfigId"`
	SectionID              string             `json:"sectionId"`
	Managed                bool               `json:"managed"`
	EngineConfigID         *string            `json:"engineConfigId,omitempty"`
	TranscriptionProfileID *string            `json:"transcriptionProfileId,omitempty"`
	AgentProfileID         *string            `json:"agentProfileId,omitempty"`
	Thinking               bool               `json:"thinking"`
	PermissionMode         ChatPermissionMode `json:"permissionMode"`
	SearchEnabled          bool               `json:"searchEnabled"`
	DictationMode          ChatDictationMode  `json:"dictationMode"`
}

type SetStateMachineSectionSettingsRequestInput struct {
	FrontendOpID    *string               `json:"frontendOpId,omitempty"`
	ProjectConfigID string                `json:"projectConfigId"`
	SectionID       string                `json:"sectionId"`
	MachineGroupID  string                `json:"machineGroupId"`
	Label           string                `json:"label"`
	GateType        *StateMachineGateType `json:"gateType,omitempty"`
}

type SetWatchCodeEnabledRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	Enabled         bool    `json:"enabled"`
}

type SetWatchCodeInputsRequestInput struct {
	FrontendOpID     *string           `json:"frontendOpId,omitempty"`
	ProjectConfigID  string            `json:"projectConfigId"`
	WatchCodeFolders []WatchCodeFolder `json:"watchCodeFolders"`
	WatchCodeFiles   []string          `json:"watchCodeFiles"`
}

type GroupSectionsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type UngroupGroupsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	GroupIDs        []string `json:"groupIds"`
}

type SetSectionSizesRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionSizes    map[string]SectionSize `json:"sectionSizes"`
}

type ToggleParamSelectedRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ParamInfoID     string  `json:"paramInfoId"`
}

type UnselectAllParamsRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

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

type ColorPickerChoice struct{}

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

type SetSectionParamFilterRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	Value           string  `json:"value"`
}

type SetMetaControlShowSectionTitleRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	ShowSectionTitle bool    `json:"showSectionTitle"`
}

type SetSectionColumnWidthRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ColumnWidth     *float64 `json:"columnWidth"`
}

type SetSectionEdgeInputsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	EdgeInputParams []string `json:"edgeInputParams"`
}

type SetSectionEdgeOutputsRequestInput struct {
	FrontendOpID    *string    `json:"frontendOpId,omitempty"`
	ProjectConfigID string     `json:"projectConfigId"`
	SectionID       string     `json:"sectionId"`
	EdgeOutputPorts []EdgePort `json:"edgeOutputPorts"`
}

type SetParentDefaultChildSectionTypeRequestInput struct {
	FrontendOpID            *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID         string      `json:"projectConfigId"`
	SectionID               string      `json:"sectionId"`
	DefaultChildSectionType SectionType `json:"defaultChildSectionType"`
}

type SetListRootViewModeRequestInput struct {
	FrontendOpID    *string          `json:"frontendOpId,omitempty"`
	ProjectConfigID string           `json:"projectConfigId"`
	SectionID       string           `json:"sectionId"`
	ViewMode        ListRootViewMode `json:"viewMode"`
}

type ToggleGroupOrientationRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
}

type SetGroupOverflowModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	OverflowMode    bool    `json:"overflowMode"`
}

type SetBrowserColumnWidthsRequestInput struct {
	FrontendOpID     *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID  string   `json:"projectConfigId"`
	SectionID        string   `json:"sectionId"`
	ColumnWidth      *float64 `json:"columnWidth"`
	TypesColumnWidth *float64 `json:"typesColumnWidth"`
}

type SetBrowserAreaViewModeRequestInput struct {
	FrontendOpID    *string             `json:"frontendOpId,omitempty"`
	ProjectConfigID string              `json:"projectConfigId"`
	SectionID       string              `json:"sectionId"`
	ViewMode        BrowserAreaViewMode `json:"viewMode"`
}

type SetBrowserHideColumnRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	HideColumn      bool    `json:"hideColumn"`
}

type SetBrowserSavedSearchesRequestInput struct {
	FrontendOpID    *string              `json:"frontendOpId,omitempty"`
	ProjectConfigID string               `json:"projectConfigId"`
	SectionID       string               `json:"sectionId"`
	SavedSearches   []BrowserSavedSearch `json:"savedSearches"`
}

type SetSpreadsheetFilePathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	FilePath        string  `json:"filePath"`
	ActiveSheet     *string `json:"activeSheet"`
}

type SetSpreadsheetSectionSettingsRequestInput struct {
	FrontendOpID               *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID            string                 `json:"projectConfigId"`
	SectionID                  string                 `json:"sectionId"`
	ReadOnly                   bool                   `json:"readOnly"`
	ShowRowNumbers             bool                   `json:"showRowNumbers"`
	Density                    SpreadsheetGridDensity `json:"density"`
	AutoReloadOnExternalChange bool                   `json:"autoReloadOnExternalChange"`
}

type SetTaskBoardSectionStateRequestInput struct {
	FrontendOpID    *string           `json:"frontendOpId,omitempty"`
	ProjectConfigID string            `json:"projectConfigId"`
	SectionID       string            `json:"sectionId"`
	ViewMode        TaskBoardViewMode `json:"viewMode"`
	Columns         []TaskBoardColumn `json:"columns"`
	Tasks           []TaskBoardTask   `json:"tasks"`
}

type SetImageAreaImagePathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ImagePath       string  `json:"imagePath"`
}

type SetSocialURLRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	URL             string  `json:"url"`
}

type AppendDrawAreaLayerItemRequestInput struct {
	FrontendOpID    *string           `json:"frontendOpId,omitempty"`
	ProjectConfigID string            `json:"projectConfigId"`
	SectionID       string            `json:"sectionId"`
	LayerIdx        int               `json:"layerIdx"`
	Element         DrawAreaLayerItem `json:"element"`
}

type SetChartAreaDataPathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	DataPath        string  `json:"dataPath"`
}

type SetChartTypeRequestInput struct {
	FrontendOpID    *string   `json:"frontendOpId,omitempty"`
	ProjectConfigID string    `json:"projectConfigId"`
	SectionID       string    `json:"sectionId"`
	ChartType       ChartType `json:"chartType"`
}

type SetChartSettingsRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionID       string                 `json:"sectionId"`
	ChartSettings   BaseChartSettingsUnion `json:"chartSettings"`
	ChangedSettings []string               `json:"changedSettings"`
}

type SetTextBlockTextRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	Text            string  `json:"text"`
}

type SetTextBlockDisplayModeRequestInput struct {
	FrontendOpID    *string              `json:"frontendOpId,omitempty"`
	ProjectConfigID string               `json:"projectConfigId"`
	SectionID       string               `json:"sectionId"`
	TextDisplayMode TextBlockDisplayMode `json:"textDisplayMode"`
}

type SetTextBlockFormatRequestInput struct {
	FrontendOpID    *string         `json:"frontendOpId,omitempty"`
	ProjectConfigID string          `json:"projectConfigId"`
	SectionID       string          `json:"sectionId"`
	Format          TextBlockFormat `json:"format"`
}

type SetTextBlockHeadingAsSectionNameRequestInput struct {
	FrontendOpID         *string `json:"frontendOpId,omitempty"`
	ProjectConfigID      string  `json:"projectConfigId"`
	SectionID            string  `json:"sectionId"`
	HeadingAsSectionName bool    `json:"headingAsSectionName"`
}

type SetTextBlockMetaControlStyleRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MetaControlStyle bool    `json:"metaControlStyle"`
}

type SetTextBlockMasterFontSizeRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MasterFontSizePx float64 `json:"masterFontSizePx"`
}

type SetCodeFileBindingRequestInput struct {
	FrontendOpID    *string               `json:"frontendOpId,omitempty"`
	ProjectConfigID string                `json:"projectConfigId"`
	SectionID       string                `json:"sectionId"`
	Binding         CodeFileBindingUpdate `json:"binding"`
}

type ViewportInput struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type ViewportBoundsInput struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type TopLevelSectionLayoutInput struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	ZIndex int      `json:"zIndex,omitempty"`
	W      *float64 `json:"w,omitempty"`
	H      *float64 `json:"h,omitempty"`
}

type SetTopLevelSectionLayoutRequestInput struct {
	FrontendOpID     *string                               `json:"frontendOpId,omitempty"`
	ProjectConfigID  string                                `json:"projectConfigId"`
	TopLevelSections map[string]TopLevelSectionLayoutInput `json:"topLevelSections"`
}

type SetViewportRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	Viewport        *ViewportInput `json:"viewport"`
}

type SetActiveIDsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	ActiveIDs       []string `json:"activeIds"`
}

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
	}
	declarations = append(declarations, projectStateTypeGuardDeclarations()...)
	return declarations
}
