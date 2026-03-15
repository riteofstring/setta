package agentruns

const (
	ChatAppGenerationMessageModePlainChat           = "plain_chat"
	ChatAppGenerationMessageModeJSONRender          = "json_render"
	ChatAppGenerationMessageModeJSONRenderWithImage = "json_render_with_image"
	ChatAppGenerationMessageModePromptBuilder       = "prompt_builder"
	ChatAppGenerationMessageModeMCPServer           = "mcp_server"
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
		ChatAppGenerationMessageModeJSONRender,
		ChatAppGenerationMessageModeJSONRenderWithImage,
		ChatAppGenerationMessageModePromptBuilder,
		ChatAppGenerationMessageModeMCPServer:
		return true
	default:
		return false
	}
}
