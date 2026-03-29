package managedchat

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

const (
	RunTypeManagedChat  = "llm_chat"
	runTypeExternalChat = "external_agent"
	runTypeScriptable   = "scriptable_chat"

	AppGenerationModeJSONRender          = "json_render"
	AppGenerationModeJSONRenderWithImage = "json_render_with_image"
	AppGenerationModePromptBuilder       = "prompt_builder"
	AppGenerationModeMCPServer           = "mcp_server"

	maxReferenceImageURLChars   = 4096
	maxReferenceImageNotesChars = 100000
	stopChatWaitTimeout         = 2 * time.Second

	requiredErrorCheckPrompt = "## Required completion gate for create/scaffold work\n" +
		"- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n" +
		"- Report check outcomes explicitly as pass/fail before any completion claim.\n" +
		"- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)

var (
	ErrRunStoreRequired                       = errors.New("managed chat run store is required")
	ErrEngineStoreRequired                    = errors.New("managed chat engine store is required")
	ErrLLMRuntimeRequired                     = errors.New("managed chat llm runtime is required")
	ErrProjectStateRequired                   = errors.New("managed chat project state is required")
	ErrProfileStoreRequired                   = errors.New("managed chat profile store is required")
	ErrStarterRequired                        = errors.New("managed chat runtime is required")
	ErrStopperRequired                        = errors.New("managed chat stop runtime is required")
	ErrChatNotFound                           = errors.New("managed chat not found")
	ErrProjectConfigIDRequired                = errors.New("projectConfigId is required")
	ErrMessageRequired                        = errors.New("message is required")
	ErrPermissionModeRequired                 = errors.New("permissionMode is required")
	ErrPermissionModeInvalid                  = errors.New("permissionMode is invalid")
	ErrSectionIDRequired                      = errors.New("sectionId is required unless allowUnscoped is true.")
	ErrAllowUnscopedRequiresSectionOmitted    = errors.New("allowUnscoped requires sectionId to be omitted.")
	ErrBranchFieldsRequired                   = errors.New("Branch edits require branchParentChatId and branchFromMessageId.")
	ErrContinueFromChatWithBranchEdits        = errors.New("continueFromChatId cannot be used with branch edits.")
	ErrContinueFromChatRequiresChatIDOmitted  = errors.New("continueFromChatId requires chatId to be omitted.")
	ErrFrontendAffinityTokenInvalid           = errors.New("frontendAffinityToken must not be blank")
	ErrAppGenerationModeInvalid               = errors.New("appGenerationMode is invalid")
	ErrAppGenerationReferenceImageURLTooLarge = errors.New(
		"appGenerationReferenceImageUrl is too large. Reduce it or omit it.",
	)
	ErrAppGenerationReferenceImageNotesTooLarge = errors.New(
		"appGenerationReferenceImageNotes is too large. Reduce it or omit it.",
	)
	ErrAppGenerationImageAttachmentRequired = errors.New(
		"json_render_with_image requires a current attached image or retained image provenance from a prior image-mode turn.",
	)
	ErrChatEngineMismatch             = errors.New("Chat engine mismatch; start a new chat.")
	ErrChatProjectConfigMismatch      = errors.New("Chat project config mismatch; start a new chat.")
	ErrContinueFromChatSourceNotFound = errors.New("continuation source chat not found")
)

type ChatPermissionMode = projectstate.ChatPermissionMode

const (
	ChatPermissionModeMinimal          = projectstate.ChatPermissionModeMinimal
	ChatPermissionModeYolo             = projectstate.ChatPermissionModeYOLO
	ChatPermissionModeConfigTomlCustom = projectstate.ChatPermissionModeConfigTomlCustom
)

type LiveChatStateProvider interface {
	GetLiveChatState(runID string) (*ChatState, error)
}

type aiFollowSnapshotProvider interface {
	AIFollowSnapshot(projectConfigID string) []realtime.AIFollowToolArgumentsUpdateContent
}

type ChatStarter interface {
	Disabled() bool
	StartRun(profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error)
}

type RunStopper interface {
	StopRun(runID string) (agentruns.Run, error)
}

type runWaiter interface {
	WaitForRun(ctx context.Context, runID string) (agentruns.Run, error)
}

type ServiceOptions struct {
	ProjectState *projectstate.Runtime
	Runs         *agentruns.RunStore
	Engines      *agentruns.EngineStore
	LLM          *llmconfig.Runtime
	Profiles     *agentprofiles.Store
	Starter      ChatStarter
	Live         LiveChatStateProvider
	Stopper      RunStopper
	TimeNow      func() time.Time
}

type Service struct {
	projectState *projectstate.Runtime
	runs         *agentruns.RunStore
	engines      *agentruns.EngineStore
	llm          *llmconfig.Runtime
	profiles     *agentprofiles.Store
	starter      ChatStarter
	live         LiveChatStateProvider
	stopper      RunStopper
	timeNow      func() time.Time
}

type ChatState struct {
	Messages           []map[string]any `json:"messages"`
	WaitingForResponse bool             `json:"waitingForResponse"`
}

type ChatContextUsage struct {
	ContextWindowTokens *int `json:"contextWindowTokens"`
	ContextUsedTokens   *int `json:"contextUsedTokens"`
	Estimated           bool `json:"estimated"`
}

type HydratedChat struct {
	Messages                 []map[string]any  `json:"messages"`
	WaitingForResponse       bool              `json:"waitingForResponse"`
	LLMConfig                *llmconfig.Config `json:"llmConfig"`
	ContextUsage             *ChatContextUsage `json:"contextUsage"`
	AppGenerationByMessageID map[string]string `json:"appGenerationByMessageId"`
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

type StopResult struct {
	AlreadyStopped   bool    `json:"alreadyStopped"`
	StoppedRunID     *string `json:"stoppedRunId"`
	StoppedMessageID *string `json:"stoppedMessageId"`
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

func NewService(options ServiceOptions) (*Service, error) {
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	if options.Engines == nil {
		return nil, ErrEngineStoreRequired
	}
	if options.LLM == nil {
		return nil, ErrLLMRuntimeRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Service{
		projectState: options.ProjectState,
		runs:         options.Runs,
		engines:      options.Engines,
		llm:          options.LLM,
		profiles:     options.Profiles,
		starter:      options.Starter,
		live:         options.Live,
		stopper:      options.Stopper,
		timeNow:      timeNow,
	}, nil
}

func (s *Service) Disabled() bool {
	return s == nil || s.starter == nil || s.starter.Disabled()
}

func (s *Service) AIFollowSnapshot(projectConfigID string) []realtime.AIFollowToolArgumentsUpdateContent {
	if s == nil || s.live == nil {
		return []realtime.AIFollowToolArgumentsUpdateContent{}
	}
	provider, ok := s.live.(aiFollowSnapshotProvider)
	if !ok {
		return []realtime.AIFollowToolArgumentsUpdateContent{}
	}
	return provider.AIFollowSnapshot(projectConfigID)
}

func (s *Service) StartChat(request StartChatRequest) (StartChatResult, error) {
	return s.startChat(request)
}

func (s *Service) GetChat(chatID string, projectConfigID *string) (HydratedChat, error) {
	if s == nil || s.runs == nil {
		return HydratedChat{}, ErrRunStoreRequired
	}
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return HydratedChat{}, fmt.Errorf("chat id is required")
	}
	filter := agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &trimmedChatID,
	}
	if projectConfigID != nil {
		trimmedProjectID := strings.TrimSpace(*projectConfigID)
		if trimmedProjectID != "" {
			filter.ProjectConfigID = &trimmedProjectID
		}
	}
	runs, err := s.runs.ListByMetadata(filter)
	if err != nil {
		return HydratedChat{}, err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return HydratedChat{}, ErrChatNotFound
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return HydratedChat{}, err
	}
	if latestRun.Status == agentruns.RunStatusRunning && s.live != nil {
		liveState, err := s.live.GetLiveChatState(latestRun.ID)
		if err != nil {
			return HydratedChat{}, err
		}
		if liveState != nil {
			state = liveState.Clone()
		}
	}
	resolvedLLMConfig, err := s.resolveLLMConfig(latestRun)
	if err != nil {
		return HydratedChat{}, err
	}
	return HydratedChat{
		Messages:                 cloneMessageSlice(state.Messages),
		WaitingForResponse:       state.WaitingForResponse,
		LLMConfig:                resolvedLLMConfig,
		ContextUsage:             resolveContextUsage(latestRun),
		AppGenerationByMessageID: agentruns.ExtractAppGenerationByMessageID(latestRun.Inputs),
	}, nil
}

func (s *Service) StopChat(chatID string) (StopResult, error) {
	return s.stopChat(chatID)
}

func (s *Service) resolveManagedProfile(agentProfileID *string, engineConfigID string) (agentprofiles.Profile, error) {
	if agentProfileID != nil && strings.TrimSpace(*agentProfileID) != "" {
		if s.profiles == nil {
			return agentprofiles.Profile{}, ErrProfileStoreRequired
		}
		profile, err := s.profiles.Get(strings.TrimSpace(*agentProfileID))
		if err != nil {
			return agentprofiles.Profile{}, err
		}
		profile.EngineConfigID = stringPtr(engineConfigID)
		return profile, nil
	}
	return agentprofiles.Profile{
		Name:           "Managed chat",
		Description:    "",
		SystemPrompt:   "",
		EngineConfigID: stringPtr(engineConfigID),
	}, nil
}

func (s *Service) ensureManagedChatIDCompatible(chatID string, projectConfigID string) ([]agentruns.Run, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return []agentruns.Run{}, nil
	}
	externalRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(runTypeExternalChat),
		ChatID:  stringPtr(trimmedChatID),
	})
	if err != nil {
		return nil, err
	}
	if len(externalRuns) > 0 {
		return nil, ErrChatEngineMismatch
	}
	scriptableRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(runTypeScriptable),
		ChatID:  stringPtr(trimmedChatID),
	})
	if err != nil {
		return nil, err
	}
	if len(scriptableRuns) > 0 {
		return nil, ErrChatEngineMismatch
	}
	managedRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  stringPtr(trimmedChatID),
	})
	if err != nil {
		return nil, err
	}
	for _, run := range managedRuns {
		existingProjectConfigID := resolveRunInputString(run, "projectConfigId")
		if existingProjectConfigID != "" && existingProjectConfigID != projectConfigID {
			return nil, ErrChatProjectConfigMismatch
		}
	}
	return managedRuns, nil
}

