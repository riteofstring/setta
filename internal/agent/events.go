package agent

import (
	"errors"
	"fmt"
)

type EventKind string

const (
	EventKindTurnStarted        EventKind = "turn_started"
	EventKindAgentTextDelta     EventKind = "agent_text_delta"
	EventKindAgentTextCompleted EventKind = "agent_text_completed"
	EventKindReasoningSummary   EventKind = "reasoning_summary"
	EventKindPlanChanged        EventKind = "plan_changed"
	EventKindActivityStarted    EventKind = "activity_started"
	EventKindActivityUpdated    EventKind = "activity_updated"
	EventKindActivityCompleted  EventKind = "activity_completed"
	EventKindApprovalRequested  EventKind = "approval_requested"
	EventKindModelRerouted      EventKind = "model_rerouted"
	EventKindTurnTerminal       EventKind = "turn_terminal"
	EventKindLifecycleChanged   EventKind = "lifecycle_changed"
)

type Event struct {
	Kind             EventKind          `json:"kind"`
	ConversationID   string             `json:"conversationId"`
	TurnID           string             `json:"turnId"`
	ProviderThreadID string             `json:"providerThreadId"`
	ProviderTurnID   string             `json:"providerTurnId"`
	ProviderEventID  *string            `json:"providerEventId,omitempty"`
	Text             *TextEvent         `json:"text,omitempty"`
	Plan             *PlanEvent         `json:"plan,omitempty"`
	Activity         *ActivityEvent     `json:"activity,omitempty"`
	Approval         *ApprovalRequest   `json:"approval,omitempty"`
	ModelReroute     *ModelRerouteEvent `json:"modelReroute,omitempty"`
	Terminal         *TerminalEvent     `json:"terminal,omitempty"`
	Lifecycle        *LifecycleEvent    `json:"lifecycle,omitempty"`
}

type TextEvent struct {
	ProviderItemID string `json:"providerItemId"`
	Text           string `json:"text"`
}

type PlanStep struct {
	Step   string `json:"step"`
	Status string `json:"status"`
}

type PlanEvent struct {
	Explanation *string    `json:"explanation,omitempty"`
	Steps       []PlanStep `json:"steps"`
}

type ActivityKind string

const (
	ActivityKindCommand       ActivityKind = "command"
	ActivityKindFileChange    ActivityKind = "file_change"
	ActivityKindTool          ActivityKind = "tool"
	ActivityKindCollaboration ActivityKind = "collaboration"
	ActivityKindSubagent      ActivityKind = "subagent"
	ActivityKindArtifact      ActivityKind = "artifact"
	ActivityKindOther         ActivityKind = "other"
)

type ActivityEvent struct {
	ProviderItemID string       `json:"providerItemId"`
	Kind           ActivityKind `json:"kind"`
	Status         string       `json:"status"`
	Title          string       `json:"title"`
	Summary        string       `json:"summary,omitempty"`
	ExitCode       *int         `json:"exitCode,omitempty"`
}

type ApprovalKind string

const (
	ApprovalKindCommand        ApprovalKind = "command"
	ApprovalKindFileChange     ApprovalKind = "file_change"
	ApprovalKindPermission     ApprovalKind = "permission"
	ApprovalKindUserInput      ApprovalKind = "user_input"
	ApprovalKindMCPElicitation ApprovalKind = "mcp_elicitation"
)

type ApprovalQuestion struct {
	ID       string   `json:"id"`
	Header   string   `json:"header"`
	Question string   `json:"question"`
	Options  []string `json:"options,omitempty"`
	Secret   bool     `json:"secret"`
}

type ApprovalRequest struct {
	ID                string             `json:"id"`
	ProviderItemID    string             `json:"providerItemId"`
	Kind              ApprovalKind       `json:"kind"`
	Title             string             `json:"title"`
	Body              string             `json:"body,omitempty"`
	Command           string             `json:"command,omitempty"`
	Path              string             `json:"path,omitempty"`
	PermissionProfile string             `json:"permissionProfile,omitempty"`
	Questions         []ApprovalQuestion `json:"questions,omitempty"`
}

