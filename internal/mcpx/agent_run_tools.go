package mcpx

import (
	"context"
	"errors"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func newRunAgentProfileHandler(server *Server) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		profileID, err := readRequiredStringArgument(arguments, "profileId")
		if err != nil {
			return nil, err
		}
		inputsArgument, err := readOptionalObjectPointerArgument(arguments, "inputs")
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
		if server.agentRuns == nil {
			return nil, newToolError("internal_error", "Agent runner is not available")
		}

		var inputs map[string]any
		if inputsArgument != nil {
			inputs = *inputsArgument
		}
		run, err := server.agentRuns.RunSubAgent(ctx, profile, inputs)
		if err != nil {
			return nil, normalizeRunAgentProfileToolError(err)
		}
		return run, nil
	}
}

func normalizeRunAgentProfileToolError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, agentruns.ErrManagedExecutorUnavailable):
		return newToolError("internal_error", "Agent runner is not available")
	case errors.Is(err, agentruns.ErrProfileEngineConfigRequired),
		errors.Is(err, agentruns.ErrManagedLLMEngineRequired),
		errors.Is(err, agentruns.ErrEngineConfigNotFound),
		errors.Is(err, projectstate.ErrSectionNotFound),
		errors.Is(err, llmconfig.ErrTransportRequired),
		errors.Is(err, llmconfig.ErrTransportInvalid),
		errors.Is(err, llmconfig.ErrServerIDInvalid),
		errors.Is(err, llmconfig.ErrServerURLRequired),
		errors.Is(err, llmconfig.ErrServerCommandRequired),
		errors.Is(err, llmconfig.ErrServerHTTPHeadersInvalid),
		errors.Is(err, llmconfig.ErrServerEncodingUnsupported):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return newToolError(projectNotFoundErrorCode, "%s", err.Error())
	default:
		return newToolError("invalid_arguments", "%s", err.Error())
	}
}

func agentRunEventSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id": map[string]any{
				"type": "string",
			},
			"timestamp": map[string]any{
				"type":   "string",
				"format": "date-time",
			},
			"type": map[string]any{
				"type": "string",
			},
			"payload": map[string]any{
				"type": "object",
			},
		},
		"required": []string{"id", "timestamp", "type"},
	}
}

func agentRunSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id": map[string]any{
				"type": "string",
			},
			"profileId": map[string]any{
				"type": []string{"string", "null"},
			},
			"status": map[string]any{
				"type": "string",
				"enum": []string{
					string(agentruns.RunStatusQueued),
					string(agentruns.RunStatusRunning),
					string(agentruns.RunStatusCompleted),
					string(agentruns.RunStatusFailed),
					string(agentruns.RunStatusCancelled),
				},
			},
			"startedAt": map[string]any{
				"type":   []string{"string", "null"},
				"format": "date-time",
			},
			"finishedAt": map[string]any{
				"type":   []string{"string", "null"},
				"format": "date-time",
			},
			"inputs": map[string]any{
				"type": "object",
			},
			"outputs": map[string]any{
				"type": "object",
			},
			"toolCalls": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
				},
			},
			"cost": map[string]any{
				"type": []string{"number", "null"},
			},
			"events": map[string]any{
				"type":  "array",
				"items": agentRunEventSchema(),
			},
		},
		"required": []string{"id", "status"},
	}
}
