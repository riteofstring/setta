package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/realtime"
)

const (
	RouteLLMConfig  = "/llm/config"
	RouteLLMAPIKeys = "/llm/apiKeys"
)

type LLMRouteDependencies struct {
	ModePolicy   modes.Policy
	Service      *llmconfig.Service
	WebsocketHub *realtime.WebsocketHub
}

type SetLLMAPIKeysRequest struct {
	APIKeys          map[string]string `json:"apiKeys"`
	ExpectedRevision int               `json:"expectedRevision"`
}

type LLMAPIKeysSnapshot llmconfig.ManagedAPIKeysSnapshot

func RegisterLLMRoutes(router chi.Router, deps LLMRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if deps.Service == nil {
			return fmt.Errorf("llm config service is required in ide mode")
		}
		if deps.WebsocketHub == nil {
			return fmt.Errorf("websocket hub is required in ide mode")
		}
	}

	protected := router.With(RequireIDEMode(deps.ModePolicy))
	protected.Get(RouteLLMConfig, getLLMConfigHandler(deps))
	protected.Post(RouteLLMConfig, setLLMConfigHandler(deps))
	protected.Get(RouteLLMAPIKeys, getLLMAPIKeysHandler(deps))
	protected.Post(RouteLLMAPIKeys, setLLMAPIKeysHandler(deps))
	return nil
}

func getLLMConfigHandler(deps LLMRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, deps.Service.Configs())
	}
}

func setLLMConfigHandler(deps LLMRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Service == nil || deps.WebsocketHub == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[llmconfig.AllConfigs](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		configs, apiKeySnapshot, err := deps.Service.SaveConfig(payload)
		if err != nil {
			writeLLMConfigError(w, r, err)
			return
		}

		if _, err := deps.WebsocketHub.BroadcastJSON(
			r.Context(),
			realtime.NewLLMConfigUpdatedMessage(configs),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if _, err := deps.WebsocketHub.BroadcastJSON(
			r.Context(),
			realtime.NewLLMAPIKeysUpdatedMessage(apiKeySnapshot),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, configs)
	}
}

func getLLMAPIKeysHandler(deps LLMRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot := deps.Service.ManagedAPIKeysSnapshot()
		if snapshot.ErrorCode != nil {
			writeJSON(w, managedAPIKeysErrorStatus(snapshot), LLMAPIKeysSnapshot(snapshot))
			return
		}
		writeJSON(w, http.StatusOK, LLMAPIKeysSnapshot(snapshot))
	}
}

func setLLMAPIKeysHandler(deps LLMRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Service == nil || deps.WebsocketHub == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[SetLLMAPIKeysRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if payload.ExpectedRevision < 0 {
			writeError(w, r, http.StatusBadRequest, "expected_revision_invalid", "expectedRevision must be greater than or equal to 0.")
			return
		}

		snapshot, status := deps.Service.SaveManagedAPIKeys(payload.APIKeys, payload.ExpectedRevision)
		if status != llmconfig.ManagedAPIKeysWriteStatusSuccess {
			writeJSON(w, managedAPIKeysWriteStatusCode(status), LLMAPIKeysSnapshot(snapshot))
			return
		}

		if _, err := deps.WebsocketHub.BroadcastJSON(
			r.Context(),
			realtime.NewLLMAPIKeysUpdatedMessage(snapshot),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, LLMAPIKeysSnapshot(snapshot))
	}
}

func writeLLMConfigError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, llmconfig.ErrInvalidConfig):
		writeError(w, r, http.StatusBadRequest, "invalid_llm_config", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func managedAPIKeysErrorStatus(snapshot llmconfig.ManagedAPIKeysSnapshot) int {
	if snapshot.ErrorCode == nil {
		return http.StatusOK
	}
	switch *snapshot.ErrorCode {
	case llmconfig.ManagedAPIKeysCorruptErrorCode:
		return http.StatusConflict
	case llmconfig.ManagedAPIKeysUnavailableErrorCode:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}

func managedAPIKeysWriteStatusCode(status llmconfig.ManagedAPIKeysWriteStatus) int {
	switch status {
	case llmconfig.ManagedAPIKeysWriteStatusRevisionConflict:
		return http.StatusConflict
	case llmconfig.ManagedAPIKeysWriteStatusCorruptStore:
		return http.StatusConflict
	case llmconfig.ManagedAPIKeysWriteStatusStoreUnavailable:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}
