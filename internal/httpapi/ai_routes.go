package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/deployments"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
)

const RouteGetLLMResponse = "/getLLMResponse"
const RouteGetLLMChat = "/getLLMChat"
const RouteStopLLMChat = "/stopLLMChat"
const RouteGetExternalAgentChat = "/getExternalAgentChat"
const RouteGetAIFollowSnapshot = "/getAIFollowSnapshot"
const RouteStopExternalAgentRun = "/stopExternalAgentRun"
const RouteRespondExternalAgentApproval = "/respondExternalAgentApproval"
const RouteRespondExternalAgentQuestion = "/respondExternalAgentQuestion"

type AIRouteDependencies struct {
	ModePolicy            modes.Policy
	Deployment            *deployments.Runtime
	ManagedChats          *managedchat.Service
	ExternalAgentSend     *externalagents.SendService
	ExternalAgentChats    *externalagents.Service
	ExternalAgentFollow   *externalagents.FollowService
	ExternalAgentRuns     *externalagents.Runtime
	TranscriptionProfiles *transcriptionprofiles.Service
	TranscriptionSessions *transcriptionsessions.Service
	Sessions              aiRouteSessionProvider
}

type aiRouteSessionProvider interface {
	CurrentSession() (*auth.CurrentSession, bool)
}

type GetLLMResponseRequest struct {
	ChatID                           *string           `json:"chatId"`
	ContinueFromChatID               *string           `json:"continueFromChatId"`
	Message                          map[string]any    `json:"message"`
	EngineConfigID                   string            `json:"engineConfigId"`
	AgentProfileID                   *string           `json:"agentProfileId"`
	Thinking                         bool              `json:"thinking"`
	ProjectConfigID                  string            `json:"projectConfigId"`
	SectionID                        *string           `json:"sectionId"`
	FrontendAffinityToken            *string           `json:"frontendAffinityToken"`
	AllowUnscoped                    bool              `json:"allowUnscoped"`
	BranchParentChatID               *string           `json:"branchParentChatId"`
	BranchFromMessageID              *string           `json:"branchFromMessageId"`
	AppSpecStreamingEnabled          bool              `json:"appSpecStreamingEnabled,omitempty"`
	PermissionMode                   string            `json:"permissionMode"`
	SearchEnabled                    bool              `json:"searchEnabled"`
	AppGenerationMode                *string           `json:"appGenerationMode"`
	AppGenerationByMessageID         map[string]string `json:"appGenerationByMessageId"`
	AppGenerationReferenceImageURL   *string           `json:"appGenerationReferenceImageUrl"`
	AppGenerationReferenceImageNotes *string           `json:"appGenerationReferenceImageNotes"`
}

type GetExternalAgentChatRequest struct {
	ChatID          string  `json:"chatId"`
	ProjectConfigID *string `json:"projectConfigId"`
}

type LLMChatIDResponse string

type LLMChatResponse managedchat.HydratedChat

type GetLLMChatRequest struct {
	ChatID          string  `json:"chatId"`
	ProjectConfigID *string `json:"projectConfigId"`
}

type ExternalAgentChatResponse externalagents.HydratedChat

type StopLLMChatResponse managedchat.StopResult

type StopLLMChatRequest struct {
	ChatID string `json:"chatId"`
}

type GetAIFollowSnapshotRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
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
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.ModePolicy.IsIDE() && !documentOnly {
		if deps.ManagedChats == nil {
			return fmt.Errorf("managed chat service is required in ide mode")
		}
		if deps.ExternalAgentSend == nil {
			return fmt.Errorf("external agent send service is required in ide mode")
		}
		if deps.ExternalAgentChats == nil {
			return fmt.Errorf("external agent chat service is required in ide mode")
		}
		if deps.ExternalAgentFollow == nil {
			return fmt.Errorf("external agent ai follow service is required in ide mode")
		}
		if deps.ExternalAgentRuns == nil {
			return fmt.Errorf("external agent runtime is required in ide mode")
		}
		if deps.TranscriptionProfiles == nil {
			return fmt.Errorf("transcription profile service is required in ide mode")
		}
		if deps.TranscriptionSessions == nil {
			return fmt.Errorf("transcription session service is required in ide mode")
		}
		if deps.Sessions == nil {
			return fmt.Errorf("session provider is required in ide mode")
		}
	}
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil && !documentOnly {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}

	registerAIPost[GetLLMResponseRequest, LLMChatIDResponse](
		router,
		"getLlmResponse",
		RouteGetLLMResponse,
		"Start or continue a managed or external AI chat and return the chat ID.",
		getLLMResponseHandler(deps),
	)
	registerAIPost[GetLLMChatRequest, LLMChatResponse](
		router,
		"getLlmChat",
		RouteGetLLMChat,
		"Load the hydrated managed AI chat state for a chat ID.",
		getLLMChatHandler(deps),
	)
	registerAIPost[StopLLMChatRequest, StopLLMChatResponse](
		router,
		"stopLlmChat",
		RouteStopLLMChat,
		"Stop an active managed AI chat run.",
		stopLLMChatHandler(deps),
	)
	registerAIPost[StartTranscriptionSessionRequest, StartTranscriptionSessionResponse](
		router,
		"startTranscriptionSession",
		RouteStartTranscriptionSession,
		"Start a transcription session for the current authenticated scope.",
		startTranscriptionSessionHandler(deps),
	)
	registerAIPost[AppendTranscriptionAudioRequest, TranscriptionSessionDeltaResponse](
		router,
		"appendTranscriptionAudio",
		RouteAppendTranscriptionAudio,
		"Append PCM16 audio to an active transcription session.",
		appendTranscriptionAudioHandler(deps),
	)
	registerAIPost[StopTranscriptionSessionRequest, TranscriptionSessionDeltaResponse](
		router,
		"stopTranscriptionSession",
		RouteStopTranscriptionSession,
		"Stop an active transcription session and return the final delta.",
		stopTranscriptionSessionHandler(deps),
	)
	registerAIPost[CancelTranscriptionSessionRequest, CancelTranscriptionSessionResponse](
		router,
		"cancelTranscriptionSession",
		RouteCancelTranscriptionSession,
		"Cancel an active transcription session.",
		cancelTranscriptionSessionHandler(deps),
	)
	registerAIPost[GetExternalAgentChatRequest, ExternalAgentChatResponse](
		router,
		"getExternalAgentChat",
		RouteGetExternalAgentChat,
		"Load the hydrated external agent chat state for a chat ID.",
		getExternalAgentChatHandler(deps),
	)
	registerAIPost[GetAIFollowSnapshotRequest, []realtime.AIFollowToolArgumentsUpdateContent](
		router,
		"getAIFollowSnapshot",
		RouteGetAIFollowSnapshot,
		"Load the current AI follow tool-argument snapshot for a project.",
		getAIFollowSnapshotHandler(deps),
	)
	registerAIPost[StopExternalAgentRunRequest, agentruns.Run](
		router,
		"stopExternalAgentRun",
		RouteStopExternalAgentRun,
		"Stop an active external agent run.",
		stopExternalAgentRunHandler(deps),
	)
	registerAIPost[RespondExternalAgentApprovalRequest, openAPIJSONNull](
		router,
		"respondExternalAgentApproval",
		RouteRespondExternalAgentApproval,
		"Submit an approval decision for an external agent run.",
		respondExternalAgentApprovalHandler(deps),
	)
	registerAIPost[RespondExternalAgentQuestionRequest, openAPIJSONNull](
		router,
		"respondExternalAgentQuestion",
		RouteRespondExternalAgentQuestion,
		"Submit answers for an external agent question prompt.",
		respondExternalAgentQuestionHandler(deps),
	)
	return nil
}

func registerAIPost[Req, Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	summary string,
	handler http.HandlerFunc,
) {
	registerOpenAPIPost[Req, Resp](
		router,
		operationID,
		routePath,
		handler,
		withOpenAPITags("AI"),
		withOpenAPISummary(summary),
		withOpenAPIModeRequirement("not-launcher"),
	)
}

func getLLMResponseHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
		payload, err := decodeGetLLMResponseRequest(r)
		if err != nil {
			writeGetLLMResponseDecodeError(w, r, err)
			return
		}
		if deps.ManagedChats == nil || deps.ExternalAgentSend == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		managedRequest := managedchat.StartChatRequest{
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
			PermissionMode:                   managedchat.ChatPermissionMode(strings.TrimSpace(payload.PermissionMode)),
			SearchEnabled:                    payload.SearchEnabled,
			AppSpecStreamingEnabled:          payload.AppSpecStreamingEnabled,
			AppGenerationMode:                payload.AppGenerationMode,
			AppGenerationReferenceImageURL:   payload.AppGenerationReferenceImageURL,
			AppGenerationReferenceImageNotes: payload.AppGenerationReferenceImageNotes,
			AdditionalInputs:                 aiRouteAdditionalInputs(payload.AppGenerationByMessageID),
		}
		result, err := deps.ManagedChats.StartChat(managedRequest)
		if err == nil {
			writeJSON(w, http.StatusOK, LLMChatIDResponse(result.ChatID))
			return
		}
		if !errors.Is(err, agentruns.ErrManagedLLMEngineRequired) {
			writeGetLLMResponseError(w, r, err)
			return
		}

		resultExternal, err := deps.ExternalAgentSend.StartChat(r.Context(), externalagents.StartChatRequest{
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
			AdditionalInputs:                 aiRouteAdditionalInputs(payload.AppGenerationByMessageID),
		})
		if err != nil {
			writeGetLLMResponseError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, LLMChatIDResponse(resultExternal.ChatID))
	}
}

func getLLMChatHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
		payload, err := decodeStrictJSONBodyWithRequiredFields[GetLLMChatRequest](
			r,
			strictJSONFieldRequirement{Field: "projectConfigId", AllowNull: true},
		)
		if err != nil {
			writeChatHydrationDecodeError(w, r, err)
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
		if deps.ManagedChats == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		hydrated, err := deps.ManagedChats.GetChat(chatID, payload.ProjectConfigID)
		switch {
		case errors.Is(err, managedchat.ErrChatNotFound):
			writeError(w, r, http.StatusNotFound, "chat_not_found", "Chat not found.")
			return
		case err != nil:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, LLMChatResponse(hydrated))
	}
}

func stopLLMChatHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
		payload, err := decodeJSONBody[StopLLMChatRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		chatID := strings.TrimSpace(payload.ChatID)
		if chatID == "" {
			writeError(w, r, http.StatusBadRequest, "chat_id_required", "Chat id is required.")
			return
		}
		if deps.ManagedChats == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		stopped, err := deps.ManagedChats.StopChat(chatID)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, StopLLMChatResponse(stopped))
	}
}

func getExternalAgentChatHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
		payload, err := decodeStrictJSONBodyWithRequiredFields[GetExternalAgentChatRequest](
			r,
			strictJSONFieldRequirement{Field: "projectConfigId", AllowNull: true},
		)
		if err != nil {
			writeChatHydrationDecodeError(w, r, err)
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

		writeJSON(w, http.StatusOK, ExternalAgentChatResponse(hydrated))
	}
}

func aiRouteAdditionalInputs(appGenerationByMessageID map[string]string) map[string]any {
	if len(appGenerationByMessageID) == 0 {
		return nil
	}
	cloned := make(map[string]string, len(appGenerationByMessageID))
	for messageID, mode := range appGenerationByMessageID {
		cloned[messageID] = mode
	}
	return map[string]any{
		"appGenerationByMessageId": cloned,
	}
}

func ensureAIRouteLLMAccessAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps AIRouteDependencies,
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

func getAIFollowSnapshotHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
		payload, err := decodeJSONBody[GetAIFollowSnapshotRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		hasProjectConfigID, err := requestHasTopLevelJSONField(r, "projectConfigId", false)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if !hasProjectConfigID {
			writeValidationError(
				w,
				http.StatusUnprocessableEntity,
				(&strictJSONMissingFieldError{Field: "projectConfigId"}).Error(),
			)
			return
		}
		if deps.ManagedChats == nil || deps.ExternalAgentFollow == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot := deps.ManagedChats.AIFollowSnapshot(payload.ProjectConfigID)
		snapshot = append(snapshot, deps.ExternalAgentFollow.Snapshot(payload.ProjectConfigID)...)
		writeJSON(w, http.StatusOK, snapshot)
	}
}

func stopExternalAgentRunHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
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
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
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
		if !ensureAIRouteLLMAccessAllowed(w, r, deps) {
			return
		}
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

type llmResponseErrorDetails struct {
	Status  int
	Code    string
	Message string
}

type llmResponseErrorMatcher func(error) (llmResponseErrorDetails, bool)

var defaultGetLLMResponseError = llmResponseErrorDetails{
	Status:  http.StatusInternalServerError,
	Code:    "internal_error",
	Message: "Internal Server Error",
}

