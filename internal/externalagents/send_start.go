package externalagents

import (
	"context"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/chatmodes"
)

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
