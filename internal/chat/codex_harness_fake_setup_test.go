package chat

func handleFakeSetupMethod(mode string, state *fakeCodexState, message map[string]any) (bool, bool) {
	switch message["method"] {
	case "initialize":
		writeFakeInitializeResponse(message["id"])
		return true, false
	case "skills/extraRoots/set":
		assertFakeCodexSkillRootsSetParams(message)
		state.skillRootsConfigured = true
		writeFakeResponse(message["id"], map[string]any{})
		return true, false
	case "config/read":
		assertFakeConfigRead(message)
		writeFakeResponse(message["id"], map[string]any{
			"config": map[string]any{
				"model":                  "gpt-test",
				"model_reasoning_effort": "xhigh",
			},
			"layers":  []any{},
			"origins": map[string]any{},
		})
		return true, false
	case "configRequirements/read":
		writeFakeConfigRequirementsResponse(message["id"], mode)
		done := mode == "command-permission-picker-linked" || mode == "command-permission-picker-disabled"
		return true, done
	default:
		return false, false
	}
}
