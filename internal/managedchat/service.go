package managedchat

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
)

const RunTypeManagedChat = "llm_chat"

var (
	ErrRunStoreRequired    = errors.New("managed chat run store is required")
	ErrEngineStoreRequired = errors.New("managed chat engine store is required")
	ErrLLMRuntimeRequired  = errors.New("managed chat llm runtime is required")
	ErrStopperRequired     = errors.New("managed chat stop runtime is required")
	ErrChatNotFound        = errors.New("managed chat not found")
)

type LiveChatStateProvider interface {
	GetLiveChatState(runID string) (*ChatState, error)
}

type RunStopper interface {
	StopRun(runID string) (agentruns.Run, error)
}

type ServiceOptions struct {
	Runs    *agentruns.RunStore
	Engines *agentruns.EngineStore
	LLM     *llmconfig.Runtime
	Live    LiveChatStateProvider
	Stopper RunStopper
}

type Service struct {
	runs    *agentruns.RunStore
	engines *agentruns.EngineStore
	llm     *llmconfig.Runtime
	live    LiveChatStateProvider
	stopper RunStopper
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
	Messages           []map[string]any  `json:"messages"`
	WaitingForResponse bool              `json:"waitingForResponse"`
	LLMConfig          *llmconfig.Config `json:"llmConfig"`
	ContextUsage       *ChatContextUsage `json:"contextUsage"`
}

type StopResult struct {
	AlreadyStopped   bool    `json:"alreadyStopped"`
	StoppedRunID     *string `json:"stoppedRunId"`
	StoppedMessageID *string `json:"stoppedMessageId"`
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
	return &Service{
		runs:    options.Runs,
		engines: options.Engines,
		llm:     options.LLM,
		live:    options.Live,
		stopper: options.Stopper,
	}, nil
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
		Messages:           cloneMessageSlice(state.Messages),
		WaitingForResponse: state.WaitingForResponse,
		LLMConfig:          resolvedLLMConfig,
		ContextUsage:       resolveContextUsage(latestRun),
	}, nil
}

func (s *Service) StopChat(chatID string) (StopResult, error) {
	if s == nil || s.runs == nil {
		return StopResult{}, ErrRunStoreRequired
	}
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return StopResult{}, fmt.Errorf("chat id is required")
	}
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return StopResult{}, err
	}
	runningRuns := make([]agentruns.Run, 0, len(runs))
	for _, run := range runs {
		if run.Status == agentruns.RunStatusRunning {
			runningRuns = append(runningRuns, run)
		}
	}
	latestRun, ok := selectLatestRun(runningRuns)
	if !ok {
		return StopResult{AlreadyStopped: true}, nil
	}
	if s.stopper == nil {
		return StopResult{}, ErrStopperRequired
	}
	stoppedRun, err := s.stopper.StopRun(latestRun.ID)
	if err != nil {
		return StopResult{}, err
	}
	if stoppedRun.Status != agentruns.RunStatusCancelled {
		return StopResult{AlreadyStopped: true}, nil
	}
	stoppedRunID := stoppedRun.ID
	stoppedMessageID, err := resolveLatestAssistantMessageID(stoppedRun)
	if err != nil {
		return StopResult{}, err
	}
	return StopResult{
		AlreadyStopped:   false,
		StoppedRunID:     &stoppedRunID,
		StoppedMessageID: stoppedMessageID,
	}, nil
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
	inputIDs := make(map[string]struct{}, len(inputMessages))
	for _, message := range inputMessages {
		id, err := messageID(message)
		if err != nil {
			continue
		}
		inputIDs[id] = struct{}{}
	}
	for index := len(outputMessages) - 1; index >= 0; index-- {
		message := outputMessages[index]
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
		return stringPtr(id), nil
	}
	return nil, nil
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
