package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/modes"
)

const RouteGetExternalAgentChat = "/getExternalAgentChat"
const RouteStopExternalAgentRun = "/stopExternalAgentRun"
const RouteRespondExternalAgentApproval = "/respondExternalAgentApproval"

type AIRouteDependencies struct {
	ModePolicy         modes.Policy
	ExternalAgentChats *externalagents.Service
	ExternalAgentRuns  *externalagents.Runtime
}

type GetExternalAgentChatRequest struct {
	ChatID          string  `json:"chatId"`
	ProjectConfigID *string `json:"projectConfigId"`
}

type GetExternalAgentChatResponse struct {
	Messages           []map[string]any                 `json:"messages"`
	WaitingForResponse bool                             `json:"waitingForResponse"`
	ToolCallArguments  map[string]string                `json:"toolCallArguments"`
	ContextUsage       *externalagents.ChatContextUsage `json:"contextUsage"`
}

type StopExternalAgentRunRequest struct {
	RunID string `json:"runId"`
}

type RespondExternalAgentApprovalRequest struct {
	ApprovalID string `json:"approvalId"`
	Approved   bool   `json:"approved"`
}

func RegisterAIRoutes(router chi.Router, deps AIRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if deps.ExternalAgentChats == nil {
			return fmt.Errorf("external agent chat service is required in ide mode")
		}
		if deps.ExternalAgentRuns == nil {
			return fmt.Errorf("external agent runtime is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetExternalAgentChat, getExternalAgentChatHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStopExternalAgentRun, stopExternalAgentRunHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteRespondExternalAgentApproval, respondExternalAgentApprovalHandler(deps))
	return nil
}

func getExternalAgentChatHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetExternalAgentChatRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		chatID := strings.TrimSpace(payload.ChatID)
		if chatID == "" {
			writeError(w, r, http.StatusBadRequest, "chat_id_required", "Chat id is required.")
			return
		}
		if payload.ProjectConfigID != nil && strings.TrimSpace(*payload.ProjectConfigID) == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ExternalAgentChats == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		hydrated, err := deps.ExternalAgentChats.GetChat(chatID, payload.ProjectConfigID)
		switch {
		case errors.Is(err, externalagents.ErrChatNotFound):
			writeError(w, r, http.StatusNotFound, "chat_not_found", "Chat not found.")
			return
		case err != nil:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, GetExternalAgentChatResponse{
			Messages:           hydrated.Messages,
			WaitingForResponse: hydrated.WaitingForResponse,
			ToolCallArguments:  hydrated.ToolCallArguments,
			ContextUsage:       hydrated.ContextUsage,
		})
	}
}

func stopExternalAgentRunHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[StopExternalAgentRunRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		runID := strings.TrimSpace(payload.RunID)
		if runID == "" {
			writeError(w, r, http.StatusBadRequest, "run_id_required", "Run id is required.")
			return
		}
		if deps.ExternalAgentRuns == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		run, err := deps.ExternalAgentRuns.StopRun(runID)
		switch {
		case errors.Is(err, agentruns.ErrRunNotFound):
			writeError(w, r, http.StatusNotFound, "external_agent_run_not_found", "External agent run not found.")
			return
		case errors.Is(err, externalagents.ErrRunIDRequired):
			writeError(w, r, http.StatusBadRequest, "run_id_required", "Run id is required.")
			return
		case err != nil:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, run)
	}
}

func respondExternalAgentApprovalHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[RespondExternalAgentApprovalRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		approvalID := strings.TrimSpace(payload.ApprovalID)
		if approvalID == "" {
			writeError(w, r, http.StatusBadRequest, "approval_id_required", "Approval id is required.")
			return
		}
		if deps.ExternalAgentRuns == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		err = deps.ExternalAgentRuns.RespondToApproval(approvalID, payload.Approved)
		switch {
		case errors.Is(err, externalagents.ErrApprovalNotFound):
			writeError(w, r, http.StatusNotFound, "approval_not_found", "Approval not found.")
			return
		case errors.Is(err, externalagents.ErrRunNotActive):
			writeError(w, r, http.StatusNotFound, "external_agent_run_not_active", "External agent run is not active.")
			return
		case errors.Is(err, agentruns.ErrRunNotFound):
			writeError(w, r, http.StatusNotFound, "external_agent_run_not_found", "External agent run not found.")
			return
		case errors.Is(err, externalagents.ErrApprovalIDRequired):
			writeError(w, r, http.StatusBadRequest, "approval_id_required", "Approval id is required.")
			return
		case err != nil:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}
