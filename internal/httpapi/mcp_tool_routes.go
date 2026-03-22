package httpapi

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

const RouteMCPToolCall = "/__setta__/tools/call"

type MCPRootRouteDependencies struct {
	ModePolicy   modes.Policy
	Server       *mcpx.Server
	ProjectState *projectstate.Runtime
	WebsocketHub *realtime.WebsocketHub
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

		summary, err := deps.Server.InvokeToolWithSummary(r.Context(), toolName, payload.Arguments, mcpx.ToolRequestContext{
			SessionKey:                   buildRequestID(),
			Headers:                      r.Header.Clone(),
			Meta:                         agenticContextMeta(payload.AgenticContext),
			AllowRequestMetaShareSession: true,
		})
		if err != nil {
			writeError(w, r, http.StatusNotFound, "tool_not_found", err.Error())
			return
		}
		if summary.ProjectStateRevisionChanged {
			if err := broadcastMCPToolProjectStateUpdate(r, deps, summary.ResolvedProjectConfigID); err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}
		writeJSON(w, http.StatusOK, summary.Result)
	}
}

func broadcastMCPToolProjectStateUpdate(
	r *http.Request,
	deps MCPRootRouteDependencies,
	projectConfigID string,
) error {
	if deps.ProjectState == nil || deps.WebsocketHub == nil {
		return nil
	}
	projectConfigID = strings.TrimSpace(projectConfigID)
	if projectConfigID == "" {
		return nil
	}

	snapshot := deps.ProjectState.Snapshot()
	projectStateView, err := projectview.SingleConfigByProjectID(
		snapshot.Document,
		projectConfigID,
	)
	if err != nil {
		return err
	}
	status := deps.ProjectState.FrontendOpStatus()
	_, err = deps.WebsocketHub.BroadcastJSON(
		r.Context(),
		realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
			ProjectState:   projectStateView,
			CompletedOpIDs: status.Completed,
			PendingOpIDs:   status.Pending,
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func agenticContextMeta(value *mcpx.AgenticContext) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	meta := map[string]any{
		"projectConfigId": value.ProjectConfigID,
	}
	if value.ShareSessionID != "" {
		meta["shareSessionId"] = value.ShareSessionID
	}
	if value.ChatID != "" {
		meta["chatId"] = value.ChatID
	}
	if value.RunID != "" {
		meta["runId"] = value.RunID
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
