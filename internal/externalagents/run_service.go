package externalagents

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/chatattachments"
	"setta/internal/externalagentconfigs"
	"setta/internal/projectstate"
)

var (
	ErrRunServiceProjectStateRequired = errors.New("external agent run project state is required")
	ErrRunServiceEngineStoreRequired  = errors.New("external agent run engine store is required")
	ErrRunServiceRunStoreRequired     = errors.New("external agent run store is required")
	ErrRunServiceConfigStoreRequired  = errors.New("external agent run config store is required")
	ErrRunServiceRuntimeRequired      = errors.New("external agent run runtime is required")
	ErrRunServicePreflightRequired    = errors.New("external agent run preflight checker is required")
	ErrRunServiceAttachmentsRequired  = errors.New("external agent run attachments service is required")
	ErrInvalidRunInput                = errors.New("invalid external agent run input")
)

type RunServiceOptions struct {
	ProjectState *projectstate.Runtime
	Engines      *agentruns.EngineStore
	Runs         *agentruns.RunStore
	Configs      *externalagentconfigs.Store
	Runtime      *Runtime
	Preflight    externalagentconfigs.Checker
	Attachments  *chatattachments.Service
	Executor     Executor
	TimeNow      func() time.Time
}

type RunService struct {
	projectState *projectstate.Runtime
	engines      *agentruns.EngineStore
	runs         *agentruns.RunStore
	configs      *externalagentconfigs.Store
	runtime      *Runtime
	preflight    externalagentconfigs.Checker
	attachments  *chatattachments.Service
	executor     Executor
	timeNow      func() time.Time
}

type preparedRun struct {
	engineConfig    agentruns.EngineConfig
	externalConfig  externalagentconfigs.Config
	projectConfigID string
	chatID          string
	sectionID       *string
	inputs          map[string]any
	initialMessages []map[string]any
	profile         agentprofiles.Profile
}

type preparedRunInputs struct {
	projectConfigID string
	chatID          string
	sectionID       *string
	thinking        bool
	inputs          map[string]any
	initialMessages []map[string]any
}

type runScopeSelection struct {
	sectionID     *string
	allowUnscoped bool
}

