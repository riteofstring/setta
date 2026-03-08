package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const RouteGetLLMResponse = "/getLLMResponse"
const RouteGetExternalAgentChat = "/getExternalAgentChat"
const RouteStopExternalAgentRun = "/stopExternalAgentRun"
const RouteRespondExternalAgentApproval = "/respondExternalAgentApproval"
const RouteRespondExternalAgentQuestion = "/respondExternalAgentQuestion"

type AIRouteDependencies struct {
	ModePolicy         modes.Policy
	ExternalAgentSend  *externalagents.SendService
	ExternalAgentChats *externalagents.Service
	ExternalAgentRuns  *externalagents.Runtime
}

type GetLLMResponseRequest struct {
	ChatID                           *string        `json:"chatId"`
	ContinueFromChatID               *string        `json:"continueFromChatId"`
	Message                          map[string]any `json:"message"`
	EngineConfigID                   string         `json:"engineConfigId"`
	AgentProfileID                   *string        `json:"agentProfileId"`
	Thinking                         bool           `json:"thinking"`
	ProjectConfigID                  string         `json:"projectConfigId"`
	SectionID                        *string        `json:"sectionId"`
	FrontendAffinityToken            *string        `json:"frontendAffinityToken"`
	AllowUnscoped                    bool           `json:"allowUnscoped"`
	BranchParentChatID               *string        `json:"branchParentChatId"`
	BranchFromMessageID              *string        `json:"branchFromMessageId"`
	AppSpecStreamingEnabled          bool           `json:"appSpecStreamingEnabled"`
	PermissionMode                   string         `json:"permissionMode"`
	SearchEnabled                    bool           `json:"searchEnabled"`
	AppGenerationMode                *string        `json:"appGenerationMode"`
	AppGenerationReferenceImageURL   *string        `json:"appGenerationReferenceImageUrl"`
	AppGenerationReferenceImageNotes *string        `json:"appGenerationReferenceImageNotes"`
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

type RespondExternalAgentQuestionRequest struct {
	ToolCallID string            `json:"toolCallId"`
	Answers    map[string]string `json:"answers"`
}

func RegisterAIRoutes(router chi.Router, deps AIRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if deps.ExternalAgentSend == nil {
			return fmt.Errorf("external agent send service is required in ide mode")
		}
		if deps.ExternalAgentChats == nil {
			return fmt.Errorf("external agent chat service is required in ide mode")
		}
		if deps.ExternalAgentRuns == nil {
			return fmt.Errorf("external agent runtime is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLLMResponse, getLLMResponseHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetExternalAgentChat, getExternalAgentChatHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteStopExternalAgentRun, stopExternalAgentRunHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteRespondExternalAgentApproval, respondExternalAgentApprovalHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteRespondExternalAgentQuestion, respondExternalAgentQuestionHandler(deps))
	return nil
}

func getLLMResponseHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetLLMResponseRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.ExternalAgentSend == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		result, err := deps.ExternalAgentSend.StartChat(r.Context(), externalagents.StartChatRequest{
			ChatID:                           payload.ChatID,
			ContinueFromChatID:               payload.ContinueFromChatID,
			Message:                          payload.Message,
			EngineConfigID:                   payload.EngineConfigID,
			AgentProfileID:                   payload.AgentProfileID,
			Thinking:                         payload.Thinking,
			ProjectConfigID:                  payload.ProjectConfigID,
			SectionID:                        payload.SectionID,
			FrontendAffinityToken:            payload.FrontendAffinityToken,
			AllowUnscoped:                    payload.AllowUnscoped,
			BranchParentChatID:               payload.BranchParentChatID,
			BranchFromMessageID:              payload.BranchFromMessageID,
			PermissionMode:                   externalagents.ChatPermissionMode(strings.TrimSpace(payload.PermissionMode)),
			SearchEnabled:                    payload.SearchEnabled,
			AppSpecStreamingEnabled:          payload.AppSpecStreamingEnabled,
			AppGenerationMode:                payload.AppGenerationMode,
			AppGenerationReferenceImageURL:   payload.AppGenerationReferenceImageURL,
			AppGenerationReferenceImageNotes: payload.AppGenerationReferenceImageNotes,
		})
		if err != nil {
			writeGetLLMResponseError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, result.ChatID)
	}
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

func respondExternalAgentQuestionHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[RespondExternalAgentQuestionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		toolCallID := strings.TrimSpace(payload.ToolCallID)
		if toolCallID == "" {
			writeError(w, r, http.StatusBadRequest, "tool_call_id_required", "Tool call id is required.")
			return
		}
		if deps.ExternalAgentRuns == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		err = deps.ExternalAgentRuns.RespondToQuestion(toolCallID, payload.Answers)
		switch {
		case errors.Is(err, externalagents.ErrQuestionNotFound):
			writeError(w, r, http.StatusNotFound, "question_not_found", "Question not found.")
			return
		case errors.Is(err, externalagents.ErrRunNotActive):
			writeError(w, r, http.StatusNotFound, "external_agent_run_not_active", "External agent run is not active.")
			return
		case errors.Is(err, agentruns.ErrRunNotFound):
			writeError(w, r, http.StatusNotFound, "external_agent_run_not_found", "External agent run not found.")
			return
		case errors.Is(err, externalagents.ErrToolCallIDRequired):
			writeError(w, r, http.StatusBadRequest, "tool_call_id_required", "Tool call id is required.")
			return
		case err != nil:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func writeGetLLMResponseError(w http.ResponseWriter, r *http.Request, err error) {
	var preflightErr *externalagents.PreflightUnavailableError
	var continueErr *externalagents.ContinueFromChatSourceNotFoundError
	var branchErr *externalagents.BranchMessageNotFoundError

	switch {
	case errors.Is(err, externalagents.ErrMessageRequired):
		writeError(w, r, http.StatusBadRequest, "message_required", "Message is required.")
	case errors.Is(err, externalagents.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, externalagents.ErrPermissionModeRequired), errors.Is(err, externalagents.ErrPermissionModeInvalid):
		writeError(w, r, http.StatusBadRequest, "permission_mode_invalid", "permissionMode is invalid.")
	case errors.Is(err, externalagents.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", err.Error())
	case errors.Is(err, externalagents.ErrAllowUnscopedRequiresSectionOmitted):
		writeError(w, r, http.StatusBadRequest, "allow_unscoped_conflict", err.Error())
	case errors.Is(err, externalagents.ErrBranchFieldsRequired):
		writeError(w, r, http.StatusBadRequest, "branch_fields_required", err.Error())
	case errors.Is(err, externalagents.ErrContinueFromChatWithBranchEdits):
		writeError(w, r, http.StatusBadRequest, "continue_from_chat_with_branch_edits", err.Error())
	case errors.Is(err, externalagents.ErrContinueFromChatRequiresChatIDOmitted):
		writeError(w, r, http.StatusBadRequest, "continue_from_chat_conflict", err.Error())
	case errors.Is(err, externalagents.ErrFrontendAffinityTokenInvalid):
		writeError(w, r, http.StatusBadRequest, "frontend_affinity_token_invalid", "frontendAffinityToken must not be blank.")
	case errors.Is(err, externalagents.ErrAppGenerationModeInvalid):
		writeError(w, r, http.StatusBadRequest, "app_generation_mode_invalid", "appGenerationMode is invalid.")
	case errors.Is(err, externalagents.ErrAppGenerationReferenceImageURLTooLarge):
		writeError(w, r, http.StatusBadRequest, "app_generation_reference_image_url_too_large", err.Error())
	case errors.Is(err, externalagents.ErrAppGenerationReferenceImageNotesTooLarge):
		writeError(w, r, http.StatusBadRequest, "app_generation_reference_image_notes_too_large", err.Error())
	case errors.As(err, &continueErr):
		writeError(w, r, http.StatusNotFound, "source_chat_not_found", continueErr.Error())
	case errors.As(err, &branchErr):
		writeError(w, r, http.StatusNotFound, "branch_message_not_found", branchErr.Error())
	case errors.Is(err, agentprofiles.ErrProfileNotFound):
		writeError(w, r, http.StatusNotFound, "agent_profile_not_found", "Agent profile not found.")
	case errors.Is(err, agentruns.ErrEngineConfigNotFound):
		writeError(w, r, http.StatusNotFound, "engine_config_not_found", "Engine config not found.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, externalagents.ErrChatEngineMismatch):
		writeError(w, r, http.StatusConflict, "chat_engine_mismatch", err.Error())
	case errors.Is(err, externalagents.ErrChatProjectConfigMismatch):
		writeError(w, r, http.StatusConflict, "chat_project_config_mismatch", err.Error())
	case errors.Is(err, externalagents.ErrExternalAgentEngineRequired):
		writeError(w, r, http.StatusBadRequest, "unsupported_engine_config", "Unsupported engine config.")
	case errors.Is(err, externalagents.ErrExecutorUnavailable), errors.Is(err, externalagents.ErrSendPreflightCheckerRequired):
		writeError(w, r, http.StatusServiceUnavailable, "external_agent_runtime_unavailable", "External agent runtime is not available.")
	case errors.As(err, &preflightErr):
		writeError(w, r, http.StatusServiceUnavailable, "external_agent_preflight_failed", preflightErr.Error())
	case errors.Is(err, externalagentconfigs.ErrConfigNotFound), errors.Is(err, externalagents.ErrExternalAgentConfigIDRequired):
		writeError(w, r, http.StatusInternalServerError, "external_agent_config_not_found", "External agent config not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
