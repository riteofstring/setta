package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/modes"
)

const RouteGetEngineConfigs = "/getEngineConfigs"
const RouteCreateEngineConfig = "/createEngineConfig"
const RouteUpdateEngineConfig = "/updateEngineConfig"
const RouteDeleteEngineConfig = "/deleteEngineConfig"

type EngineConfigRouteDependencies struct {
	ModePolicy modes.Policy
	Engines    *agentruns.EngineStore
}

type createEngineConfigRequest struct {
	Name                  *string                         `json:"name"`
	EngineType            *agentruns.EngineType           `json:"engineType"`
	SettaLLMConfigID      *string                         `json:"settaLlmConfigId"`
	ExternalAgentConfigID *string                         `json:"externalAgentConfigId"`
	Defaults              *agentruns.EngineConfigDefaults `json:"defaults"`
}

type updateEngineConfigRequest struct {
	Config *agentruns.EngineConfig `json:"config"`
}

type deleteEngineConfigRequest struct {
	ConfigID string `json:"configId"`
}

type engineConfigRouteError struct {
	Status  int
	Code    string
	Message string
}

func RegisterEngineConfigRoutes(router chi.Router, deps EngineConfigRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Engines == nil {
		return fmt.Errorf("engine config store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetEngineConfigs, getEngineConfigsHandler(deps.Engines))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateEngineConfig, createEngineConfigHandler(deps.Engines))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateEngineConfig, updateEngineConfigHandler(deps.Engines))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteEngineConfig, deleteEngineConfigHandler(deps.Engines))
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

func createEngineConfigHandler(store *agentruns.EngineStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[createEngineConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		config, routeErr := buildCreatedEngineConfig(payload)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		created, err := store.Create(config)
		if err != nil {
			if writeEngineConfigStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, created)
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
			if !writeEngineConfigStoreError(w, r, err) {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		writeJSON(w, http.StatusOK, config)
	}
}

func deleteEngineConfigHandler(store *agentruns.EngineStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[deleteEngineConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		configID := strings.TrimSpace(payload.ConfigID)
		if configID == "" {
			writeError(w, r, http.StatusBadRequest, "config_id_required", "Config id is required.")
			return
		}
		if err := store.Delete(configID); err != nil {
			if !writeEngineConfigStoreError(w, r, err) {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func buildCreatedEngineConfig(payload createEngineConfigRequest) (agentruns.EngineConfig, *engineConfigRouteError) {
	if payload.Name == nil || strings.TrimSpace(*payload.Name) == "" {
		return agentruns.EngineConfig{}, &engineConfigRouteError{
			Status:  http.StatusBadRequest,
			Code:    "engine_config_name_required",
			Message: "Engine config name is required.",
		}
	}
	if payload.EngineType == nil || strings.TrimSpace(string(*payload.EngineType)) == "" {
		return agentruns.EngineConfig{}, &engineConfigRouteError{
			Status:  http.StatusBadRequest,
			Code:    "engine_type_required",
			Message: "Engine type is required.",
		}
	}

	config := agentruns.EngineConfig{
		ID:         newEngineConfigID(),
		Name:       *payload.Name,
		EngineType: *payload.EngineType,
	}
	if payload.SettaLLMConfigID != nil {
		config.SettaLLMConfigID = cloneOptionalString(payload.SettaLLMConfigID)
	}
	if payload.ExternalAgentConfigID != nil {
		config.ExternalAgentConfigID = cloneOptionalString(payload.ExternalAgentConfigID)
	}
	if payload.Defaults != nil {
		config.Defaults = *payload.Defaults
	}
	return config, nil
}

func writeEngineConfigStoreError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, agentruns.ErrInvalidEngineConfig):
		writeError(w, r, http.StatusBadRequest, "invalid_engine_config", err.Error())
	case errors.Is(err, agentruns.ErrEngineConfigNotFound):
		writeError(w, r, http.StatusNotFound, "engine_config_not_found", "Engine config not found.")
	default:
		return false
	}
	return true
}

func newEngineConfigID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("engine-config-%d", time.Now().UnixNano())
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
