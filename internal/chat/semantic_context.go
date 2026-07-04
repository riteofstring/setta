package chat

import "strings"

func deliveredTurnPrompt(request TurnRequest) string {
	return combineSemanticContext(request.SemanticContextText(), request.Prompt)
}

func deliveredSteeringText(request SteerRequest) string {
	return combineSemanticContext(request.SemanticContextText(), request.Text)
}

func (request TurnRequest) SemanticContextText() string {
	if request.SemanticContext == nil {
		return ""
	}
	return request.SemanticContext.ContextText
}

func (request SteerRequest) SemanticContextText() string {
	if request.SemanticContext == nil {
		return ""
	}
	return request.SemanticContext.ContextText
}

func combineSemanticContext(contextText string, authored string) string {
	contextText = strings.TrimSpace(contextText)
	authored = strings.TrimSpace(authored)
	if contextText == "" {
		return authored
	}
	if authored == "" {
		return contextText
	}
	return contextText + "\n\n" + authored
}
