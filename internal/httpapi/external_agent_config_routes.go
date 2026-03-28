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
	"setta/internal/deployments"
	"setta/internal/externalagentconfigs"
	"setta/internal/modes"
	"setta/internal/realtime"
)

const RouteGetExternalAgentConfigs = "/getExternalAgentConfigs"
const RouteGetExternalAgentConfig = "/getExternalAgentConfig"
const RouteGetExternalAgentHealth = "/getExternalAgentHealth"
const RouteCreateExternalAgentConfig = "/createExternalAgentConfig"
const RouteUpdateExternalAgentConfig = "/updateExternalAgentConfig"
const RouteDeleteExternalAgentConfig = "/deleteExternalAgentConfig"

type ExternalAgentConfigRouteDependencies struct {
	ModePolicy   modes.Policy
	Configs      *externalagentconfigs.Service
	Preflight    externalagentconfigs.Checker
	Deployment   *deployments.Runtime
	WebsocketHub *realtime.WebsocketHub
}

type createExternalAgentConfigRequest struct {
	Name                    *string                                     `json:"name"`
	Description             *string                                     `json:"description"`
	ToolType                *externalagentconfigs.ToolType              `json:"toolType"`
	RunMode                 *externalagentconfigs.RunMode               `json:"runMode"`
	CommandPath             *string                                     `json:"commandPath"`
	BaseURL                 *string                                     `json:"baseUrl"`
	DefaultModel            *string                                     `json:"defaultModel"`
	SandboxPolicy           *string                                     `json:"sandboxPolicy"`
	ApprovalPolicy          *string                                     `json:"approvalPolicy"`
	SettingsMode            *externalagentconfigs.SettingsMode          `json:"settingsMode"`
	SettingsSources         []externalagentconfigs.ClaudeSettingsSource `json:"settingsSources"`
	SettingsFilePath        *string                                     `json:"settingsFilePath"`
	SettingsManagedBlock    *externalagentconfigs.SettingsManagedBlock  `json:"settingsManagedBlock"`
	SettingsAllowSettaEdits *bool                                       `json:"settingsAllowSettaEdits"`
	EnvVarWhitelist         []string                                    `json:"envVarWhitelist"`
	WorkingDirStrategy      *externalagentconfigs.WorkingDirStrategy    `json:"workingDirStrategy"`
	WorkingDir              *string                                     `json:"workingDir"`
	CodexSkipGitRepoCheck   *bool                                       `json:"codexSkipGitRepoCheck"`
}

type GetExternalAgentConfigRequest struct {
	ConfigID string `json:"configId"`
}

type updateExternalAgentConfigRequest struct {
	Config *externalagentconfigs.Config `json:"config"`
}

type DeleteExternalAgentConfigRequest struct {
	ConfigID string `json:"configId"`
}

type ExternalAgentPreflightStatus struct {
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
	EnvVars     externalagentconfigs.EnvVarStatus `json:"envVars"`
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
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}
	if deps.ModePolicy.IsIDE() && deps.WebsocketHub == nil {
		return fmt.Errorf("websocket hub is required in ide mode")
	}

	router.Get(RouteGetExternalAgentConfigs, getExternalAgentConfigsHandler(deps))
	router.Post(RouteGetExternalAgentConfig, getExternalAgentConfigHandler(deps))
	router.Get(RouteGetExternalAgentHealth, getExternalAgentHealthHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateExternalAgentConfig, createExternalAgentConfigHandler(deps.Configs, deps.WebsocketHub))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateExternalAgentConfig, updateExternalAgentConfigHandler(deps.Configs, deps.WebsocketHub))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteExternalAgentConfig, deleteExternalAgentConfigHandler(deps.Configs, deps.WebsocketHub))
	return nil
}

func ensureExternalAgentConfigReadsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps ExternalAgentConfigRouteDependencies,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if err := requestInfo.Policy.RequireNotLauncher(); err != nil {
		if writeModesError(w, r, err) {
			return false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deps.Deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if deps.Deployment.Policy().AllowLLM {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"llm_access_forbidden",
		"Deployment policy disallows LLM access.",
	)
	return false
}

func getExternalAgentConfigsHandler(deps ExternalAgentConfigRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureExternalAgentConfigReadsAllowed(w, r, deps) {
			return
		}
		service := deps.Configs
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

func getExternalAgentConfigHandler(deps ExternalAgentConfigRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureExternalAgentConfigReadsAllowed(w, r, deps) {
			return
		}
		service := deps.Configs
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[GetExternalAgentConfigRequest](r)
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

func getExternalAgentHealthHandler(deps ExternalAgentConfigRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureExternalAgentConfigReadsAllowed(w, r, deps) {
			return
		}
		service := deps.Configs
		checker := deps.Preflight
		if service == nil || checker == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		configs, err := service.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		statuses := make([]ExternalAgentPreflightStatus, 0, len(configs))
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

func createExternalAgentConfigHandler(service *externalagentconfigs.Service, websocketHub *realtime.WebsocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil || websocketHub == nil {
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
		if err := broadcastExternalAgentConfigsUpdated(r.Context(), service, websocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, created)
	}
}

func updateExternalAgentConfigHandler(service *externalagentconfigs.Service, websocketHub *realtime.WebsocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil || websocketHub == nil {
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
		if err := broadcastExternalAgentConfigsUpdated(r.Context(), service, websocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteExternalAgentConfigHandler(service *externalagentconfigs.Service, websocketHub *realtime.WebsocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil || websocketHub == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[DeleteExternalAgentConfigRequest](r)
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
		if err := broadcastExternalAgentConfigsUpdated(r.Context(), service, websocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func broadcastExternalAgentConfigsUpdated(
	ctx context.Context,
	service *externalagentconfigs.Service,
	websocketHub *realtime.WebsocketHub,
) error {
	configs, err := service.List()
	if err != nil {
		return err
	}
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewExternalAgentConfigsUpdatedMessage(configs),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func buildExternalAgentHealthResponse(status externalagentconfigs.Status) ExternalAgentPreflightStatus {
	response := ExternalAgentPreflightStatus{
		ConfigID:    status.ConfigID,
		Name:        status.Name,
		ToolType:    status.ToolType,
		RunMode:     status.RunMode,
		Supported:   status.Supported,
		Available:   status.Available,
		Issues:      cloneStringSlice(status.Issues),
		BaseURL:     cloneOptionalString(status.BaseURL),
		WorkingDir:  cloneOptionalString(status.WorkingDir),
		NodeVersion: cloneOptionalString(status.NodeVersion),
		SDKVersion:  cloneOptionalString(status.SDKVersion),
		CLIVersion:  cloneOptionalString(status.CLIVersion),
		EnvVars: externalagentconfigs.EnvVarStatus{
			Present: cloneStringSlice(status.EnvVars.Present),
			Missing: cloneStringSlice(status.EnvVars.Missing),
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
		config.SettingsSources = append([]externalagentconfigs.ClaudeSettingsSource(nil), payload.SettingsSources...)
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

func cloneStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return append([]string(nil), values...)
}

func cloneExternalAgentSettingsManagedBlock(
	value *externalagentconfigs.SettingsManagedBlock,
) *externalagentconfigs.SettingsManagedBlock {
	if value == nil {
		return nil
	}
	cloned := &externalagentconfigs.SettingsManagedBlock{}
	if value.Claude != nil {
		cloned.Claude = &externalagentconfigs.ClaudeSettingsManaged{
			DefaultMode: cloneOptionalString(value.Claude.DefaultMode),
			MCP:         cloneJSONMap(value.Claude.MCP),
		}
		if value.Claude.Permissions != nil {
			cloned.Claude.Permissions = &externalagentconfigs.ClaudeSettingsPermissions{
				Allow: append([]string(nil), value.Claude.Permissions.Allow...),
				Ask:   append([]string(nil), value.Claude.Permissions.Ask...),
				Deny:  append([]string(nil), value.Claude.Permissions.Deny...),
			}
		}
	}
	if value.Codex != nil {
		cloned.Codex = cloneJSONMap(value.Codex)
	}
	if value.OpenCode != nil {
		cloned.OpenCode = &externalagentconfigs.OpenCodeSettingsManaged{
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
