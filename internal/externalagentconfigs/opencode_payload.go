package externalagentconfigs

func ForceOpenCodeOpenAITextVerbosity(payload map[string]any, modelID string, verbosity string) {
	if payload == nil {
		return
	}
	provider, _ := payload["provider"].(map[string]any)
	if provider == nil {
		provider = map[string]any{}
	}
	openAI, _ := provider["openai"].(map[string]any)
	if openAI == nil {
		openAI = map[string]any{}
	}
	models, _ := openAI["models"].(map[string]any)
	if models == nil {
		models = map[string]any{}
	}
	modelEntry, _ := models[modelID].(map[string]any)
	if modelEntry == nil {
		modelEntry = map[string]any{}
	}
	options, _ := modelEntry["options"].(map[string]any)
	if options == nil {
		options = map[string]any{}
	}
	options["textVerbosity"] = verbosity
	if textOptions, ok := options["text"].(map[string]any); ok {
		clonedTextOptions := cloneJSONMap(textOptions)
		delete(clonedTextOptions, "verbosity")
		if len(clonedTextOptions) == 0 {
			delete(options, "text")
		} else {
			options["text"] = clonedTextOptions
		}
	}
	modelEntry["options"] = options
	models[modelID] = modelEntry
	openAI["models"] = models
	provider["openai"] = openAI
	payload["provider"] = provider
}
