package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/deployments"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"

	"github.com/go-chi/chi/v5"
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
	if err := validateAIRouteDependencies(deps, openAPIDocumentOnlyFromRouter(router)); err != nil {
		return err
	}
	registerManagedAIRoutes(router, deps)
	registerTranscriptionAIRoutes(router, deps)
	registerExternalAgentAIRoutes(router, deps)
	return nil
}

type aiRouteDependencyRequirement struct {
	Missing bool
	Message string
}

func validateAIRouteDependencies(deps AIRouteDependencies, documentOnly bool) error {
	if documentOnly {
		return nil
	}
	if deps.ModePolicy.IsIDE() {
		return validateRequiredAIRouteDependencies([]aiRouteDependencyRequirement{
			{Missing: deps.ManagedChats == nil, Message: "managed chat service is required in ide mode"},
			{Missing: deps.ExternalAgentSend == nil, Message: "external agent send service is required in ide mode"},
			{Missing: deps.ExternalAgentChats == nil, Message: "external agent chat service is required in ide mode"},
			{Missing: deps.ExternalAgentFollow == nil, Message: "external agent ai follow service is required in ide mode"},
			{Missing: deps.ExternalAgentRuns == nil, Message: "external agent runtime is required in ide mode"},
			{Missing: deps.TranscriptionProfiles == nil, Message: "transcription profile service is required in ide mode"},
			{Missing: deps.TranscriptionSessions == nil, Message: "transcription session service is required in ide mode"},
			{Missing: deps.Sessions == nil, Message: "session provider is required in ide mode"},
		})
	}
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}
	return nil
}

func validateRequiredAIRouteDependencies(requirements []aiRouteDependencyRequirement) error {
	for _, requirement := range requirements {
		if requirement.Missing {
			return errors.New(requirement.Message)
		}
	}
	return nil
}

func registerManagedAIRoutes(router chi.Router, deps AIRouteDependencies) {
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
}

func registerTranscriptionAIRoutes(router chi.Router, deps AIRouteDependencies) {
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
}

func registerExternalAgentAIRoutes(router chi.Router, deps AIRouteDependencies) {
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
