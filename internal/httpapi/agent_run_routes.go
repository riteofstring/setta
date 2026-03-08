package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/modes"
	"setta/internal/runchains"
)

const RouteGetAgentRuns = "/getAgentRuns"
const RouteGetAgentRun = "/getAgentRun"
const RouteStartAgentRun = "/startAgentRun"
const RouteStopAgentRun = "/stopAgentRun"
const RouteStartRunChain = "/startRunChain"
const RouteStopRunChain = "/stopRunChain"

type AgentRunRouteDependencies struct {
	ModePolicy modes.Policy
	Profiles   *agentprofiles.Store
	Runs       *agentruns.RunStore
	Managed    *agentruns.Runtime
	Chains     *runchains.Runtime
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

type startRunChainRequest struct {
	Spec   runchains.SpecInput `json:"spec"`
	Inputs map[string]any      `json:"inputs"`
}

type stopRunChainRequest struct {
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
		if deps.Chains == nil {
			return fmt.Errorf("run chain runtime is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetAgentRuns, getAgentRunsHandler(deps.Runs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetAgentRun, getAgentRunHandler(deps.Runs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStartAgentRun, startAgentRunHandler(deps.Profiles, deps.Managed))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStopAgentRun, stopAgentRunHandler(deps.Managed))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStartRunChain, startRunChainHandler(deps.Chains))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStopRunChain, stopRunChainHandler(deps.Chains))
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

func startRunChainHandler(runtime *runchains.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "run_chain_unavailable", "Run chains are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[startRunChainRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		run, err := runtime.StartRun(payload.Spec, payload.Inputs)
		if err != nil {
			if writeRunChainError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, run)
	}
}

func stopRunChainHandler(runtime *runchains.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runtime == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if runtime.Disabled() {
			writeError(w, r, http.StatusServiceUnavailable, "run_chain_unavailable", "Run chains are not available.")
			return
		}

		payload, err := decodeStrictJSONBody[stopRunChainRequest](r)
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
			if writeRunChainError(w, r, err) {
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

func writeRunChainError(w http.ResponseWriter, r *http.Request, err error) bool {
	var preflightErr *externalagents.PreflightUnavailableError
	switch {
	case errors.Is(err, runchains.ErrStepRuntimeRequired):
		writeError(w, r, http.StatusServiceUnavailable, "run_chain_unavailable", "Run chains are not available.")
		return true
	case errors.Is(err, runchains.ErrManagedRuntimeUnavailable), errors.Is(err, runchains.ErrManagedRuntimeRequired):
		writeError(w, r, http.StatusServiceUnavailable, "managed_run_chain_unavailable", "Managed run-chain steps are not available.")
		return true
	case errors.Is(err, runchains.ErrExternalRuntimeUnavailable):
		writeError(w, r, http.StatusServiceUnavailable, "external_run_chain_unavailable", "External-agent run-chain steps are not available.")
		return true
	case errors.Is(err, runchains.ErrSupportedStepEngineRequired):
		writeError(w, r, http.StatusBadRequest, "run_chain_engine_unsupported", "Run chain steps must use a Setta LLM or external-agent engine config.")
		return true
	case errors.Is(err, runchains.ErrInvalidRunChainInput):
		message := strings.TrimPrefix(strings.TrimSpace(err.Error()), runchains.ErrInvalidRunChainInput.Error()+": ")
		if message == "" {
			message = "Invalid run chain inputs."
		}
		writeError(w, r, http.StatusBadRequest, "invalid_run_chain_inputs", message)
		return true
	case errors.As(err, &preflightErr):
		writeError(w, r, http.StatusServiceUnavailable, "external_agent_preflight_failed", preflightErr.Error())
		return true
	case errors.Is(err, agentprofiles.ErrProfileNotFound):
		writeError(w, r, http.StatusNotFound, "agent_profile_not_found", "Agent profile not found.")
		return true
	case errors.Is(err, agentruns.ErrEngineConfigNotFound):
		writeError(w, r, http.StatusBadRequest, "engine_config_not_found", "Engine config not found.")
		return true
	case errors.Is(err, externalagentconfigs.ErrConfigNotFound):
		writeError(w, r, http.StatusBadRequest, "external_agent_config_not_found", "External agent config not found.")
		return true
	case errors.Is(err, externalagents.ErrExternalAgentEngineRequired):
		writeError(w, r, http.StatusBadRequest, "run_chain_engine_unsupported", "Run chain steps must use a Setta LLM or external-agent engine config.")
		return true
	case errors.Is(err, agentruns.ErrRunNotFound):
		writeError(w, r, http.StatusNotFound, "run_chain_not_found", "Run chain not found.")
		return true
	default:
		return false
	}
}
