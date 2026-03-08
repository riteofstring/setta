package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/modes"
)

const RouteGetEngineConfigs = "/getEngineConfigs"
const RouteUpdateEngineConfig = "/updateEngineConfig"

type EngineConfigRouteDependencies struct {
	ModePolicy modes.Policy
	Engines    *agentruns.EngineStore
}

type updateEngineConfigRequest struct {
	Config *agentruns.EngineConfig `json:"config"`
}

func RegisterEngineConfigRoutes(router chi.Router, deps EngineConfigRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Engines == nil {
		return fmt.Errorf("engine config store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetEngineConfigs, getEngineConfigsHandler(deps.Engines))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateEngineConfig, updateEngineConfigHandler(deps.Engines))
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

func updateEngineConfigHandler(store *agentruns.EngineStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[updateEngineConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if payload.Config == nil {
			writeError(w, r, http.StatusBadRequest, "engine_config_required", "Engine config is required.")
			return
		}

		config, err := store.Update(*payload.Config)
		if err != nil {
			switch {
			case errors.Is(err, agentruns.ErrInvalidEngineConfig):
				writeError(w, r, http.StatusBadRequest, "invalid_engine_config", err.Error())
			case errors.Is(err, agentruns.ErrEngineConfigNotFound):
				writeError(w, r, http.StatusNotFound, "engine_config_not_found", "Engine config not found.")
			default:
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		writeJSON(w, http.StatusOK, config)
	}
}