func NewRunService(options RunServiceOptions) (*RunService, error) {
	if options.ProjectState == nil {
		return nil, ErrRunServiceProjectStateRequired
	}
	if options.Engines == nil {
		return nil, ErrRunServiceEngineStoreRequired
	}
	if options.Runs == nil {
		return nil, ErrRunServiceRunStoreRequired
	}
	if options.Configs == nil {
		return nil, ErrRunServiceConfigStoreRequired
	}
	if options.Runtime == nil {
		return nil, ErrRunServiceRuntimeRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &RunService{
		projectState: options.ProjectState,
		engines:      options.Engines,
		runs:         options.Runs,
		configs:      options.Configs,
		runtime:      options.Runtime,
		preflight:    options.Preflight,
		attachments:  options.Attachments,
		executor:     options.Executor,
		timeNow:      timeNow,
	}, nil
}

func (s *RunService) Disabled() bool {
	return s == nil || s.executor == nil
}

func (s *RunService) ValidateRun(profile agentprofiles.Profile, inputs map[string]any) error {
	_, err := s.prepareRun(profile, inputs, "")
	return err
}

func (s *RunService) StartRun(ctx context.Context, profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
	if s == nil || s.executor == nil {
		return agentruns.Run{}, ErrExecutorUnavailable
	}
	prepared, err := s.prepareRun(profile, inputs, "")
	if err != nil {
		return agentruns.Run{}, err
	}
	run, err := s.initializeRun(&prepared)
	if err != nil {
		return agentruns.Run{}, err
	}
	if err := s.persistStartedRun(&run, prepared); err != nil {
		return agentruns.Run{}, err
	}
	started, err := s.executor.Start(ctx, buildRunStartRequest(run, prepared))
	if err != nil {
		return s.markRunFailed(run, err)
	}
	if err := s.activateStartedRun(run.ID, started.Controller, prepared.initialMessages); err != nil {
		return agentruns.Run{}, err
	}
	return s.runs.Load(run.ID)
}

func (s *RunService) initializeRun(prepared *preparedRun) (agentruns.Run, error) {
	run := agentruns.NewRun(resolveRunProfileID(prepared.profile), prepared.inputs, s.timeNow())
	if prepared.chatID != "" {
		return run, nil
	}
	prepared.chatID = run.ID
	run.Inputs = cloneAnyMap(prepared.inputs)
	run.Inputs["chatId"] = prepared.chatID
	if err := s.seedChatContinuity(run.Inputs, prepared.chatID, prepared.projectConfigID, prepared.engineConfig.ID, prepared.externalConfig.ToolType); err != nil {
		return agentruns.Run{}, err
	}
	return run, nil
}

func resolveRunProfileID(profile agentprofiles.Profile) *string {
	profileID := strings.TrimSpace(profile.ID)
	if profileID == "" {
		return nil
	}
	return stringPtr(profileID)
}

func (s *RunService) persistStartedRun(run *agentruns.Run, prepared preparedRun) error {
	if err := s.runs.Save(*run); err != nil {
		return err
	}
	run.Events = append(run.Events, agentruns.NewRunEvent("run_started", map[string]any{
		"engineConfigId":  prepared.engineConfig.ID,
		"projectConfigId": prepared.projectConfigID,
		"chatId":          prepared.chatID,
		"sectionId":       derefOptionalString(prepared.sectionID),
	}, s.timeNow()))
	return s.runs.Save(*run)
}

func buildRunStartRequest(run agentruns.Run, prepared preparedRun) StartRequest {
	return StartRequest{
		Run:             run.Clone(),
		EngineConfig:    prepared.engineConfig,
		ExternalConfig:  prepared.externalConfig,
		Profile:         cloneProfilePtr(&prepared.profile),
		ProjectConfigID: prepared.projectConfigID,
		ChatID:          prepared.chatID,
		SectionID:       cloneOptionalString(prepared.sectionID),
		Inputs:          cloneAnyMap(run.Inputs),
	}
}

func (s *RunService) activateStartedRun(runID string, controller RunController, initialMessages []map[string]any) error {
	if err := s.runtime.ActivateRun(runID, controller); err != nil {
		_ = controller.Cancel()
		return err
	}
	if err := s.runtime.SetLiveChatState(runID, ChatState{
		Messages:           cloneMessageSlice(initialMessages),
		WaitingForResponse: true,
		ToolCallArguments:  map[string]string{},
	}); err != nil {
		_ = controller.Cancel()
		s.runtime.DeactivateRun(runID)
		return err
	}
	if readyController, ok := controller.(runtimeReadyController); ok {
		readyController.markRuntimeReady()
	}
	return nil
}

func (s *RunService) StopRun(runID string) (agentruns.Run, error) {
	if s == nil || s.runtime == nil {
		return agentruns.Run{}, ErrRunServiceRuntimeRequired
	}
	return s.runtime.StopRun(runID)
}

func (s *RunService) WaitForRun(ctx context.Context, runID string) (agentruns.Run, error) {
	if s == nil || s.runtime == nil {
		return agentruns.Run{}, ErrRunServiceRuntimeRequired
	}
	return s.runtime.WaitForRun(ctx, runID)
}

func (s *RunService) prepareRun(profile agentprofiles.Profile, rawInputs map[string]any, synthesizedChatID string) (preparedRun, error) {
	engineConfig, externalConfig, err := s.resolveRunConfig(profile)
	if err != nil {
		return preparedRun{}, err
	}
	normalizedInputs, err := s.normalizePreparedRunInputs(profile, rawInputs, engineConfig.ID, synthesizedChatID)
	if err != nil {
		return preparedRun{}, err
	}
	if err := s.applyChatContinuity(
		normalizedInputs.inputs,
		normalizedInputs.chatID,
		normalizedInputs.projectConfigID,
		engineConfig.ID,
		externalConfig.ToolType,
	); err != nil {
		return preparedRun{}, err
	}
	if err := s.applyAttachmentPayload(
		normalizedInputs.inputs,
		normalizedInputs.initialMessages,
		normalizedInputs.projectConfigID,
		externalConfig.ToolType,
	); err != nil {
		return preparedRun{}, err
	}
	applyExternalReasoningDefaults(normalizedInputs.inputs, externalConfig.ToolType, normalizedInputs.thinking)
	return preparedRun{
		engineConfig:    engineConfig,
		externalConfig:  externalConfig,
		projectConfigID: normalizedInputs.projectConfigID,
		chatID:          normalizedInputs.chatID,
		sectionID:       normalizedInputs.sectionID,
		inputs:          normalizedInputs.inputs,
		initialMessages: normalizedInputs.initialMessages,
		profile:         profile,
	}, nil
}

func (s *RunService) resolveRunConfig(profile agentprofiles.Profile) (agentruns.EngineConfig, externalagentconfigs.Config, error) {
	if s == nil || s.executor == nil {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, ErrExecutorUnavailable
	}
	if s.preflight == nil {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, ErrRunServicePreflightRequired
	}

	engineConfigID := strings.TrimSpace(derefOptionalString(profile.EngineConfigID))
	if engineConfigID == "" {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, agentruns.ErrProfileEngineConfigRequired
	}
	engineConfig, err := s.engines.Get(engineConfigID)
	if err != nil {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, err
	}
	if engineConfig.EngineType != agentruns.EngineTypeExternalAgent {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, ErrExternalAgentEngineRequired
	}
	if engineConfig.ExternalAgentConfigID == nil || strings.TrimSpace(*engineConfig.ExternalAgentConfigID) == "" {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, ErrExternalAgentConfigIDRequired
	}

	externalConfig, err := s.configs.Get(strings.TrimSpace(*engineConfig.ExternalAgentConfigID))
	if err != nil {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, err
	}
	preflightStatus, err := s.preflight.Check(externalConfig)
	if err != nil {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, err
	}
	if !preflightStatus.Available {
		return agentruns.EngineConfig{}, externalagentconfigs.Config{}, &PreflightUnavailableError{Status: preflightStatus}
	}
	return engineConfig, externalConfig, nil
}

func (s *RunService) normalizePreparedRunInputs(
	profile agentprofiles.Profile,
	rawInputs map[string]any,
	engineConfigID string,
	synthesizedChatID string,
) (preparedRunInputs, error) {
	inputs := cloneAnyMap(rawInputs)
	if inputs == nil {
		inputs = map[string]any{}
	}
	projectConfigID, sectionID, err := s.resolveScope(inputs)
	if err != nil {
		return preparedRunInputs{}, err
	}
	if err := s.seedPreparedRunInputs(inputs, profile, engineConfigID, projectConfigID, sectionID); err != nil {
		return preparedRunInputs{}, err
	}
	thinking, initialMessages, err := normalizePreparedRunMessages(inputs, &profile)
	if err != nil {
		return preparedRunInputs{}, err
	}
	chatID, err := normalizePreparedRunChatID(inputs, synthesizedChatID)
	if err != nil {
		return preparedRunInputs{}, err
	}

	return preparedRunInputs{
		projectConfigID: projectConfigID,
		chatID:          chatID,
		sectionID:       sectionID,
		thinking:        thinking,
		inputs:          inputs,
		initialMessages: initialMessages,
	}, nil
}

func (s *RunService) applyChatContinuity(
	inputs map[string]any,
	chatID string,
	projectConfigID string,
	engineConfigID string,
	toolType externalagentconfigs.ToolType,
) error {
	if chatID == "" {
		return nil
	}
	if err := s.ensureExternalChatCompatible(chatID, engineConfigID, projectConfigID); err != nil {
		return err
	}
	return s.seedChatContinuity(inputs, chatID, projectConfigID, engineConfigID, toolType)
}

func (s *RunService) applyAttachmentPayload(
	inputs map[string]any,
	initialMessages []map[string]any,
	projectConfigID string,
	toolType externalagentconfigs.ToolType,
) error {
	if !chatattachments.HasAttachments(initialMessages) {
		return nil
	}
	if s.attachments == nil {
		return ErrRunServiceAttachmentsRequired
	}

	attachmentPayload, err := s.attachments.BuildPayload(chatattachments.BuildPayloadRequest{
		Messages:            initialMessages,
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

func (s *RunService) markRunFailed(run agentruns.Run, runErr error) (agentruns.Run, error) {
	return persistExternalAgentRunFailure(
		s.runs,
		s.runtime,
		s.timeNow,
		run.ID,
		runErr,
		nil,
	)
}

func (s *RunService) resolveScope(inputs map[string]any) (string, *string, error) {
	projectSnapshot := s.projectState.Snapshot().Document
	defaultProjectConfigID := strings.TrimSpace(projectSnapshot.DefaultProjectID)
	if defaultProjectConfigID == "" {
		return "", nil, fmt.Errorf("%w: project state does not define a default project config", ErrInvalidRunInput)
	}
	projectConfigID, err := resolveProjectConfigIDInput(inputs, defaultProjectConfigID)
	if err != nil {
		return "", nil, err
	}
	project, err := projectSnapshot.ProjectByID(projectConfigID)
	if err != nil {
		return "", nil, fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	selection, err := resolveRunScopeSelection(inputs)
	if err != nil {
		return "", nil, err
	}
	if err := validateRunScopeSelection(project, selection); err != nil {
		return "", nil, err
	}
	return projectConfigID, selection.sectionID, nil
}

func resolveProjectConfigIDInput(inputs map[string]any, defaultProjectConfigID string) (string, error) {
	rawProjectConfigID, ok := inputs["projectConfigId"]
	if !ok {
		return defaultProjectConfigID, nil
	}
	projectConfigID, ok := rawProjectConfigID.(string)
	if !ok {
		return "", fmt.Errorf("%w: projectConfigId must be a string", ErrInvalidRunInput)
	}
	return strings.TrimSpace(projectConfigID), nil
}

func resolveRunScopeSelection(inputs map[string]any) (runScopeSelection, error) {
	sectionID, err := resolveRunSectionIDInput(inputs)
	if err != nil {
		return runScopeSelection{}, err
	}
	allowUnscoped, err := resolveAllowUnscopedInput(inputs)
	if err != nil {
		return runScopeSelection{}, err
	}
	return runScopeSelection{
		sectionID:     sectionID,
		allowUnscoped: allowUnscoped,
	}, nil
}

func resolveRunSectionIDInput(inputs map[string]any) (*string, error) {
	rawSectionID, ok := inputs["sectionId"]
	if !ok {
		return nil, nil
	}
	sectionID, ok := rawSectionID.(string)
	if !ok {
		return nil, fmt.Errorf("%w: sectionId must be a string", ErrInvalidRunInput)
	}
	trimmed := strings.TrimSpace(sectionID)
	if trimmed == "" {
		return nil, nil
	}
	return &trimmed, nil
}

func resolveAllowUnscopedInput(inputs map[string]any) (bool, error) {
	rawAllowUnscoped, ok := inputs["allowUnscoped"]
	if !ok {
		return false, nil
	}
	allowUnscoped, ok := rawAllowUnscoped.(bool)
	if !ok {
		return false, fmt.Errorf("%w: allowUnscoped must be a boolean", ErrInvalidRunInput)
	}
	return allowUnscoped, nil
}

func validateRunScopeSelection(project projectstate.Project, selection runScopeSelection) error {
	if selection.sectionID == nil && !selection.allowUnscoped {
		return fmt.Errorf("%w: sectionId is required unless allowUnscoped is true.", ErrInvalidRunInput)
	}
	if selection.sectionID != nil && selection.allowUnscoped {
		return fmt.Errorf("%w: allowUnscoped requires sectionId to be omitted.", ErrInvalidRunInput)
	}
	if selection.sectionID == nil {
		return nil
	}
	if _, _, _, err := project.ResolveSection(*selection.sectionID); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidRunInput, err)
	}
	return nil
}

func (s *RunService) seedPreparedRunInputs(
	inputs map[string]any,
	profile agentprofiles.Profile,
	engineConfigID string,
	projectConfigID string,
	sectionID *string,
) error {
	inputs["projectConfigId"] = projectConfigID
	if err := s.normalizeEngineInput(inputs, engineConfigID); err != nil {
		return err
	}
	if profileID := strings.TrimSpace(profile.ID); profileID != "" {
		inputs["agentProfileId"] = profileID
	}
	if _, ok := inputs["runType"]; !ok {
		inputs["runType"] = RunTypeExternalAgent
	}
	if sectionID != nil {
		inputs["sectionId"] = *sectionID
	}
	return nil
}

func normalizePreparedRunMessages(inputs map[string]any, profile *agentprofiles.Profile) (bool, []map[string]any, error) {
	thinking, err := normalizeThinkingInput(inputs)
	if err != nil {
		return false, nil, err
	}
	initialMessages, synthesizedFromPrompt, err := normalizeInitialMessages(inputs)
	if err != nil {
		return false, nil, err
	}
	if len(initialMessages) > 0 {
		inputs["messages"] = messageSliceToJSONList(initialMessages)
	}
	if synthesizedFromPrompt {
		delete(inputs, "prompt")
	}
	systemPrompt, err := normalizeRunSystemPrompt(inputs, profile)
	if err != nil {
		return false, nil, err
	}
	if systemPrompt != "" {
		inputs["systemPrompt"] = systemPrompt
	}
	return thinking, initialMessages, nil
}

func normalizePreparedRunChatID(inputs map[string]any, synthesizedChatID string) (string, error) {
	chatID, err := normalizeRunChatID(inputs)
	if err != nil {
		return "", err
	}
	if chatID != "" {
		return chatID, nil
	}
	trimmedSynthesizedChatID := strings.TrimSpace(synthesizedChatID)
	if trimmedSynthesizedChatID == "" {
		return "", nil
	}
	inputs["chatId"] = trimmedSynthesizedChatID
	return trimmedSynthesizedChatID, nil
}

func (s *RunService) normalizeEngineInput(inputs map[string]any, engineConfigID string) error {
	if rawEngineConfigID, ok := inputs["engineConfigId"]; ok {
		value, ok := rawEngineConfigID.(string)
		if !ok {
			return fmt.Errorf("%w: engineConfigId must be a string", ErrInvalidRunInput)
		}
		if strings.TrimSpace(value) != engineConfigID {
			return fmt.Errorf("%w: engineConfigId does not match resolved engine config", ErrInvalidRunInput)
		}
	}
	inputs["engineConfigId"] = engineConfigID
	return nil
}

func (s *RunService) ensureExternalChatCompatible(chatID string, engineConfigID string, projectConfigID string) error {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return nil
	}
	llmRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return err
	}
	if len(llmRuns) > 0 {
		return ErrChatEngineMismatch
	}
	externalRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeExternalAgent),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return err
	}
	for _, run := range externalRuns {
		if resolveRunInputString(run, "engineConfigId") != engineConfigID {
			return ErrChatEngineMismatch
		}
		if resolveRunInputString(run, "projectConfigId") != projectConfigID {
			return ErrChatProjectConfigMismatch
		}
	}
	return nil
}

