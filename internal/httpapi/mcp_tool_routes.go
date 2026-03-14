package httpapi

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/mcpx"
	"setta/internal/modes"
)

const RouteMCPToolCall = "/__setta__/tools/call"

type MCPRootRouteDependencies struct {
	ModePolicy modes.Policy
	Server     *mcpx.Server
}

type MCPToolCallRequest struct {
	Tool           string               `json:"tool"`
	Arguments      map[string]any       `json:"arguments"`
	AgenticContext *mcpx.AgenticContext `json:"agenticContext,omitempty"`
}

func RegisterMCPRootRoutes(router chi.Router, deps MCPRootRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Server == nil {
		return fmt.Errorf("mcp server is required")
	}

	router.With(RequireFullIDERuntime(deps.ModePolicy)).Post(RouteMCPToolCall, mcpToolCallHandler(deps))
	return nil
}

func mcpToolCallHandler(deps MCPRootRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MCPToolCallRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		toolName := strings.TrimSpace(payload.Tool)
		if toolName == "" {
			writeError(w, r, http.StatusBadRequest, "invalid_tool_name", "tool must be a non-empty string.")
			return
		}
		if strings.Contains(toolName, mcpx.ToolNameSeparator) {
			writeError(w, r, http.StatusBadRequest, "invalid_tool_name", "tool must be a bare MCP tool name.")
			return
		}

		result, err := deps.Server.InvokeTool(r.Context(), toolName, payload.Arguments, mcpx.ToolRequestContext{
			SessionKey: buildRequestID(),
			Headers:    r.Header.Clone(),
			Meta:       agenticContextMeta(payload.AgenticContext),
		})
		if err != nil {
			writeError(w, r, http.StatusNotFound, "tool_not_found", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func agenticContextMeta(value *mcpx.AgenticContext) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	meta := map[string]any{
		"projectConfigId": value.ProjectConfigID,
	}
	if value.ChatID != "" {
		meta["chatId"] = value.ChatID
	}
	if value.SectionID != "" {
		meta["sectionId"] = value.SectionID
	}
	if value.FrontendAffinityToken != "" {
		meta["frontendAffinityToken"] = value.FrontendAffinityToken
	}
	if value.AllowUnscoped {
		meta["allowUnscoped"] = true
	}
	return meta
}
