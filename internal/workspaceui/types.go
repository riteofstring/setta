package workspaceui

import "setta/internal/orchestrator"

const SchemaVersion = 2

type ColumnWidthUnit string

const (
	ColumnWidthUnitProportion ColumnWidthUnit = "proportion"
	ColumnWidthUnitPX         ColumnWidthUnit = "px"
)

type SurfaceKind string

const (
	SurfaceKindChatDOM             SurfaceKind = "chat-dom"
	SurfaceKindEmptyFrame          SurfaceKind = "empty-frame"
	SurfaceKindWorkflowGraph       SurfaceKind = "workflow-graph"
	SurfaceKindSettingsDOM         SurfaceKind = "settings-dom"
	SurfaceKindTerminal            SurfaceKind = "terminal"
	SurfaceKindSemanticNodeDetails SurfaceKind = "semantic-node-details"
	SurfaceKindWorkflowNodeDetails SurfaceKind = "workflow-node-details"
	SurfaceKindWorkflowSettings    SurfaceKind = "workflow-settings"
)

type PaneTone string

const (
	PaneToneCyan   PaneTone = "cyan"
	PaneToneGreen  PaneTone = "green"
	PaneToneOrange PaneTone = "orange"
	PaneTonePink   PaneTone = "pink"
	PaneToneSlate  PaneTone = "slate"
)

type WorkspaceUIPaneReadMode string

const (
	WorkspaceUIPaneReadModeMetadata WorkspaceUIPaneReadMode = "metadata"
)

type WorkspaceUIPaneWriteMode string

const (
	WorkspaceUIPaneWriteModeChatSend      WorkspaceUIPaneWriteMode = "chat_send"
	WorkspaceUIPaneWriteModeChatQueue     WorkspaceUIPaneWriteMode = "chat_queue"
	WorkspaceUIPaneWriteModeChatSteer     WorkspaceUIPaneWriteMode = "chat_steer"
	WorkspaceUIPaneWriteModeTerminalInput WorkspaceUIPaneWriteMode = "terminal_input"
)

type WorkspaceUISurfaceCloseMode string

const (
	WorkspaceUISurfaceCloseModeNone  WorkspaceUISurfaceCloseMode = "none"
	WorkspaceUISurfaceCloseModeSafe  WorkspaceUISurfaceCloseMode = "safe"
	WorkspaceUISurfaceCloseModeForce WorkspaceUISurfaceCloseMode = "force"
)

type WorkspaceUIPaneOperationKind string

const (
	WorkspaceUIPaneOperationKindFocusPane WorkspaceUIPaneOperationKind = "focus_pane"
	WorkspaceUIPaneOperationKindMovePane  WorkspaceUIPaneOperationKind = "move_pane"
)

type WorkspaceUIPaneMoveDirection string

const (
	WorkspaceUIPaneMoveDirectionDown  WorkspaceUIPaneMoveDirection = "down"
	WorkspaceUIPaneMoveDirectionLeft  WorkspaceUIPaneMoveDirection = "left"
	WorkspaceUIPaneMoveDirectionRight WorkspaceUIPaneMoveDirection = "right"
	WorkspaceUIPaneMoveDirectionUp    WorkspaceUIPaneMoveDirection = "up"
)

type WorkspaceUIPaneRuntimeStatus string

const (
	WorkspaceUIPaneRuntimeStatusLayoutOnly WorkspaceUIPaneRuntimeStatus = "layout_only"
)

type WorkspaceUIOperationErrorCode string

const (
	WorkspaceUIOperationErrorCodeInvalidOperation     WorkspaceUIOperationErrorCode = "invalid_operation"
	WorkspaceUIOperationErrorCodeMissingLayout        WorkspaceUIOperationErrorCode = "missing_layout"
	WorkspaceUIOperationErrorCodePaneNotFound         WorkspaceUIOperationErrorCode = "pane_not_found"
	WorkspaceUIOperationErrorCodeUnsupportedOperation WorkspaceUIOperationErrorCode = "unsupported_operation"
)

