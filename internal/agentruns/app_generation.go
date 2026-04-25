package agentruns

import "strings"

type AppGenerationMode string

type ChatAppGenerationMessageMode string

const (
	ChatAppGenerationMessageModePlainChat ChatAppGenerationMessageMode = "plain_chat"

	AppGenerationModeJSONRender          AppGenerationMode = "json_render"
	AppGenerationModeJSONRenderWithImage AppGenerationMode = "json_render_with_image"
	AppGenerationModePromptBuilder       AppGenerationMode = "prompt_builder"
	AppGenerationModeMCPServer           AppGenerationMode = "mcp_server"

	ChatAppGenerationMessageModeJSONRender          ChatAppGenerationMessageMode = ChatAppGenerationMessageMode(AppGenerationModeJSONRender)
	ChatAppGenerationMessageModeJSONRenderWithImage ChatAppGenerationMessageMode = ChatAppGenerationMessageMode(AppGenerationModeJSONRenderWithImage)
	ChatAppGenerationMessageModePromptBuilder       ChatAppGenerationMessageMode = ChatAppGenerationMessageMode(AppGenerationModePromptBuilder)
	ChatAppGenerationMessageModeMCPServer           ChatAppGenerationMessageMode = ChatAppGenerationMessageMode(AppGenerationModeMCPServer)
)

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
			mode = strings.TrimSpace(mode)
			if messageID != "" && mode != "" {
				normalized[messageID] = mode
			}
		}
	case map[string]any:
		for messageID, rawMode := range typed {
			mode, ok := normalizeAppGenerationModeValue(rawMode)
			if !ok {
				continue
			}
			if messageID != "" && mode != "" {
				normalized[messageID] = mode
			}
		}
	}
	return normalized
}

func normalizeAppGenerationModeValue(raw any) (string, bool) {
	switch typed := raw.(type) {
	case string:
		return strings.TrimSpace(typed), true
	case AppGenerationMode:
		return strings.TrimSpace(string(typed)), true
	case ChatAppGenerationMessageMode:
		return strings.TrimSpace(string(typed)), true
	default:
		return "", false
	}
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
		normalized[submittedMessageID] = string(ChatAppGenerationMessageModePlainChat)
		return normalized
	}
	normalized[submittedMessageID] = strings.TrimSpace(*requestedMode)
	return normalized
}
