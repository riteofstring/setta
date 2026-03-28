package httpapi

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedllm"
	"setta/internal/modes"
	"setta/internal/realtime"
)

const RouteGetEngineConfigs = "/getEngineConfigs"
const RouteGetEngineConfig = "/getEngineConfig"
const RouteCreateEngineConfig = "/createEngineConfig"
const RouteUpdateEngineConfig = "/updateEngineConfig"
const RouteDeleteEngineConfig = "/deleteEngineConfig"

type EngineConfigRouteDependencies struct {
	ModePolicy   modes.Policy
	Engines      *agentruns.EngineStore
	LLM          *llmconfig.Runtime
	WebsocketHub *realtime.WebsocketHub
}

type GetEngineConfigRequest struct {
	ConfigID string `json:"configId"`
}

type CreateEngineConfigRequest struct {
	Name                  *string                         `json:"name"`
	EngineType            *agentruns.EngineType           `json:"engineType"`
	SettaLLMConfigID      *string                         `json:"settaLlmConfigId"`
	ExternalAgentConfigID *string                         `json:"externalAgentConfigId"`
	Defaults              *agentruns.EngineConfigDefaults `json:"defaults"`
}

type updateEngineConfigRequest struct {
	Config *updateEngineConfigPayload `json:"config"`
}

type DeleteEngineConfigRequest struct {
	ConfigID string `json:"configId"`
}

type updateEngineConfigPayload struct {
	ID                    *string                         `json:"id"`
	Name                  *string                         `json:"name"`
	EngineType            *agentruns.EngineType           `json:"engineType"`
	SettaLLMConfigID      *string                         `json:"settaLlmConfigId"`
	ExternalAgentConfigID *string                         `json:"externalAgentConfigId"`
	Defaults              *agentruns.EngineConfigDefaults `json:"defaults"`
	RuntimeSupport        *agentruns.EngineRuntimeSupport `json:"runtimeSupport"`
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
	if deps.ModePolicy.IsIDE() && deps.WebsocketHub == nil {
		return fmt.Errorf("websocket hub is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetEngineConfigs, getEngineConfigsHandler(deps.Engines, deps.LLM))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetEngineConfig, getEngineConfigHandler(deps.Engines, deps.LLM))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateEngineConfig, createEngineConfigHandler(deps.Engines, deps.LLM, deps.WebsocketHub))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateEngineConfig, updateEngineConfigHandler(deps.Engines, deps.LLM, deps.WebsocketHub))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteEngineConfig, deleteEngineConfigHandler(deps.Engines, deps.LLM, deps.WebsocketHub))
	return nil
}

func getEngineConfigsHandler(store *agentruns.EngineStore, llm *llmconfig.Runtime) http.HandlerFunc {
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
		writeJSON(w, http.StatusOK, enrichEngineConfigs(configs, llm))
	}
}

func getEngineConfigHandler(store *agentruns.EngineStore, llm *llmconfig.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[GetEngineConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		configID := strings.TrimSpace(payload.ConfigID)
		if configID == "" {
			writeError(w, r, http.StatusBadRequest, "config_id_required", "Config id is required.")
			return
		}
		config, err := store.Get(configID)
		if err != nil {
			if writeEngineConfigStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, enrichEngineConfig(config, llm))
	}
}

func createEngineConfigHandler(store *agentruns.EngineStore, llm *llmconfig.Runtime, websocketHub *realtime.WebsocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil || websocketHub == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[CreateEngineConfigRequest](r)
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
		if err := broadcastEngineConfigsUpdated(r.Context(), store, llm, websocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, enrichEngineConfig(created, llm))
	}
}

func updateEngineConfigHandler(store *agentruns.EngineStore, llm *llmconfig.Runtime, websocketHub *realtime.WebsocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil || websocketHub == nil {
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

		config, routeErr := buildUpdatedEngineConfig(payload.Config)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		updated, err := store.Update(config)
		if err != nil {
			if !writeEngineConfigStoreError(w, r, err) {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			}
			return
		}
		if err := broadcastEngineConfigsUpdated(r.Context(), store, llm, websocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, enrichEngineConfig(updated, llm))
	}
}

func deleteEngineConfigHandler(store *agentruns.EngineStore, llm *llmconfig.Runtime, websocketHub *realtime.WebsocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil || websocketHub == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[DeleteEngineConfigRequest](r)
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
		if err := broadcastEngineConfigsUpdated(r.Context(), store, llm, websocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func broadcastEngineConfigsUpdated(ctx context.Context, store *agentruns.EngineStore, llm *llmconfig.Runtime, websocketHub *realtime.WebsocketHub) error {
	configs, err := store.List()
	if err != nil {
		return err
	}
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewEngineConfigsUpdatedMessage(enrichEngineConfigs(configs, llm)),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func buildCreatedEngineConfig(payload CreateEngineConfigRequest) (agentruns.EngineConfig, *engineConfigRouteError) {
	if payload.Name == nil {
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

func buildUpdatedEngineConfig(payload *updateEngineConfigPayload) (agentruns.EngineConfig, *engineConfigRouteError) {
	if payload == nil {
		return agentruns.EngineConfig{}, &engineConfigRouteError{
			Status:  http.StatusBadRequest,
			Code:    "engine_config_required",
			Message: "Engine config is required.",
		}
	}
	if payload.Name == nil {
		return agentruns.EngineConfig{}, &engineConfigRouteError{
			Status:  http.StatusBadRequest,
			Code:    "invalid_engine_config",
			Message: fmt.Sprintf("%v: engine config name is required", agentruns.ErrInvalidEngineConfig),
		}
	}
	config := agentruns.EngineConfig{
		Name: *payload.Name,
	}
	if payload.ID != nil {
		config.ID = *payload.ID
	}
	if payload.EngineType != nil {
		config.EngineType = *payload.EngineType
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

func enrichEngineConfigs(configs []agentruns.EngineConfig, llm *llmconfig.Runtime) []agentruns.EngineConfig {
	if len(configs) == 0 {
		return []agentruns.EngineConfig{}
	}
	enriched := make([]agentruns.EngineConfig, 0, len(configs))
	for _, config := range configs {
		enriched = append(enriched, enrichEngineConfig(config, llm))
	}
	return enriched
}

func enrichEngineConfig(config agentruns.EngineConfig, llm *llmconfig.Runtime) agentruns.EngineConfig {
	enriched := config
	enriched.RuntimeSupport = &agentruns.EngineRuntimeSupport{
		Thinking: engineConfigSupportsThinking(config, llm),
	}
	return enriched
}

func engineConfigSupportsThinking(config agentruns.EngineConfig, llm *llmconfig.Runtime) bool {
	switch config.EngineType {
	case agentruns.EngineTypeExternalAgent:
		return true
	case agentruns.EngineTypeSettaLLM:
		if llm == nil {
			return false
		}
		resolvedConfig, err := agentruns.ResolveManagedLLMConfig(config, llm.Configs())
		if err != nil {
			return false
		}
		return managedllm.SupportsThinkingOutput(resolvedConfig)
	default:
		return false
	}
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