type ColumnWidthSpec struct {
	Unit  ColumnWidthUnit `json:"unit"`
	Value float64         `json:"value"`
}

type TerminalPaneConfig struct {
	ProfileID     string `json:"profileId"`
	CWDOverride   string `json:"cwdOverride"`
	TitleOverride string `json:"titleOverride"`
}

type WorkflowNodeDetailsPaneConfig struct {
	DefinitionID            string                               `json:"definitionId"`
	DefinitionName          string                               `json:"definitionName"`
	DefinitionVersionID     string                               `json:"definitionVersionId"`
	DefinitionVersionNumber int                                  `json:"definitionVersionNumber"`
	ExecutionID             string                               `json:"executionId"`
	NodeID                  string                               `json:"nodeId"`
	NodeExecutionID         string                               `json:"nodeExecutionId"`
	NodeKind                orchestrator.WorkflowNodeKind        `json:"nodeKind"`
	NodeLabel               string                               `json:"nodeLabel"`
	NodeStatus              orchestrator.WorkflowGraphNodeStatus `json:"nodeStatus"`
	ProjectionIncomingEdges []orchestrator.WorkflowGraphEdge     `json:"projectionIncomingEdges"`
	ProjectionOutgoingEdges []orchestrator.WorkflowGraphEdge     `json:"projectionOutgoingEdges"`
	VersionMismatch         bool                                 `json:"versionMismatch"`
	ViewMode                orchestrator.WorkflowGraphViewMode   `json:"viewMode"`
	WorkspaceID             string                               `json:"workspaceId"`
}

type WorkspaceUIPane struct {
	ColumnID                  string                         `json:"columnId"`
	Heat                      int                            `json:"heat"`
	PaneID                    string                         `json:"paneId"`
	Sequence                  int                            `json:"sequence"`
	Subtitle                  string                         `json:"subtitle"`
	SurfaceID                 string                         `json:"surfaceId"`
	SurfaceKind               SurfaceKind                    `json:"surfaceKind"`
	TerminalConfig            *TerminalPaneConfig            `json:"terminalConfig"`
	Title                     string                         `json:"title"`
	Tone                      PaneTone                       `json:"tone"`
	Weight                    float64                        `json:"weight"`
	WorkflowNodeDetailsConfig *WorkflowNodeDetailsPaneConfig `json:"workflowNodeDetailsConfig"`
}

type WorkspaceUIColumn struct {
	ColumnID                string          `json:"columnId"`
	IdealWidthSpec          ColumnWidthSpec `json:"idealWidthSpec"`
	Index                   int             `json:"index"`
	PaneIDs                 []string        `json:"paneIds"`
	PlaneIndex              int             `json:"planeIndex"`
	PreviousProportionWidth *float64        `json:"previousProportionWidth"`
	SlotIndex               int             `json:"slotIndex"`
	WidthSpec               ColumnWidthSpec `json:"widthSpec"`
}

type WorkspaceUILayout struct {
	SchemaVersion int                 `json:"schemaVersion"`
	Revision      int                 `json:"revision"`
	WorkspaceID   string              `json:"workspaceId"`
	FocusedPaneID string              `json:"focusedPaneId"`
	Columns       []WorkspaceUIColumn `json:"columns"`
	Panes         []WorkspaceUIPane   `json:"panes"`
}

type WorkspaceUILayoutReadResult struct {
	WorkspaceID string             `json:"workspaceId"`
	Layout      *WorkspaceUILayout `json:"layout"`
}

