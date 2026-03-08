package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/externalagentconfigs"
	"setta/internal/modes"
)

const RouteGetExternalAgentConfigs = "/getExternalAgentConfigs"
const RouteGetExternalAgentConfig = "/getExternalAgentConfig"
const RouteGetExternalAgentHealth = "/getExternalAgentHealth"
const RouteCreateExternalAgentConfig = "/createExternalAgentConfig"
const RouteUpdateExternalAgentConfig = "/updateExternalAgentConfig"
const RouteDeleteExternalAgentConfig = "/deleteExternalAgentConfig"

type ExternalAgentConfigRouteDependencies struct {
	ModePolicy modes.Policy
	Configs    *externalagentconfigs.Service
	Preflight  externalagentconfigs.Checker
}

type createExternalAgentConfigRequest struct {
	Name                    *string                                    `json:"name"`
	Description             *string                                    `json:"description"`
	ToolType                *externalagentconfigs.ToolType             `json:"toolType"`
	PluginAdapterID         *string                                    `json:"pluginAdapterId"`
	RunMode                 *externalagentconfigs.RunMode              `json:"runMode"`
	CommandPath             *string                                    `json:"commandPath"`
	BaseURL                 *string                                    `json:"baseUrl"`
	DefaultModel            *string                                    `json:"defaultModel"`
	SandboxPolicy           *string                                    `json:"sandboxPolicy"`
	ApprovalPolicy          *string                                    `json:"approvalPolicy"`
	SettingsMode            *externalagentconfigs.SettingsMode         `json:"settingsMode"`
	SettingsSources         []string                                   `json:"settingsSources"`
	SettingsFilePath        *string                                    `json:"settingsFilePath"`
	SettingsManagedBlock    *externalagentconfigs.SettingsManagedBlock `json:"settingsManagedBlock"`
	SettingsAllowSettaEdits *bool                                      `json:"settingsAllowSettaEdits"`
	EnvVarWhitelist         []string                                   `json:"envVarWhitelist"`
	WorkingDirStrategy      *externalagentconfigs.WorkingDirStrategy   `json:"workingDirStrategy"`
	WorkingDir              *string                                    `json:"workingDir"`
	CodexSkipGitRepoCheck   *bool                                      `json:"codexSkipGitRepoCheck"`
}

type getExternalAgentConfigRequest struct {
	ConfigID string `json:"configId"`
}

type updateExternalAgentConfigRequest struct {
	Config *externalagentconfigs.Config `json:"config"`
}

type deleteExternalAgentConfigRequest struct {
	ConfigID string `json:"configId"`
}

type externalAgentEnvVarStatusResponse struct {
	Present []string `json:"present"`
	Missing []string `json:"missing"`
}

type externalAgentHealthResponse struct {
	ConfigID    string                            `json:"configId"`
	Name        string                            `json:"name"`
	ToolType    externalagentconfigs.ToolType     `json:"toolType"`
	RunMode     externalagentconfigs.RunMode      `json:"runMode"`
	Supported   bool                              `json:"supported"`
	Available   bool                              `json:"available"`
	Issues      []string                          `json:"issues"`
	NodePath    *string                           `json:"nodePath"`
	NodeVersion *string                           `json:"nodeVersion"`
	SDKVersion  *string                           `json:"sdkVersion"`
	CLIVersion  *string                           `json:"cliVersion"`
	BaseURL     *string                           `json:"baseUrl"`
	WorkingDir  *string                           `json:"workingDir"`
	EnvVars     externalAgentEnvVarStatusResponse `json:"envVars"`
}

func RegisterExternalAgentConfigRoutes(router chi.Router, deps ExternalAgentConfigRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Configs == nil {
		return fmt.Errorf("external agent config service is required in ide mode")
	}
	if deps.ModePolicy.IsIDE() && deps.Preflight == nil {
		return fmt.Errorf("external agent preflight checker is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetExternalAgentConfigs, getExternalAgentConfigsHandler(deps.Configs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetExternalAgentConfig, getExternalAgentConfigHandler(deps.Configs))
	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetExternalAgentHealth, getExternalAgentHealthHandler(deps.Configs, deps.Preflight))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateExternalAgentConfig, createExternalAgentConfigHandler(deps.Configs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateExternalAgentConfig, updateExternalAgentConfigHandler(deps.Configs))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteExternalAgentConfig, deleteExternalAgentConfigHandler(deps.Configs))
	return nil
}

func getExternalAgentConfigsHandler(service *externalagentconfigs.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		configs, err := service.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, configs)
	}
}

func getExternalAgentConfigHandler(service *externalagentconfigs.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[getExternalAgentConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		configID := strings.TrimSpace(payload.ConfigID)
		if configID == "" {
			writeError(w, r, http.StatusBadRequest, "config_id_required", "Config id is required.")
			return
		}
		config, err := service.Get(configID)
		if err != nil {
			if writeExternalAgentConfigServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, config)
	}
}

func getExternalAgentHealthHandler(service *externalagentconfigs.Service, checker externalagentconfigs.Checker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil || checker == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		configs, err := service.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		statuses := make([]externalAgentHealthResponse, 0, len(configs))
		for _, config := range configs {
			status, err := checker.Check(config)
			if err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			statuses = append(statuses, buildExternalAgentHealthResponse(status))
		}
		writeJSON(w, http.StatusOK, statuses)
	}
}

func createExternalAgentConfigHandler(service *externalagentconfigs.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[createExternalAgentConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		config := buildCreatedExternalAgentConfig(payload)
		created, err := service.Create(config)
		if err != nil {
			if writeExternalAgentConfigServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, created)
	}
}

