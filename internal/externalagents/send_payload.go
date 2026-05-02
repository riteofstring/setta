package externalagents

import (
	"context"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/chatattachments"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
)

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
