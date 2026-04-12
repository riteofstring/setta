package httpapi

import (
	"strconv"
	"strings"
	"time"

	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/projectstate"
	"setta/internal/transcriptionsessions"
	"setta/internal/wsapi"
)

const (
	frontendChatAttachmentsMaxFiles        = 10
	frontendDropzoneStatelessMaxFileBytes  = 5 * 1024 * 1024
	frontendDropzoneStatelessMaxTotalBytes = 16 * 1024 * 1024
	frontendNotificationAllProjectsKey     = "NOTIFICATION_IS_FOR_ALL_PROJECTS"
	frontendLLMContentTypeText             = "text"
	frontendLLMContentTypeThinking         = "thinking"
	frontendEdgeOutputBaseLabel            = "value"
)

// setta-go-type-discovery: skip
type FrontendConstants struct {
	AuthCookieRefreshWindowSeconds int      `json:"AUTH_COOKIE_REFRESH_WINDOW_SECONDS"`
	ChatAttachmentsAllowedPrefixes []string `json:"CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES"`
	ChatAttachmentsMaxFiles        int      `json:"CHAT_ATTACHMENTS_MAX_FILES"`
	ChatAttachmentsMaxFileBytes    int      `json:"CHAT_ATTACHMENTS_MAX_FILE_BYTES"`
	ChatAttachmentsMaxFileLabel    string   `json:"CHAT_ATTACHMENTS_MAX_FILE_LABEL"`
	DefaultHost                    string   `json:"DEFAULT_HOST"`
	DefaultPort                    int      `json:"DEFAULT_PORT"`
	DropzoneAllowedPrefixes        []string `json:"DROPZONE_ALLOWED_MIME_PREFIXES"`
	DropzoneStatefulMaxFileBytes   int      `json:"DROPZONE_STATEFUL_MAX_FILE_BYTES"`
	DropzoneStatefulMaxFileLabel   string   `json:"DROPZONE_STATEFUL_MAX_FILE_LABEL"`
	DropzoneStatelessMaxFileBytes  int      `json:"DROPZONE_STATELESS_MAX_FILE_BYTES"`
	DropzoneStatelessMaxFileLabel  string   `json:"DROPZONE_STATELESS_MAX_FILE_LABEL"`
	DropzoneStatelessMaxTotalBytes int      `json:"DROPZONE_STATELESS_MAX_TOTAL_BYTES"`
	DropzoneStatelessMaxTotalLabel string   `json:"DROPZONE_STATELESS_MAX_TOTAL_LABEL"`
	EdgeOutputBaseLabel            string   `json:"EDGE_OUTPUT_BASE_LABEL"`
	GenCodeSeparatorNewlines       int      `json:"GEN_CODE_SEPARATOR_NEWLINES"`
	LLMText                        string   `json:"LLM_TEXT"`
	LLMThinking                    string   `json:"LLM_THINKING"`
	NotificationIsForAllProjects   string   `json:"NOTIFICATION_IS_FOR_ALL_PROJECTS"`
	RealtimeBinaryMaxBytes         int      `json:"REALTIME_BINARY_MAX_BYTES"`
	SettaTerminalReady             string   `json:"SETTA_TERMINAL_READY"`
	SettingsProjectName            string   `json:"SETTINGS_PROJECT_NAME"`
	WSTerminalResize               string   `json:"WS_TERMINAL_RESIZE"`
}

func FrontendValueC() FrontendConstants {
	authRefreshWindowSeconds := int(auth.DefaultAuthRefreshWindow / time.Second)
	genCodeSeparatorNewlines := strings.Count(codegen.PythonGeneratedCodeSeparator, "\n")
	uploadPolicies := artifacts.DefaultUploadPolicies()

	return FrontendConstants{
		AuthCookieRefreshWindowSeconds: authRefreshWindowSeconds,
		ChatAttachmentsAllowedPrefixes: cloneFrontendConstantStrings(uploadPolicies.Chat.AllowedMimePrefixes),
		ChatAttachmentsMaxFiles:        frontendChatAttachmentsMaxFiles,
		ChatAttachmentsMaxFileBytes:    uploadPolicies.Chat.MaxFileBytes,
		ChatAttachmentsMaxFileLabel:    uploadPolicies.Chat.MaxFileLabel,
		DefaultHost:                    config.DefaultServerHost,
		DefaultPort:                    config.DefaultServerPort,
		DropzoneAllowedPrefixes:        cloneFrontendConstantStrings(uploadPolicies.Generic.AllowedMimePrefixes),
		DropzoneStatefulMaxFileBytes:   uploadPolicies.Generic.MaxFileBytes,
		DropzoneStatefulMaxFileLabel:   uploadPolicies.Generic.MaxFileLabel,
		DropzoneStatelessMaxFileBytes:  frontendDropzoneStatelessMaxFileBytes,
		DropzoneStatelessMaxFileLabel:  frontendMegabyteLabel(frontendDropzoneStatelessMaxFileBytes),
		DropzoneStatelessMaxTotalBytes: frontendDropzoneStatelessMaxTotalBytes,
		DropzoneStatelessMaxTotalLabel: frontendMegabyteLabel(frontendDropzoneStatelessMaxTotalBytes),
		EdgeOutputBaseLabel:            frontendEdgeOutputBaseLabel,
		GenCodeSeparatorNewlines:       genCodeSeparatorNewlines,
		LLMText:                        frontendLLMContentTypeText,
		LLMThinking:                    frontendLLMContentTypeThinking,
		NotificationIsForAllProjects:   frontendNotificationAllProjectsKey,
		RealtimeBinaryMaxBytes:         transcriptionsessions.DefaultAppendPCMMaxBytes,
		SettaTerminalReady:             wsapi.TerminalReadyMessage,
		SettingsProjectName:            string(projectstate.TargetSettings),
		WSTerminalResize:               wsapi.TerminalMessageTypeResize,
	}
}

func frontendMegabyteLabel(bytes int) string {
	return strconv.Itoa(bytes/(1024*1024)) + " MB"
}

func cloneFrontendConstantStrings(values []string) []string {
	return append([]string{}, values...)
}
