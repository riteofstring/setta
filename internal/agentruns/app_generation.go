package agentruns

import "strings"

const (
	ChatAppGenerationMessageModePlainChat           = "plain_chat"
	AppGenerationModeJSONRender                     = "json_render"
	AppGenerationModeJSONRenderWithImage            = "json_render_with_image"
	AppGenerationModePromptBuilder                  = "prompt_builder"
	AppGenerationModeMCPServer                      = "mcp_server"
	ChatAppGenerationMessageModeJSONRender          = AppGenerationModeJSONRender
	ChatAppGenerationMessageModeJSONRenderWithImage = AppGenerationModeJSONRenderWithImage
	ChatAppGenerationMessageModePromptBuilder       = AppGenerationModePromptBuilder
	ChatAppGenerationMessageModeMCPServer           = AppGenerationModeMCPServer
)

func AppGenerationModes() []string {
	return []string{
		AppGenerationModeJSONRender,
		AppGenerationModeJSONRenderWithImage,
		AppGenerationModePromptBuilder,
		AppGenerationModeMCPServer,
	}
}

func ParseAppGenerationMode(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	switch trimmed {
	case AppGenerationModeJSONRender,
		AppGenerationModeJSONRenderWithImage,
		AppGenerationModePromptBuilder,
		AppGenerationModeMCPServer:
		return trimmed, true
	default:
		return "", false
	}
}

func NormalizeOptionalAppGenerationMode(value *string) (*string, bool) {
	if value == nil {
		return nil, true
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, true
	}
	normalized, ok := ParseAppGenerationMode(trimmed)
	if !ok {
		return nil, false
	}
	return &normalized, true
}

func ExtractAppGenerationByMessageID(inputs map[string]any) map[string]string {
	if len(inputs) == 0 {
		return map[string]string{}
	}
	return NormalizeAppGenerationByMessageID(inputs["appGenerationByMessageId"])
}

func NormalizeAppGenerationByMessageID(raw any) map[string]string {
	normalized := map[string]string{}
	switch typed := raw.(type) {
	case map[string]string:
		for messageID, mode := range typed {
			if isAllowedChatAppGenerationMessageMode(mode) && messageID != "" {
				normalized[messageID] = mode
			}
		}
	case map[string]any:
		for messageID, rawMode := range typed {
			mode, ok := rawMode.(string)
			if !ok {
				continue
			}
			if isAllowedChatAppGenerationMessageMode(mode) && messageID != "" {
				normalized[messageID] = mode
			}
		}
	}
	return normalized
}

func isAllowedChatAppGenerationMessageMode(mode string) bool {
	switch mode {
	case ChatAppGenerationMessageModePlainChat,
		AppGenerationModeJSONRender,
		AppGenerationModeJSONRenderWithImage,
		AppGenerationModePromptBuilder,
		AppGenerationModeMCPServer:
		return true
	default:
		return false
	}
}

func MessageHasImageAttachment(message map[string]any) bool {
	rawAttachments, ok := message["attachments"]
	if !ok {
		return false
	}
	attachments, ok := rawAttachments.([]any)
	if !ok {
		return false
	}
	for _, rawAttachment := range attachments {
		attachment, ok := rawAttachment.(map[string]any)
		if !ok {
			continue
		}
		mimeType, ok := attachment["mimeType"].(string)
		if !ok {
			continue
		}
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "image/") {
			return true
		}
	}
	return false
}

func HasRetainedImageAttachmentFromImageModeThread(
	messages []map[string]any,
	appGenerationByMessageID map[string]string,
) bool {
	for _, message := range messages {
		role, _ := message["role"].(string)
		if strings.TrimSpace(role) != "user" {
			continue
		}
		messageID, _ := message["id"].(string)
		if appGenerationByMessageID[messageID] != ChatAppGenerationMessageModeJSONRenderWithImage {
			continue
		}
		if MessageHasImageAttachment(message) {
			return true
		}
	}
	return false
}

func NormalizeSubmittedTurnAppGenerationByMessageID(
	raw any,
	submittedMessageID string,
	requestedMode *string,
) map[string]string {
	normalized := NormalizeAppGenerationByMessageID(raw)
	if strings.TrimSpace(submittedMessageID) == "" {
		return normalized
	}
	if requestedMode == nil || strings.TrimSpace(*requestedMode) == "" {
		normalized[submittedMessageID] = ChatAppGenerationMessageModePlainChat
		return normalized
	}
	normalized[submittedMessageID] = strings.TrimSpace(*requestedMode)
	return normalized
}
