package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/modes"
)

const RouteGetAgentRuns = "/getAgentRuns"
const RouteGetAgentRun = "/getAgentRun"
const RouteStartAgentRun = "/startAgentRun"
const RouteStopAgentRun = "/stopAgentRun"

type AgentRunRouteDependencies struct {
	ModePolicy modes.Policy
	Profiles   *agentprofiles.Store
	Runs       *agentruns.RunStore
	Managed    *agentruns.Runtime
}

type getAgentRunRequest struct {
	RunID string `json:"runId"`
}

type startAgentRunRequest struct {
	ProfileID string         `json:"profileId"`
	Inputs    map[string]any `json:"inputs"`
}

type stopAgentRunRequest struct {
	RunID string `json:"runId"`
}

func RegisterAgentRunRoutes(router chi.Router, deps AgentRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if deps.Profiles == nil {
			return fmt.Errorf("agent profile store is required in ide mode")
		}
		if deps.Runs == nil {
			return fmt.Errorf("agent run store is required in ide mode")
		}
		if deps.Managed == nil {
			return fmt.Errorf("managed agent runtime is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetAgentRuns, getAgentRunsHandler(deps.Runs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetAgentRun, getAgentRunHandler(deps.Runs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStartAgentRun, startAgentRunHandler(deps.Profiles, deps.Managed))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStopAgentRun, stopAgentRunHandler(deps.Managed))
	return nil
}

func getAgentRunsHandler(store *agentruns.RunStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		runs, err := store.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, runs)
	}
}

func getAgentRunHandler(store *agentruns.RunStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		payload, err := decodeStrictJSONBody[getAgentRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		runID := strings.TrimSpace(payload.RunID)
		if runID == "" {
			writeError(w, r, http.StatusBadRequest, "run_id_required", "Run id is required.")
			return
		}

		run, err := store.Load(runID)
		if err != nil {
			if errors.Is(err, agentruns.ErrRunNotFound) {
				writeError(w, r, http.StatusNotFound, "agent_run_not_found", "Agent run not found.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func startAgentRunHandler(profileStore *agentprofiles.Store, runtime *agentruns.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if profileStore == nil || runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "managed_agent_run_unavailable", "Managed agent runs are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[startAgentRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		profileID := strings.TrimSpace(payload.ProfileID)
		if profileID == "" {
			writeError(w, r, http.StatusBadRequest, "profile_id_required", "Profile id is required.")
			return
		}
		profile, err := profileStore.Get(profileID)
		if err != nil {
			if errors.Is(err, agentprofiles.ErrProfileNotFound) {
				writeError(w, r, http.StatusNotFound, "agent_profile_not_found", "Agent profile not found.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		run, err := runtime.StartRun(profile, payload.Inputs)
		if err != nil {
			if writeManagedAgentRunError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func stopAgentRunHandler(runtime *agentruns.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "managed_agent_run_unavailable", "Managed agent runs are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[stopAgentRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		runID := strings.TrimSpace(payload.RunID)
		if runID == "" {
			writeError(w, r, http.StatusBadRequest, "run_id_required", "Run id is required.")
			return
		}

		run, err := runtime.StopRun(runID)
		if err != nil {
			if writeManagedAgentRunError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func writeManagedAgentRunError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, agentruns.ErrManagedExecutorUnavailable), errors.Is(err, agentruns.ErrRuntimeServiceRequired):
		writeError(w, r, http.StatusServiceUnavailable, "managed_agent_run_unavailable", "Managed agent runs are not available.")
		return true
	case errors.Is(err, agentruns.ErrProfileEngineConfigRequired):
		writeError(w, r, http.StatusBadRequest, "agent_profile_engine_required", "Agent profile missing engine config.")
		return true
	case errors.Is(err, agentruns.ErrManagedLLMEngineRequired):
		writeError(w, r, http.StatusBadRequest, "managed_llm_engine_required", "Agent profile must use a Setta LLM engine config.")
		return true
	case errors.Is(err, agentruns.ErrInvalidRunInput):
		message := strings.TrimPrefix(strings.TrimSpace(err.Error()), agentruns.ErrInvalidRunInput.Error()+": ")
		writeError(w, r, http.StatusBadRequest, "invalid_agent_run_inputs", message)
		return true
	case errors.Is(err, agentruns.ErrEngineConfigNotFound):
		writeError(w, r, http.StatusBadRequest, "engine_config_not_found", "Engine config not found.")
		return true
	case errors.Is(err, agentruns.ErrRunNotFound):
		writeError(w, r, http.StatusNotFound, "agent_run_not_found", "Agent run not found.")
		return true
	default:
		return false
	}
}
