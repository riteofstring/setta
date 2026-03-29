package externalagents

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"setta/internal/agentruns"
)

const RunTypeExternalAgent = "external_agent"

var (
	ErrRunStoreRequired = errors.New("external agent run store is required")
	ErrChatNotFound     = errors.New("external agent chat not found")
)

type LiveChatStateProvider interface {
	GetLiveChatState(runID string) (*ChatState, error)
}

type ServiceOptions struct {
	Runs *agentruns.RunStore
	Live LiveChatStateProvider
}

type Service struct {
	runs *agentruns.RunStore
	live LiveChatStateProvider
}

type ChatState struct {
	Messages           []map[string]any  `json:"messages"`
	WaitingForResponse bool              `json:"waitingForResponse"`
	ToolCallArguments  map[string]string `json:"toolCallArguments"`
}

type ChatContextUsage struct {
	ContextWindowTokens *int `json:"contextWindowTokens"`
	ContextUsedTokens   *int `json:"contextUsedTokens"`
	Estimated           bool `json:"estimated"`
}

type HydratedChat struct {
	Messages                 []map[string]any  `json:"messages"`
	WaitingForResponse       bool              `json:"waitingForResponse"`
	ToolCallArguments        map[string]string `json:"toolCallArguments"`
	ContextUsage             *ChatContextUsage `json:"contextUsage"`
	AppGenerationByMessageID map[string]string `json:"appGenerationByMessageId"`
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	return &Service{
		runs: options.Runs,
		live: options.Live,
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
		RunType: stringPtr(RunTypeExternalAgent),
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
	return HydratedChat{
		Messages:                 cloneMessageSlice(state.Messages),
		WaitingForResponse:       state.WaitingForResponse,
		ToolCallArguments:        cloneStringMap(state.ToolCallArguments),
		ContextUsage:             resolveContextUsage(latestRun),
		AppGenerationByMessageID: agentruns.ExtractAppGenerationByMessageID(latestRun.Inputs),
	}, nil
}

func (s ChatState) Clone() *ChatState {
	return &ChatState{
		Messages:           cloneMessageSlice(s.Messages),
		WaitingForResponse: s.WaitingForResponse,
		ToolCallArguments:  cloneStringMap(s.ToolCallArguments),
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
	outputToolCallArguments, err := parseOutputToolCallArguments(run)
	if err != nil {
		return nil, err
	}
	merged := mergeMessages(inputMessages, outputMessages, hasOutputs)
	filtered := filterResponsePlaceholderMessages(merged)
	return &ChatState{
		Messages:           filtered,
		WaitingForResponse: run.Status == agentruns.RunStatusRunning,
		ToolCallArguments:  outputToolCallArguments,
	}, nil
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

func parseOutputToolCallArguments(run agentruns.Run) (map[string]string, error) {
	if run.Outputs == nil {
		return map[string]string{}, nil
	}
	rawArguments, ok := run.Outputs["toolCallArguments"]
	if !ok || rawArguments == nil {
		return map[string]string{}, nil
	}
	return parseToolCallArgumentsMap(rawArguments)
}

func parseToolCallArgumentsMap(raw any) (map[string]string, error) {
	switch value := raw.(type) {
	case map[string]string:
		return cloneStringMap(value), nil
	case map[string]any:
		parsed := make(map[string]string, len(value))
		for key, entry := range value {
			if strings.TrimSpace(key) == "" {
				continue
			}
			stringValue, ok := entry.(string)
			if !ok {
				return nil, fmt.Errorf("toolCallArguments[%q] must be a string", key)
			}
			parsed[key] = stringValue
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("toolCallArguments must be an object")
	}
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
	cloned, err := cloneMessage(message)
	if err != nil {
		return nil, err
	}
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
		outputsByID[messageID] = cloneMessageOrPanic(message)
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
			merged = append(merged, cloneMessageOrPanic(output))
			continue
		}
		merged = append(merged, cloneMessageOrPanic(message))
	}
	for _, message := range outputMessages {
		messageID, err := messageID(message)
		if err != nil {
			continue
		}
		if _, ok := inputIDs[messageID]; ok {
			continue
		}
		merged = append(merged, cloneMessageOrPanic(message))
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
		filtered = append(filtered, cloneMessageOrPanic(message))
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
	case int32:
		converted := int(value)
		if converted < 0 {
			return nil
		}
		return &converted
	case int64:
		converted := int(value)
		if converted < 0 {
			return nil
		}
		return &converted
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || math.Trunc(value) != value {
			return nil
		}
		converted := int(value)
		return &converted
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		parsed, err := strconv.Atoi(trimmed)
		if err != nil || parsed < 0 {
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
	value, ok := usagePayload["contextWindowTokens"]
	if !ok || value <= 0 {
		return nil
	}
	return intPtr(value)
}

func resolveContextUsedTokens(usagePayload map[string]int) *int {
	if usagePayload == nil {
		return nil
	}
	if value, ok := usagePayload["contextUsedTokens"]; ok {
		return intPtr(value)
	}
	if value, ok := usagePayload["promptTokens"]; ok {
		return intPtr(value)
	}
	if value, ok := usagePayload["inputTokens"]; ok {
		return intPtr(value)
	}
	return nil
}

func cloneMessage(message map[string]any) (map[string]any, error) {
	content, err := json.Marshal(message)
	if err != nil {
		return nil, fmt.Errorf("clone message: %w", err)
	}
	var cloned map[string]any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return nil, fmt.Errorf("clone message: %w", err)
	}
	return cloned, nil
}

func cloneMessageSlice(messages []map[string]any) []map[string]any {
	if messages == nil {
		return []map[string]any{}
	}
	cloned := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		cloned = append(cloned, cloneMessageOrPanic(message))
	}
	return cloned
}

func cloneMessageOrPanic(message map[string]any) map[string]any {
	cloned, err := cloneMessage(message)
	if err != nil {
		panic(err)
	}
	return cloned
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func intPtr(value int) *int {
	return &value
}

func stringPtr(value string) *string {
	return &value
}
