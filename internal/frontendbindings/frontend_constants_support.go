package frontendbindings

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/projectstate"
	"setta/internal/transcriptionsessions"
	"setta/internal/uisettings"
	"setta/internal/wsapi"
)

const (
	frontendChatAttachmentsMaxFiles              = 10
	frontendDropzoneStatelessMaxFileBytes        = 5 * 1024 * 1024
	frontendDropzoneStatelessMaxTotalBytes       = 16 * 1024 * 1024
	frontendNotificationAllProjectsProjectConfig = "NOTIFICATION_IS_FOR_ALL_PROJECTS"
	frontendLLMContentTypeText                   = "text"
	frontendLLMContentTypeThinking               = "thinking"
	frontendEdgeOutputBaseLabel                  = "value"
)

func frontendConstantsSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		objectDeclaration(
			"FrontendConstants",
			TypeProperty{Name: "AUTH_COOKIE_REFRESH_WINDOW_SECONDS", TypeExpr: "number"},
			TypeProperty{Name: "CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES", TypeExpr: "Array<string>"},
			TypeProperty{Name: "CHAT_ATTACHMENTS_MAX_FILES", TypeExpr: "number"},
			TypeProperty{Name: "CHAT_ATTACHMENTS_MAX_FILE_BYTES", TypeExpr: "number"},
			TypeProperty{Name: "CHAT_ATTACHMENTS_MAX_FILE_LABEL", TypeExpr: "string"},
			TypeProperty{Name: "DEFAULT_HOST", TypeExpr: "string"},
			TypeProperty{Name: "DEFAULT_PORT", TypeExpr: "number"},
			TypeProperty{Name: "DROPZONE_ALLOWED_MIME_PREFIXES", TypeExpr: "Array<string>"},
			TypeProperty{Name: "DROPZONE_STATEFUL_MAX_FILE_BYTES", TypeExpr: "number"},
			TypeProperty{Name: "DROPZONE_STATEFUL_MAX_FILE_LABEL", TypeExpr: "string"},
			TypeProperty{Name: "DROPZONE_STATELESS_MAX_FILE_BYTES", TypeExpr: "number"},
			TypeProperty{Name: "DROPZONE_STATELESS_MAX_FILE_LABEL", TypeExpr: "string"},
			TypeProperty{Name: "DROPZONE_STATELESS_MAX_TOTAL_BYTES", TypeExpr: "number"},
			TypeProperty{Name: "DROPZONE_STATELESS_MAX_TOTAL_LABEL", TypeExpr: "string"},
			TypeProperty{Name: "EDGE_OUTPUT_BASE_LABEL", TypeExpr: "string"},
			TypeProperty{Name: "GEN_CODE_SEPARATOR_NEWLINES", TypeExpr: "number"},
			TypeProperty{Name: "LLM_TEXT", TypeExpr: "string"},
			TypeProperty{Name: "LLM_THINKING", TypeExpr: "string"},
			TypeProperty{Name: "NOTIFICATION_IS_FOR_ALL_PROJECTS", TypeExpr: "string"},
			TypeProperty{Name: "REALTIME_BINARY_MAX_BYTES", TypeExpr: "number"},
			TypeProperty{Name: "SETTA_TERMINAL_READY", TypeExpr: "string"},
			TypeProperty{Name: "SETTINGS_PROJECT_NAME", TypeExpr: "string"},
			TypeProperty{Name: "WS_TERMINAL_RESIZE", TypeExpr: "string"},
		),
		constDeclaration("C", true, buildFrontendConstantsExprTS()),
	}
}

func uiEditorTabSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		{
			Name: "UIEditorTabName",
			Kind: "enum",
			EnumValues: []EnumValue{
				{Name: "SectionConfig", Value: "SectionConfig"},
				{Name: "QuickInfoConfig", Value: "QuickInfoConfig"},
				{Name: "UIConfig", Value: "UIConfig"},
				{Name: "InfoConfig", Value: "InfoConfig"},
				{Name: "SectionVariantsConfig", Value: "SectionVariantsConfig"},
			},
		},
		aliasDeclaration("UIEditorTabLocalStorage", "Record<SectionType, UIEditorTabName>"),
		constDeclaration("REQUIRED_UI_EDITOR_TABS", true, buildRequiredUIEditorTabsExprTS()),
	}
}

