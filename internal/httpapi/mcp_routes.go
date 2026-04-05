package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/mcpx"
	"setta/internal/modes"
)

const RouteMCPServerRuntimeStatus = "/mcpServerRuntimeStatus"

type MCPRouteDependencies struct {
	Logger                   *slog.Logger
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
	ResolvedServers          []MCPResolvedRuntimeServer `json:"resolvedServers"`
}

func RegisterMCPRoutes(router chi.Router, deps MCPRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.LLMConfigPath == "" {
		return fmt.Errorf("llm config path is required")
	}

	registerOpenAPIPost[MCPRuntimeStatusRequest, MCPRuntimeStatusResponse](
		router.With(RequireFullIDERuntime(deps.ModePolicy)),
		"getMcpServerRuntimeStatus",
		RouteMCPServerRuntimeStatus,
		mcpRuntimeStatusHandler(deps),
		withOpenAPITags("MCP"),
		withOpenAPISummary("Get current MCP runtime status for configured and external servers."),
		withOpenAPIModeRequirement("full-ide"),
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
			if deps.Logger != nil {
				deps.Logger.Debug(
					"failed to resolve MCP runtime status",
					slog.String("trace_event", "mcp_runtime_status_failed"),
					slog.String("request_id", requestIDFromContext(r.Context())),
					slog.String("chat_id", normalizeOptionalString(payload.ChatID)),
					slog.String("engine_config_id", normalizeOptionalString(payload.EngineConfigID)),
					slog.String("error", err.Error()),
				)
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Failed to read external MCP runtime status.")
			return
		}
		resolvedServers := resolveMCPRuntimeDisplayServers(servers, externalServers)
		if deps.Logger != nil {
			deps.Logger.Debug(
				"resolved MCP runtime status",
				slog.String("trace_event", "mcp_runtime_status_resolved"),
				slog.String("request_id", requestIDFromContext(r.Context())),
				slog.String("chat_id", normalizeOptionalString(payload.ChatID)),
				slog.String("engine_config_id", normalizeOptionalString(payload.EngineConfigID)),
				slog.Int("setta_server_count", len(servers)),
				slog.Int("external_server_count", len(externalServers)),
				slog.Int("resolved_server_count", len(resolvedServers)),
			)
		}

		writeJSON(w, http.StatusOK, MCPRuntimeStatusResponse{
			LLMConfigPath:            deps.LLMConfigPath,
			ActiveSettaFilesLocation: deps.ActiveSettaFilesLocation,
			Servers:                  servers,
			ExternalServers:          externalServers,
			ResolvedServers:          resolvedServers,
		})
	}
}

func externalRuntimeStatuses(request MCPRuntimeStatusRequest, provider ExternalMCPStatusProvider) ([]mcpx.ServerRuntimeStatus, error) {
	if provider == nil || provider.Disabled() {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	return provider.ExternalRuntimeStatuses(request.ChatID, request.EngineConfigID)
}

func normalizeOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
