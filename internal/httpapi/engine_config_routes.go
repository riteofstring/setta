package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/modes"
)

const RouteGetEngineConfigs = "/getEngineConfigs"

type EngineConfigRouteDependencies struct {
	ModePolicy modes.Policy
	Engines    *agentruns.EngineStore
}

func RegisterEngineConfigRoutes(router chi.Router, deps EngineConfigRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Engines == nil {
		return fmt.Errorf("engine config store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetEngineConfigs, getEngineConfigsHandler(deps.Engines))
	return nil
}

func getEngineConfigsHandler(store *agentruns.EngineStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		configs, err := store.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, configs)
	}
}