type WorkspaceUISchema struct {
	SchemaVersion       int                            `json:"schemaVersion"`
	LayoutSchemaVersion int                            `json:"layoutSchemaVersion"`
	ColumnWidthUnits    []ColumnWidthUnit              `json:"columnWidthUnits"`
	PaneReadModes       []WorkspaceUIPaneReadMode      `json:"paneReadModes"`
	PaneWriteModes      []WorkspaceUIPaneWriteMode     `json:"paneWriteModes"`
	PaneRuntimeStatuses []WorkspaceUIPaneRuntimeStatus `json:"paneRuntimeStatuses"`
	PaneTones           []PaneTone                     `json:"paneTones"`
	SurfaceCloseModes   []WorkspaceUISurfaceCloseMode  `json:"surfaceCloseModes"`
	SurfaceKinds        []SurfaceKind                  `json:"surfaceKinds"`
}

type WorkspaceUIPaneListResult struct {
	WorkspaceID   string                      `json:"workspaceId"`
	LayoutPresent bool                        `json:"layoutPresent"`
	Panes         []WorkspaceUIPaneDescriptor `json:"panes"`
	Schema        WorkspaceUISchema           `json:"schema"`
}

type WorkspaceUIPaneReadResult struct {
	WorkspaceID string                    `json:"workspaceId"`
	Pane        WorkspaceUIPaneDescriptor `json:"pane"`
	Schema      WorkspaceUISchema         `json:"schema"`
}

type WorkspaceUIPaneOperation struct {
	Kind   WorkspaceUIPaneOperationKind  `json:"kind"`
	PaneID string                        `json:"paneId"`
	Move   *WorkspaceUIPaneMoveOperation `json:"move"`
}

type WorkspaceUIPaneMoveOperation struct {
	Direction WorkspaceUIPaneMoveDirection `json:"direction"`
}

type WorkspaceUIPaneOperationResult struct {
	WorkspaceID           string                            `json:"workspaceId"`
	Revision              int                               `json:"revision"`
	Layout                WorkspaceUILayout                 `json:"layout"`
	Changed               bool                              `json:"changed"`
	OperationResult       WorkspaceUIPaneOperationOutcome   `json:"operationResult"`
	BeforeAfterDimensions []WorkspaceUIPaneDimensionChange  `json:"beforeAfterDimensions"`
	Warnings              []WorkspaceUIPaneOperationWarning `json:"warnings"`
}

type WorkspaceUIPaneOperationOutcome struct {
	Kind                  WorkspaceUIPaneOperationKind `json:"kind"`
	Move                  *WorkspaceUIPaneMoveOutcome  `json:"move"`
	PaneID                string                       `json:"paneId"`
	PreviousFocusedPaneID string                       `json:"previousFocusedPaneId"`
	FocusedPaneID         string                       `json:"focusedPaneId"`
}

type WorkspaceUIPaneMoveOutcome struct {
	ColumnID            string                       `json:"columnId"`
	ColumnIndex         int                          `json:"columnIndex"`
	Direction           WorkspaceUIPaneMoveDirection `json:"direction"`
	PaneIndex           int                          `json:"paneIndex"`
	PlaneIndex          int                          `json:"planeIndex"`
	PreviousColumnID    string                       `json:"previousColumnId"`
	PreviousColumnIndex int                          `json:"previousColumnIndex"`
	PreviousPaneIndex   int                          `json:"previousPaneIndex"`
	PreviousPlaneIndex  int                          `json:"previousPlaneIndex"`
}

type WorkspaceUIPaneDimensionChange struct {
	PaneID string                    `json:"paneId"`
	Before WorkspaceUIPaneDimensions `json:"before"`
	After  WorkspaceUIPaneDimensions `json:"after"`
}

type WorkspaceUIPaneDimensions struct {
	ColumnID  string          `json:"columnId"`
	Weight    float64         `json:"weight"`
	WidthSpec ColumnWidthSpec `json:"widthSpec"`
}

type WorkspaceUIPaneOperationWarning struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields"`
}

