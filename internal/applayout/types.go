package applayout

import "reflect"

const SchemaVersion = 1

type AppPaneColumnWidthUnit string

const (
	AppPaneColumnWidthUnitProportion AppPaneColumnWidthUnit = "proportion"
	AppPaneColumnWidthUnitPX         AppPaneColumnWidthUnit = "px"
)

type AppPaneSurfaceKind string

const (
	AppPaneSurfaceKindMaster       AppPaneSurfaceKind = "master"
	AppPaneSurfaceKindConversation AppPaneSurfaceKind = "conversation"
	AppPaneSurfaceKindBrowser      AppPaneSurfaceKind = "browser"
	AppPaneSurfaceKindEmptyFrame   AppPaneSurfaceKind = "empty-frame"
)

type AppPaneTone string

const (
	AppPaneToneCyan   AppPaneTone = "cyan"
	AppPaneToneGreen  AppPaneTone = "green"
	AppPaneToneOrange AppPaneTone = "orange"
	AppPaneTonePink   AppPaneTone = "pink"
	AppPaneToneSlate  AppPaneTone = "slate"
)

type ConversationPaneResourceBindingKind string

const (
	ConversationPaneResourceBindingKindFolder ConversationPaneResourceBindingKind = "folder"
)

type AppPaneColumnWidthSpec struct {
	Unit  AppPaneColumnWidthUnit `json:"unit"`
	Value float64                `json:"value"`
}

type MasterPaneConfig struct{}

type FolderResourceBinding struct {
	RootPath string `json:"rootPath"`
}

type ConversationPaneResourceBinding struct {
	Folder *FolderResourceBinding              `json:"folder"`
	Kind   ConversationPaneResourceBindingKind `json:"kind"`
}

type ConversationPanePresentationIdentity struct {
	Subtitle string      `json:"subtitle"`
	Title    string      `json:"title"`
	Tone     AppPaneTone `json:"tone"`
}

type ConversationPaneConfig struct {
	ConversationID       string                               `json:"conversationId"`
	PresentationIdentity ConversationPanePresentationIdentity `json:"presentationIdentity"`
	ResourceBindings     []ConversationPaneResourceBinding    `json:"resourceBindings"`
}

type AppPane struct {
	ColumnID           string                  `json:"columnId"`
	ConversationConfig *ConversationPaneConfig `json:"conversationConfig"`
	Heat               int                     `json:"heat"`
	MasterConfig       *MasterPaneConfig       `json:"masterConfig"`
	PaneID             string                  `json:"paneId"`
	Sequence           int                     `json:"sequence"`
	Subtitle           string                  `json:"subtitle"`
	SurfaceID          string                  `json:"surfaceId"`
	SurfaceKind        AppPaneSurfaceKind      `json:"surfaceKind"`
	Title              string                  `json:"title"`
	Tone               AppPaneTone             `json:"tone"`
	Weight             float64                 `json:"weight"`
}

type AppPaneColumn struct {
	ColumnID                string                 `json:"columnId"`
	IdealWidthSpec          AppPaneColumnWidthSpec `json:"idealWidthSpec"`
	Index                   int                    `json:"index"`
	PaneIDs                 []string               `json:"paneIds"`
	PlaneIndex              int                    `json:"planeIndex"`
	PreviousProportionWidth *float64               `json:"previousProportionWidth"`
	SlotIndex               int                    `json:"slotIndex"`
	WidthSpec               AppPaneColumnWidthSpec `json:"widthSpec"`
}

type AppPaneLayout struct {
	SchemaVersion   int             `json:"schemaVersion"`
	FocusedPaneID   string          `json:"focusedPaneId"`
	MaximizedPaneID *string         `json:"maximizedPaneId"`
	Columns         []AppPaneColumn `json:"columns"`
	Panes           []AppPane       `json:"panes"`
}

type AppPaneLayoutReadResult struct {
	Layout *AppPaneLayout `json:"layout"`
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
	return []ContractDiscriminatedStruct{
		{
			Type:          reflect.TypeFor[AppPane](),
			Discriminator: "surfaceKind",
			Variants: []ContractDiscriminatedStructVariant{
				{
					DiscriminatorValue: string(AppPaneSurfaceKindMaster),
					Fields: []ContractDiscriminatedStructField{
						{Name: "masterConfig", NonNull: true},
						{Name: "conversationConfig"},
					},
				},
				{
					DiscriminatorValue: string(AppPaneSurfaceKindConversation),
					Fields: []ContractDiscriminatedStructField{
						{Name: "masterConfig"},
						{Name: "conversationConfig", NonNull: true},
					},
				},
				{
					DiscriminatorValue: string(AppPaneSurfaceKindBrowser),
					Fields: []ContractDiscriminatedStructField{
						{Name: "masterConfig"},
						{Name: "conversationConfig"},
					},
				},
				{
					DiscriminatorValue: string(AppPaneSurfaceKindEmptyFrame),
					Fields: []ContractDiscriminatedStructField{
						{Name: "masterConfig"},
						{Name: "conversationConfig"},
					},
				},
			},
		},
		{
			Type:          reflect.TypeFor[ConversationPaneResourceBinding](),
			Discriminator: "kind",
			Variants: []ContractDiscriminatedStructVariant{
				{
					DiscriminatorValue: string(ConversationPaneResourceBindingKindFolder),
					Fields: []ContractDiscriminatedStructField{{
						Name:    "folder",
						NonNull: true,
					}},
				},
			},
		},
	}
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{
			Name: "AppPaneColumnWidthUnit",
			Values: []string{
				string(AppPaneColumnWidthUnitProportion),
				string(AppPaneColumnWidthUnitPX),
			},
		},
		{
			Name: "AppPaneSurfaceKind",
			Values: []string{
				string(AppPaneSurfaceKindMaster),
				string(AppPaneSurfaceKindConversation),
				string(AppPaneSurfaceKindBrowser),
				string(AppPaneSurfaceKindEmptyFrame),
			},
		},
		{
			Name: "AppPaneTone",
			Values: []string{
				string(AppPaneToneCyan),
				string(AppPaneToneGreen),
				string(AppPaneToneOrange),
				string(AppPaneTonePink),
				string(AppPaneToneSlate),
			},
		},
		{
			Name: "ConversationPaneResourceBindingKind",
			Values: []string{
				string(ConversationPaneResourceBindingKindFolder),
			},
		},
	}
}
