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
	ErrAppGenerationImageAttachmentRequired  = errors.New("json_render_with_image requires a current attached image or retained image provenance from a prior image-mode turn.")
)

type ChatPermissionMode = projectstate.ChatPermissionMode

const (
	ChatPermissionModeMinimal          = projectstate.ChatPermissionModeMinimal
	ChatPermissionModeYolo             = projectstate.ChatPermissionModeYOLO
	ChatPermissionModeConfigTomlCustom = projectstate.ChatPermissionModeConfigTomlCustom
)

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
	ProjectState   *projectstate.Runtime
	Engines        *agentruns.EngineStore
	Runs           *agentruns.RunStore
	Profiles       *agentprofiles.Store
	Configs        *externalagentconfigs.Store
	Runtime        *Runtime
	Preflight      externalagentconfigs.Checker
	Attachments    *chatattachments.Service
	Executor       Executor
	SettaFilesRoot string
	TimeNow        func() time.Time
}

type SendService struct {
	projectState   *projectstate.Runtime
	engines        *agentruns.EngineStore
	runs           *agentruns.RunStore
	profiles       *agentprofiles.Store
	configs        *externalagentconfigs.Store
	runtime        *Runtime
	preflight      externalagentconfigs.Checker
	attachments    *chatattachments.Service
	executor       Executor
	settaFilesRoot string
	timeNow        func() time.Time
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
		projectState:   options.ProjectState,
		engines:        options.Engines,
		runs:           options.Runs,
		profiles:       options.Profiles,
		configs:        options.Configs,
		runtime:        options.Runtime,
		preflight:      options.Preflight,
		attachments:    options.Attachments,
		executor:       options.Executor,
		settaFilesRoot: strings.TrimSpace(options.SettaFilesRoot),
		timeNow:        timeNow,
	}, nil
}

func (s *SendService) Disabled() bool {
	return s == nil || s.executor == nil
}