func (s *Service) getPriorMessagesForManagedChat(chatID string, projectConfigID string, prefetched []agentruns.Run) ([]map[string]any, error) {
	runs := prefetched
	if runs == nil {
		filter := agentruns.RunFilter{
			RunType:         stringPtr(RunTypeManagedChat),
			ChatID:          stringPtr(chatID),
			ProjectConfigID: stringPtr(projectConfigID),
		}
		var err error
		runs, err = s.runs.ListByMetadata(filter)
		if err != nil {
			return nil, err
		}
	}
	latestRun, ok := selectLatestRun(filterRunsByProjectConfigID(runs, projectConfigID))
	if !ok {
		return []map[string]any{}, nil
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *Service) getPriorMessagesForSeedChat(chatID string, projectConfigID string) ([]map[string]any, error) {
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
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
	if resolveRunInputString(latestRun, "runType") == runTypeScriptable {
		return nil, ErrChatEngineMismatch
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *Service) getLatestRunForManagedChat(chatID string, projectConfigID string, prefetched []agentruns.Run) (*agentruns.Run, error) {
	runs := prefetched
	if runs == nil {
		var err error
		runs, err = s.runs.ListByMetadata(agentruns.RunFilter{
			RunType:         stringPtr(RunTypeManagedChat),
			ChatID:          stringPtr(chatID),
			ProjectConfigID: stringPtr(projectConfigID),
		})
		if err != nil {
			return nil, err
		}
	}
	run, ok := selectLatestRun(filterRunsByProjectConfigID(runs, projectConfigID))
	if !ok {
		return nil, nil
	}
	return &run, nil
}

func (s *Service) resolveLLMConfig(run agentruns.Run) (*llmconfig.Config, error) {
	engineConfigID := resolveRunInputString(run, "engineConfigId")
	if engineConfigID == "" {
		return nil, nil
	}
	engineConfig, err := s.engines.Get(engineConfigID)
	if err != nil {
		if errors.Is(err, agentruns.ErrEngineConfigNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if engineConfig.EngineType != agentruns.EngineTypeSettaLLM {
		return nil, nil
	}
	if engineConfig.SettaLLMConfigID == nil || strings.TrimSpace(*engineConfig.SettaLLMConfigID) == "" {
		return nil, nil
	}
	configs := s.llm.Configs()
	resolved, err := configs.ResolveConfig(strings.TrimSpace(*engineConfig.SettaLLMConfigID))
	if err != nil {
		return nil, nil
	}
	return &resolved, nil
}

func (s ChatState) Clone() *ChatState {
	return &ChatState{
		Messages:           cloneMessageSlice(s.Messages),
		WaitingForResponse: s.WaitingForResponse,
	}
}

func selectLatestRun(runs []agentruns.Run) (agentruns.Run, bool) {
	if len(runs) == 0 {
		return agentruns.Run{}, false
	}
	latest := runs[0].Clone()
	latestUpdated := runLastUpdated(latest)
	for index := 1; index < len(runs); index++ {
		candidate := runs[index].Clone()
		candidateUpdated := runLastUpdated(candidate)
		if candidateUpdated.After(latestUpdated) {
			latest = candidate
			latestUpdated = candidateUpdated
		}
	}
	return latest, true
}

func runLastUpdated(run agentruns.Run) time.Time {
	latest := time.Time{}
	for _, event := range run.Events {
		if event.Timestamp.IsZero() {
			continue
		}
		if latest.IsZero() || event.Timestamp.After(latest) {
			latest = event.Timestamp.UTC()
		}
	}
	if !latest.IsZero() {
		return latest
	}
	if run.FinishedAt != nil {
		return run.FinishedAt.UTC()
	}
	if run.StartedAt != nil {
		return run.StartedAt.UTC()
	}
	return time.Time{}
}

func buildChatStateFromRun(run agentruns.Run) (*ChatState, error) {
	inputMessages, err := parseInputMessages(run)
	if err != nil {
		return nil, err
	}
	outputMessages, hasOutputs, err := parseOutputMessages(run)
	if err != nil {
		return nil, err
	}
	merged := mergeMessages(inputMessages, outputMessages, hasOutputs)
	filtered := filterResponsePlaceholderMessages(merged)
	return &ChatState{
		Messages:           filtered,
		WaitingForResponse: run.Status == agentruns.RunStatusRunning,
	}, nil
}

func resolveLatestAssistantMessageID(run agentruns.Run) (*string, error) {
	inputMessages, err := parseInputMessages(run)
	if err != nil {
		return nil, err
	}
	outputMessages, _, err := parseOutputMessages(run)
	if err != nil {
		return nil, err
	}
	return resolveLatestAssistantMessageIDFromMessages(inputMessages, outputMessages), nil
}

func resolveLatestAssistantMessageIDFromMessages(inputMessages []map[string]any, candidateMessages []map[string]any) *string {
	inputIDs := make(map[string]struct{}, len(inputMessages))
	for _, message := range inputMessages {
		id, err := messageID(message)
		if err != nil {
			continue
		}
		inputIDs[id] = struct{}{}
	}
	for index := len(candidateMessages) - 1; index >= 0; index-- {
		message := candidateMessages[index]
		role, err := messageRole(message)
		if err != nil || role != "assistant" {
			continue
		}
		id, err := messageID(message)
		if err != nil {
			continue
		}
		if _, ok := inputIDs[id]; ok {
			continue
		}
		return stringPtr(id)
	}
	return nil
}

func (s *Service) persistLiveChatStateToRun(run agentruns.Run, liveState *ChatState) (agentruns.Run, error) {
	if s == nil || s.runs == nil || liveState == nil {
		return run, nil
	}
	persisted := run.Clone()
	outputs := cloneAnyMap(persisted.Outputs)
	if outputs == nil {
		outputs = map[string]any{}
	}
	outputs["messages"] = messageSliceToJSONList(liveState.Messages)
	persisted.Outputs = outputs
	if err := s.runs.Save(persisted); err != nil {
		return agentruns.Run{}, err
	}
	return s.runs.Load(persisted.ID)
}

func (s *Service) waitForStoppedRunPersistence(run agentruns.Run) (agentruns.Run, error) {
	if s == nil || s.runs == nil {
		return run, nil
	}
	runID := strings.TrimSpace(run.ID)
	if runID == "" {
		return run, nil
	}
	if waiter, ok := s.stopper.(runWaiter); ok {
		ctx, cancel := context.WithTimeout(context.Background(), stopChatWaitTimeout)
		defer cancel()
		waitedRun, err := waiter.WaitForRun(ctx, runID)
		switch {
		case err == nil:
			return waitedRun, nil
		case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		default:
			return agentruns.Run{}, err
		}
	}
	return s.runs.Load(runID)
}

func parseInputMessages(run agentruns.Run) ([]map[string]any, error) {
	if run.Inputs == nil {
		return []map[string]any{}, nil
	}
	rawMessages, ok := run.Inputs["messages"]
	if !ok {
		return []map[string]any{}, nil
	}
	return parseMessageList(rawMessages)
}

func parseOutputMessages(run agentruns.Run) ([]map[string]any, bool, error) {
	if run.Outputs == nil {
		return nil, false, nil
	}
	rawMessages, ok := run.Outputs["messages"]
	if !ok {
		return nil, false, nil
	}
	parsed, err := parseMessageList(rawMessages)
	if err != nil {
		return nil, false, err
	}
	return parsed, true, nil
}

func parseMessageList(raw any) ([]map[string]any, error) {
	rawList, ok := raw.([]any)
	if !ok {
		return []map[string]any{}, nil
	}
	parsed := make([]map[string]any, 0, len(rawList))
	for index, entry := range rawList {
		message, err := normalizeMessage(entry)
		if err != nil {
			return nil, fmt.Errorf("parse chat message %d: %w", index, err)
		}
		parsed = append(parsed, message)
	}
	return parsed, nil
}

func normalizeMessage(raw any) (map[string]any, error) {
	message, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("message must be an object")
	}
	cloned := cloneAnyMap(message)
	if _, err := messageID(cloned); err != nil {
		return nil, err
	}
	if _, err := messageRole(cloned); err != nil {
		return nil, err
	}
	return cloned, nil
}

func mergeMessages(inputMessages []map[string]any, outputMessages []map[string]any, hasOutputs bool) []map[string]any {
	if !hasOutputs {
		return cloneMessageSlice(inputMessages)
	}
	outputsByID := make(map[string]map[string]any, len(outputMessages))
	for _, message := range outputMessages {
		messageID, err := messageID(message)
		if err != nil {
			continue
		}
		outputsByID[messageID] = cloneAnyMap(message)
	}
	inputIDs := make(map[string]struct{}, len(inputMessages))
	merged := make([]map[string]any, 0, len(outputMessages))
	for _, message := range inputMessages {
		messageID, err := messageID(message)
		if err != nil {
			continue
		}
		inputIDs[messageID] = struct{}{}
		if output, ok := outputsByID[messageID]; ok {
			merged = append(merged, cloneAnyMap(output))
			continue
		}
		merged = append(merged, cloneAnyMap(message))
	}
	for _, message := range outputMessages {
		messageID, err := messageID(message)
		if err != nil {
			continue
		}
		if _, ok := inputIDs[messageID]; ok {
			continue
		}
		merged = append(merged, cloneAnyMap(message))
	}
	return merged
}

func filterResponsePlaceholderMessages(messages []map[string]any) []map[string]any {
	filtered := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		role, err := messageRole(message)
		if err != nil {
			continue
		}
		id, err := messageID(message)
		if err != nil {
			continue
		}
		if role == "assistant" && isResponsePlaceholderID(id) {
			if messageContentEmpty(message) && messageToolCallsEmpty(message) {
				continue
			}
		}
		filtered = append(filtered, cloneAnyMap(message))
	}
	return filtered
}

func isResponsePlaceholderID(messageID string) bool {
	return strings.HasPrefix(messageID, "rs_") || strings.HasPrefix(messageID, "resp_")
}

func messageID(message map[string]any) (string, error) {
	rawID, ok := message["id"]
	if !ok {
		return "", fmt.Errorf("message id is required")
	}
	id, ok := rawID.(string)
	if !ok || strings.TrimSpace(id) == "" {
		return "", fmt.Errorf("message id is required")
	}
	return id, nil
}

func messageRole(message map[string]any) (string, error) {
	rawRole, ok := message["role"]
	if !ok {
		return "", fmt.Errorf("message role is required")
	}
	role, ok := rawRole.(string)
	if !ok || strings.TrimSpace(role) == "" {
		return "", fmt.Errorf("message role is required")
	}
	return role, nil
}

func messageContentEmpty(message map[string]any) bool {
	rawContent, ok := message["content"]
	if !ok || rawContent == nil {
		return true
	}
	content, ok := rawContent.([]any)
	return !ok || len(content) == 0
}

func messageToolCallsEmpty(message map[string]any) bool {
	rawToolCalls, ok := message["tool_calls"]
	if !ok || rawToolCalls == nil {
		return true
	}
	toolCalls, ok := rawToolCalls.([]any)
	return !ok || len(toolCalls) == 0
}

func resolveContextUsage(run agentruns.Run) *ChatContextUsage {
	usagePayload := extractRunUsagePayload(run)
	contextWindowTokens := resolveContextWindowTokens(usagePayload)
	contextUsedTokens := resolveContextUsedTokens(usagePayload)
	if contextWindowTokens == nil && contextUsedTokens == nil {
		return nil
	}
	return &ChatContextUsage{
		ContextWindowTokens: contextWindowTokens,
		ContextUsedTokens:   contextUsedTokens,
		Estimated:           contextWindowTokens == nil,
	}
}

func extractRunUsagePayload(run agentruns.Run) map[string]int {
	if run.Outputs == nil {
		return nil
	}
	return normalizeUsagePayload(run.Outputs["usage"])
}

func normalizeUsagePayload(raw any) map[string]int {
	payload, ok := raw.(map[string]any)
	if !ok {
		return nil
	}
	normalized := map[string]int{}
	for key, aliases := range usageKeyAliases() {
		for _, alias := range aliases {
			value, ok := payload[alias]
			if !ok {
				continue
			}
			parsed := extractNonNegativeInt(value)
			if parsed == nil {
				continue
			}
			normalized[key] = *parsed
			break
		}
	}
	if _, ok := normalized["promptTokens"]; !ok {
		if inputTokens, ok := normalized["inputTokens"]; ok {
			normalized["promptTokens"] = inputTokens
		}
	}
	if _, ok := normalized["completionTokens"]; !ok {
		if outputTokens, ok := normalized["outputTokens"]; ok {
			normalized["completionTokens"] = outputTokens
		}
	}
	if _, ok := normalized["totalTokens"]; !ok {
		promptTokens, hasPrompt := normalized["promptTokens"]
		completionTokens, hasCompletion := normalized["completionTokens"]
		if hasPrompt && hasCompletion {
			normalized["totalTokens"] = promptTokens + completionTokens
		}
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func usageKeyAliases() map[string][]string {
	return map[string][]string{
		"promptTokens":          {"promptTokens", "prompt_tokens", "inputTokens", "input_tokens", "usedTokens"},
		"completionTokens":      {"completionTokens", "completion_tokens", "outputTokens", "output_tokens"},
		"totalTokens":           {"totalTokens", "total_tokens"},
		"inputTokens":           {"inputTokens", "input_tokens", "usedTokens"},
		"outputTokens":          {"outputTokens", "output_tokens"},
		"cachedInputTokens":     {"cachedInputTokens", "cached_input_tokens"},
		"reasoningOutputTokens": {"reasoningOutputTokens", "reasoning_output_tokens"},
		"contextWindowTokens":   {"contextWindowTokens", "context_window_tokens", "model_context_window", "modelContextWindow", "windowTokens"},
		"contextUsedTokens":     {"contextUsedTokens", "context_used_tokens"},
	}
}

func extractNonNegativeInt(raw any) *int {
	switch value := raw.(type) {
	case bool:
		return nil
	case int:
		if value < 0 {
			return nil
		}
		return &value
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value {
			return nil
		}
		parsed := int(value)
		if parsed < 0 {
			return nil
		}
		return &parsed
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		parsed, err := strconv.Atoi(trimmed)
		if err != nil {
			return nil
		}
		if parsed < 0 {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func resolveContextWindowTokens(usagePayload map[string]int) *int {
	if usagePayload == nil {
		return nil
	}
	contextWindowTokens, ok := usagePayload["contextWindowTokens"]
	if !ok || contextWindowTokens <= 0 {
		return nil
	}
	return &contextWindowTokens
}

func resolveContextUsedTokens(usagePayload map[string]int) *int {
	if usagePayload == nil {
		return nil
	}
	if contextUsedTokens, ok := usagePayload["contextUsedTokens"]; ok {
		return &contextUsedTokens
	}
	if promptTokens, ok := usagePayload["promptTokens"]; ok {
		return &promptTokens
	}
	if inputTokens, ok := usagePayload["inputTokens"]; ok {
		return &inputTokens
	}
	return nil
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

func filterRunsByProjectConfigID(runs []agentruns.Run, projectConfigID string) []agentruns.Run {
	if strings.TrimSpace(projectConfigID) == "" {
		return append([]agentruns.Run(nil), runs...)
	}
	filtered := make([]agentruns.Run, 0, len(runs))
	for _, run := range runs {
		existingProjectConfigID := resolveRunInputString(run, "projectConfigId")
		if existingProjectConfigID == "" || existingProjectConfigID == projectConfigID {
			filtered = append(filtered, run)
		}
	}
	return filtered
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

func normalizeAppGenerationMode(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}
	switch trimmed {
	case AppGenerationModeJSONRender, AppGenerationModeJSONRenderWithImage, AppGenerationModePromptBuilder, AppGenerationModeMCPServer:
		return &trimmed, nil
	default:
		return nil, ErrAppGenerationModeInvalid
	}
}

func normalizeReferenceImageInputs(referenceImageURL *string, referenceImageNotes *string) (*string, *string, error) {
	normalizedURL := strings.TrimSpace(derefOptionalString(referenceImageURL))
	normalizedNotes := strings.TrimSpace(derefOptionalString(referenceImageNotes))
	if len(normalizedURL) > maxReferenceImageURLChars {
		return nil, nil, ErrAppGenerationReferenceImageURLTooLarge
	}
	if len(normalizedNotes) > maxReferenceImageNotesChars {
		return nil, nil, ErrAppGenerationReferenceImageNotesTooLarge
	}
	var resolvedURL *string
	var resolvedNotes *string
	if normalizedURL != "" {
		resolvedURL = stringPtr(normalizedURL)
	}
	if normalizedNotes != "" {
		resolvedNotes = stringPtr(normalizedNotes)
	}
	return resolvedURL, resolvedNotes, nil
}

func buildAppGenerationModePrompt(mode *string, appSpecStreamingEnabled bool, referenceImageURL *string, referenceImageNotes *string) string {
	if mode == nil {
		return ""
	}
	resolvedMode := strings.TrimSpace(*mode)
	if resolvedMode == "" {
		return ""
	}
	lines := []string{
		"## App spec generation mode",
		fmt.Sprintf("- mode: %s", resolvedMode),
		"- streamingPreview: disabled",
	}
	if appSpecStreamingEnabled {
		lines[2] = "- streamingPreview: enabled"
	}
	switch resolvedMode {
	case AppGenerationModeJSONRender, AppGenerationModeJSONRenderWithImage, AppGenerationModePromptBuilder:
		lines = append(lines,
			"- If you are generating/updating the App spec (json-render):",
			"  - Use catalog-compatible components only.",
			"  - Persist via Setta app tools.",
		)
		if appSpecStreamingEnabled {
			lines = append(lines,
				"  - Use `setta__stream_app_definition` and stream patches into its `patches` string arg.",
				"  - For updates, omit `baseAppSpec` to patch the currently stored app spec (or pass `baseAppSpec` explicitly).",
			)
		} else {
			lines = append(lines,
				"  - Prefer `setta__set_app_definition` with the full UITree appSpec payload.",
				"  - Optionally call `setta__validate_app_definition` first and fix errors before persisting.",
			)
		}
	}
	switch resolvedMode {
	case AppGenerationModeJSONRenderWithImage:
		lines = append(lines,
			"- Prioritize reference-image fidelity in this order: layout structure, spacing rhythm, typography scale, then color intent.",
			"- If exact parity is impossible with catalog constraints, preserve hierarchy and explain the closest approximation.",
		)
		if referenceImageURL != nil && strings.TrimSpace(*referenceImageURL) != "" {
			lines = append(lines,
				fmt.Sprintf("- Reference image URL: %s", strings.TrimSpace(*referenceImageURL)),
				"- Use this image as layout/style guidance when composing the app spec.",
			)
			if referenceImageNotes != nil && strings.TrimSpace(*referenceImageNotes) != "" {
				lines = append(lines, fmt.Sprintf("- Reference image notes: %s", strings.TrimSpace(*referenceImageNotes)))
			}
		}
	case AppGenerationModePromptBuilder:
		lines = append(lines,
			"- Prompt-builder flow: keep responses concise and tool-oriented so generation can run from the App pane without manual copy/paste.",
		)
	case AppGenerationModeMCPServer:
		lines = append(lines,
			"- MCP-server flow: use MCP tools as the source of truth for design artifacts when available.",
			"- For Figma-oriented requests, support both paths:",
			"  - Pull an existing Figma design into a JSON-render appSpec.",
			"  - Generate/update in Figma first, then pull the resulting design back into Setta.",
		)
		if appSpecStreamingEnabled {
			lines = append(lines, "- After MCP design retrieval, persist into Setta via `setta__stream_app_definition`.")
		} else {
			lines = append(lines, "- After MCP design retrieval, persist into Setta via `setta__set_app_definition`.")
		}
	}
	return strings.Join(lines, "\n")
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

func buildInputMessages(priorMessages []map[string]any, message map[string]any) []map[string]any {
	if hasMessageID(priorMessages, mustMessageID(message)) {
		return cloneMessageSlice(priorMessages)
	}
	return append(cloneMessageSlice(priorMessages), cloneAnyMap(message))
}

func buildBranchMessages(priorMessages []map[string]any, editedMessage map[string]any, branchFromMessageID string) ([]map[string]any, error) {
	for index, message := range priorMessages {
		messageID, err := messageID(message)
		if err != nil || messageID != branchFromMessageID {
			continue
		}
		updated := cloneAnyMap(editedMessage)
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

func messageSliceToJSONList(messages []map[string]any) []any {
	result := make([]any, 0, len(messages))
	for _, message := range messages {
		result = append(result, cloneAnyMap(message))
	}
	return result
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

func cloneMessageSlice(input []map[string]any) []map[string]any {
	if input == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(input))
	for _, entry := range input {
		cloned = append(cloned, cloneAnyMap(entry))
	}
	return cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneAnyValue(value)
	}
	return cloned
}

func cloneAnyValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return cloneAnyMap(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, cloneAnyValue(entry))
		}
		return cloned
	default:
		return typed
	}
}

func stringPtr(value string) *string {
	return &value
}
