package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/modes"
)

const RouteGetAgentRuns = "/getAgentRuns"
const RouteGetAgentRun = "/getAgentRun"

type AgentRunRouteDependencies struct {
	ModePolicy modes.Policy
	Runs       *agentruns.RunStore
}

type getAgentRunRequest struct {
	RunID string `json:"runId"`
}

func RegisterAgentRunRoutes(router chi.Router, deps AgentRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Runs == nil {
		return fmt.Errorf("agent run store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetAgentRuns, getAgentRunsHandler(deps.Runs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetAgentRun, getAgentRunHandler(deps.Runs))
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
