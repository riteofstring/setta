package projectstate

type MetaControlSizeMode string

const (
	MetaControlSizeModeAny        MetaControlSizeMode = "any"
	MetaControlSizeModeAutoOnly   MetaControlSizeMode = "auto_only"
	MetaControlSizeModeManualOnly MetaControlSizeMode = "manual_only"
)

type SectionSizeMode string

const (
	SectionSizeModeAuto SectionSizeMode = "auto"
)

type AgenticEdgeKind string

const (
	AgenticEdgeKindChatChat    AgenticEdgeKind = "chat_chat"
	AgenticEdgeKindSectionChat AgenticEdgeKind = "section_chat"
	AgenticEdgeKindChatSection AgenticEdgeKind = "chat_section"
)

type AgenticEdgeContextMode string

const (
	AgenticEdgeContextModeReferenceOnly AgenticEdgeContextMode = "reference_only"
	AgenticEdgeContextModeInlineText    AgenticEdgeContextMode = "inline_text"
	AgenticEdgeContextModeSummary       AgenticEdgeContextMode = "summary"
)

func MetaControlSizeModeValues() []string {
	return []string{
		string(MetaControlSizeModeAny),
		string(MetaControlSizeModeAutoOnly),
		string(MetaControlSizeModeManualOnly),
	}
}
