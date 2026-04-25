package managedchat

import (
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
)

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
	AppSpecStreamingEnabled bool
	AppGenerationMode       *string
	ReferenceImageURL       *string
	ReferenceImageNotes     *string
	AppGenerationModePrompt string
	AdditionalInputs        map[string]any
}

type startChatConversation struct {
	ChatID                string
	PrefetchedManagedRuns []agentruns.Run
	PriorMessages         []map[string]any
	ParentRun             *agentruns.Run
}

type preparedStartChatRun struct {
	ChatID  string
	Profile agentprofiles.Profile
	Inputs  map[string]any
}

func (s *Service) startChat(request StartChatRequest) (StartChatResult, error) {
	if err := s.validateStartChatPreconditions(); err != nil {
		return StartChatResult{}, err
	}
	normalized, err := normalizeStartChatRequest(request)
	if err != nil {
		return StartChatResult{}, err
	}
	if err := s.validateStartChatProjectTarget(normalized); err != nil {
		return StartChatResult{}, err
	}
	resolvedEngine, err := agentruns.ResolveManagedEngine(s.engines, s.llm.Configs(), normalized.EngineConfigID)
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
		normalized,
		conversation.PriorMessages,
		appGenerationByMessageID,
	); err != nil {
		return StartChatResult{}, err
	}
	preparedRun, err := s.prepareStartChatRun(
		normalized,
		resolvedEngine.EngineConfig.ID,
		conversation,
		appGenerationByMessageID,
	)
	if err != nil {
		return StartChatResult{}, err
	}
	return s.startPreparedChatRun(preparedRun)
}

func (s *Service) validateStartChatPreconditions() error {
	if s == nil || s.runs == nil {
		return ErrRunStoreRequired
	}
	if s.projectState == nil {
		return ErrProjectStateRequired
	}
	return nil
}

func normalizeStartChatRequest(request StartChatRequest) (normalizedStartChatRequest, error) {
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
	appGenerationMode, referenceImageURL, referenceImageNotes, appGenerationModePrompt, err := normalizeStartChatGenerationOptions(request)
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
		AppSpecStreamingEnabled: request.AppSpecStreamingEnabled,
		AppGenerationMode:       appGenerationMode,
		ReferenceImageURL:       referenceImageURL,
		ReferenceImageNotes:     referenceImageNotes,
		AppGenerationModePrompt: appGenerationModePrompt,
		AdditionalInputs:        request.AdditionalInputs,
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
) (*string, *string, *string, string, error) {
	appGenerationMode, err := normalizeAppGenerationMode(request.AppGenerationMode)
	if err != nil {
		return nil, nil, nil, "", err
	}
	referenceImageURL, referenceImageNotes, err := normalizeReferenceImageInputs(
		request.AppGenerationReferenceImageURL,
		request.AppGenerationReferenceImageNotes,
	)
	if err != nil {
		return nil, nil, nil, "", err
	}
	if appGenerationMode == nil || *appGenerationMode != string(agentruns.AppGenerationModeJSONRenderWithImage) {
		referenceImageURL = nil
		referenceImageNotes = nil
	}
	return appGenerationMode, referenceImageURL, referenceImageNotes, buildAppGenerationModePrompt(
		appGenerationMode,
		request.AppSpecStreamingEnabled,
		referenceImageURL,
		referenceImageNotes,
	), nil
}

