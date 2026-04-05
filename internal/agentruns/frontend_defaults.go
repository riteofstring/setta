package agentruns

import "time"

func FrontendDefaultEngineConfigDefaults() EngineConfigDefaults {
	return EngineConfigDefaults{}
}

func FrontendDefaultEngineRuntimeSupport() EngineRuntimeSupport {
	return EngineRuntimeSupport{}
}

func FrontendDefaultRunEvent() RunEvent {
	return RunEvent{
		ID:        "",
		Timestamp: time.Time{},
		Type:      "",
		Payload:   map[string]any{},
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
