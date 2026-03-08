package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/externalagents"
	"setta/internal/modes"
)

const RouteGetExternalAgentChat = "/getExternalAgentChat"

type AIRouteDependencies struct {
	ModePolicy         modes.Policy
	ExternalAgentChats *externalagents.Service
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

func RegisterAIRoutes(router chi.Router, deps AIRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.ExternalAgentChats == nil {
		return fmt.Errorf("external agent chat service is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetExternalAgentChat, getExternalAgentChatHandler(deps))
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
