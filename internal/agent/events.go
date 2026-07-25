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
	EventKindApprovalSuperseded EventKind = "approval_superseded"
	EventKindValidationRecorded EventKind = "validation_recorded"
	EventKindModelRerouted      EventKind = "model_rerouted"
	EventKindTurnTerminal       EventKind = "turn_terminal"
	EventKindLifecycleChanged   EventKind = "lifecycle_changed"
)

type Event struct {
	Kind               EventKind                `json:"kind"`
	ConversationID     string                   `json:"conversationId"`
	TurnID             string                   `json:"turnId"`
	ProviderThreadID   string                   `json:"providerThreadId"`
	ProviderTurnID     string                   `json:"providerTurnId"`
	ProviderEventID    *string                  `json:"providerEventId,omitempty"`
	Text               *TextEvent               `json:"text,omitempty"`
	Plan               *PlanEvent               `json:"plan,omitempty"`
	Activity           *ActivityEvent           `json:"activity,omitempty"`
	Approval           *ApprovalRequest         `json:"approval,omitempty"`
	ApprovalSuperseded *ApprovalSupersededEvent `json:"approvalSuperseded,omitempty"`
	Validation         *ValidationEvent         `json:"validation,omitempty"`
	ModelReroute       *ModelRerouteEvent       `json:"modelReroute,omitempty"`
	Terminal           *TerminalEvent           `json:"terminal,omitempty"`
	Lifecycle          *LifecycleEvent          `json:"lifecycle,omitempty"`
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

// ActivityKind is the typed activity vocabulary the Codex adapter reports. It
// is deliberately as precise as the provider's own item types, because the
// Director resolves a node kind from this fact: a search is an investigation, a
// command is an action, and a bucket like "tool" would force the graph to guess
// which one it was looking at.
type ActivityKind string

const (
	ActivityKindCommand         ActivityKind = "command"
	ActivityKindFileChange      ActivityKind = "file_change"
	ActivityKindMCPTool         ActivityKind = "mcp_tool"
	ActivityKindDynamicTool     ActivityKind = "dynamic_tool"
	ActivityKindWebSearch       ActivityKind = "web_search"
	ActivityKindImageView       ActivityKind = "image_view"
	ActivityKindImageGeneration ActivityKind = "image_generation"
	ActivityKindSleep           ActivityKind = "sleep"
	ActivityKindHook            ActivityKind = "hook"
	ActivityKindSubagent        ActivityKind = "subagent"
	ActivityKindOther           ActivityKind = "other"
)

var activityKinds = []ActivityKind{
	ActivityKindCommand,
	ActivityKindFileChange,
	ActivityKindMCPTool,
	ActivityKindDynamicTool,
	ActivityKindWebSearch,
	ActivityKindImageView,
	ActivityKindImageGeneration,
	ActivityKindSleep,
	ActivityKindHook,
	ActivityKindSubagent,
	ActivityKindOther,
}

// ActivityKinds returns the adapter's activity catalog so a consumer can prove
// it gave every reported activity a durable meaning.
func ActivityKinds() []ActivityKind {
	return append([]ActivityKind(nil), activityKinds...)
}

// ActivityEvent carries the typed identity of one provider activity. The
// kind-specific fields are the provider's own facts, so the durable record does
// not have to reconstruct a working directory, a server, or a tool name from a
// display title.
type ActivityEvent struct {
	ProviderItemID string       `json:"providerItemId"`
	Kind           ActivityKind `json:"kind"`
	Status         string       `json:"status"`
	Title          string       `json:"title"`
	Summary        string       `json:"summary,omitempty"`
	Command        *string      `json:"command,omitempty"`
	CWD            *string      `json:"cwd,omitempty"`
	Server         *string      `json:"server,omitempty"`
	Tool           *string      `json:"tool,omitempty"`
	Namespace      *string      `json:"namespace,omitempty"`
	ProcessID      *string      `json:"processId,omitempty"`
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

// ApprovalSupersededEvent reports that the provider resolved a request this app
// is still showing, so the pending prompt is withdrawn without a user decision.
type ApprovalSupersededEvent struct {
	ApprovalID string `json:"approvalId"`
}

// ValidationKind is the typed provider check the adapter reports. It matches
// the durable validation catalog one to one, so the Director resolves what was
// checked from a reported fact rather than from a bucket the adapter chose.
type ValidationKind string

const (
	ValidationKindGuardianReview    ValidationKind = "guardian_review"
	ValidationKindModelVerification ValidationKind = "model_verification"
)

// ValidationStatus is the typed verdict of a provider check.
type ValidationStatus string

const (
	ValidationStatusInProgress   ValidationStatus = "in_progress"
	ValidationStatusPassed       ValidationStatus = "passed"
	ValidationStatusFailed       ValidationStatus = "failed"
	ValidationStatusInconclusive ValidationStatus = "inconclusive"
)

var validationKinds = []ValidationKind{
	ValidationKindGuardianReview,
	ValidationKindModelVerification,
}

var validationStatuses = []ValidationStatus{
	ValidationStatusInProgress,
	ValidationStatusPassed,
	ValidationStatusFailed,
	ValidationStatusInconclusive,
}

// ValidationEvent carries one provider check over declared work. Subject names
// the provider item the check covers when the provider names one.
type ValidationEvent struct {
	ID      string           `json:"id"`
	Kind    ValidationKind   `json:"kind"`
	Status  ValidationStatus `json:"status"`
	Subject *string          `json:"subject,omitempty"`
	Summary string           `json:"summary"`
}

type ModelRerouteEvent struct {
	FromModel string `json:"fromModel"`
	ToModel   string `json:"toModel"`
	Reason    string `json:"reason"`
}

type TerminalEvent struct {
	Outcome TurnOutcome `json:"outcome"`
	Error   *string     `json:"error,omitempty"`
}

// LifecycleState is whether the provider can carry the run forward. It matches
// the durable provider lifecycle catalog one to one.
type LifecycleState string

const (
	LifecycleStateStarting    LifecycleState = "starting"
	LifecycleStateReady       LifecycleState = "ready"
	LifecycleStateRestarting  LifecycleState = "restarting"
	LifecycleStateUnavailable LifecycleState = "unavailable"
	LifecycleStateClosed      LifecycleState = "closed"
)

// LifecycleReason is the trusted provider fact that produced the state, so a
// consumer never has to read the message to know what happened.
type LifecycleReason string

const (
	LifecycleReasonSessionFailed           LifecycleReason = "session_failed"
	LifecycleReasonEventLag                LifecycleReason = "event_lag"
	LifecycleReasonTurnError               LifecycleReason = "turn_error"
	LifecycleReasonThreadStatus            LifecycleReason = "thread_status"
	LifecycleReasonThreadClosed            LifecycleReason = "thread_closed"
	LifecycleReasonEnvironmentConnected    LifecycleReason = "environment_connected"
	LifecycleReasonEnvironmentDisconnected LifecycleReason = "environment_disconnected"
)

var lifecycleStates = []LifecycleState{
	LifecycleStateStarting,
	LifecycleStateReady,
	LifecycleStateRestarting,
	LifecycleStateUnavailable,
	LifecycleStateClosed,
}

var lifecycleReasons = []LifecycleReason{
	LifecycleReasonSessionFailed,
	LifecycleReasonEventLag,
	LifecycleReasonTurnError,
	LifecycleReasonThreadStatus,
	LifecycleReasonThreadClosed,
	LifecycleReasonEnvironmentConnected,
	LifecycleReasonEnvironmentDisconnected,
}

type LifecycleEvent struct {
	State  LifecycleState  `json:"state"`
	Reason LifecycleReason `json:"reason"`
	Error  *string         `json:"error,omitempty"`
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
		event.ApprovalSuperseded != nil,
		event.Validation != nil,
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
	EventKindApprovalSuperseded: {branches: 1, validate: validateApprovalSupersededEvent},
	EventKindValidationRecorded: {branches: 1, validate: validateValidationEvent},
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
	for _, kind := range activityKinds {
		if event.Activity.Kind == kind {
			return nil
		}
	}
	return fmt.Errorf("unsupported agent activity kind %q", event.Activity.Kind)
}

func validateApprovalEvent(event Event) error {
	if event.Approval == nil {
		return errors.New("agent approval event requires approval payload")
	}
	return nil
}

func validateApprovalSupersededEvent(event Event) error {
	if event.ApprovalSuperseded == nil || event.ApprovalSuperseded.ApprovalID == "" {
		return errors.New("agent approval superseded event requires an approval id")
	}
	return nil
}

func validateValidationEvent(event Event) error {
	if event.Validation == nil {
		return errors.New("agent validation event requires validation payload")
	}
	if event.Validation.ID == "" {
		return errors.New("agent validation event requires a validation id")
	}
	if !containsEnumValue(validationKinds, event.Validation.Kind) {
		return fmt.Errorf("unsupported agent validation kind %q", event.Validation.Kind)
	}
	if !containsEnumValue(validationStatuses, event.Validation.Status) {
		return fmt.Errorf("unsupported agent validation status %q", event.Validation.Status)
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
	return nil
}

func validateLifecycleEvent(event Event) error {
	if event.Lifecycle == nil {
		return errors.New("agent lifecycle event requires lifecycle payload")
	}
	if !containsEnumValue(lifecycleStates, event.Lifecycle.State) {
		return fmt.Errorf("unsupported agent lifecycle state %q", event.Lifecycle.State)
	}
	if !containsEnumValue(lifecycleReasons, event.Lifecycle.Reason) {
		return fmt.Errorf("unsupported agent lifecycle reason %q", event.Lifecycle.Reason)
	}
	return nil
}

func containsEnumValue[T ~string](catalog []T, value T) bool {
	for _, candidate := range catalog {
		if candidate == value {
			return true
		}
	}
	return false
}
