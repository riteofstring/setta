package semanticcontext

import "context"

type TriggerKind string

const (
	TriggerWorkflowAgentStart      TriggerKind = "workflow_agent_start"
	TriggerSteering                TriggerKind = "steering"
	TriggerImmediateSteeringReplay TriggerKind = "immediate_steering_replay"
	TriggerPhaseBoundary           TriggerKind = "phase_boundary"
	TriggerAgentRequest            TriggerKind = "agent_request"
)

type SourceRefs struct {
	WorkflowDefinitionID    string
	WorkflowExecutionID     string
	WorkflowNodeID          string
	WorkflowNodeExecutionID string
	ChatConversationID      string
	ChatRunID               string
	ChatMessageID           string
	RunItemID               string
}

type CompileRequest struct {
	WorkspaceID    string
	TriggerKind    TriggerKind
	SourceRefs     SourceRefs
	AuthoredPrompt string
	TokenBudget    int
}

type Delivery struct {
	PackID        string
	ContextText   string
	ItemCount     int
	TokenBudget   int
	TokenEstimate int
}

type Compiler interface {
	CompileContext(context.Context, CompileRequest) (Delivery, error)
}