type WorkspaceUIPaneDescriptor struct {
	PaneID            string                        `json:"paneId"`
	SurfaceID         string                        `json:"surfaceId"`
	SurfaceKind       SurfaceKind                   `json:"surfaceKind"`
	Title             string                        `json:"title"`
	Subtitle          string                        `json:"subtitle"`
	Focused           bool                          `json:"focused"`
	Location          WorkspaceUIPaneLocation       `json:"location"`
	RuntimeState      WorkspaceUIPaneRuntimeState   `json:"runtimeState"`
	CanFocus          bool                          `json:"canFocus"`
	CanMove           bool                          `json:"canMove"`
	CanClosePane      bool                          `json:"canClosePane"`
	SurfaceCloseModes []WorkspaceUISurfaceCloseMode `json:"surfaceCloseModes"`
	ReadModes         []WorkspaceUIPaneReadMode     `json:"readModes"`
	WriteModes        []WorkspaceUIPaneWriteMode    `json:"writeModes"`
	ContentRefs       WorkspaceUIPaneContentRefs    `json:"contentRefs"`
}

type WorkspaceUIPaneLocation struct {
	ColumnID       string          `json:"columnId"`
	ColumnIndex    int             `json:"columnIndex"`
	IdealWidthSpec ColumnWidthSpec `json:"idealWidthSpec"`
	PaneIndex      int             `json:"paneIndex"`
	PaneCount      int             `json:"paneCount"`
	PlaneIndex     int             `json:"planeIndex"`
	Sequence       int             `json:"sequence"`
	SlotIndex      int             `json:"slotIndex"`
	Weight         float64         `json:"weight"`
	WidthSpec      ColumnWidthSpec `json:"widthSpec"`
}

type WorkspaceUIPaneRuntimeState struct {
	Status WorkspaceUIPaneRuntimeStatus `json:"status"`
}

type WorkspaceUIPaneContentRefs struct {
	Chat                *WorkspaceUIChatPaneContentRef                `json:"chat"`
	SemanticNodeDetails *WorkspaceUISemanticNodeDetailsPaneContentRef `json:"semanticNodeDetails"`
	Terminal            *WorkspaceUITerminalPaneContentRef            `json:"terminal"`
	WorkflowGraph       *WorkspaceUIWorkflowGraphPaneContentRef       `json:"workflowGraph"`
	WorkflowNodeDetails *WorkspaceUIWorkflowNodeDetailsPaneContentRef `json:"workflowNodeDetails"`
}

type WorkspaceUIChatPaneContentRef struct {
	ConversationID string `json:"conversationId"`
}

type WorkspaceUITerminalPaneContentRef struct {
	CWDOverride   string `json:"cwdOverride"`
	ProfileID     string `json:"profileId"`
	SessionID     string `json:"sessionId"`
	TitleOverride string `json:"titleOverride"`
}

type WorkspaceUIWorkflowGraphPaneContentRef struct {
	DefinitionID string `json:"definitionId"`
	ExecutionID  string `json:"executionId"`
	ViewMode     string `json:"viewMode"`
}

type WorkspaceUIWorkflowNodeDetailsPaneContentRef struct {
	DefinitionID            string                               `json:"definitionId"`
	DefinitionVersionID     string                               `json:"definitionVersionId"`
	DefinitionVersionNumber int                                  `json:"definitionVersionNumber"`
	ExecutionID             string                               `json:"executionId"`
	NodeID                  string                               `json:"nodeId"`
	NodeExecutionID         string                               `json:"nodeExecutionId"`
	NodeKind                orchestrator.WorkflowNodeKind        `json:"nodeKind"`
	NodeStatus              orchestrator.WorkflowGraphNodeStatus `json:"nodeStatus"`
	ViewMode                orchestrator.WorkflowGraphViewMode   `json:"viewMode"`
}

