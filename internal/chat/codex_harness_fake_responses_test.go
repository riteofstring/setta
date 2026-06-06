package chat

func fakeSkillsListResponse() map[string]any {
	return map[string]any{
		"data": []map[string]any{{
			"cwd":    "/tmp/workspace",
			"errors": []any{},
			"skills": []map[string]any{{
				"description": "Fake skill for command tests.",
				"enabled":     true,
				"name":        "fake-skill",
				"path":        "/tmp/skills/fake-skill/SKILL.md",
				"scope":       "user",
			}},
		}},
	}
}

func fakeMCPServerStatusResponse() map[string]any {
	return map[string]any{
		"data": []map[string]any{{
			"authStatus":        "unsupported",
			"name":              "fake-mcp",
			"resourceTemplates": []any{},
			"resources":         []any{},
			"tools": map[string]any{
				"fake_tool": map[string]any{},
			},
		}},
		"nextCursor": nil,
	}
}