func (s *RunService) seedChatContinuity(inputs map[string]any, chatID string, projectConfigID string, engineConfigID string, toolType externalagentconfigs.ToolType) error {
	if strings.TrimSpace(chatID) == "" {
		return nil
	}
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr(projectConfigID),
	})
	if err != nil {
		return err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return nil
	}
	if resolveRunInputString(latestRun, "engineConfigId") != engineConfigID {
		return nil
	}
	switch toolType {
	case externalagentconfigs.ToolTypeCodex:
		if resolveRunOutputString(latestRun, "threadId") != "" && strings.TrimSpace(stringValue(inputs["threadId"])) == "" {
			inputs["threadId"] = resolveRunOutputString(latestRun, "threadId")
		}
	case externalagentconfigs.ToolTypeClaudeCode:
		if resolveRunOutputString(latestRun, "sessionId") != "" && strings.TrimSpace(stringValue(inputs["sessionId"])) == "" {
			inputs["sessionId"] = resolveRunOutputString(latestRun, "sessionId")
		}
	}
	return nil
}

func normalizeThinkingInput(inputs map[string]any) (bool, error) {
	rawThinking, ok := inputs["thinking"]
	if !ok {
		return false, nil
	}
	thinking, ok := rawThinking.(bool)
	if !ok {
		return false, fmt.Errorf("%w: thinking must be a boolean", ErrInvalidRunInput)
	}
	return thinking, nil
}

