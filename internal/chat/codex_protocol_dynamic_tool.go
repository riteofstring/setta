package chat

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

func dynamicToolCallThreadItemRunItem(item codexapp.ThreadItem, _ RunItemStatus) (RunItem, error) {
	if item.DynamicToolCall == nil {
		return RunItem{}, missingCodexThreadItemVariant(item.Type)
	}
	return dynamicToolCallRunItem(*item.DynamicToolCall)
}

func dynamicToolCallRunItem(item codexapp.DynamicToolCallThreadItem) (RunItem, error) {
	id, err := requireCodexStringValue(item.ID, "codex dynamicToolCall item.id")
	if err != nil {
		return RunItem{}, err
	}
	toolName, err := requireCodexStringValue(item.Tool, "codex dynamicToolCall item.tool")
	if err != nil {
		return RunItem{}, err
	}
	status, err := mapCodexItemStatusWithDefault(string(item.Status), RunItemStatusRunning)
	if err != nil {
		return RunItem{}, err
	}
	details, err := dynamicToolCallDetails(item, stringPtrValue(item.Namespace), toolName)
	if err != nil {
		return RunItem{}, err
	}
	return RunItem{
		ProviderItemID: id,
		Type:           RunItemTypeDynamicToolCall,
		Status:         status,
		Details:        NewRunItemDynamicToolCallDetails(details),
	}, nil
}

func dynamicToolCallDetails(item codexapp.DynamicToolCallThreadItem, namespace string, toolName string) (RunItemDynamicToolCallDetails, error) {
	result, resultSummary, err := dynamicToolCallResultDetails(item)
	if err != nil {
		return RunItemDynamicToolCallDetails{}, err
	}
	return RunItemDynamicToolCallDetails{
		Namespace:     namespace,
		ToolName:      toolName,
		DurationMs:    intPtrValue(item.DurationMs),
		Arguments:     cloneRawMessage(item.Arguments),
		ResultSummary: resultSummary,
		Result:        result,
	}, nil
}

func dynamicToolCallResultDetails(item codexapp.DynamicToolCallThreadItem) (*RunItemDynamicToolResult, string, error) {
	if item.ContentItems == nil && item.Success == nil {
		return nil, "", nil
	}
	contentItems := []RunItemDynamicToolContentItem{}
	if item.ContentItems != nil {
		for index, raw := range *item.ContentItems {
			content, err := dynamicToolCallContentItem(raw, index)
			if err != nil {
				return nil, "", err
			}
			contentItems = append(contentItems, content)
		}
	}
	result := &RunItemDynamicToolResult{
		ContentItems: contentItems,
		Success:      item.Success,
	}
	return result, dynamicToolCallResultSummary(contentItems, item.Success), nil
}

func dynamicToolCallContentItem(raw json.RawMessage, index int) (RunItemDynamicToolContentItem, error) {
	var payload struct {
		Type     string `json:"type"`
		Text     string `json:"text"`
		ImageURL string `json:"imageUrl"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return RunItemDynamicToolContentItem{}, fmt.Errorf("decode codex dynamicToolCall contentItems[%d]: %w", index, err)
	}
	switch payload.Type {
	case "inputText":
		if payload.Text == "" {
			return RunItemDynamicToolContentItem{}, fmt.Errorf("codex dynamicToolCall contentItems[%d].text is required for inputText", index)
		}
	case "inputImage":
		if payload.ImageURL == "" {
			return RunItemDynamicToolContentItem{}, fmt.Errorf("codex dynamicToolCall contentItems[%d].imageUrl is required for inputImage", index)
		}
	case "":
		return RunItemDynamicToolContentItem{}, fmt.Errorf("codex dynamicToolCall contentItems[%d].type is required", index)
	default:
		return RunItemDynamicToolContentItem{}, fmt.Errorf("unsupported codex dynamicToolCall contentItems[%d].type: %s", index, payload.Type)
	}
	return RunItemDynamicToolContentItem{
		Type:     payload.Type,
		Text:     payload.Text,
		ImageURL: payload.ImageURL,
	}, nil
}

func dynamicToolCallResultSummary(contentItems []RunItemDynamicToolContentItem, success *bool) string {
	parts := make([]string, 0, len(contentItems))
	for _, item := range contentItems {
		if item.Text != "" {
			parts = append(parts, item.Text)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}
	if success == nil {
		return ""
	}
	if *success {
		return "Tool completed"
	}
	return "Tool failed"
}
