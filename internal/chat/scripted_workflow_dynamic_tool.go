package chat

import (
	"context"
	"encoding/json"
)

func scriptedDynamicToolTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	item := RunItem{
		ProviderItemID: "provider_dynamic_tool_" + request.Run.ID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusRunning,
		Title:          "Dynamic tool call",
		Details: NewRunItemDynamicToolCallDetails(RunItemDynamicToolCallDetails{
			Namespace:    "setta",
			ToolName:     "fakeTool",
			DisplayTitle: "Fake dynamic tool",
			Description:  "Scripted dynamic tool workflow fixture.",
			Category:     "test",
			Arguments:    json.RawMessage(`{"value":"from scripted workflow"}`),
		}),
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.RunItemOutputDelta(item.ProviderItemID, "stdout", "tool ok\n"); err != nil {
		return TurnCompletion{}, err
	}
	item.Status = RunItemStatusCompleted
	item.Details = NewRunItemDynamicToolCallDetails(RunItemDynamicToolCallDetails{
		Namespace:     "setta",
		ToolName:      "fakeTool",
		DisplayTitle:  "Fake dynamic tool",
		Description:   "Scripted dynamic tool workflow fixture.",
		Category:      "test",
		Arguments:     json.RawMessage(`{"value":"from scripted workflow"}`),
		ResultSummary: "tool ok",
		Result: &RunItemDynamicToolResult{
			ContentItems: []RunItemDynamicToolContentItem{{Type: "inputText", Text: "tool ok"}},
			Success:      runItemDynamicToolSuccess(true),
		},
	})
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Dynamic tool workflow complete.")
}