func updateExternalAgentConfigHandler(service *externalagentconfigs.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[updateExternalAgentConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if payload.Config == nil {
			writeError(w, r, http.StatusBadRequest, "external_agent_config_required", "External agent config is required.")
			return
		}
		if strings.TrimSpace(payload.Config.ID) == "" {
			writeError(w, r, http.StatusBadRequest, "config_id_required", "Config id is required.")
			return
		}

		updated, err := service.Update(*payload.Config)
		if err != nil {
			if writeExternalAgentConfigServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteExternalAgentConfigHandler(service *externalagentconfigs.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[deleteExternalAgentConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		configID := strings.TrimSpace(payload.ConfigID)
		if configID == "" {
			writeError(w, r, http.StatusBadRequest, "config_id_required", "Config id is required.")
			return
		}
		if err := service.Delete(configID); err != nil {
			if writeExternalAgentConfigServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func buildExternalAgentHealthResponse(status externalagentconfigs.Status) externalAgentHealthResponse {
	response := externalAgentHealthResponse{
		ConfigID:   status.ConfigID,
		Name:       status.Name,
		ToolType:   status.ToolType,
		RunMode:    status.RunMode,
		Supported:  status.Supported,
		Available:  status.Available,
		Issues:     append([]string(nil), status.Issues...),
		BaseURL:    cloneOptionalString(status.BaseURL),
		WorkingDir: cloneOptionalString(status.WorkingDir),
		EnvVars: externalAgentEnvVarStatusResponse{
			Present: []string{},
			Missing: []string{},
		},
	}
	if status.ToolType == externalagentconfigs.ToolTypeOpenCode {
		response.NodePath = cloneOptionalString(status.CommandPath)
	}
	return response
}

func buildCreatedExternalAgentConfig(payload createExternalAgentConfigRequest) externalagentconfigs.Config {
	config := externalagentconfigs.Config{
		ID: newExternalAgentConfigID(),
	}
	if payload.Name != nil {
		config.Name = *payload.Name
	}
	if payload.Description != nil {
		config.Description = *payload.Description
	}
	if payload.ToolType != nil {
		config.ToolType = *payload.ToolType
	}
	config.PluginAdapterID = cloneOptionalString(payload.PluginAdapterID)
	if payload.RunMode != nil {
		config.RunMode = *payload.RunMode
	}
	config.CommandPath = cloneOptionalString(payload.CommandPath)
	config.BaseURL = cloneOptionalString(payload.BaseURL)
	config.DefaultModel = cloneOptionalString(payload.DefaultModel)
	config.SandboxPolicy = cloneOptionalString(payload.SandboxPolicy)
	config.ApprovalPolicy = cloneOptionalString(payload.ApprovalPolicy)
	if payload.SettingsMode != nil {
		config.SettingsMode = *payload.SettingsMode
	}
	if payload.SettingsSources != nil {
		config.SettingsSources = append([]string(nil), payload.SettingsSources...)
	}
	config.SettingsFilePath = cloneOptionalString(payload.SettingsFilePath)
	config.SettingsManagedBlock = cloneExternalAgentSettingsManagedBlock(payload.SettingsManagedBlock)
	if payload.SettingsAllowSettaEdits == nil {
		config.SettingsAllowSettaEdits = true
	} else {
		config.SettingsAllowSettaEdits = *payload.SettingsAllowSettaEdits
	}
	if payload.EnvVarWhitelist != nil {
		config.EnvVarWhitelist = append([]string(nil), payload.EnvVarWhitelist...)
	}
	if payload.WorkingDirStrategy != nil {
		config.WorkingDirStrategy = *payload.WorkingDirStrategy
	}
	config.WorkingDir = cloneOptionalString(payload.WorkingDir)
	config.CodexSkipGitRepoCheck = cloneOptionalBool(payload.CodexSkipGitRepoCheck)
	return config
}

func writeExternalAgentConfigServiceError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, externalagentconfigs.ErrInvalidConfig):
		writeError(w, r, http.StatusBadRequest, "invalid_external_agent_config", err.Error())
	case errors.Is(err, externalagentconfigs.ErrConfigNotFound):
		writeError(w, r, http.StatusNotFound, "external_agent_config_not_found", "External agent config not found.")
	default:
		return false
	}
	return true
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneOptionalBool(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneExternalAgentSettingsManagedBlock(
	value *externalagentconfigs.SettingsManagedBlock,
) *externalagentconfigs.SettingsManagedBlock {
	if value == nil {
		return nil
	}
	cloned := &externalagentconfigs.SettingsManagedBlock{}
	if value.Claude != nil {
		cloned.Claude = cloneJSONMap(value.Claude)
	}
	if value.Codex != nil {
		cloned.Codex = cloneJSONMap(value.Codex)
	}
	if value.OpenCode != nil {
		cloned.OpenCode = &externalagentconfigs.OpenCodeSettingsBlock{
			MCP:        cloneJSONMap(value.OpenCode.MCP),
			Model:      cloneOptionalString(value.OpenCode.Model),
			Permission: cloneJSONValue(value.OpenCode.Permission),
		}
	}
	return cloned
}

func cloneJSONMap(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	cloned := make(map[string]any, len(value))
	for key, entry := range value {
		cloned[key] = cloneJSONValue(entry)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return cloneJSONMap(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, cloneJSONValue(entry))
		}
		return cloned
	default:
		return typed
	}
}

func newExternalAgentConfigID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("external-agent-config-%d", time.Now().UnixNano())
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
