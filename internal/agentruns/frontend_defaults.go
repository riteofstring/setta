package agentruns

func FrontendDefaultEngineConfigDefaults() map[string]any {
	return map[string]any{
		"thinking": nil,
	}
}

func FrontendDefaultRunEvent() map[string]any {
	return map[string]any{
		"id":        "",
		"timestamp": "",
		"type":      "",
		"payload":   map[string]any{},
	}
}

func FrontendDefaultRun() map[string]any {
	return map[string]any{
		"id":         "",
		"profileId":  nil,
		"status":     RunStatusQueued,
		"startedAt":  nil,
		"finishedAt": nil,
		"inputs":     nil,
		"outputs":    nil,
		"toolCalls":  []map[string]any{},
		"cost":       nil,
		"events":     []RunEvent{},
	}
}