var getLLMResponseErrorMatchers = []llmResponseErrorMatcher{
	fixedLLMResponseError(
		http.StatusBadRequest,
		"message_required",
		"Message is required.",
		externalagents.ErrMessageRequired,
		managedchat.ErrMessageRequired,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"project_config_id_required",
		"Project config id is required.",
		externalagents.ErrProjectConfigIDRequired,
		managedchat.ErrProjectConfigIDRequired,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"permission_mode_invalid",
		"permissionMode is invalid.",
		externalagents.ErrPermissionModeRequired,
		externalagents.ErrPermissionModeInvalid,
		managedchat.ErrPermissionModeRequired,
		managedchat.ErrPermissionModeInvalid,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"section_id_required",
		externalagents.ErrSectionIDRequired,
		managedchat.ErrSectionIDRequired,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"allow_unscoped_conflict",
		externalagents.ErrAllowUnscopedRequiresSectionOmitted,
		managedchat.ErrAllowUnscopedRequiresSectionOmitted,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"branch_fields_required",
		externalagents.ErrBranchFieldsRequired,
		managedchat.ErrBranchFieldsRequired,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"continue_from_chat_with_branch_edits",
		externalagents.ErrContinueFromChatWithBranchEdits,
		managedchat.ErrContinueFromChatWithBranchEdits,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"continue_from_chat_conflict",
		externalagents.ErrContinueFromChatRequiresChatIDOmitted,
		managedchat.ErrContinueFromChatRequiresChatIDOmitted,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"frontend_affinity_token_invalid",
		"frontendAffinityToken must not be blank.",
		externalagents.ErrFrontendAffinityTokenInvalid,
		managedchat.ErrFrontendAffinityTokenInvalid,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"app_generation_mode_invalid",
		"appGenerationMode is invalid.",
		externalagents.ErrAppGenerationModeInvalid,
		managedchat.ErrAppGenerationModeInvalid,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"app_generation_reference_image_url_too_large",
		externalagents.ErrAppGenerationReferenceImageURLTooLarge,
		managedchat.ErrAppGenerationReferenceImageURLTooLarge,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"app_generation_reference_image_notes_too_large",
		externalagents.ErrAppGenerationReferenceImageNotesTooLarge,
		managedchat.ErrAppGenerationReferenceImageNotesTooLarge,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"app_generation_image_attachment_required",
		externalagents.ErrAppGenerationImageAttachmentRequired,
		managedchat.ErrAppGenerationImageAttachmentRequired,
	),
	typedLLMResponseError[*externalagents.ContinueFromChatSourceNotFoundError](
		http.StatusNotFound,
		"source_chat_not_found",
	),
	typedLLMResponseError[*managedchat.ContinueFromChatSourceNotFoundError](
		http.StatusNotFound,
		"source_chat_not_found",
	),
	typedLLMResponseError[*externalagents.BranchMessageNotFoundError](
		http.StatusNotFound,
		"branch_message_not_found",
	),
	typedLLMResponseError[*managedchat.BranchMessageNotFoundError](
		http.StatusNotFound,
		"branch_message_not_found",
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"agent_profile_not_found",
		"Agent profile not found.",
		agentprofiles.ErrProfileNotFound,
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"engine_config_not_found",
		"Engine config not found.",
		agentruns.ErrEngineConfigNotFound,
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"project_config_not_found",
		"Project config not found.",
		projectstate.ErrProjectNotFound,
	),
	fixedLLMResponseError(
		http.StatusNotFound,
		"section_not_found",
		"Section not found.",
		projectstate.ErrSectionNotFound,
	),
	dynamicLLMResponseError(
		http.StatusConflict,
		"chat_engine_mismatch",
		externalagents.ErrChatEngineMismatch,
		managedchat.ErrChatEngineMismatch,
	),
	dynamicLLMResponseError(
		http.StatusConflict,
		"chat_project_config_mismatch",
		externalagents.ErrChatProjectConfigMismatch,
		managedchat.ErrChatProjectConfigMismatch,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"provider_unsupported",
		managedllm.ErrProviderUnsupported,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"provider_config_invalid",
		managedllm.ErrProviderConfigInvalid,
	),
	dynamicLLMResponseError(
		http.StatusBadRequest,
		"thinking_unsupported",
		managedllm.ErrReasoningUnsupported,
	),
	fixedLLMResponseError(
		http.StatusBadRequest,
		"unsupported_engine_config",
		"Unsupported engine config.",
		externalagents.ErrExternalAgentEngineRequired,
		agentruns.ErrManagedLLMEngineRequired,
	),
	fixedLLMResponseError(
		http.StatusServiceUnavailable,
		"agent_runner_unavailable",
		"Agent runner is not available",
		managedchat.ErrStarterRequired,
		agentruns.ErrManagedExecutorUnavailable,
	),
	fixedLLMResponseError(
		http.StatusServiceUnavailable,
		"external_agent_runtime_unavailable",
		"External agent runtime is not available.",
		externalagents.ErrExecutorUnavailable,
		externalagents.ErrSendPreflightCheckerRequired,
	),
	typedLLMResponseError[*externalagents.PreflightUnavailableError](
		http.StatusServiceUnavailable,
		"external_agent_preflight_failed",
	),
	fixedLLMResponseError(
		http.StatusInternalServerError,
		"external_agent_config_not_found",
		"External agent config not found.",
		externalagentconfigs.ErrConfigNotFound,
		externalagents.ErrExternalAgentConfigIDRequired,
	),
}

