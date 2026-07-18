package chat

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestServiceLoadRunTranscriptPageScopesReusedWorkflowConversation(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"first workflow prompt": {
			{Type: FakeEventAssistantDelta, Text: "first workflow response"},
		},
		"second workflow prompt": {
			{Type: FakeEventAssistantDelta, Text: "second workflow response"},
		},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)

	first, err := service.SendWorkflowAgentTurn("workspace_api", WorkflowAgentTurnRequest{
		DefinitionID:        "workflow_definition_api",
		DefinitionVersionID: "workflow_version_api",
		ExecutionID:         "workflow_execution_api",
		NodeID:              "work",
		NodeExecutionID:     "workflow_node_execution_first",
		Prompt:              "first workflow prompt",
		FreshConversation:   false,
	})
	if err != nil {
		t.Fatalf("send first workflow turn: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", first.Conversation.ID, first.Run.ID, RunStatusCompleted)

	second, err := service.SendWorkflowAgentTurn("workspace_api", WorkflowAgentTurnRequest{
		DefinitionID:        "workflow_definition_api",
		DefinitionVersionID: "workflow_version_api",
		ExecutionID:         "workflow_execution_api",
		NodeID:              "work",
		NodeExecutionID:     "workflow_node_execution_second",
		Prompt:              "second workflow prompt",
		FreshConversation:   false,
	})
	if err != nil {
		t.Fatalf("send second workflow turn: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", second.Conversation.ID, second.Run.ID, RunStatusCompleted)
	if second.Conversation.ID != first.Conversation.ID {
		t.Fatalf("workflow conversation id = %s, want reused %s", second.Conversation.ID, first.Conversation.ID)
	}

	conversationPage, err := service.LoadMessagePage("workspace_api", second.Conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load reused conversation page: %v", err)
	}
	if !pageContainsText(conversationPage.Blocks, "first workflow response") ||
		!pageContainsText(conversationPage.Blocks, "second workflow response") {
		t.Fatalf("conversation blocks = %+v, want both workflow turns", conversationPage.Blocks)
	}

	runPage, err := service.LoadRunTranscriptPage("workspace_api", second.Run.ID, 0, 20)
	if err != nil {
		t.Fatalf("load second run transcript page: %v", err)
	}
	if len(runPage.Blocks) == 0 {
		t.Fatal("second run transcript page was empty")
	}
	for _, block := range runPage.Blocks {
		if block.RunID != second.Run.ID {
			t.Fatalf("run transcript block = %+v, want run %s only", block, second.Run.ID)
		}
	}
	if pageContainsText(runPage.Blocks, "first workflow response") {
		t.Fatalf("second run transcript leaked first workflow response: %+v", runPage.Blocks)
	}
	if !pageContainsText(runPage.Blocks, "second workflow response") {
		t.Fatalf("second run transcript omitted second response: %+v", runPage.Blocks)
	}
}

func pageContainsText(blocks []TranscriptBlock, text string) bool {
	raw, err := json.Marshal(blocks)
	return err == nil && strings.Contains(string(raw), text)
}
