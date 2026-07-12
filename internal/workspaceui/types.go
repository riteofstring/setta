package workspaceui

const SchemaVersion = 1

type ColumnWidthUnit string

const (
	ColumnWidthUnitProportion ColumnWidthUnit = "proportion"
	ColumnWidthUnitPX         ColumnWidthUnit = "px"
)

type SurfaceKind string

const (
	SurfaceKindEasyButton  SurfaceKind = "easy-button"
	SurfaceKindEmptyFrame  SurfaceKind = "empty-frame"
	SurfaceKindSettingsDOM SurfaceKind = "settings-dom"
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

type EasyButtonPaneConfig struct {
	ConversationID string `json:"conversationId"`
}

type WorkspaceUIPane struct {
	ColumnID         string                `json:"columnId"`
	EasyButtonConfig *EasyButtonPaneConfig `json:"easyButtonConfig"`
	Heat             int                   `json:"heat"`
	PaneID           string                `json:"paneId"`
	Sequence         int                   `json:"sequence"`
	Subtitle         string                `json:"subtitle"`
	SurfaceID        string                `json:"surfaceId"`
	SurfaceKind      SurfaceKind           `json:"surfaceKind"`
	Title            string                `json:"title"`
	Tone             PaneTone              `json:"tone"`
	Weight           float64               `json:"weight"`
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
				string(SurfaceKindEasyButton),
				string(SurfaceKindEmptyFrame),
				string(SurfaceKindSettingsDOM),
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