func normalizeRunSystemPrompt(inputs map[string]any, profile *agentprofiles.Profile) (string, error) {
	rawSystemPrompt, ok := inputs["systemPrompt"]
	if !ok {
		return buildExternalProfilePrompt(profile), nil
	}
	value, ok := rawSystemPrompt.(string)
	if !ok {
		return "", fmt.Errorf("%w: systemPrompt must be a string", ErrInvalidRunInput)
	}
	return combinePromptSections(buildExternalProfilePrompt(profile), value), nil
}

func normalizeRunChatID(inputs map[string]any) (string, error) {
	rawChatID, ok := inputs["chatId"]
	if !ok {
		return "", nil
	}
	value, ok := rawChatID.(string)
	if !ok {
		return "", fmt.Errorf("%w: chatId must be a string", ErrInvalidRunInput)
	}
	return strings.TrimSpace(value), nil
}

func normalizeInitialMessages(inputs map[string]any) ([]map[string]any, bool, error) {
	if rawMessages, ok := inputs["messages"]; ok {
		messages, err := normalizeMessageInputList(rawMessages)
		if err != nil {
			return nil, false, err
		}
		return messages, false, nil
	}
	rawPrompt, ok := inputs["prompt"]
	if !ok {
		return []map[string]any{}, false, nil
	}
	prompt, ok := rawPrompt.(string)
	if !ok {
		return nil, false, fmt.Errorf("%w: prompt must be a string", ErrInvalidRunInput)
	}
	trimmedPrompt := strings.TrimSpace(prompt)
	if trimmedPrompt == "" {
		return []map[string]any{}, false, nil
	}
	return []map[string]any{
		{
			"id":   newChatID(),
			"role": "user",
			"content": []any{
				map[string]any{
					"type": "text",
					"text": trimmedPrompt,
				},
			},
		},
	}, true, nil
}