func writeGetLLMResponseError(w http.ResponseWriter, r *http.Request, err error) {
	response := resolveGetLLMResponseError(err)
	writeError(w, r, response.Status, response.Code, response.Message)
}

func resolveGetLLMResponseError(err error) llmResponseErrorDetails {
	for _, matcher := range getLLMResponseErrorMatchers {
		if response, ok := matcher(err); ok {
			return response
		}
	}
	return defaultGetLLMResponseError
}

func fixedLLMResponseError(status int, code string, message string, candidates ...error) llmResponseErrorMatcher {
	return matchLLMResponseErrors(status, code, func(error) string {
		return message
	}, candidates...)
}

func dynamicLLMResponseError(status int, code string, candidates ...error) llmResponseErrorMatcher {
	return matchLLMResponseErrors(status, code, func(err error) string {
		return err.Error()
	}, candidates...)
}

func matchLLMResponseErrors(
	status int,
	code string,
	message func(error) string,
	candidates ...error,
) llmResponseErrorMatcher {
	return func(err error) (llmResponseErrorDetails, bool) {
		for _, candidate := range candidates {
			if errors.Is(err, candidate) {
				return llmResponseErrorDetails{
					Status:  status,
					Code:    code,
					Message: message(err),
				}, true
			}
		}
		return llmResponseErrorDetails{}, false
	}
}

func typedLLMResponseError[T error](status int, code string) llmResponseErrorMatcher {
	return func(err error) (llmResponseErrorDetails, bool) {
		var target T
		if !errors.As(err, &target) {
			return llmResponseErrorDetails{}, false
		}
		return llmResponseErrorDetails{
			Status:  status,
			Code:    code,
			Message: target.Error(),
		}, true
	}
}

func writeGetLLMResponseDecodeError(w http.ResponseWriter, r *http.Request, err error) {
	writeValidationError(
		w,
		http.StatusUnprocessableEntity,
		formatGetLLMResponseValidationMessage(err),
	)
}

type llmResponseValidationError struct {
	message string
}

var getLLMResponseMessageRoles = map[string]struct{}{
	"system":    {},
	"assistant": {},
	"user":      {},
	"tool":      {},
}

const getLLMResponseMessageRoleExpectedTags = "<ChatRole.system: 'system'>, <ChatRole.assistant: 'assistant'>, <ChatRole.user: 'user'>, <ChatRole.tool: 'tool'>"

