package externalagents

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/chatattachments"
	"setta/internal/chatmodes"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
)

const (
	RunTypeManagedChat = "llm_chat"

	requiredErrorCheckPrompt = "## Required completion gate for create/scaffold work\n" +
		"- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n" +
		"- Report check outcomes explicitly as pass/fail before any completion claim.\n" +
		"- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)

var (
	ErrSendProjectStateRequired              = errors.New("external agent send project state is required")
	ErrSendEngineStoreRequired               = errors.New("external agent send engine store is required")
	ErrSendRunStoreRequired                  = errors.New("external agent send run store is required")
	ErrSendConfigStoreRequired               = errors.New("external agent send config store is required")
	ErrSendRuntimeRequired                   = errors.New("external agent send runtime is required")
	ErrSendPreflightCheckerRequired          = errors.New("external agent send preflight checker is required")
	ErrSendAttachmentsRequired               = errors.New("external agent send attachments service is required")
	ErrExecutorUnavailable                   = errors.New("external agent executor is not available")
	ErrExternalAgentEngineRequired           = errors.New("engine config must be external_agent")
	ErrExternalAgentConfigIDRequired         = errors.New("external agent engine config missing external agent config id")
	ErrProjectConfigIDRequired               = errors.New("projectConfigId is required")
	ErrMessageRequired                       = errors.New("message is required")
	ErrPermissionModeRequired                = errors.New("permissionMode is required")
	ErrPermissionModeInvalid                 = errors.New("permissionMode is invalid")
	ErrSectionIDRequired                     = errors.New("sectionId is required unless allowUnscoped is true.")
	ErrAllowUnscopedRequiresSectionOmitted   = errors.New("allowUnscoped requires sectionId to be omitted.")
	ErrBranchFieldsRequired                  = errors.New("Branch edits require branchParentChatId and branchFromMessageId.")
	ErrContinueFromChatWithBranchEdits       = errors.New("continueFromChatId cannot be used with branch edits.")
	ErrContinueFromChatRequiresChatIDOmitted = errors.New("continueFromChatId requires chatId to be omitted.")
	ErrChatEngineMismatch                    = errors.New("Chat engine mismatch; start a new chat.")
	ErrChatProjectConfigMismatch             = errors.New("Chat project config mismatch; start a new chat.")
	ErrContinueFromChatSourceNotFound        = errors.New("continuation source chat not found")
	ErrFrontendAffinityTokenInvalid          = errors.New("frontendAffinityToken must not be blank")
	ErrAppGenerationImageAttachmentRequired  = chatmodes.ErrAppGenerationImageAttachmentRequired
)

type ChatPermissionMode = projectstate.ChatPermissionMode

type Executor interface {
	Start(context.Context, StartRequest) (StartResponse, error)
}

type StartRequest struct {
	Run             agentruns.Run
	EngineConfig    agentruns.EngineConfig
	ExternalConfig  externalagentconfigs.Config
	Profile         *agentprofiles.Profile
	ProjectConfigID string
	ChatID          string
	SectionID       *string
	Inputs          map[string]any
}

type StartResponse struct {
	Controller RunController
}

type SendServiceOptions struct {
	ProjectState       *projectstate.Runtime
	Engines            *agentruns.EngineStore
	Runs               *agentruns.RunStore
	Profiles           *agentprofiles.Store
	Configs            *externalagentconfigs.Store
	Runtime            *Runtime
	Preflight          externalagentconfigs.Checker
	Attachments        *chatattachments.Service
	Executor           Executor
	SettaFilesRoot     string
	AppGenerationModes chatmodes.AppGenerationModeResolver
	TimeNow            func() time.Time
}

type SendService struct {
	projectState       *projectstate.Runtime
	engines            *agentruns.EngineStore
	runs               *agentruns.RunStore
	profiles           *agentprofiles.Store
	configs            *externalagentconfigs.Store
	runtime            *Runtime
	preflight          externalagentconfigs.Checker
	attachments        *chatattachments.Service
	executor           Executor
	settaFilesRoot     string
	appGenerationModes chatmodes.AppGenerationModeResolver
	timeNow            func() time.Time
}

type runtimeReadyController interface {
	RunController
	markRuntimeReady()
}

type StartChatRequest struct {
	ChatID                           *string
	ContinueFromChatID               *string
	Message                          map[string]any
	EngineConfigID                   string
	AgentProfileID                   *string
	Thinking                         bool
	ProjectConfigID                  string
	SectionID                        *string
	FrontendAffinityToken            *string
	AllowUnscoped                    bool
	BranchParentChatID               *string
	BranchFromMessageID              *string
	PermissionMode                   ChatPermissionMode
	SearchEnabled                    bool
	AppSpecStreamingEnabled          bool
	AppGenerationMode                *string
	AppGenerationReferenceImageURL   *string
	AppGenerationReferenceImageNotes *string
	AdditionalInputs                 map[string]any
}

type StartChatResult struct {
	ChatID string
	Run    agentruns.Run
}

type PreflightUnavailableError struct {
	Status externalagentconfigs.Status
}

type ContinueFromChatSourceNotFoundError struct {
	ChatID string
}

func (e *ContinueFromChatSourceNotFoundError) Error() string {
	if e == nil {
		return "Continuation source chat not found."
	}
	return fmt.Sprintf("Continuation source chat %s not found.", e.ChatID)
}

func (e *ContinueFromChatSourceNotFoundError) Unwrap() error {
	return ErrContinueFromChatSourceNotFound
}

type BranchMessageNotFoundError struct {
	MessageID string
}

func (e *BranchMessageNotFoundError) Error() string {
	if e == nil {
		return "Message not found in chat history"
	}
	return fmt.Sprintf("Message %s not found in chat history", e.MessageID)
}

func (e *PreflightUnavailableError) Error() string {
	if e == nil {
		return "external agent config is not available"
	}
	if len(e.Status.Issues) == 0 {
		return "External agent config is not available: preflight failed"
	}
	return fmt.Sprintf("External agent config is not available: %s", strings.Join(e.Status.Issues, "; "))
}

func NewSendService(options SendServiceOptions) (*SendService, error) {
	if options.ProjectState == nil {
		return nil, ErrSendProjectStateRequired
	}
	if options.Engines == nil {
		return nil, ErrSendEngineStoreRequired
	}
	if options.Runs == nil {
		return nil, ErrSendRunStoreRequired
	}
	if options.Configs == nil {
		return nil, ErrSendConfigStoreRequired
	}
	if options.Runtime == nil {
		return nil, ErrSendRuntimeRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &SendService{
		projectState:       options.ProjectState,
		engines:            options.Engines,
		runs:               options.Runs,
		profiles:           options.Profiles,
		configs:            options.Configs,
		runtime:            options.Runtime,
		preflight:          options.Preflight,
		attachments:        options.Attachments,
		executor:           options.Executor,
		settaFilesRoot:     strings.TrimSpace(options.SettaFilesRoot),
		appGenerationModes: options.AppGenerationModes,
		timeNow:            timeNow,
	}, nil
}

func (s *SendService) Disabled() bool {
	return s == nil || s.executor == nil
}

type normalizedStartChatRequest struct {
	Message                 map[string]any
	ChatID                  *string
	ContinueFromChatID      *string
	EngineConfigID          string
	AgentProfileID          *string
	Thinking                bool
	ProjectConfigID         string
	SectionID               *string
	FrontendAffinityToken   *string
	AllowUnscoped           bool
	BranchParentChatID      *string
	BranchFromMessageID     *string
	IsBranchRequest         bool
	PermissionMode          ChatPermissionMode
	SearchEnabled           bool
	AppGenerationMode       *string
	AppGenerationModePrompt string
	AdditionalInputs        map[string]any
	CompletionGuardEnabled  bool
}

type startChatConversation struct {
	ChatID                 string
	PrefetchedExternalRuns []agentruns.Run
	PriorMessages          []map[string]any
	ParentRun              *agentruns.Run
}

type resolvedStartChatEngine struct {
	EngineConfig   agentruns.EngineConfig
	ExternalConfig externalagentconfigs.Config
}

type preparedStartChatRun struct {
	ChatID         string
	Profile        *agentprofiles.Profile
	ProfileID      *string
	Inputs         map[string]any
	EngineConfig   agentruns.EngineConfig
	ExternalConfig externalagentconfigs.Config
}

func (s *SendService) StartChat(ctx context.Context, request StartChatRequest) (StartChatResult, error) {
	if err := s.validateStartChatPreconditions(); err != nil {
		return StartChatResult{}, err
	}
	normalized, err := s.normalizeStartChatRequest(ctx, request)
	if err != nil {
		return StartChatResult{}, err
	}
	if err := s.validateStartChatProjectTarget(normalized); err != nil {
		return StartChatResult{}, err
	}
	resolvedEngine, err := s.resolveStartChatEngine(normalized.EngineConfigID)
	if err != nil {
		return StartChatResult{}, err
	}
	conversation, err := s.resolveStartChatConversation(normalized)
	if err != nil {
		return StartChatResult{}, err
	}
	appGenerationByMessageID, err := resolveSubmittedTurnAppGenerationByMessageID(
		normalized,
		conversation.PriorMessages,
	)
	if err != nil {
		return StartChatResult{}, err
	}
	if err := validateStartChatImageRequirements(
		s.appGenerationModes,
		normalized,
		conversation.PriorMessages,
		appGenerationByMessageID,
	); err != nil {
		return StartChatResult{}, err
	}
	preparedRun, err := s.prepareStartChatRun(
		normalized,
		resolvedEngine,
		conversation,
		appGenerationByMessageID,
	)
	if err != nil {
		return StartChatResult{}, err
	}
	return s.startPreparedChatRun(ctx, normalized, conversation, preparedRun)
}

func (s *SendService) validateStartChatPreconditions() error {
	if s == nil || s.executor == nil {
		return ErrExecutorUnavailable
	}
	if s.preflight == nil {
		return ErrSendPreflightCheckerRequired
	}
	return nil
}

func (s *SendService) normalizeStartChatRequest(
	ctx context.Context,
	request StartChatRequest,
) (normalizedStartChatRequest, error) {
	normalizedMessage, projectConfigID, sectionID, permissionMode, err := normalizeStartChatCoreRequest(request)
	if err != nil {
		return normalizedStartChatRequest{}, err
	}
	chatID, continueFromChatID, branchParentChatID, branchFromMessageID, isBranchRequest, err := normalizeStartChatConversationIDs(request)
	if err != nil {
		return normalizedStartChatRequest{}, err
	}
	frontendAffinityToken, err := normalizeFrontendAffinityToken(request.FrontendAffinityToken)
	if err != nil {
		return normalizedStartChatRequest{}, err
	}
	appGenerationMode, appGenerationModePrompt, err := normalizeStartChatGenerationOptions(
		request,
		s.appGenerationModes,
	)
	if err != nil {
		return normalizedStartChatRequest{}, err
	}
	completionGuardEnabled, err := s.resolveCompletionGuardEnabled(ctx)
	if err != nil {
		return normalizedStartChatRequest{}, err
	}
	return normalizedStartChatRequest{
		Message:                 normalizedMessage,
		ChatID:                  chatID,
		ContinueFromChatID:      continueFromChatID,
		EngineConfigID:          strings.TrimSpace(request.EngineConfigID),
		AgentProfileID:          normalizeOptionalString(request.AgentProfileID),
		Thinking:                request.Thinking,
		ProjectConfigID:         projectConfigID,
		SectionID:               sectionID,
		FrontendAffinityToken:   frontendAffinityToken,
		AllowUnscoped:           request.AllowUnscoped,
		BranchParentChatID:      branchParentChatID,
		BranchFromMessageID:     branchFromMessageID,
		IsBranchRequest:         isBranchRequest,
		PermissionMode:          permissionMode,
		SearchEnabled:           request.SearchEnabled,
		AppGenerationMode:       appGenerationMode,
		AppGenerationModePrompt: appGenerationModePrompt,
		AdditionalInputs:        request.AdditionalInputs,
		CompletionGuardEnabled:  completionGuardEnabled,
	}, nil
}

func normalizeStartChatCoreRequest(
	request StartChatRequest,
) (map[string]any, string, *string, ChatPermissionMode, error) {
	normalizedMessage, err := normalizeMessage(request.Message)
	if err != nil {
		return nil, "", nil, "", ErrMessageRequired
	}
	projectConfigID := strings.TrimSpace(request.ProjectConfigID)
	if projectConfigID == "" {
		return nil, "", nil, "", ErrProjectConfigIDRequired
	}
	sectionID := normalizeOptionalString(request.SectionID)
	if sectionID == nil && !request.AllowUnscoped {
		return nil, "", nil, "", ErrSectionIDRequired
	}
	if sectionID != nil && request.AllowUnscoped {
		return nil, "", nil, "", ErrAllowUnscopedRequiresSectionOmitted
	}
	permissionMode, err := validatePermissionMode(request.PermissionMode)
	if err != nil {
		return nil, "", nil, "", err
	}
	return normalizedMessage, projectConfigID, sectionID, permissionMode, nil
}

func normalizeStartChatConversationIDs(
	request StartChatRequest,
) (*string, *string, *string, *string, bool, error) {
	chatID := normalizeOptionalString(request.ChatID)
	continueFromChatID := normalizeOptionalString(request.ContinueFromChatID)
	branchParentChatID := normalizeOptionalString(request.BranchParentChatID)
	branchFromMessageID := normalizeOptionalString(request.BranchFromMessageID)
	isBranchRequest := branchParentChatID != nil || branchFromMessageID != nil
	if isBranchRequest && continueFromChatID != nil {
		return nil, nil, nil, nil, false, ErrContinueFromChatWithBranchEdits
	}
	if chatID != nil && continueFromChatID != nil {
		return nil, nil, nil, nil, false, ErrContinueFromChatRequiresChatIDOmitted
	}
	if isBranchRequest && (branchParentChatID == nil || branchFromMessageID == nil) {
		return nil, nil, nil, nil, false, ErrBranchFieldsRequired
	}
	return chatID, continueFromChatID, branchParentChatID, branchFromMessageID, isBranchRequest, nil
}

func normalizeStartChatGenerationOptions(
	request StartChatRequest,
	appGenerationModes chatmodes.AppGenerationModeResolver,
) (*string, string, error) {
	normalized, err := chatmodes.NormalizeAppGenerationRequest(
		appGenerationModes,
		chatmodes.AppGenerationRequestOptions{
			Mode:                    request.AppGenerationMode,
			AppSpecStreamingEnabled: request.AppSpecStreamingEnabled,
			ReferenceImageURL:       request.AppGenerationReferenceImageURL,
			ReferenceImageNotes:     request.AppGenerationReferenceImageNotes,
		},
	)
	if err != nil {
		return nil, "", err
	}
	return normalized.Mode, normalized.Prompt, nil
}

func (s *SendService) validateStartChatProjectTarget(request normalizedStartChatRequest) error {
	projectDocument := s.projectState.Snapshot().Document
	project, err := projectDocument.ProjectByID(request.ProjectConfigID)
	if err != nil {
		return err
	}
	if request.SectionID == nil {
		return nil
	}
	_, _, _, err = project.ResolveSection(*request.SectionID)
	return err
}

func (s *SendService) resolveStartChatEngine(engineConfigID string) (resolvedStartChatEngine, error) {
	engineConfig, err := s.engines.Get(engineConfigID)
	if err != nil {
		return resolvedStartChatEngine{}, err
	}
	if engineConfig.EngineType != agentruns.EngineTypeExternalAgent {
		return resolvedStartChatEngine{}, ErrExternalAgentEngineRequired
	}
	if engineConfig.ExternalAgentConfigID == nil || strings.TrimSpace(*engineConfig.ExternalAgentConfigID) == "" {
		return resolvedStartChatEngine{}, ErrExternalAgentConfigIDRequired
	}
	externalConfig, err := s.configs.Get(strings.TrimSpace(*engineConfig.ExternalAgentConfigID))
	if err != nil {
		return resolvedStartChatEngine{}, err
	}
	preflightStatus, err := s.preflight.Check(externalConfig)
	if err != nil {
		return resolvedStartChatEngine{}, err
	}
	if !preflightStatus.Available {
		return resolvedStartChatEngine{}, &PreflightUnavailableError{Status: preflightStatus}
	}
	return resolvedStartChatEngine{
		EngineConfig:   engineConfig,
		ExternalConfig: externalConfig,
	}, nil
}

func (s *SendService) resolveStartChatConversation(
	request normalizedStartChatRequest,
) (startChatConversation, error) {
	chatID, prefetchedExternalRuns, err := s.resolveStartChatID(request)
	if err != nil {
		return startChatConversation{}, err
	}
	priorMessages, parentRun, err := s.resolveStartChatPriorMessages(
		request,
		chatID,
		prefetchedExternalRuns,
	)
	if err != nil {
		return startChatConversation{}, err
	}
	return startChatConversation{
		ChatID:                 chatID,
		PrefetchedExternalRuns: prefetchedExternalRuns,
		PriorMessages:          priorMessages,
		ParentRun:              parentRun,
	}, nil
}

func (s *SendService) resolveStartChatID(
	request normalizedStartChatRequest,
) (string, []agentruns.Run, error) {
	if request.IsBranchRequest {
		chatID := newChatID()
		prefetchedExternalRuns, err := s.ensureExternalChatIDCompatible(
			*request.BranchParentChatID,
			request.EngineConfigID,
			request.ProjectConfigID,
		)
		if err != nil {
			return "", nil, err
		}
		return chatID, prefetchedExternalRuns, nil
	}
	chatID := derefOptionalString(request.ChatID)
	if chatID == "" {
		chatID = newChatID()
	}
	prefetchedExternalRuns, err := s.ensureExternalChatIDCompatible(
		chatID,
		request.EngineConfigID,
		request.ProjectConfigID,
	)
	if err != nil {
		return "", nil, err
	}
	return chatID, prefetchedExternalRuns, nil
}

func (s *SendService) resolveStartChatPriorMessages(
	request normalizedStartChatRequest,
	chatID string,
	prefetchedExternalRuns []agentruns.Run,
) ([]map[string]any, *agentruns.Run, error) {
	if request.IsBranchRequest {
		return s.resolveBranchStartChatPriorMessages(request, prefetchedExternalRuns)
	}
	priorMessages, err := s.loadStartChatPriorMessages(request, chatID, prefetchedExternalRuns)
	if err != nil {
		return nil, nil, err
	}
	return buildInputMessages(priorMessages, request.Message), nil, nil
}

func (s *SendService) loadStartChatPriorMessages(
	request normalizedStartChatRequest,
	chatID string,
	prefetchedExternalRuns []agentruns.Run,
) ([]map[string]any, error) {
	switch {
	case request.ChatID != nil:
		return s.getPriorMessagesForExternalChat(chatID, request.ProjectConfigID, prefetchedExternalRuns)
	case request.ContinueFromChatID != nil:
		return s.getPriorMessagesForSeedChat(*request.ContinueFromChatID, request.ProjectConfigID)
	default:
		return []map[string]any{}, nil
	}
}

func (s *SendService) resolveBranchStartChatPriorMessages(
	request normalizedStartChatRequest,
	prefetchedExternalRuns []agentruns.Run,
) ([]map[string]any, *agentruns.Run, error) {
	run, err := s.getLatestRunForExternalChat(
		*request.BranchParentChatID,
		request.ProjectConfigID,
	)
	if err != nil {
		return nil, nil, err
	}
	priorMessages, err := buildBranchSourceMessages(run, *request.BranchFromMessageID)
	if err != nil {
		return nil, nil, err
	}
	priorMessages, err = buildBranchMessages(priorMessages, request.Message, *request.BranchFromMessageID)
	if err != nil {
		return nil, nil, err
	}
	return priorMessages, run, nil
}

func buildBranchSourceMessages(run *agentruns.Run, branchFromMessageID string) ([]map[string]any, error) {
	if run == nil {
		return []map[string]any{}, nil
	}
	state, err := buildChatStateFromRun(run.Clone())
	if err != nil {
		return nil, err
	}
	priorMessages := state.Messages
	if hasMessageID(priorMessages, branchFromMessageID) {
		return priorMessages, nil
	}
	return parseInputMessages(run.Clone())
}

func resolveSubmittedTurnAppGenerationByMessageID(
	request normalizedStartChatRequest,
	priorMessages []map[string]any,
) (map[string]string, error) {
	submittedMessageID, err := messageID(priorMessages[len(priorMessages)-1])
	if err != nil {
		return nil, err
	}
	appGenerationByMessageID := agentruns.NormalizeSubmittedTurnAppGenerationByMessageID(
		nil,
		submittedMessageID,
		request.AppGenerationMode,
	)
	if request.AdditionalInputs == nil {
		return appGenerationByMessageID, nil
	}
	return agentruns.NormalizeSubmittedTurnAppGenerationByMessageID(
		request.AdditionalInputs["appGenerationByMessageId"],
		submittedMessageID,
		request.AppGenerationMode,
	), nil
}

func validateStartChatImageRequirements(
	appGenerationModes chatmodes.AppGenerationModeResolver,
	request normalizedStartChatRequest,
	priorMessages []map[string]any,
	appGenerationByMessageID map[string]string,
) error {
	if appGenerationModes == nil {
		return nil
	}
	return appGenerationModes.ValidateCurrentTurn(
		request.AppGenerationMode,
		chatmodes.AppGenerationTurnValidationOptions{
			Message:                  request.Message,
			PriorMessages:            priorMessages,
			AppGenerationByMessageID: appGenerationByMessageID,
		},
	)
}

func (s *SendService) prepareStartChatRun(
	request normalizedStartChatRequest,
	resolvedEngine resolvedStartChatEngine,
	conversation startChatConversation,
	appGenerationByMessageID map[string]string,
) (preparedStartChatRun, error) {
	profile, profileID, err := s.resolveStartChatProfile(request.AgentProfileID)
	if err != nil {
		return preparedStartChatRun{}, err
	}
	inputs, err := s.buildStartChatInputs(
		request,
		resolvedEngine,
		conversation,
		appGenerationByMessageID,
		profile,
	)
	if err != nil {
		return preparedStartChatRun{}, err
	}
	return preparedStartChatRun{
		ChatID:         conversation.ChatID,
		Profile:        profile,
		ProfileID:      profileID,
		Inputs:         inputs,
		EngineConfig:   resolvedEngine.EngineConfig,
		ExternalConfig: resolvedEngine.ExternalConfig,
	}, nil
}

func (s *SendService) resolveStartChatProfile(
	agentProfileID *string,
) (*agentprofiles.Profile, *string, error) {
	if agentProfileID == nil {
		return nil, nil, nil
	}
	if s.profiles == nil {
		return nil, nil, agentprofiles.ErrProfileNotFound
	}
	resolvedProfile, err := s.profiles.Get(*agentProfileID)
	if err != nil {
		return nil, nil, err
	}
	return &resolvedProfile, stringPtr(resolvedProfile.ID), nil
}

func (s *SendService) buildStartChatInputs(
	request normalizedStartChatRequest,
	resolvedEngine resolvedStartChatEngine,
	conversation startChatConversation,
	appGenerationByMessageID map[string]string,
	profile *agentprofiles.Profile,
) (map[string]any, error) {
	inputs := cloneAnyMap(request.AdditionalInputs)
	if inputs == nil {
		inputs = map[string]any{}
	}
	inputs["appGenerationByMessageId"] = appGenerationByMessageID
	inputs["chatId"] = conversation.ChatID
	inputs["projectConfigId"] = request.ProjectConfigID
	inputs["thinking"] = request.Thinking
	inputs["engineConfigId"] = resolvedEngine.EngineConfig.ID
	inputs["runType"] = RunTypeExternalAgent
	inputs["permissionMode"] = string(request.PermissionMode)
	inputs["searchEnabled"] = request.SearchEnabled
	inputs["messages"] = messageSliceToJSONList(conversation.PriorMessages)
	if err := s.attachStartChatPayload(
		conversation.PriorMessages,
		request.ProjectConfigID,
		resolvedEngine.ExternalConfig.ToolType,
		inputs,
	); err != nil {
		return nil, err
	}
	applyStartChatExecutionInputs(
		inputs,
		request,
		resolvedEngine.ExternalConfig.ToolType,
		profile,
	)
	inputs["systemPrompt"] = buildStartChatSystemPrompt(
		profile,
		request,
		resolvedEngine.ExternalConfig.ToolType,
		conversation.PrefetchedExternalRuns,
	)
	inputs["completionGuardEnabled"] = request.CompletionGuardEnabled
	s.applyStartChatConversationInputs(inputs, request, conversation, resolvedEngine.ExternalConfig.ToolType)
	return inputs, nil
}

func (s *SendService) attachStartChatPayload(
	priorMessages []map[string]any,
	projectConfigID string,
	toolType externalagentconfigs.ToolType,
	inputs map[string]any,
) error {
	if !chatattachments.HasAttachments(priorMessages) {
		return nil
	}
	if s.attachments == nil {
		return ErrSendAttachmentsRequired
	}
	attachmentPayload, err := s.attachments.BuildPayload(chatattachments.BuildPayloadRequest{
		Messages:            priorMessages,
		ProjectConfigID:     projectConfigID,
		IncludeText:         toolType == externalagentconfigs.ToolTypeClaudeCode,
		IncludeTextNoImages: toolType == externalagentconfigs.ToolTypeCodex,
		IncludeDownloadURLs: toolType == externalagentconfigs.ToolTypeCodex,
	})
	if err != nil {
		return err
	}
	for key, value := range attachmentPayload.AsMap() {
		inputs[key] = value
	}
	return nil
}

func applyStartChatExecutionInputs(
	inputs map[string]any,
	request normalizedStartChatRequest,
	toolType externalagentconfigs.ToolType,
	profile *agentprofiles.Profile,
) {
	applyExternalReasoningDefaults(inputs, toolType, request.Thinking)
	if approvalPolicyOverride := resolveExternalApprovalPolicyOverride(request.PermissionMode, toolType); approvalPolicyOverride != nil {
		inputs["approvalPolicy"] = *approvalPolicyOverride
	}
	if sandboxPolicyOverride := resolveExternalSandboxPolicyOverride(request.PermissionMode, toolType); sandboxPolicyOverride != nil {
		inputs["sandboxPolicy"] = *sandboxPolicyOverride
	}
	if toolType == externalagentconfigs.ToolTypeClaudeCode && !hasExplicitClaudeAllowedToolsInput(inputs) {
		if allowedTools := buildClaudeAllowedToolsFromProfile(profile, request.CompletionGuardEnabled); len(allowedTools) > 0 {
			inputs["allowedTools"] = append([]string(nil), allowedTools...)
		}
	}
}

func buildStartChatSystemPrompt(
	profile *agentprofiles.Profile,
	request normalizedStartChatRequest,
	toolType externalagentconfigs.ToolType,
	prefetchedExternalRuns []agentruns.Run,
) string {
	systemPromptSections := []string{
		buildExternalProfilePrompt(profile),
		request.AppGenerationModePrompt,
		buildExecutionPolicyPrompt(request.PermissionMode, request.SearchEnabled),
		buildSettaMCPAwarenessPrompt(toolType, resolveLatestSettaMCPStatus(prefetchedExternalRuns)),
	}
	if request.CompletionGuardEnabled {
		systemPromptSections = append(systemPromptSections, requiredErrorCheckPrompt)
	}
	return combinePromptSections(systemPromptSections...)
}

func resolveLatestSettaMCPStatus(
	prefetchedExternalRuns []agentruns.Run,
) *mcpx.ServerRuntimeStatus {
	latestRun, ok := selectLatestRun(prefetchedExternalRuns)
	if !ok {
		return nil
	}
	statuses := loadExternalMCPStatusSnapshot(latestRun.Outputs)
	for index := range statuses {
		status := statuses[index]
		if strings.TrimSpace(status.ServerID) != "setta" {
			continue
		}
		statusCopy := status
		return &statusCopy
	}
	return nil
}

func (s *SendService) applyStartChatConversationInputs(
	inputs map[string]any,
	request normalizedStartChatRequest,
	conversation startChatConversation,
	toolType externalagentconfigs.ToolType,
) {
	if request.IsBranchRequest {
		inputs["branchParentChatId"] = *request.BranchParentChatID
		inputs["branchFromMessageId"] = *request.BranchFromMessageID
		inputs["branchRootChatId"] = resolveBranchRootChatID(
			conversation.ParentRun,
			*request.BranchParentChatID,
		)
		inputs["branchCreatedAt"] = s.timeNow().UTC().UnixMilli()
	}
	if request.SectionID != nil {
		inputs["sectionId"] = *request.SectionID
	}
	if request.AllowUnscoped {
		inputs["allowUnscoped"] = true
	}
	if request.FrontendAffinityToken != nil {
		inputs["frontendAffinityToken"] = *request.FrontendAffinityToken
	}
	applyStartChatContinuationInputs(inputs, toolType, conversation.PrefetchedExternalRuns)
}

func applyStartChatContinuationInputs(
	inputs map[string]any,
	toolType externalagentconfigs.ToolType,
	prefetchedExternalRuns []agentruns.Run,
) {
	latestRun, ok := selectLatestRun(prefetchedExternalRuns)
	if !ok {
		return
	}
	switch toolType {
	case externalagentconfigs.ToolTypeCodex:
		if !hasNonBlankStringInput(inputs, "threadId") {
			if threadID := resolveRunOutputString(latestRun.Clone(), "threadId"); threadID != "" {
				inputs["threadId"] = threadID
			}
		}
	case externalagentconfigs.ToolTypeClaudeCode:
		if !hasNonBlankStringInput(inputs, "sessionId") {
			if sessionID := resolveRunOutputString(latestRun.Clone(), "sessionId"); sessionID != "" {
				inputs["sessionId"] = sessionID
			}
		}
	}
}

func (s *SendService) startPreparedChatRun(
	ctx context.Context,
	request normalizedStartChatRequest,
	conversation startChatConversation,
	prepared preparedStartChatRun,
) (StartChatResult, error) {
	run := agentruns.NewRun(prepared.ProfileID, prepared.Inputs, s.timeNow())
	if err := s.runs.Save(run); err != nil {
		return StartChatResult{}, err
	}
	run.Events = append(run.Events, agentruns.NewRunEvent("run_started", map[string]any{
		"engineConfigId":  prepared.EngineConfig.ID,
		"projectConfigId": request.ProjectConfigID,
		"chatId":          prepared.ChatID,
		"sectionId":       derefOptionalString(request.SectionID),
	}, s.timeNow()))
	if err := s.runs.Save(run); err != nil {
		return StartChatResult{}, err
	}

	started, err := s.executor.Start(ctx, StartRequest{
		Run:             run.Clone(),
		EngineConfig:    prepared.EngineConfig,
		ExternalConfig:  prepared.ExternalConfig,
		Profile:         cloneProfilePtr(prepared.Profile),
		ProjectConfigID: request.ProjectConfigID,
		ChatID:          prepared.ChatID,
		SectionID:       cloneOptionalString(request.SectionID),
		Inputs:          cloneAnyMap(prepared.Inputs),
	})
	if err != nil {
		failedRun, markErr := s.markRunFailed(run, err)
		if markErr != nil {
			return StartChatResult{}, markErr
		}
		return StartChatResult{ChatID: prepared.ChatID, Run: failedRun}, err
	}
	if err := s.runtime.ActivateRun(run.ID, started.Controller); err != nil {
		return StartChatResult{}, err
	}
	if err := s.runtime.SetLiveChatState(run.ID, ChatState{
		Messages:           cloneMessageSlice(conversation.PriorMessages),
		WaitingForResponse: true,
		ToolCallArguments:  map[string]string{},
	}); err != nil {
		_ = started.Controller.Cancel()
		s.runtime.DeactivateRun(run.ID)
		return StartChatResult{}, err
	}
	if readyController, ok := started.Controller.(runtimeReadyController); ok {
		readyController.markRuntimeReady()
	}
	persisted, err := s.runs.Load(run.ID)
	if err != nil {
		return StartChatResult{}, err
	}
	return StartChatResult{
		ChatID: prepared.ChatID,
		Run:    persisted,
	}, nil
}

func (s *SendService) resolveCompletionGuardEnabled(ctx context.Context) (bool, error) {
	if s == nil {
		return loadCompletionGuardEnabled(ctx, "")
	}
	return loadCompletionGuardEnabled(ctx, s.settaFilesRoot)
}

func hasExplicitClaudeAllowedToolsInput(inputs map[string]any) bool {
	if inputs == nil {
		return false
	}
	switch rawTools := inputs["allowedTools"].(type) {
	case []string:
		return len(rawTools) > 0
	case []any:
		return len(rawTools) > 0
	default:
		return false
	}
}

func normalizeClaudeAllowedToolName(entry string) (string, bool) {
	normalized := strings.TrimSpace(entry)
	if normalized == "" {
		return "", false
	}
	if strings.HasPrefix(normalized, "mcp__") {
		return normalized, true
	}
	if !strings.Contains(normalized, mcpx.ToolNameSeparator) {
		return normalized, true
	}
	serverID, toolName, ok := mcpx.SplitNamespacedToolName(normalized)
	if !ok || strings.TrimSpace(serverID) == "" || strings.TrimSpace(toolName) == "" {
		return normalized, true
	}
	return "mcp__" + serverID + mcpx.ToolNameSeparator + toolName, true
}

func requiredClaudeAllowedTools(completionGuardEnabled bool) []string {
	requiredTools := []string{"mcp__" + mcpx.DefaultServerID + mcpx.ToolNameSeparator + "set_agentic_context"}
	if completionGuardEnabled {
		requiredTools = append(requiredTools, "mcp__"+mcpx.DefaultServerID+mcpx.ToolNameSeparator+"report_completion_status")
	}
	return requiredTools
}

func hasClaudeAllowedTool(tools []string, target string) bool {
	for _, tool := range tools {
		if tool == target {
			return true
		}
	}
	return false
}

func buildClaudeAllowedToolsFromProfile(profile *agentprofiles.Profile, completionGuardEnabled bool) []string {
	if profile == nil || len(profile.ToolAllowlist) == 0 {
		return nil
	}
	tools := make([]string, 0, len(profile.ToolAllowlist)+2)
	for _, entry := range profile.ToolAllowlist {
		normalized, ok := normalizeClaudeAllowedToolName(entry)
		if !ok {
			continue
		}
		tools = append(tools, normalized)
	}
	for _, requiredTool := range requiredClaudeAllowedTools(completionGuardEnabled) {
		if !hasClaudeAllowedTool(tools, requiredTool) {
			tools = append(tools, requiredTool)
		}
	}
	if len(tools) == 0 {
		return nil
	}
	return tools
}

func hasNonBlankStringInput(inputs map[string]any, key string) bool {
	if inputs == nil {
		return false
	}
	raw, ok := inputs[key]
	if !ok {
		return false
	}
	value, ok := raw.(string)
	return ok && strings.TrimSpace(value) != ""
}

func (s *SendService) markRunFailed(run agentruns.Run, runErr error) (agentruns.Run, error) {
	return persistExternalAgentRunFailure(
		s.runs,
		s.runtime,
		s.timeNow,
		run.ID,
		runErr,
		nil,
	)
}

func (s *SendService) ensureExternalChatIDCompatible(chatID string, engineConfigID string, projectConfigID string) ([]agentruns.Run, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return []agentruns.Run{}, nil
	}
	llmRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return nil, err
	}
	if len(llmRuns) > 0 {
		return nil, ErrChatEngineMismatch
	}
	externalRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeExternalAgent),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return nil, err
	}
	for _, run := range externalRuns {
		if resolveRunInputString(run, "engineConfigId") != engineConfigID {
			return nil, ErrChatEngineMismatch
		}
		if resolveRunInputString(run, "projectConfigId") != projectConfigID {
			return nil, ErrChatProjectConfigMismatch
		}
	}
	return externalRuns, nil
}