func normalizeMessageInputList(raw any) ([]map[string]any, error) {
	switch typed := raw.(type) {
	case nil:
		return []map[string]any{}, nil
	case []map[string]any:
		messages := make([]map[string]any, 0, len(typed))
		for index, message := range typed {
			normalized, err := normalizeInputMessage(message)
			if err != nil {
				return nil, fmt.Errorf("%w: messages[%d]: %v", ErrInvalidRunInput, index, err)
			}
			messages = append(messages, normalized)
		}
		return messages, nil
	case []any:
		messages := make([]map[string]any, 0, len(typed))
		for index, rawMessage := range typed {
			message, ok := rawMessage.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("%w: messages[%d] must be an object", ErrInvalidRunInput, index)
			}
			normalized, err := normalizeInputMessage(message)
			if err != nil {
				return nil, fmt.Errorf("%w: messages[%d]: %v", ErrInvalidRunInput, index, err)
			}
			messages = append(messages, normalized)
		}
		return messages, nil
	default:
		return nil, fmt.Errorf("%w: messages must be a list", ErrInvalidRunInput)
	}
}

func normalizeInputMessage(message map[string]any) (map[string]any, error) {
	cloned := cloneAnyMap(message)
	if strings.TrimSpace(stringValue(cloned["id"])) == "" {
		cloned["id"] = newChatID()
	}
	normalized, err := normalizeMessage(cloned)
	if err != nil {
		return nil, err
	}
	if _, ok := normalized["content"]; !ok {
		return nil, fmt.Errorf("message content is required")
	}
	if _, ok := normalized["content"].([]any); !ok {
		return nil, fmt.Errorf("message content must be a list")
	}
	return normalized, nil
}
