package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/externalagentconfigs"
	"setta/internal/modes"
)

const RouteGetExternalAgentConfigs = "/getExternalAgentConfigs"
const RouteGetExternalAgentHealth = "/getExternalAgentHealth"

type ExternalAgentConfigRouteDependencies struct {
	ModePolicy modes.Policy
	Configs    *externalagentconfigs.Store
	Preflight  externalagentconfigs.Checker
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
		return fmt.Errorf("external agent config store is required in ide mode")
	}
	if deps.ModePolicy.IsIDE() && deps.Preflight == nil {
		return fmt.Errorf("external agent preflight checker is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetExternalAgentConfigs, getExternalAgentConfigsHandler(deps.Configs))
	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetExternalAgentHealth, getExternalAgentHealthHandler(deps.Configs, deps.Preflight))
	return nil
}

func getExternalAgentConfigsHandler(store *externalagentconfigs.Store) http.HandlerFunc {
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

func getExternalAgentHealthHandler(store *externalagentconfigs.Store, checker externalagentconfigs.Checker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil || checker == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		configs, err := store.List()
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

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
