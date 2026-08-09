package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const RouteGetAgenticSummaryCacheStatus = "/getAgenticSummaryCacheStatus"

type GetAgenticSummaryCacheStatusRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
	ChatSectionID   string `json:"chatSectionId"`
}

type AgenticSummaryCacheRouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
	Statuses     *agenticsummarycache.Service
}

func RegisterAgenticSummaryCacheRoutes(router chi.Router, deps AgenticSummaryCacheRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && !openAPIDocumentOnlyFromRouter(router) {
		if deps.ProjectState == nil {
			return fmt.Errorf("project state runtime is required in ide mode")
		}
		if deps.Statuses == nil {
			return fmt.Errorf("agentic summary cache service is required in ide mode")
		}
	}

	registerOpenAPIPost[GetAgenticSummaryCacheStatusRequest, agenticsummarycache.AgenticSummaryCacheStatus](
		router.With(RequireIDEMode(deps.ModePolicy)),
		"getAgenticSummaryCacheStatus",
		RouteGetAgenticSummaryCacheStatus,
		getAgenticSummaryCacheStatusHandler(deps.ProjectState, deps.Statuses),
		withOpenAPITags("AgenticSummaryCache"),
		withOpenAPISummary("Get the cache status for a chat section summary."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func getAgenticSummaryCacheStatusHandler(projectRuntime *projectstate.Runtime, statuses *agenticsummarycache.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetAgenticSummaryCacheStatusRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		chatSectionID := strings.TrimSpace(payload.ChatSectionID)
		if chatSectionID == "" {
			writeError(w, r, http.StatusBadRequest, "chat_section_id_required", "Chat section id is required.")
			return
		}
		if projectRuntime == nil || statuses == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID(projectConfigID)
		if err != nil {
			if errors.Is(err, projectstate.ErrProjectNotFound) {
				writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		status, err := statuses.BuildStatusForChat(project, chatSectionID)
		if err != nil {
			if errors.Is(err, agenticsummarycache.ErrChatSectionNotFound) {
				writeError(w, r, http.StatusNotFound, "chat_section_not_found", "Chat section not found.")
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, status)
	}
}
