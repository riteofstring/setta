package mcpx

import (
	"context"
	"errors"

	"setta/internal/agentprofiles"
	"setta/internal/tools"
)

type agentProfileListResult struct {
	Profiles []agentprofiles.Profile `json:"profiles"`
}

func newListAgentProfilesHandler(server *Server) tools.Handler {
	return func(context.Context, map[string]any) (any, error) {
		if server == nil || server.agentProfiles == nil {
			return nil, newToolError("internal_error", "Agent profile store is unavailable.")
		}

		profiles, err := server.agentProfiles.List()
		if err != nil {
			return nil, normalizeAgentProfileToolError(err)
		}
		return agentProfileListResult{Profiles: profiles}, nil
	}
}

func newGetAgentProfileHandler(server *Server) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		profileID, err := readRequiredStringArgument(arguments, "profileId")
		if err != nil {
			return nil, err
		}
		if server == nil || server.agentProfiles == nil {
			return nil, newToolError("internal_error", "Agent profile store is unavailable.")
		}

		profile, err := server.agentProfiles.Get(profileID)
		if err != nil {
			return nil, normalizeAgentProfileToolError(err)
		}
		return profile, nil
	}
}

func normalizeAgentProfileToolError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, agentprofiles.ErrProfileNotFound) {
		return newToolError("invalid_arguments", "%s", err.Error())
	}
	return err
}

func agentProfileSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id": map[string]any{
				"type": "string",
			},
			"name": map[string]any{
				"type": "string",
			},
			"description": map[string]any{
				"type": "string",
			},
			"systemPrompt": map[string]any{
				"type": "string",
			},
			"enableBackgroundSummaryFill": map[string]any{
				"type": "boolean",
			},
			"enableLlmChatTitles": map[string]any{
				"type": "boolean",
			},
			"engineConfigId": map[string]any{
				"type": []string{"string", "null"},
			},
			"toolAllowlist": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "string",
				},
			},
			"memoryScope": map[string]any{
				"type": []string{"string", "null"},
			},
		},
		"required": []string{
			"id",
			"name",
			"description",
			"systemPrompt",
			"enableBackgroundSummaryFill",
			"enableLlmChatTitles",
			"engineConfigId",
			"toolAllowlist",
			"memoryScope",
		},
	}
}