func (e *llmResponseValidationError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func invalidGetLLMResponseMessageRoleError(value any) error {
	tag := "None"
	switch typed := value.(type) {
	case nil:
	case bool:
		if typed {
			tag = "True"
		} else {
			tag = "False"
		}
	default:
		tag = fmt.Sprint(typed)
	}
	return &llmResponseValidationError{
		message: "message: Input tag '" + tag + "' found using 'role' does not match any of the expected tags: " + getLLMResponseMessageRoleExpectedTags,
	}
}

func decodeGetLLMResponseRequest(r *http.Request) (GetLLMResponseRequest, error) {
	var payload GetLLMResponseRequest
	if r.Body == nil {
		return payload, &strictJSONMissingFieldError{Field: "message"}
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return payload, err
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	trimmedBody := bytes.TrimSpace(body)
	if len(trimmedBody) == 0 {
		trimmedBody = []byte("{}")
	}

	if field, ok := detectUnknownTopLevelJSONField[GetLLMResponseRequest](trimmedBody); ok {
		return payload, &strictJSONUnknownFieldError{Field: field}
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(trimmedBody, &fields); err != nil {
		return payload, err
	}
	for _, field := range []string{"message", "engineConfigId", "thinking", "projectConfigId", "permissionMode", "searchEnabled"} {
		value, ok := fields[field]
		if !ok {
			return payload, &strictJSONMissingFieldError{Field: field}
		}
		if !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			continue
		}
		switch field {
		case "message":
			return payload, &llmResponseValidationError{
				message: "message: Input should be a valid dictionary",
			}
		case "engineConfigId", "projectConfigId":
			return payload, &llmResponseValidationError{
				message: field + ": Input should be a valid string",
			}
		case "thinking", "searchEnabled":
			return payload, &llmResponseValidationError{
				message: field + ": Input should be a valid boolean",
			}
		case "permissionMode":
			return payload, &llmResponseValidationError{
				message: "permissionMode: Input should be 'minimal', 'yolo' or 'config_toml_custom'",
			}
		}
	}
	if err := validateGetLLMResponseMessage(fields["message"]); err != nil {
		return payload, err
	}

	decoder := json.NewDecoder(bytes.NewReader(trimmedBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		if errors.Is(err, io.EOF) {
			return payload, nil
		}
		return payload, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return payload, fmt.Errorf("unexpected trailing JSON content")
		}
		return payload, err
	}
	return payload, nil
}

func formatGetLLMResponseValidationMessage(err error) string {
	var missingFieldErr *strictJSONMissingFieldError
	if errors.As(err, &missingFieldErr) {
		return missingFieldErr.Error()
	}

	var unknownFieldErr *strictJSONUnknownFieldError
	if errors.As(err, &unknownFieldErr) {
		field := strings.TrimSpace(unknownFieldErr.Field)
		if field == "" {
			return "Extra inputs are not permitted"
		}
		return field + ": Extra inputs are not permitted"
	}

	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		switch strings.TrimSpace(typeErr.Field) {
		case "message":
			return "message: Input should be a valid dictionary"
		case "engineConfigId", "projectConfigId":
			return strings.TrimSpace(typeErr.Field) + ": Input should be a valid string"
		case "thinking", "searchEnabled":
			return strings.TrimSpace(typeErr.Field) + ": Input should be a valid boolean"
		case "permissionMode":
			return "permissionMode: Input should be 'minimal', 'yolo' or 'config_toml_custom'"
		}
	}

	var validationErr *llmResponseValidationError
	if errors.As(err, &validationErr) {
		return validationErr.Error()
	}

	return err.Error()
}

func validateGetLLMResponseMessage(raw json.RawMessage) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return &llmResponseValidationError{
			message: "message: Input should be a valid dictionary",
		}
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &fields); err != nil {
		return &llmResponseValidationError{
			message: "message: Input should be a valid dictionary",
		}
	}

	roleRaw, ok := fields["role"]
	if !ok {
		return &llmResponseValidationError{
			message: "message: Unable to extract tag using discriminator 'role'",
		}
	}

	var roleValue any
	if err := json.Unmarshal(roleRaw, &roleValue); err != nil {
		return &llmResponseValidationError{message: "message: Unable to extract tag using discriminator 'role'"}
	}

	role, ok := roleValue.(string)
	if !ok {
		return invalidGetLLMResponseMessageRoleError(roleValue)
	}

	if _, ok := getLLMResponseMessageRoles[role]; !ok {
		return invalidGetLLMResponseMessageRoleError(role)
	}

	if role != "tool" {
		return nil
	}

	toolCallIDRaw, ok := fields["tool_call_id"]
	if !ok {
		return &llmResponseValidationError{
			message: "message.tool.tool_call_id: Field required",
		}
	}

	var toolCallID any
	if err := json.Unmarshal(toolCallIDRaw, &toolCallID); err != nil {
		return &llmResponseValidationError{
			message: "message.tool.tool_call_id: Input should be a valid string",
		}
	}
	if _, ok := toolCallID.(string); !ok {
		return &llmResponseValidationError{
			message: "message.tool.tool_call_id: Input should be a valid string",
		}
	}
	return nil
}

func writeChatHydrationDecodeError(w http.ResponseWriter, r *http.Request, err error) {
	var missingFieldErr *strictJSONMissingFieldError
	if errors.As(err, &missingFieldErr) && missingFieldErr.Field == "projectConfigId" {
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
		return
	}
	writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
}
