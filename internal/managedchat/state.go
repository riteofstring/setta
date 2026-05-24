package managedchat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentruns"
)

func (s ChatState) Clone() *ChatState {
	return &ChatState{
		Messages:           cloneMessageSlice(s.Messages),
		ToolCallArguments:  cloneStringMap(s.ToolCallArguments),
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
	toolCallArguments, err := parseOutputToolCallArguments(run)
	if err != nil {
		return nil, err
	}
	merged := mergeMessages(inputMessages, outputMessages, hasOutputs)
	filtered := filterResponsePlaceholderMessages(merged)
	return &ChatState{
		Messages:           filtered,
		ToolCallArguments:  toolCallArguments,
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
	outputs["toolCallArguments"] = cloneStringMap(liveState.ToolCallArguments)
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
