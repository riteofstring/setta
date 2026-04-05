package agentruns

func FrontendDefaultEngineConfigDefaults() EngineConfigDefaults {
	return EngineConfigDefaults{}
}

func FrontendDefaultRunEvent() map[string]any {
	return map[string]any{
		"id":        "",
		"timestamp": "",
		"type":      "",
		"payload":   map[string]any{},
	}
}

func FrontendDefaultRun() Run {
	return Run{
		ID:         "",
		Status:     RunStatusQueued,
		ToolCalls:  []map[string]any{},
		Events:     []RunEvent{},
		ProfileID:  nil,
		StartedAt:  nil,
		FinishedAt: nil,
		Inputs:     nil,
		Outputs:    nil,
		Cost:       nil,
	}
}