func (s *SendService) getPriorMessagesForExternalChat(chatID string, projectConfigID string, prefetched []agentruns.Run) ([]map[string]any, error) {
	runs := prefetched
	if runs == nil {
		filter := agentruns.RunFilter{
			RunType:         stringPtr(RunTypeExternalAgent),
			ChatID:          stringPtr(chatID),
			ProjectConfigID: stringPtr(projectConfigID),
		}
		var err error
		runs, err = s.runs.ListByMetadata(filter)
		if err != nil {
			return nil, err
		}
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return []map[string]any{}, nil
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *SendService) getPriorMessagesForSeedChat(chatID string, projectConfigID string) ([]map[string]any, error) {
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return nil, &ContinueFromChatSourceNotFoundError{ChatID: chatID}
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *SendService) getLatestRunForExternalChat(chatID string, projectConfigID string) (*agentruns.Run, error) {
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	run, ok := selectLatestRun(runs)
	if !ok {
		return nil, nil
	}
	return &run, nil
}

func validatePermissionMode(mode ChatPermissionMode) (ChatPermissionMode, error) {
	switch ChatPermissionMode(strings.TrimSpace(string(mode))) {
	case projectstate.ChatPermissionModeMinimal:
		return projectstate.ChatPermissionModeMinimal, nil
	case projectstate.ChatPermissionModeYOLO:
		return projectstate.ChatPermissionModeYOLO, nil
	case projectstate.ChatPermissionModeConfigTomlCustom:
		return projectstate.ChatPermissionModeConfigTomlCustom, nil
	case "":
		return "", ErrPermissionModeRequired
	default:
		return "", ErrPermissionModeInvalid
	}
}

func normalizeFrontendAffinityToken(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, ErrFrontendAffinityTokenInvalid
	}
	return &trimmed, nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func buildExecutionPolicyPrompt(permissionMode ChatPermissionMode, searchEnabled bool) string {
	lines := []string{
		"## Runtime execution settings",
		fmt.Sprintf("- permissionMode: %s", permissionMode),
		fmt.Sprintf("- searchEnabled: %t", searchEnabled),
	}
	if !searchEnabled {
		lines = append(lines, "- Search is disabled for this run. Do not rely on search tools; use existing context and local tools only.")
	}
	return strings.Join(lines, "\n")
}

func resolveExternalApprovalPolicyOverride(permissionMode ChatPermissionMode, toolType externalagentconfigs.ToolType) *string {
	if permissionMode == projectstate.ChatPermissionModeConfigTomlCustom {
		return nil
	}
	switch toolType {
	case externalagentconfigs.ToolTypeClaudeCode:
		if permissionMode == projectstate.ChatPermissionModeMinimal {
			return stringPtr("default")
		}
		if permissionMode == projectstate.ChatPermissionModeYOLO {
			return stringPtr("bypassPermissions")
		}
		return nil
	default:
		if permissionMode == projectstate.ChatPermissionModeMinimal {
			return stringPtr("on-request")
		}
		if permissionMode == projectstate.ChatPermissionModeYOLO {
			return stringPtr("never")
		}
		return nil
	}
}

func resolveExternalSandboxPolicyOverride(permissionMode ChatPermissionMode, toolType externalagentconfigs.ToolType) *string {
	if permissionMode == projectstate.ChatPermissionModeConfigTomlCustom {
		return nil
	}
	if toolType != externalagentconfigs.ToolTypeCodex {
		return nil
	}
	if permissionMode == projectstate.ChatPermissionModeMinimal {
		return stringPtr("workspace-write")
	}
	if permissionMode == projectstate.ChatPermissionModeYOLO {
		return stringPtr("danger-full-access")
	}
	return nil
}

func applyExternalReasoningDefaults(inputs map[string]any, toolType externalagentconfigs.ToolType, thinking bool) {
	if toolType != externalagentconfigs.ToolTypeCodex {
		return
	}
	if _, ok := inputs["effort"]; !ok {
		if thinking {
			inputs["effort"] = "high"
		} else {
			inputs["effort"] = "low"
		}
	}
	if _, ok := inputs["summary"]; !ok {
		if thinking {
			inputs["summary"] = "auto"
		} else {
			inputs["summary"] = "none"
		}
	}
}

func buildInputMessages(priorMessages []map[string]any, message map[string]any) []map[string]any {
	if hasMessageID(priorMessages, mustMessageID(message)) {
		return cloneMessageSlice(priorMessages)
	}
	return append(cloneMessageSlice(priorMessages), cloneMessageOrPanic(message))
}

func buildBranchMessages(priorMessages []map[string]any, editedMessage map[string]any, branchFromMessageID string) ([]map[string]any, error) {
	for index, message := range priorMessages {
		messageID, err := messageID(message)
		if err != nil || messageID != branchFromMessageID {
			continue
		}
		updated := cloneMessageOrPanic(editedMessage)
		updated["id"] = branchFromMessageID
		return append(cloneMessageSlice(priorMessages[:index]), updated), nil
	}
	return nil, &BranchMessageNotFoundError{MessageID: branchFromMessageID}
}

func hasMessageID(messages []map[string]any, target string) bool {
	for _, message := range messages {
		messageID, err := messageID(message)
		if err == nil && messageID == target {
			return true
		}
	}
	return false
}

func mustMessageID(message map[string]any) string {
	id, err := messageID(message)
	if err != nil {
		panic(err)
	}
	return id
}

func resolveBranchRootChatID(parentRun *agentruns.Run, parentChatID string) string {
	if parentRun != nil && parentRun.Inputs != nil {
		if rawRoot := resolveRunInputString(parentRun.Clone(), "branchRootChatId"); rawRoot != "" {
			return rawRoot
		}
		if rawParent := resolveRunInputString(parentRun.Clone(), "branchParentChatId"); rawParent != "" {
			return rawParent
		}
	}
	return parentChatID
}

func resolveRunInputString(run agentruns.Run, key string) string {
	if run.Inputs == nil {
		return ""
	}
	raw, ok := run.Inputs[key]
	if !ok {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func resolveRunOutputString(run agentruns.Run, key string) string {
	if run.Outputs == nil {
		return ""
	}
	raw, ok := run.Outputs[key]
	if !ok {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func messageSliceToJSONList(messages []map[string]any) []any {
	result := make([]any, 0, len(messages))
	for _, message := range messages {
		result = append(result, cloneMessageOrPanic(message))
	}
	return result
}

func combinePromptSections(sections ...string) string {
	parts := make([]string, 0, len(sections))
	for _, section := range sections {
		trimmed := strings.TrimSpace(section)
		if trimmed == "" {
			continue
		}
		parts = append(parts, trimmed)
	}
	return strings.Join(parts, "\n\n")
}

func cloneProfilePtr(profile *agentprofiles.Profile) *agentprofiles.Profile {
	if profile == nil {
		return nil
	}
	cloned := *profile
	if profile.EngineConfigID != nil {
		engineConfigID := *profile.EngineConfigID
		cloned.EngineConfigID = &engineConfigID
	}
	if profile.MemoryScope != nil {
		memoryScope := *profile.MemoryScope
		cloned.MemoryScope = &memoryScope
	}
	if profile.ToolAllowlist != nil {
		cloned.ToolAllowlist = append([]string(nil), profile.ToolAllowlist...)
	}
	return &cloned
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = deepCloneJSONValue(value)
	}
	return cloned
}

func deepCloneJSONValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		cloned := make(map[string]any, len(typed))
		for key, child := range typed {
			cloned[key] = deepCloneJSONValue(child)
		}
		return cloned
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, child := range typed {
			cloned = append(cloned, deepCloneJSONValue(child))
		}
		return cloned
	default:
		return typed
	}
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func newChatID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err == nil {
		return hex.EncodeToString(buffer)
	}
	return fmt.Sprintf("chat-%d", time.Now().UnixNano())
}