type WorkspaceUISemanticNodeDetailsPaneContentRef struct {
	NodeID string `json:"nodeId"`
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func Schema() WorkspaceUISchema {
	return WorkspaceUISchema{
		SchemaVersion:       1,
		LayoutSchemaVersion: SchemaVersion,
		ColumnWidthUnits:    supportedColumnWidthUnits(),
		PaneReadModes:       supportedPaneReadModes(),
		PaneWriteModes:      supportedPaneWriteModes(),
		PaneRuntimeStatuses: supportedPaneRuntimeStatuses(),
		PaneTones:           supportedPaneTones(),
		SurfaceCloseModes:   supportedSurfaceCloseModes(),
		SurfaceKinds:        supportedSurfaceKinds(),
	}
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{
			Name:   "ColumnWidthUnit",
			Values: stringValues(supportedColumnWidthUnits()),
		},
		{
			Name:   "SurfaceKind",
			Values: stringValues(supportedSurfaceKinds()),
		},
		{
			Name:   "PaneTone",
			Values: stringValues(supportedPaneTones()),
		},
		{
			Name:   "WorkspaceUIPaneReadMode",
			Values: stringValues(supportedPaneReadModes()),
		},
		{
			Name:   "WorkspaceUIPaneWriteMode",
			Values: stringValues(supportedPaneWriteModes()),
		},
		{
			Name:   "WorkspaceUIPaneMoveDirection",
			Values: stringValues(supportedPaneMoveDirections()),
		},
		{
			Name:   "WorkspaceUISurfaceCloseMode",
			Values: stringValues(supportedSurfaceCloseModes()),
		},
		{
			Name:   "WorkspaceUIPaneRuntimeStatus",
			Values: stringValues(supportedPaneRuntimeStatuses()),
		},
	}
}

func supportedColumnWidthUnits() []ColumnWidthUnit {
	return []ColumnWidthUnit{
		ColumnWidthUnitProportion,
		ColumnWidthUnitPX,
	}
}

func supportedSurfaceKinds() []SurfaceKind {
	return []SurfaceKind{
		SurfaceKindChatDOM,
		SurfaceKindEmptyFrame,
		SurfaceKindWorkflowGraph,
		SurfaceKindSettingsDOM,
		SurfaceKindTerminal,
		SurfaceKindSemanticNodeDetails,
		SurfaceKindWorkflowNodeDetails,
		SurfaceKindWorkflowSettings,
	}
}

func supportedPaneTones() []PaneTone {
	return []PaneTone{
		PaneToneCyan,
		PaneToneGreen,
		PaneToneOrange,
		PaneTonePink,
		PaneToneSlate,
	}
}

func supportedPaneReadModes() []WorkspaceUIPaneReadMode {
	return []WorkspaceUIPaneReadMode{
		WorkspaceUIPaneReadModeMetadata,
	}
}

func supportedPaneWriteModes() []WorkspaceUIPaneWriteMode {
	return []WorkspaceUIPaneWriteMode{
		WorkspaceUIPaneWriteModeChatSend,
		WorkspaceUIPaneWriteModeChatQueue,
		WorkspaceUIPaneWriteModeChatSteer,
		WorkspaceUIPaneWriteModeTerminalInput,
	}
}

func supportedPaneMoveDirections() []WorkspaceUIPaneMoveDirection {
	return []WorkspaceUIPaneMoveDirection{
		WorkspaceUIPaneMoveDirectionDown,
		WorkspaceUIPaneMoveDirectionLeft,
		WorkspaceUIPaneMoveDirectionRight,
		WorkspaceUIPaneMoveDirectionUp,
	}
}

func supportedSurfaceCloseModes() []WorkspaceUISurfaceCloseMode {
	return []WorkspaceUISurfaceCloseMode{
		WorkspaceUISurfaceCloseModeNone,
		WorkspaceUISurfaceCloseModeSafe,
		WorkspaceUISurfaceCloseModeForce,
	}
}

func supportedPaneRuntimeStatuses() []WorkspaceUIPaneRuntimeStatus {
	return []WorkspaceUIPaneRuntimeStatus{
		WorkspaceUIPaneRuntimeStatusLayoutOnly,
	}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
