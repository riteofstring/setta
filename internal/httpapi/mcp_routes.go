package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/mcpx"
	"setta/internal/modes"
)

const RouteMCPServerRuntimeStatus = "/mcpServerRuntimeStatus"

type MCPRouteDependencies struct {
	ModePolicy               modes.Policy
	LLMConfigPath            string
	ActiveSettaFilesLocation string
	Client                   MCPStatusProvider
	ExternalStatusProvider   ExternalMCPStatusProvider
}

type MCPStatusProvider interface {
	RuntimeStatuses() []mcpx.ServerRuntimeStatus
}

type ExternalMCPStatusProvider interface {
	Disabled() bool
	ExternalRuntimeStatuses(chatID *string, engineConfigID *string) ([]mcpx.ServerRuntimeStatus, error)
}

type MCPRuntimeStatusRequest struct {
	ChatID         *string `json:"chatId"`
	EngineConfigID *string `json:"engineConfigId"`
}

type MCPRuntimeStatusResponse struct {
	LLMConfigPath            string                     `json:"llmConfigPath"`
	ActiveSettaFilesLocation string                     `json:"activeSettaFilesLocation"`
	Servers                  []mcpx.ServerRuntimeStatus `json:"servers"`
	ExternalServers          []mcpx.ServerRuntimeStatus `json:"externalServers"`
}

func RegisterMCPRoutes(router chi.Router, deps MCPRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.LLMConfigPath == "" {
		return fmt.Errorf("llm config path is required")
	}

	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(
		RouteMCPServerRuntimeStatus,
		mcpRuntimeStatusHandler(deps),
	)
	return nil
}

func mcpRuntimeStatusHandler(deps MCPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MCPRuntimeStatusRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		servers := []mcpx.ServerRuntimeStatus{}
		if deps.Client != nil {
			servers = deps.Client.RuntimeStatuses()
		}

		externalServers, err := externalRuntimeStatuses(payload, deps.ExternalStatusProvider)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Failed to read external MCP runtime status.")
			return
		}

		writeJSON(w, http.StatusOK, MCPRuntimeStatusResponse{
			LLMConfigPath:            deps.LLMConfigPath,
			ActiveSettaFilesLocation: deps.ActiveSettaFilesLocation,
			Servers:                  servers,
			ExternalServers:          externalServers,
		})
	}
}

func externalRuntimeStatuses(request MCPRuntimeStatusRequest, provider ExternalMCPStatusProvider) ([]mcpx.ServerRuntimeStatus, error) {
	if provider == nil || provider.Disabled() {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	return provider.ExternalRuntimeStatuses(request.ChatID, request.EngineConfigID)
}
