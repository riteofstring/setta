package projectview

import (
	"setta/internal/projectstate"
)

// Keep project chat editor/viewer option ordering and labels Go-owned so the
// frontend does not hand-maintain chat enum metadata in multiple components.
var (
	frontendProjectChatSectionWindowModeOptions = []ProjectChatWindowModeOption{
		{Value: projectstate.ChatWindowModeSection, Label: "Section mode (edge scoped)"},
		{Value: projectstate.ChatWindowModeProjectAI, Label: "Project AI mode (full project)"},
	}
	frontendProjectChatAgenticEdgeContextModeOptions = []ProjectChatAgenticEdgeContextModeOption{
		{Value: projectstate.AgenticEdgeContextModeReferenceOnly, Label: "Reference only"},
		{Value: projectstate.AgenticEdgeContextModeInlineText, Label: "Inline text"},
		{Value: projectstate.AgenticEdgeContextModeSummary, Label: "Summary"},
	}
	frontendProjectChatSectionDictationModeOptions = []ProjectChatDictationModeOption{
		{Value: projectstate.ChatDictationModeAuto, Label: "Auto"},
		{Value: projectstate.ChatDictationModeBrowser, Label: "Browser"},
		{Value: projectstate.ChatDictationModeProvider, Label: "Provider"},
	}
	frontendProjectChatProjectDictationModeOptions = []ProjectChatDictationModeOption{
		{Value: projectstate.ChatDictationModeAuto, Label: "Auto"},
		{Value: projectstate.ChatDictationModeProvider, Label: "Provider"},
		{Value: projectstate.ChatDictationModeBrowser, Label: "Browser"},
	}
	frontendProjectChatPermissionModeOptions = []ProjectChatPermissionModeOption{
		{Value: projectstate.ChatPermissionModeMinimal, Label: "minimal"},
		{Value: projectstate.ChatPermissionModeYOLO, Label: "yolo"},
		{Value: projectstate.ChatPermissionModeConfigTomlCustom, Label: "config.toml custom"},
	}
)

type ProjectChatWindowModeOption struct {
	Value projectstate.ChatWindowMode `json:"value"`
	Label string                      `json:"label"`
}

type ProjectChatAgenticEdgeContextModeOption struct {
	Value projectstate.AgenticEdgeContextMode `json:"value"`
	Label string                              `json:"label"`
}

type ProjectChatDictationModeOption struct {
	Value projectstate.ChatDictationMode `json:"value"`
	Label string                         `json:"label"`
}

type ProjectChatPermissionModeOption struct {
	Value projectstate.ChatPermissionMode `json:"value"`
	Label string                          `json:"label"`
}

type ProjectChatUIConfigValue struct {
	SectionChatWindowModeOptions  []ProjectChatWindowModeOption             `json:"sectionChatWindowModeOptions"`
	AgenticEdgeContextModeOptions []ProjectChatAgenticEdgeContextModeOption `json:"agenticEdgeContextModeOptions"`
	SectionDictationModeOptions   []ProjectChatDictationModeOption          `json:"sectionDictationModeOptions"`
	ProjectDictationModeOptions   []ProjectChatDictationModeOption          `json:"projectDictationModeOptions"`
	PermissionModeOptions         []ProjectChatPermissionModeOption         `json:"permissionModeOptions"`
}

func FrontendValueProjectChatUIConfig() ProjectChatUIConfigValue {
	return ProjectChatUIConfigValue{
		SectionChatWindowModeOptions: append(
			[]ProjectChatWindowModeOption(nil),
			frontendProjectChatSectionWindowModeOptions...,
		),
		AgenticEdgeContextModeOptions: append(
			[]ProjectChatAgenticEdgeContextModeOption(nil),
			frontendProjectChatAgenticEdgeContextModeOptions...,
		),
		SectionDictationModeOptions: append(
			[]ProjectChatDictationModeOption(nil),
			frontendProjectChatSectionDictationModeOptions...,
		),
		ProjectDictationModeOptions: append(
			[]ProjectChatDictationModeOption(nil),
			frontendProjectChatProjectDictationModeOptions...,
		),
		PermissionModeOptions: append(
			[]ProjectChatPermissionModeOption(nil),
			frontendProjectChatPermissionModeOptions...,
		),
	}
}
