package chat

import "fmt"

func NewScriptedWorkflowHarness() *ScriptedWorkflowHarness {
	defaultModel := fakeModelOptions()[0]
	return &ScriptedWorkflowHarness{
		approvals:                map[string]chan ApprovalResponse{},
		model:                    defaultModel.Model,
		phase4ConsolidatorCounts: map[string]int{},
		phase4ReviewerBarriers:   map[string]map[string]chan struct{}{},
		reasoning:                defaultModel.DefaultReasoningEffort,
		steers:                   map[string]chan SteerRequest{},
		tools:                    mustNewSettaAgentToolRegistry(),
		turnErrors:               map[string]string{},
		turnStatuses:             map[string]HarnessTurnRuntimeStatus{},
	}
}

func (harness *ScriptedWorkflowHarness) SetAgentToolRegistry(registry *AgentToolRegistry) error {
	if registry == nil {
		return fmt.Errorf("agent tool registry is required")
	}
	harness.mu.Lock()
	defer harness.mu.Unlock()
	harness.tools = registry
	return nil
}