func buildFrontendConstantsExprTS() string {
	authRefreshWindowSeconds := int(auth.DefaultAuthRefreshWindow / time.Second)
	genCodeSeparatorNewlines := strings.Count(codegen.PythonGeneratedCodeSeparator, "\n")

	fields := []tsLiteralField{
		{Name: "AUTH_COOKIE_REFRESH_WINDOW_SECONDS", Value: strconv.Itoa(authRefreshWindowSeconds)},
		{Name: "CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES", Value: "[]"},
		{Name: "CHAT_ATTACHMENTS_MAX_FILES", Value: strconv.Itoa(frontendChatAttachmentsMaxFiles)},
		{Name: "CHAT_ATTACHMENTS_MAX_FILE_BYTES", Value: strconv.Itoa(artifacts.DefaultMaxChatFileBytes)},
		{Name: "CHAT_ATTACHMENTS_MAX_FILE_LABEL", Value: tsStringLiteralExpr(frontendMegabyteLabel(artifacts.DefaultMaxChatFileBytes))},
		{Name: "DEFAULT_HOST", Value: tsStringLiteralExpr(config.DefaultServerHost)},
		{Name: "DEFAULT_PORT", Value: strconv.Itoa(config.DefaultServerPort)},
		{Name: "DROPZONE_ALLOWED_MIME_PREFIXES", Value: "[]"},
		{Name: "DROPZONE_STATEFUL_MAX_FILE_BYTES", Value: strconv.Itoa(artifacts.DefaultMaxGenericFileBytes)},
		{Name: "DROPZONE_STATEFUL_MAX_FILE_LABEL", Value: tsStringLiteralExpr(frontendMegabyteLabel(artifacts.DefaultMaxGenericFileBytes))},
		{Name: "DROPZONE_STATELESS_MAX_FILE_BYTES", Value: strconv.Itoa(frontendDropzoneStatelessMaxFileBytes)},
		{Name: "DROPZONE_STATELESS_MAX_FILE_LABEL", Value: tsStringLiteralExpr(frontendMegabyteLabel(frontendDropzoneStatelessMaxFileBytes))},
		{Name: "DROPZONE_STATELESS_MAX_TOTAL_BYTES", Value: strconv.Itoa(frontendDropzoneStatelessMaxTotalBytes)},
		{Name: "DROPZONE_STATELESS_MAX_TOTAL_LABEL", Value: tsStringLiteralExpr(frontendMegabyteLabel(frontendDropzoneStatelessMaxTotalBytes))},
		{Name: "EDGE_OUTPUT_BASE_LABEL", Value: tsStringLiteralExpr(frontendEdgeOutputBaseLabel)},
		{Name: "GEN_CODE_SEPARATOR_NEWLINES", Value: strconv.Itoa(genCodeSeparatorNewlines)},
		{Name: "LLM_TEXT", Value: tsStringLiteralExpr(frontendLLMContentTypeText)},
		{Name: "LLM_THINKING", Value: tsStringLiteralExpr(frontendLLMContentTypeThinking)},
		{Name: "NOTIFICATION_IS_FOR_ALL_PROJECTS", Value: tsStringLiteralExpr(frontendNotificationAllProjectsProjectConfig)},
		{Name: "REALTIME_BINARY_MAX_BYTES", Value: strconv.Itoa(transcriptionsessions.DefaultAppendPCMMaxBytes)},
		{Name: "SETTA_TERMINAL_READY", Value: tsStringLiteralExpr(wsapi.TerminalReadyMessage)},
		{Name: "SETTINGS_PROJECT_NAME", Value: tsStringLiteralExpr(string(projectstate.TargetSettings))},
		{Name: "WS_TERMINAL_RESIZE", Value: tsStringLiteralExpr(wsapi.TerminalMessageTypeResize)},
	}

	var builder strings.Builder
	builder.WriteString("({\n")
	writeTSObjectFields(&builder, "  ", fields)
	builder.WriteString("}) as FrontendConstants")
	return builder.String()
}

func buildRequiredUIEditorTabsExprTS() string {
	compatibility := uisettings.RequiredUIEditorTabsBySectionType()
	sectionTypes := make([]string, 0, len(compatibility))
	for sectionType := range compatibility {
		sectionTypes = append(sectionTypes, sectionType)
	}
	sort.Strings(sectionTypes)

	var builder strings.Builder
	builder.WriteString("({\n")
	for _, sectionType := range sectionTypes {
		builder.WriteString("  [SectionTypeEnum.")
		builder.WriteString(sectionType)
		builder.WriteString("]: ")
		builder.WriteString(tsEnumMemberArrayExpr("UIEditorTabNameEnum", compatibility[sectionType]))
		builder.WriteString(",\n")
	}
	builder.WriteString("}) as Record<SectionType, readonly UIEditorTabName[]>")
	return builder.String()
}

func frontendMegabyteLabel(bytes int) string {
	return strconv.Itoa(bytes/(1024*1024)) + " MB"
}

func tsStringLiteralExpr(value string) string {
	return strconv.Quote(value)
}

func tsEnumMemberArrayExpr(enumName string, members []string) string {
	if len(members) == 0 {
		return "[]"
	}
	entries := make([]string, 0, len(members))
	for _, member := range members {
		entries = append(entries, enumName+"."+member)
	}
	return "[" + strings.Join(entries, ", ") + "]"
}