type ModelRerouteEvent struct {
	FromModel string `json:"fromModel"`
	ToModel   string `json:"toModel"`
	Reason    string `json:"reason"`
}

type TerminalEvent struct {
	Outcome TurnOutcome `json:"outcome"`
	Error   *string     `json:"error,omitempty"`
	Usage   *TokenUsage `json:"usage,omitempty"`
}

type LifecycleEvent struct {
	State  string  `json:"state"`
	Reason string  `json:"reason"`
	Error  *string `json:"error,omitempty"`
}

type EventSink interface {
	HandleAgentEvent(Event) error
}

func (event Event) Validate() error {
	if event.ConversationID == "" || event.TurnID == "" || event.ProviderThreadID == "" || event.ProviderTurnID == "" {
		return errors.New("agent event requires conversation, turn, provider thread, and provider turn ids")
	}
	branches := 0
	for _, present := range []bool{
		event.Text != nil,
		event.Plan != nil,
		event.Activity != nil,
		event.Approval != nil,
		event.ModelReroute != nil,
		event.Terminal != nil,
		event.Lifecycle != nil,
	} {
		if present {
			branches++
		}
	}
	validation, ok := eventValidation[event.Kind]
	if !ok {
		return fmt.Errorf("unsupported agent event kind %q", event.Kind)
	}
	wantBranches := validation.branches
	if branches != wantBranches {
		return fmt.Errorf("agent event %s has %d payload branches, want %d", event.Kind, branches, wantBranches)
	}
	return validation.validate(event)
}

type eventValidator func(Event) error

var eventValidation = map[EventKind]struct {
	branches int
	validate eventValidator
}{
	EventKindTurnStarted:        {branches: 0, validate: validEventPayload},
	EventKindAgentTextDelta:     {branches: 1, validate: validateTextEvent},
	EventKindAgentTextCompleted: {branches: 1, validate: validateTextEvent},
	EventKindReasoningSummary:   {branches: 1, validate: validateTextEvent},
	EventKindPlanChanged:        {branches: 1, validate: validatePlanEvent},
	EventKindActivityStarted:    {branches: 1, validate: validateActivityEvent},
	EventKindActivityUpdated:    {branches: 1, validate: validateActivityEvent},
	EventKindActivityCompleted:  {branches: 1, validate: validateActivityEvent},
	EventKindApprovalRequested:  {branches: 1, validate: validateApprovalEvent},
	EventKindModelRerouted:      {branches: 1, validate: validateModelRerouteEvent},
	EventKindTurnTerminal:       {branches: 1, validate: validateTerminalEvent},
	EventKindLifecycleChanged:   {branches: 1, validate: validateLifecycleEvent},
}

func validEventPayload(Event) error { return nil }

func validateTextEvent(event Event) error {
	if event.Text == nil {
		return errors.New("agent text event requires text payload")
	}
	return nil
}

func validatePlanEvent(event Event) error {
	if event.Plan == nil {
		return errors.New("agent plan event requires plan payload")
	}
	return nil
}

func validateActivityEvent(event Event) error {
	if event.Activity == nil {
		return errors.New("agent activity event requires activity payload")
	}
	return nil
}

func validateApprovalEvent(event Event) error {
	if event.Approval == nil {
		return errors.New("agent approval event requires approval payload")
	}
	return nil
}

func validateModelRerouteEvent(event Event) error {
	if event.ModelReroute == nil {
		return errors.New("agent model-reroute event requires payload")
	}
	return nil
}

func validateTerminalEvent(event Event) error {
	if event.Terminal == nil {
		return errors.New("agent terminal event requires terminal payload")
	}
	if event.Terminal.Usage != nil {
		if err := event.Terminal.Usage.Validate(); err != nil {
			return fmt.Errorf("agent terminal token usage: %w", err)
		}
	}
	return nil
}

func validateLifecycleEvent(event Event) error {
	if event.Lifecycle == nil {
		return errors.New("agent lifecycle event requires lifecycle payload")
	}
	return nil
}
