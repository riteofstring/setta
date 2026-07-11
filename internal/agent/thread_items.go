package agent

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

func normalizedThreadItem(base Event, item codexapp.ThreadItem, completed bool) ([]Event, *TerminalEvent, error) {
	if item.Type == codexapp.ThreadItemTypeUserMessage || item.Type == codexapp.ThreadItemTypeHookPrompt || item.Type == codexapp.ThreadItemTypePlan {
		return nil, nil, nil
	}
	if item.Type == codexapp.ThreadItemTypeAgentMessage {
		return normalizedAgentMessage(base, item, completed)
	}
	if item.Type == codexapp.ThreadItemTypeReasoning {
		return normalizedReasoning(base, item, completed)
	}
	activity, err := activityFromThreadItem(item)
	if err != nil {
		return nil, nil, err
	}
	event := base
	if completed {
		event.Kind = EventKindActivityCompleted
	} else {
		event.Kind = EventKindActivityStarted
	}
	event.ProviderEventID = stringPointer(activity.ProviderItemID)
	event.Activity = &activity
	return []Event{event}, nil, nil
}

func normalizedAgentMessage(base Event, item codexapp.ThreadItem, completed bool) ([]Event, *TerminalEvent, error) {
	if !completed {
		return nil, nil, nil
	}
	if item.AgentMessage == nil {
		return nil, nil, fmt.Errorf("%w: agent message payload is missing", errUnsupportedThreadItem)
	}
	event := base
	event.Kind = EventKindAgentTextCompleted
	event.ProviderEventID = stringPointer(item.AgentMessage.ID)
	event.Text = &TextEvent{ProviderItemID: item.AgentMessage.ID, Text: item.AgentMessage.Text}
	return []Event{event}, nil, nil
}

func normalizedReasoning(base Event, item codexapp.ThreadItem, completed bool) ([]Event, *TerminalEvent, error) {
	if !completed || item.Reasoning == nil {
		return nil, nil, nil
	}
	if len(item.Reasoning.Summary) == 0 {
		return nil, nil, nil
	}
	event := base
	event.Kind = EventKindReasoningSummary
	event.ProviderEventID = stringPointer(item.Reasoning.ID)
	event.Text = &TextEvent{ProviderItemID: item.Reasoning.ID, Text: strings.Join(item.Reasoning.Summary, "\n")}
	return []Event{event}, nil, nil
}

func activityFromThreadItem(item codexapp.ThreadItem) (ActivityEvent, error) {
	handler := activityHandlers[item.Type]
	if handler == nil {
		return ActivityEvent{}, fmt.Errorf("%w: %s", errUnsupportedThreadItem, item.Type)
	}
	return handler(item)
}

type activityHandler func(codexapp.ThreadItem) (ActivityEvent, error)

var activityHandlers = map[codexapp.ThreadItemType]activityHandler{
	codexapp.ThreadItemTypeCommandExecution:    commandActivity,
	codexapp.ThreadItemTypeFileChange:          fileChangeActivity,
	codexapp.ThreadItemTypeMcpToolCall:         mcpToolActivity,
	codexapp.ThreadItemTypeDynamicToolCall:     dynamicToolActivity,
	codexapp.ThreadItemTypeCollabAgentToolCall: collabAgentActivity,
	codexapp.ThreadItemTypeSubAgentActivity:    subagentActivity,
	codexapp.ThreadItemTypeWebSearch:           webSearchActivity,
	codexapp.ThreadItemTypeImageView:           imageViewActivity,
	codexapp.ThreadItemTypeImageGeneration:     imageGenerationActivity,
	codexapp.ThreadItemTypeSleep:               sleepActivity,
	codexapp.ThreadItemTypeEnteredReviewMode:   otherActivity,
	codexapp.ThreadItemTypeExitedReviewMode:    otherActivity,
	codexapp.ThreadItemTypeContextCompaction:   otherActivity,
}

func commandActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.CommandExecution == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{
		ProviderItemID: item.CommandExecution.ID,
		Kind:           ActivityKindCommand,
		Status:         string(item.CommandExecution.Status),
		Title:          item.CommandExecution.Command,
		ExitCode:       cloneInt(item.CommandExecution.ExitCode),
		Command:        item.CommandExecution.Command,
		CWD:            string(item.CommandExecution.CWD),
		ProcessID:      optionalString(item.CommandExecution.ProcessId),
		DurationMs:     cloneInt(item.CommandExecution.DurationMs),
	}, nil
}

func fileChangeActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.FileChange == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	changes := make([]ActivityFileChange, 0, len(item.FileChange.Changes))
	for _, change := range item.FileChange.Changes {
		kind, movePath, err := activityFileChangeKind(change.Kind)
		if err != nil {
			return ActivityEvent{}, err
		}
		changes = append(changes, ActivityFileChange{Path: change.Path, Kind: kind, MovePath: movePath, Diff: change.Diff})
	}
	return ActivityEvent{
		ProviderItemID: item.FileChange.ID,
		Kind:           ActivityKindFileChange,
		Status:         string(item.FileChange.Status),
		Title:          fmt.Sprintf("Changed %d file(s)", len(item.FileChange.Changes)),
		FileChanges:    changes,
	}, nil
}

func mcpToolActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.McpToolCall == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{
		ProviderItemID: item.McpToolCall.ID,
		Kind:           ActivityKindMCPTool,
		Status:         string(item.McpToolCall.Status),
		Title:          item.McpToolCall.Server + "/" + item.McpToolCall.Tool,
		Server:         item.McpToolCall.Server,
		Tool:           item.McpToolCall.Tool,
		DurationMs:     cloneInt(item.McpToolCall.DurationMs),
	}, nil
}

func dynamicToolActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.DynamicToolCall == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	title := item.DynamicToolCall.Tool
	if item.DynamicToolCall.Namespace != nil {
		title = *item.DynamicToolCall.Namespace + "/" + title
	}
	return ActivityEvent{ProviderItemID: item.DynamicToolCall.ID, Kind: ActivityKindDynamicTool, Status: string(item.DynamicToolCall.Status), Title: title, Tool: item.DynamicToolCall.Tool, Namespace: optionalString(item.DynamicToolCall.Namespace), DurationMs: cloneInt(item.DynamicToolCall.DurationMs)}, nil
}

func collabAgentActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.CollabAgentToolCall == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{
		ProviderItemID:   item.CollabAgentToolCall.ID,
		Kind:             ActivityKindSubagent,
		Status:           string(item.CollabAgentToolCall.Status),
		Title:            string(item.CollabAgentToolCall.Tool),
		Summary:          fmt.Sprintf("%d receiver thread(s)", len(item.CollabAgentToolCall.ReceiverThreadIds)),
		ProviderThreadID: firstString(item.CollabAgentToolCall.ReceiverThreadIds),
	}, nil
}

func subagentActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.SubAgentActivity == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{
		ProviderItemID:   item.SubAgentActivity.ID,
		Kind:             ActivityKindSubagent,
		Status:           string(item.SubAgentActivity.Kind),
		Title:            item.SubAgentActivity.AgentPath,
		Summary:          item.SubAgentActivity.AgentThreadId,
		ProviderThreadID: item.SubAgentActivity.AgentThreadId,
	}, nil
}

func webSearchActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.WebSearch == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{ProviderItemID: item.WebSearch.ID, Kind: ActivityKindWebSearch, Status: "completed", Title: "Web search", Summary: item.WebSearch.Query}, nil
}

func imageViewActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.ImageView == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{ProviderItemID: item.ImageView.ID, Kind: ActivityKindImageView, Status: "completed", Title: "Viewed image", Summary: string(item.ImageView.Path)}, nil
}

func imageGenerationActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.ImageGeneration == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	summary := ""
	if item.ImageGeneration.SavedPath != nil {
		summary = string(*item.ImageGeneration.SavedPath)
	}
	return ActivityEvent{ProviderItemID: item.ImageGeneration.ID, Kind: ActivityKindImageGeneration, Status: item.ImageGeneration.Status, Title: "Generated image", Summary: summary}, nil
}

func sleepActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	if item.Sleep == nil {
		return ActivityEvent{}, missingThreadItemPayload(item.Type)
	}
	return ActivityEvent{ProviderItemID: item.Sleep.ID, Kind: ActivityKindSleep, Status: "completed", Title: "Waited", Summary: fmt.Sprintf("%d ms", item.Sleep.DurationMs), DurationMs: intPointer(item.Sleep.DurationMs)}, nil
}

func otherActivity(item codexapp.ThreadItem) (ActivityEvent, error) {
	switch item.Type {
	case codexapp.ThreadItemTypeEnteredReviewMode:
		if item.EnteredReviewMode == nil {
			return ActivityEvent{}, missingThreadItemPayload(item.Type)
		}
		return ActivityEvent{ProviderItemID: item.EnteredReviewMode.ID, Kind: ActivityKindHook, Status: "completed", Title: "Entered review mode", Summary: item.EnteredReviewMode.Review}, nil
	case codexapp.ThreadItemTypeExitedReviewMode:
		if item.ExitedReviewMode == nil {
			return ActivityEvent{}, missingThreadItemPayload(item.Type)
		}
		return ActivityEvent{ProviderItemID: item.ExitedReviewMode.ID, Kind: ActivityKindHook, Status: "completed", Title: "Exited review mode", Summary: item.ExitedReviewMode.Review}, nil
	case codexapp.ThreadItemTypeContextCompaction:
		if item.ContextCompaction == nil {
			return ActivityEvent{}, missingThreadItemPayload(item.Type)
		}
		return ActivityEvent{ProviderItemID: item.ContextCompaction.ID, Kind: ActivityKindHook, Status: "completed", Title: "Compacted context"}, nil
	default:
		return ActivityEvent{}, fmt.Errorf("%w: %s", errUnsupportedThreadItem, item.Type)
	}
}

func missingThreadItemPayload(itemType codexapp.ThreadItemType) error {
	return fmt.Errorf("%w: %s payload is missing", errUnsupportedThreadItem, itemType)
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func intPointer(value int) *int {
	return &value
}

func activityFileChangeKind(raw []byte) (string, *string, error) {
	var value struct {
		Type     string  `json:"type"`
		MovePath *string `json:"move_path"`
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", nil, fmt.Errorf("decode file change kind: %w", err)
	}
	switch value.Type {
	case "add", "delete", "update":
		return value.Type, value.MovePath, nil
	default:
		return "", nil, fmt.Errorf("unsupported file change kind %q", value.Type)
	}
}
