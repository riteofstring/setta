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

type GetAgentRunRequest struct {
	RunID string `json:"runId"`
}

type StartAgentRunRequest struct {
	ProfileID string         `json:"profileId"`
	Inputs    map[string]any `json:"inputs"`
}

type StopAgentRunRequest struct {
	RunID string `json:"runId"`
}

type StartRunChainRequest struct {
	Spec   runchains.SpecInput `json:"spec"`
	Inputs map[string]any      `json:"inputs"`
}

type StopRunChainRequest struct {
	RunID string `json:"runId"`
}

func RegisterAgentRunRoutes(router chi.Router, deps AgentRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && !openAPIDocumentOnlyFromRouter(router) {
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

	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	registerOpenAPIGet[[]agentruns.Run](
		ideRouter,
		"getAgentRuns",
		RouteGetAgentRuns,
		getAgentRunsHandler(deps.Runs),
		withOpenAPITags("Agent Runs"),
		withOpenAPISummary("List the managed agent and run-chain runs known to the IDE runtime."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[GetAgentRunRequest, agentruns.Run](
		ideRouter,
		"getAgentRun",
		RouteGetAgentRun,
		getAgentRunHandler(deps.Runs),
		withOpenAPITags("Agent Runs"),
		withOpenAPISummary("Load a single managed agent or run-chain run by ID."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[StartAgentRunRequest, agentruns.Run](
		ideRouter,
		"startAgentRun",
		RouteStartAgentRun,
		startAgentRunHandler(deps.Profiles, deps.Managed),
		withOpenAPITags("Agent Runs"),
		withOpenAPISummary("Start a managed agent run from an agent profile."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[StopAgentRunRequest, agentruns.Run](
		ideRouter,
		"stopAgentRun",
		RouteStopAgentRun,
		stopAgentRunHandler(deps.Managed),
		withOpenAPITags("Agent Runs"),
		withOpenAPISummary("Stop a managed agent run."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[StartRunChainRequest, agentruns.Run](
		ideRouter,
		"startRunChain",
		RouteStartRunChain,
		startRunChainHandler(deps.Chains),
		withOpenAPITags("Agent Runs"),
		withOpenAPISummary("Start a run chain."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[StopRunChainRequest, agentruns.Run](
		ideRouter,
		"stopRunChain",
		RouteStopRunChain,
		stopRunChainHandler(deps.Chains),
		withOpenAPITags("Agent Runs"),
		withOpenAPISummary("Stop a run chain."),
		withOpenAPIModeRequirement("ide"),
	)
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
		payload, err := decodeStrictJSONBody[GetAgentRunRequest](r)
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

		payload, err := decodeStrictJSONBody[StartAgentRunRequest](r)
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

		payload, err := decodeStrictJSONBody[StopAgentRunRequest](r)
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

		payload, err := decodeStrictJSONBody[StartRunChainRequest](r)
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

		payload, err := decodeStrictJSONBody[StopRunChainRequest](r)
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

type routeErrorMapping struct {
	targets []error
	status  int
	code    string
	message string
}

var runChainRouteErrorMappings = []routeErrorMapping{
	{
		targets: []error{runchains.ErrStepRuntimeRequired},
		status:  http.StatusServiceUnavailable,
		code:    "run_chain_unavailable",
		message: "Run chains are not available.",
	},
	{
		targets: []error{runchains.ErrManagedRuntimeUnavailable, runchains.ErrManagedRuntimeRequired},
		status:  http.StatusServiceUnavailable,
		code:    "managed_run_chain_unavailable",
		message: "Managed run-chain steps are not available.",
	},
	{
		targets: []error{runchains.ErrExternalRuntimeUnavailable},
		status:  http.StatusServiceUnavailable,
		code:    "external_run_chain_unavailable",
		message: "External-agent run-chain steps are not available.",
	},
	{
		targets: []error{runchains.ErrSupportedStepEngineRequired, externalagents.ErrExternalAgentEngineRequired},
		status:  http.StatusBadRequest,
		code:    "run_chain_engine_unsupported",
		message: "Run chain steps must use a Setta LLM or external-agent engine config.",
	},
	{
		targets: []error{agentprofiles.ErrProfileNotFound},
		status:  http.StatusNotFound,
		code:    "agent_profile_not_found",
		message: "Agent profile not found.",
	},
	{
		targets: []error{agentruns.ErrEngineConfigNotFound},
		status:  http.StatusBadRequest,
		code:    "engine_config_not_found",
		message: "Engine config not found.",
	},
	{
		targets: []error{externalagentconfigs.ErrConfigNotFound},
		status:  http.StatusBadRequest,
		code:    "external_agent_config_not_found",
		message: "External agent config not found.",
	},
	{
		targets: []error{agentruns.ErrRunNotFound},
		status:  http.StatusNotFound,
		code:    "run_chain_not_found",
		message: "Run chain not found.",
	},
}

func resolveRouteErrorMapping(err error, mappings []routeErrorMapping) (routeErrorMapping, bool) {
	for _, mapping := range mappings {
		for _, target := range mapping.targets {
			if errors.Is(err, target) {
				return mapping, true
			}
		}
	}
	return routeErrorMapping{}, false
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

func runChainInvalidInputMessage(err error) string {
	message := strings.TrimSpace(err.Error())
	message = strings.TrimPrefix(message, runchains.ErrInvalidRunChainInput.Error())
	message = strings.TrimSpace(strings.TrimPrefix(message, ":"))
	if message == "" {
		return "Invalid run chain inputs."
	}
	return message
}

func writeRunChainError(w http.ResponseWriter, r *http.Request, err error) bool {
	var preflightErr *externalagents.PreflightUnavailableError
	if mapping, ok := resolveRouteErrorMapping(err, runChainRouteErrorMappings); ok {
		writeError(w, r, mapping.status, mapping.code, mapping.message)
		return true
	}
	if errors.Is(err, runchains.ErrInvalidRunChainInput) {
		writeError(w, r, http.StatusBadRequest, "invalid_run_chain_inputs", runChainInvalidInputMessage(err))
		return true
	}
	if errors.As(err, &preflightErr) {
		writeError(w, r, http.StatusServiceUnavailable, "external_agent_preflight_failed", preflightErr.Error())
		return true
	}
	return false
}
