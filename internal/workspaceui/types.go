package workspaceui

import "reflect"

const SchemaVersion = 1

type ColumnWidthUnit string

const (
	ColumnWidthUnitProportion ColumnWidthUnit = "proportion"
	ColumnWidthUnitPX         ColumnWidthUnit = "px"
)

type SurfaceKind string

const (
	SurfaceKindBrowser      SurfaceKind = "browser"
	SurfaceKindConversation SurfaceKind = "conversation"
	SurfaceKindEmptyFrame   SurfaceKind = "empty-frame"
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

type WorkspaceConversationPaneConfig struct {
	ConversationID string `json:"conversationId"`
}

type WorkspaceUIPane struct {
	ColumnID           string                           `json:"columnId"`
	ConversationConfig *WorkspaceConversationPaneConfig `json:"conversationConfig"`
	Heat               int                              `json:"heat"`
	PaneID             string                           `json:"paneId"`
	Sequence           int                              `json:"sequence"`
	Subtitle           string                           `json:"subtitle"`
	SurfaceID          string                           `json:"surfaceId"`
	SurfaceKind        SurfaceKind                      `json:"surfaceKind"`
	Title              string                           `json:"title"`
	Tone               PaneTone                         `json:"tone"`
	Weight             float64                          `json:"weight"`
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

type ContractDiscriminatedStruct struct {
	Type          reflect.Type
	Discriminator string
	Variants      []ContractDiscriminatedStructVariant
}

type ContractDiscriminatedStructVariant struct {
	DiscriminatorValue string
	Fields             []ContractDiscriminatedStructField
}

type ContractDiscriminatedStructField struct {
	Name    string
	NonNull bool
}

func ContractDiscriminatedStructs() []ContractDiscriminatedStruct {
	return []ContractDiscriminatedStruct{{
		Type:          reflect.TypeFor[WorkspaceUIPane](),
		Discriminator: "surfaceKind",
		Variants: []ContractDiscriminatedStructVariant{
			{
				DiscriminatorValue: string(SurfaceKindBrowser),
				Fields:             []ContractDiscriminatedStructField{{Name: "conversationConfig"}},
			},
			{
				DiscriminatorValue: string(SurfaceKindConversation),
				Fields: []ContractDiscriminatedStructField{{
					Name:    "conversationConfig",
					NonNull: true,
				}},
			},
			{
				DiscriminatorValue: string(SurfaceKindEmptyFrame),
				Fields:             []ContractDiscriminatedStructField{{Name: "conversationConfig"}},
			},
		},
	}}
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
				string(SurfaceKindBrowser),
				string(SurfaceKindConversation),
				string(SurfaceKindEmptyFrame),
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
