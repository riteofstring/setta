package workspaceui

import "setta/internal/orchestrator"

const SchemaVersion = 1

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
	WorkspaceID   string              `json:"workspaceId"`
	FocusedPaneID string              `json:"focusedPaneId"`
	Columns       []WorkspaceUIColumn `json:"columns"`
	Panes         []WorkspaceUIPane   `json:"panes"`
}

type WorkspaceUILayoutReadResult struct {
	WorkspaceID string             `json:"workspaceId"`
	Layout      *WorkspaceUILayout `json:"layout"`
}

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{
			Name: "ColumnWidthUnit",
			Values: []string{
				string(ColumnWidthUnitProportion),
				string(ColumnWidthUnitPX),
			},
		},
		{
			Name: "SurfaceKind",
			Values: []string{
				string(SurfaceKindChatDOM),
				string(SurfaceKindEmptyFrame),
				string(SurfaceKindWorkflowGraph),
				string(SurfaceKindSettingsDOM),
				string(SurfaceKindTerminal),
				string(SurfaceKindSemanticNodeDetails),
				string(SurfaceKindWorkflowNodeDetails),
				string(SurfaceKindWorkflowSettings),
			},
		},
		{
			Name: "PaneTone",
			Values: []string{
				string(PaneToneCyan),
				string(PaneToneGreen),
				string(PaneToneOrange),
				string(PaneTonePink),
				string(PaneToneSlate),
			},
		},
	}
}
