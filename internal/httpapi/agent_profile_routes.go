package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/modes"
)

const RouteGetAgentProfiles = "/getAgentProfiles"

type AgentProfileRouteDependencies struct {
	ModePolicy modes.Policy
	Profiles   *agentprofiles.Store
}

func RegisterAgentProfileRoutes(router chi.Router, deps AgentProfileRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Profiles == nil {
		return fmt.Errorf("agent profile store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetAgentProfiles, getAgentProfilesHandler(deps.Profiles))
	return nil
}

func getAgentProfilesHandler(store *agentprofiles.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		profiles, err := store.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, profiles)
	}
}
