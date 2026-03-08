package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/modes"
)

const RouteGetAgentRuns = "/getAgentRuns"

type AgentRunRouteDependencies struct {
	ModePolicy modes.Policy
	Runs       *agentruns.RunStore
}

func RegisterAgentRunRoutes(router chi.Router, deps AgentRunRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Runs == nil {
		return fmt.Errorf("agent run store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetAgentRuns, getAgentRunsHandler(deps.Runs))
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