func (s *Service) validateStartChatProjectTarget(request normalizedStartChatRequest) error {
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

func (s *Service) resolveStartChatConversation(request normalizedStartChatRequest) (startChatConversation, error) {
	chatID, prefetchedManagedRuns, err := s.resolveStartChatID(request)
	if err != nil {
		return startChatConversation{}, err
	}
	priorMessages, parentRun, err := s.resolveStartChatPriorMessages(
		request,
		chatID,
		prefetchedManagedRuns,
	)
	if err != nil {
		return startChatConversation{}, err
	}
	return startChatConversation{
		ChatID:                chatID,
		PrefetchedManagedRuns: prefetchedManagedRuns,
		PriorMessages:         priorMessages,
		ParentRun:             parentRun,
	}, nil
}

func (s *Service) resolveStartChatID(request normalizedStartChatRequest) (string, []agentruns.Run, error) {
	if request.IsBranchRequest {
		chatID := newChatID()
		prefetchedManagedRuns, err := s.ensureManagedChatIDCompatible(
			*request.BranchParentChatID,
			request.ProjectConfigID,
		)
		if err != nil {
			return "", nil, err
		}
		return chatID, prefetchedManagedRuns, nil
	}
	chatID := derefOptionalString(request.ChatID)
	if chatID == "" {
		chatID = newChatID()
	}
	prefetchedManagedRuns, err := s.ensureManagedChatIDCompatible(chatID, request.ProjectConfigID)
	if err != nil {
		return "", nil, err
	}
	return chatID, prefetchedManagedRuns, nil
}

func (s *Service) resolveStartChatPriorMessages(
	request normalizedStartChatRequest,
	chatID string,
	prefetchedManagedRuns []agentruns.Run,
) ([]map[string]any, *agentruns.Run, error) {
	if request.IsBranchRequest {
		return s.resolveBranchStartChatPriorMessages(request, prefetchedManagedRuns)
	}
	priorMessages, err := s.loadStartChatPriorMessages(request, chatID, prefetchedManagedRuns)
	if err != nil {
		return nil, nil, err
	}
	return buildInputMessages(priorMessages, request.Message), nil, nil
}

func (s *Service) loadStartChatPriorMessages(
	request normalizedStartChatRequest,
	chatID string,
	prefetchedManagedRuns []agentruns.Run,
) ([]map[string]any, error) {
	switch {
	case request.ChatID != nil:
		return s.getPriorMessagesForManagedChat(chatID, request.ProjectConfigID, prefetchedManagedRuns)
	case request.ContinueFromChatID != nil:
		return s.getPriorMessagesForSeedChat(*request.ContinueFromChatID, request.ProjectConfigID)
	default:
		return []map[string]any{}, nil
	}
}

func (s *Service) resolveBranchStartChatPriorMessages(
	request normalizedStartChatRequest,
	prefetchedManagedRuns []agentruns.Run,
) ([]map[string]any, *agentruns.Run, error) {
	run, err := s.getLatestRunForManagedChat(
		*request.BranchParentChatID,
		request.ProjectConfigID,
		prefetchedManagedRuns,
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
	request normalizedStartChatRequest,
	priorMessages []map[string]any,
	appGenerationByMessageID map[string]string,
) error {
	if request.AppGenerationMode == nil || *request.AppGenerationMode != string(agentruns.AppGenerationModeJSONRenderWithImage) {
		return nil
	}
	if agentruns.MessageHasImageAttachment(request.Message) {
		return nil
	}
	if agentruns.HasRetainedImageAttachmentFromImageModeThread(priorMessages, appGenerationByMessageID) {
		return nil
	}
	return ErrAppGenerationImageAttachmentRequired
}

func (s *Service) prepareStartChatRun(
	request normalizedStartChatRequest,
	engineConfigID string,
	conversation startChatConversation,
	appGenerationByMessageID map[string]string,
) (preparedStartChatRun, error) {
	profile, err := s.buildStartChatProfile(request, engineConfigID)
	if err != nil {
		return preparedStartChatRun{}, err
	}
	return preparedStartChatRun{
		ChatID:  conversation.ChatID,
		Profile: profile,
		Inputs:  s.buildStartChatInputs(request, engineConfigID, conversation, appGenerationByMessageID),
	}, nil
}

func (s *Service) buildStartChatProfile(
	request normalizedStartChatRequest,
	engineConfigID string,
) (agentprofiles.Profile, error) {
	profile, err := s.resolveManagedProfile(request.AgentProfileID, engineConfigID)
	if err != nil {
		return agentprofiles.Profile{}, err
	}
	profile.SystemPrompt = combinePromptSections(
		strings.TrimSpace(profile.SystemPrompt),
		request.AppGenerationModePrompt,
		buildExecutionPolicyPrompt(request.PermissionMode, request.SearchEnabled),
		requiredErrorCheckPrompt,
	)
	profile.EngineConfigID = stringPtr(engineConfigID)
	return profile, nil
}

func (s *Service) buildStartChatInputs(
	request normalizedStartChatRequest,
	engineConfigID string,
	conversation startChatConversation,
	appGenerationByMessageID map[string]string,
) map[string]any {
	inputs := cloneAnyMap(request.AdditionalInputs)
	if inputs == nil {
		inputs = map[string]any{}
	}
	inputs["appGenerationByMessageId"] = appGenerationByMessageID
	inputs["chatId"] = conversation.ChatID
	inputs["projectConfigId"] = request.ProjectConfigID
	inputs["thinking"] = request.Thinking
	inputs["engineConfigId"] = engineConfigID
	inputs["runType"] = RunTypeManagedChat
	inputs["permissionMode"] = string(request.PermissionMode)
	inputs["searchEnabled"] = request.SearchEnabled
	inputs["messages"] = messageSliceToJSONList(conversation.PriorMessages)
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
	return inputs
}

func (s *Service) startPreparedChatRun(prepared preparedStartChatRun) (StartChatResult, error) {
	if s.starter == nil {
		return StartChatResult{}, ErrStarterRequired
	}
	if s.starter.Disabled() {
		return StartChatResult{}, agentruns.ErrManagedExecutorUnavailable
	}
	startedRun, err := s.starter.StartRun(prepared.Profile, prepared.Inputs)
	if err != nil {
		return StartChatResult{}, err
	}
	return StartChatResult{
		ChatID: prepared.ChatID,
		Run:    startedRun,
	}, nil
}
