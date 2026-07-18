package chat

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