func (s *SendService) StartChat(ctx context.Context, request StartChatRequest) (StartChatResult, error) {
	if s == nil || s.executor == nil {
		return StartChatResult{}, ErrExecutorUnavailable
	}
	if s.preflight == nil {
		return StartChatResult{}, ErrSendPreflightCheckerRequired
	}

	normalizedMessage, err := normalizeMessage(request.Message)
	if err != nil {
		return StartChatResult{}, ErrMessageRequired
	}
	projectConfigID := strings.TrimSpace(request.ProjectConfigID)
	if projectConfigID == "" {
		return StartChatResult{}, ErrProjectConfigIDRequired
	}
	sectionID := normalizeOptionalString(request.SectionID)
	if sectionID == nil && !request.AllowUnscoped {
		return StartChatResult{}, ErrSectionIDRequired
	}
	if sectionID != nil && request.AllowUnscoped {
		return StartChatResult{}, ErrAllowUnscopedRequiresSectionOmitted
	}
	if _, err := validatePermissionMode(request.PermissionMode); err != nil {
		return StartChatResult{}, err
	}

	branchParentChatID := normalizeOptionalString(request.BranchParentChatID)
	branchFromMessageID := normalizeOptionalString(request.BranchFromMessageID)
	isBranchRequest := branchParentChatID != nil || branchFromMessageID != nil
	if isBranchRequest && request.ContinueFromChatID != nil {
		if strings.TrimSpace(*request.ContinueFromChatID) != "" {
			return StartChatResult{}, ErrContinueFromChatWithBranchEdits
		}
	}
	if request.ChatID != nil && request.ContinueFromChatID != nil {
		if strings.TrimSpace(*request.ChatID) != "" && strings.TrimSpace(*request.ContinueFromChatID) != "" {
			return StartChatResult{}, ErrContinueFromChatRequiresChatIDOmitted
		}
	}
	if isBranchRequest && (branchParentChatID == nil || branchFromMessageID == nil) {
		return StartChatResult{}, ErrBranchFieldsRequired
	}
	frontendAffinityToken, err := normalizeFrontendAffinityToken(request.FrontendAffinityToken)
	if err != nil {
		return StartChatResult{}, err
	}
	completionGuardEnabled, err := s.resolveCompletionGuardEnabled(ctx)
	if err != nil {
		return StartChatResult{}, err
	}
	appGenerationMode, err := normalizeAppGenerationMode(request.AppGenerationMode)
	if err != nil {
		return StartChatResult{}, err
	}
	referenceImageURL, referenceImageNotes, err := normalizeReferenceImageInputs(
		request.AppGenerationReferenceImageURL,
		request.AppGenerationReferenceImageNotes,
	)
	if err != nil {
		return StartChatResult{}, err
	}
	if appGenerationMode == nil || *appGenerationMode != AppGenerationModeJSONRenderWithImage {
		referenceImageURL = nil
		referenceImageNotes = nil
	}
	appGenerationModePrompt := buildAppGenerationModePrompt(
		appGenerationMode,
		request.AppSpecStreamingEnabled,
		referenceImageURL,
		referenceImageNotes,
	)

	projectDocument := s.projectState.Snapshot().Document
	project, err := projectDocument.ProjectByID(projectConfigID)
	if err != nil {
		return StartChatResult{}, err
	}
	if sectionID != nil {
		if _, _, _, err := project.ResolveSection(*sectionID); err != nil {
			return StartChatResult{}, err
		}
	}

	engineConfigID := strings.TrimSpace(request.EngineConfigID)
	engineConfig, err := s.engines.Get(engineConfigID)
	if err != nil {
		return StartChatResult{}, err
	}
	if engineConfig.EngineType != agentruns.EngineTypeExternalAgent {
		return StartChatResult{}, ErrExternalAgentEngineRequired
	}
	if engineConfig.ExternalAgentConfigID == nil || strings.TrimSpace(*engineConfig.ExternalAgentConfigID) == "" {
		return StartChatResult{}, ErrExternalAgentConfigIDRequired
	}
	externalConfigID := strings.TrimSpace(*engineConfig.ExternalAgentConfigID)
	externalConfig, err := s.configs.Get(externalConfigID)
	if err != nil {
		return StartChatResult{}, err
	}
	preflightStatus, err := s.preflight.Check(externalConfig)
	if err != nil {
		return StartChatResult{}, err
	}
	if !preflightStatus.Available {
		return StartChatResult{}, &PreflightUnavailableError{Status: preflightStatus}
	}

	var profile *agentprofiles.Profile
	var profileID *string
	if request.AgentProfileID != nil && strings.TrimSpace(*request.AgentProfileID) != "" {
		if s.profiles == nil {
			return StartChatResult{}, agentprofiles.ErrProfileNotFound
		}
		resolvedProfile, err := s.profiles.Get(strings.TrimSpace(*request.AgentProfileID))
		if err != nil {
			return StartChatResult{}, err
		}
		profile = &resolvedProfile
		profileID = stringPtr(resolvedProfile.ID)
	}

	var chatID string
	var externalRunsForChat []agentruns.Run
	if isBranchRequest {
		chatID = newChatID()
		externalRunsForChat, err = s.ensureExternalChatIDCompatible(*branchParentChatID, engineConfigID, projectConfigID)
		if err != nil {
			return StartChatResult{}, err
		}
	} else {
		chatID = strings.TrimSpace(derefOptionalString(request.ChatID))
		if chatID == "" {
			chatID = newChatID()
		}
		externalRunsForChat, err = s.ensureExternalChatIDCompatible(chatID, engineConfigID, projectConfigID)
		if err != nil {
			return StartChatResult{}, err
		}
	}

	priorMessages := []map[string]any{}
	var parentRun *agentruns.Run
	if isBranchRequest {
		run, err := s.getLatestRunForExternalChat(*branchParentChatID, projectConfigID)
		if err != nil {
			return StartChatResult{}, err
		}
		if run != nil {
			parentRun = run
			state, err := buildChatStateFromRun(run.Clone())
			if err != nil {
				return StartChatResult{}, err
			}
			priorMessages = state.Messages
			if !hasMessageID(priorMessages, *branchFromMessageID) {
				priorMessages, err = parseInputMessages(run.Clone())
				if err != nil {
					return StartChatResult{}, err
				}
			}
		}
		priorMessages, err = buildBranchMessages(priorMessages, normalizedMessage, *branchFromMessageID)
		if err != nil {
			return StartChatResult{}, err
		}
	} else {
		if request.ChatID != nil && strings.TrimSpace(*request.ChatID) != "" {
			priorMessages, err = s.getPriorMessagesForExternalChat(chatID, projectConfigID, externalRunsForChat)
			if err != nil {
				return StartChatResult{}, err
			}
		} else if request.ContinueFromChatID != nil && strings.TrimSpace(*request.ContinueFromChatID) != "" {
			priorMessages, err = s.getPriorMessagesForSeedChat(strings.TrimSpace(*request.ContinueFromChatID), projectConfigID)
			if err != nil {
				return StartChatResult{}, err
			}
		}
		priorMessages = buildInputMessages(priorMessages, normalizedMessage)
	}
	submittedMessageID, err := messageID(priorMessages[len(priorMessages)-1])
	if err != nil {
		return StartChatResult{}, err
	}
	appGenerationByMessageID := agentruns.NormalizeSubmittedTurnAppGenerationByMessageID(
		nil,
		submittedMessageID,
		appGenerationMode,
	)
	if request.AdditionalInputs != nil {
		appGenerationByMessageID = agentruns.NormalizeSubmittedTurnAppGenerationByMessageID(
			request.AdditionalInputs["appGenerationByMessageId"],
			submittedMessageID,
			appGenerationMode,
		)
	}
	if appGenerationMode != nil && *appGenerationMode == AppGenerationModeJSONRenderWithImage {
		if !agentruns.MessageHasImageAttachment(normalizedMessage) &&
			!agentruns.HasRetainedImageAttachmentFromImageModeThread(priorMessages, appGenerationByMessageID) {
			return StartChatResult{}, ErrAppGenerationImageAttachmentRequired
		}
	}

	inputs := cloneAnyMap(request.AdditionalInputs)
	if inputs == nil {
		inputs = map[string]any{}
	}
	inputs["appGenerationByMessageId"] = appGenerationByMessageID
	inputs["chatId"] = chatID
	inputs["projectConfigId"] = projectConfigID
	inputs["thinking"] = request.Thinking
	inputs["engineConfigId"] = engineConfigID
	inputs["runType"] = RunTypeExternalAgent
	inputs["permissionMode"] = string(request.PermissionMode)
	inputs["searchEnabled"] = request.SearchEnabled
	inputs["messages"] = messageSliceToJSONList(priorMessages)
	if chatattachments.HasAttachments(priorMessages) {
		if s.attachments == nil {
			return StartChatResult{}, ErrSendAttachmentsRequired
		}
		attachmentPayload, err := s.attachments.BuildPayload(chatattachments.BuildPayloadRequest{
			Messages:            priorMessages,
			ProjectConfigID:     projectConfigID,
			IncludeText:         externalConfig.ToolType == externalagentconfigs.ToolTypeClaudeCode,
			IncludeTextNoImages: externalConfig.ToolType == externalagentconfigs.ToolTypeCodex,
			IncludeDownloadURLs: externalConfig.ToolType == externalagentconfigs.ToolTypeCodex,
		})
		if err != nil {
			return StartChatResult{}, err
		}
		for key, value := range attachmentPayload.AsMap() {
			inputs[key] = value
		}
	}
	applyExternalReasoningDefaults(inputs, externalConfig.ToolType, request.Thinking)
	if approvalPolicyOverride := resolveExternalApprovalPolicyOverride(request.PermissionMode, externalConfig.ToolType); approvalPolicyOverride != nil {
		inputs["approvalPolicy"] = *approvalPolicyOverride
	}
	if sandboxPolicyOverride := resolveExternalSandboxPolicyOverride(request.PermissionMode, externalConfig.ToolType); sandboxPolicyOverride != nil {
		inputs["sandboxPolicy"] = *sandboxPolicyOverride
	}
	if externalConfig.ToolType == externalagentconfigs.ToolTypeClaudeCode && !hasExplicitClaudeAllowedToolsInput(inputs) {
		if allowedTools := buildClaudeAllowedToolsFromProfile(profile, completionGuardEnabled); len(allowedTools) > 0 {
			inputs["allowedTools"] = append([]string(nil), allowedTools...)
		}
	}
	var latestSettaMCPStatus *mcpx.ServerRuntimeStatus
	if latestRun, ok := selectLatestRun(externalRunsForChat); ok {
		statuses := loadExternalMCPStatusSnapshot(latestRun.Outputs)
		for index := range statuses {
			status := statuses[index]
			if strings.TrimSpace(status.ServerID) != "setta" {
				continue
			}
			statusCopy := status
			latestSettaMCPStatus = &statusCopy
			break
		}
	}
	systemPromptSections := []string{
		buildExternalProfilePrompt(profile),
		appGenerationModePrompt,
		buildExecutionPolicyPrompt(request.PermissionMode, request.SearchEnabled),
		buildSettaMCPAwarenessPrompt(externalConfig.ToolType, latestSettaMCPStatus),
	}
	if completionGuardEnabled {
		systemPromptSections = append(systemPromptSections, requiredErrorCheckPrompt)
	}
	inputs["systemPrompt"] = combinePromptSections(systemPromptSections...)
	inputs["completionGuardEnabled"] = completionGuardEnabled
	if isBranchRequest {
		branchRootChatID := resolveBranchRootChatID(parentRun, *branchParentChatID)
		inputs["branchParentChatId"] = *branchParentChatID
		inputs["branchFromMessageId"] = *branchFromMessageID
		inputs["branchRootChatId"] = branchRootChatID
		inputs["branchCreatedAt"] = s.timeNow().UTC().UnixMilli()
	}
	if sectionID != nil {
		inputs["sectionId"] = *sectionID
	}
	if request.AllowUnscoped {
		inputs["allowUnscoped"] = true
	}
	if frontendAffinityToken != nil {
		inputs["frontendAffinityToken"] = *frontendAffinityToken
	}
	if latestRun, ok := selectLatestRun(externalRunsForChat); ok {
		switch externalConfig.ToolType {
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

	run := agentruns.NewRun(profileID, inputs, s.timeNow())
	if err := s.runs.Save(run); err != nil {
		return StartChatResult{}, err
	}
	run.Events = append(run.Events, agentruns.NewRunEvent("run_started", map[string]any{
		"engineConfigId":  engineConfigID,
		"projectConfigId": projectConfigID,
		"chatId":          chatID,
		"sectionId":       derefOptionalString(sectionID),
	}, s.timeNow()))
	if err := s.runs.Save(run); err != nil {
		return StartChatResult{}, err
	}

	started, err := s.executor.Start(ctx, StartRequest{
		Run:             run.Clone(),
		EngineConfig:    engineConfig,
		ExternalConfig:  externalConfig,
		Profile:         cloneProfilePtr(profile),
		ProjectConfigID: projectConfigID,
		ChatID:          chatID,
		SectionID:       cloneOptionalString(sectionID),
		Inputs:          cloneAnyMap(inputs),
	})
	if err != nil {
		failedRun, markErr := s.markRunFailed(run, err)
		if markErr != nil {
			return StartChatResult{}, markErr
		}
		return StartChatResult{ChatID: chatID, Run: failedRun}, err
	}
	if err := s.runtime.ActivateRun(run.ID, started.Controller); err != nil {
		return StartChatResult{}, err
	}
	if err := s.runtime.SetLiveChatState(run.ID, ChatState{
		Messages:           cloneMessageSlice(priorMessages),
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
		ChatID: chatID,
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

func buildClaudeAllowedToolsFromProfile(profile *agentprofiles.Profile, completionGuardEnabled bool) []string {
	if profile == nil || len(profile.ToolAllowlist) == 0 {
		return nil
	}
	tools := make([]string, 0, len(profile.ToolAllowlist)+2)
	for _, entry := range profile.ToolAllowlist {
		normalized := strings.TrimSpace(entry)
		if normalized == "" {
			continue
		}
		if strings.HasPrefix(normalized, "mcp__") {
			tools = append(tools, normalized)
			continue
		}
		if strings.Contains(normalized, mcpx.ToolNameSeparator) {
			serverID, toolName, ok := mcpx.SplitNamespacedToolName(normalized)
			if ok && strings.TrimSpace(serverID) != "" && strings.TrimSpace(toolName) != "" {
				tools = append(tools, "mcp__"+serverID+mcpx.ToolNameSeparator+toolName)
				continue
			}
		}
		tools = append(tools, normalized)
	}
	requiredTools := []string{"mcp__" + mcpx.DefaultServerID + mcpx.ToolNameSeparator + "set_agentic_context"}
	if completionGuardEnabled {
		requiredTools = append(requiredTools, "mcp__"+mcpx.DefaultServerID+mcpx.ToolNameSeparator+"report_completion_status")
	}
	for _, requiredTool := range requiredTools {
		present := false
		for _, tool := range tools {
			if tool == requiredTool {
				present = true
				break
			}
		}
		if !present {
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
	case ChatPermissionModeMinimal:
		return ChatPermissionModeMinimal, nil
	case ChatPermissionModeYolo:
		return ChatPermissionModeYolo, nil
	case ChatPermissionModeConfigTomlCustom:
		return ChatPermissionModeConfigTomlCustom, nil
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
	if permissionMode == ChatPermissionModeConfigTomlCustom {
		return nil
	}
	switch toolType {
	case externalagentconfigs.ToolTypeClaudeCode:
		if permissionMode == ChatPermissionModeMinimal {
			return stringPtr("default")
		}
		if permissionMode == ChatPermissionModeYolo {
			return stringPtr("bypassPermissions")
		}
		return nil
	default:
		if permissionMode == ChatPermissionModeMinimal {
			return stringPtr("on-request")
		}
		if permissionMode == ChatPermissionModeYolo {
			return stringPtr("never")
		}
		return nil
	}
}

func resolveExternalSandboxPolicyOverride(permissionMode ChatPermissionMode, toolType externalagentconfigs.ToolType) *string {
	if permissionMode == ChatPermissionModeConfigTomlCustom {
		return nil
	}
	if toolType != externalagentconfigs.ToolTypeCodex {
		return nil
	}
	if permissionMode == ChatPermissionModeMinimal {
		return stringPtr("workspace-write")
	}
	if permissionMode == ChatPermissionModeYolo {
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
