package agent

import (
	"errors"
	"fmt"
	"strings"
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

// FileChangeKind is the provider's structured change operation. Diff text is
// evidence for the file-change detail surface; the kind is what lets the
// durable trajectory project the change without parsing that text.
type FileChangeKind string

const (
	FileChangeKindAdd    FileChangeKind = "add"
	FileChangeKindDelete FileChangeKind = "delete"
	FileChangeKindUpdate FileChangeKind = "update"
)

var fileChangeKinds = []FileChangeKind{
	FileChangeKindAdd,
	FileChangeKindDelete,
	FileChangeKindUpdate,
}

type FileChange struct {
	Path     string         `json:"path"`
	Kind     FileChangeKind `json:"kind"`
	MovePath *string        `json:"movePath,omitempty"`
	Diff     string         `json:"diff"`
}

// ActivityEvent carries the typed identity of one provider activity. The
// kind-specific fields are the provider's own facts, so the durable record does
// not have to reconstruct a working directory, a server, or a tool name from a
// display title.
type ActivityEvent struct {
	ProviderItemID           string       `json:"providerItemId"`
	Kind                     ActivityKind `json:"kind"`
	Status                   string       `json:"status"`
	Title                    string       `json:"title"`
	Summary                  string       `json:"summary,omitempty"`
	Command                  *string      `json:"command,omitempty"`
	CWD                      *string      `json:"cwd,omitempty"`
	Server                   *string      `json:"server,omitempty"`
	Tool                     *string      `json:"tool,omitempty"`
	Namespace                *string      `json:"namespace,omitempty"`
	ProcessID                *string      `json:"processId,omitempty"`
	SavedPath                *string      `json:"savedPath,omitempty"`
	ProviderSubagentThreadID *string      `json:"providerSubagentThreadId,omitempty"`
	FileChanges              []FileChange `json:"fileChanges,omitempty"`
	ExitCode                 *int         `json:"exitCode,omitempty"`
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

// ValidationRisk is the Guardian's typed risk classification. It stays
// structured across the adapter so no consumer has to recover it from prose.
type ValidationRisk string

const (
	ValidationRiskLow      ValidationRisk = "low"
	ValidationRiskMedium   ValidationRisk = "medium"
	ValidationRiskHigh     ValidationRisk = "high"
	ValidationRiskCritical ValidationRisk = "critical"
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

var validationRisks = []ValidationRisk{
	ValidationRiskLow,
	ValidationRiskMedium,
	ValidationRiskHigh,
	ValidationRiskCritical,
}

// ValidationEvent carries one provider check over declared work. Subject names
// the provider item the check covers when the provider names one.
type ValidationEvent struct {
	ID      string           `json:"id"`
	Kind    ValidationKind   `json:"kind"`
	Status  ValidationStatus `json:"status"`
	Risk    *ValidationRisk  `json:"risk,omitempty"`
	Subject *string          `json:"subject,omitempty"`
	Summary string           `json:"summary"`
}

type ModelRerouteEvent struct {
	FromModel string             `json:"fromModel"`
	ToModel   string             `json:"toModel"`
	Reason    ModelRerouteReason `json:"reason"`
}

// ModelRerouteReason is Setta's durable interpretation of the provider's
// closed reroute-reason catalog. Provider spellings stay behind the adapter.
type ModelRerouteReason string

const (
	ModelRerouteReasonHighRiskCyberActivity ModelRerouteReason = "high_risk_cyber_activity"
)

var modelRerouteReasons = []ModelRerouteReason{
	ModelRerouteReasonHighRiskCyberActivity,
}

type TerminalEvent struct {
	Outcome TurnOutcome `json:"outcome"`
	Error   *string     `json:"error,omitempty"`
}

// LifecycleState is whether the provider can carry the run forward. It matches
// the durable provider lifecycle catalog one to one.
type LifecycleState string

const (
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
	LifecycleReasonTurnRetrying            LifecycleReason = "turn_retrying"
	LifecycleReasonTurnFailed              LifecycleReason = "turn_failed"
	LifecycleReasonThreadIdle              LifecycleReason = "thread_idle"
	LifecycleReasonThreadActive            LifecycleReason = "thread_active"
	LifecycleReasonThreadNotLoaded         LifecycleReason = "thread_not_loaded"
	LifecycleReasonThreadSystemError       LifecycleReason = "thread_system_error"
	LifecycleReasonThreadClosed            LifecycleReason = "thread_closed"
	LifecycleReasonEnvironmentConnected    LifecycleReason = "environment_connected"
	LifecycleReasonEnvironmentDisconnected LifecycleReason = "environment_disconnected"
)

var lifecycleStates = []LifecycleState{
	LifecycleStateReady,
	LifecycleStateRestarting,
	LifecycleStateUnavailable,
	LifecycleStateClosed,
}

var lifecycleReasons = []LifecycleReason{
	LifecycleReasonSessionFailed,
	LifecycleReasonTurnRetrying,
	LifecycleReasonTurnFailed,
	LifecycleReasonThreadIdle,
	LifecycleReasonThreadActive,
	LifecycleReasonThreadNotLoaded,
	LifecycleReasonThreadSystemError,
	LifecycleReasonThreadClosed,
	LifecycleReasonEnvironmentConnected,
	LifecycleReasonEnvironmentDisconnected,
}

type LifecycleEvent struct {
	State  LifecycleState  `json:"state"`
	Reason LifecycleReason `json:"reason"`
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
	activity := event.Activity
	for _, validate := range []func() error{
		func() error { return validateActivityIdentity(activity) },
		func() error { return validateActivityKindFields(event.Kind, activity) },
		func() error { return validateActivitySubagent(activity) },
		func() error { return validateActivityFileChangePresence(activity) },
		func() error { return validateActivitySavedPath(activity) },
		func() error { return validateActivityFileChangeEntries(activity) },
	} {
		if err := validate(); err != nil {
			return err
		}
	}
	return nil
}

func validateActivityIdentity(activity *ActivityEvent) error {
	if strings.TrimSpace(activity.ProviderItemID) == "" ||
		strings.TrimSpace(activity.ProviderItemID) != activity.ProviderItemID ||
		strings.TrimSpace(activity.Status) == "" ||
		strings.TrimSpace(activity.Status) != activity.Status ||
		strings.TrimSpace(activity.Title) == "" ||
		strings.TrimSpace(activity.Title) != activity.Title {
		return errors.New("agent activity event requires item id, status, and title")
	}
	if !containsEnumValue(activityKinds, activity.Kind) {
		return fmt.Errorf("unsupported agent activity kind %q", activity.Kind)
	}
	return nil
}

func validateActivityKindFields(eventKind EventKind, activity *ActivityEvent) error {
	if eventKind != EventKindActivityUpdated {
		switch activity.Kind {
		case ActivityKindCommand:
			if !nonEmptyStringPointer(activity.Command) || !nonEmptyStringPointer(activity.CWD) {
				return errors.New("agent command activity requires command and cwd")
			}
		case ActivityKindMCPTool:
			if !nonEmptyStringPointer(activity.Server) || !nonEmptyStringPointer(activity.Tool) {
				return errors.New("agent MCP activity requires server and tool")
			}
		case ActivityKindDynamicTool:
			if !nonEmptyStringPointer(activity.Tool) {
				return errors.New("agent dynamic tool activity requires tool")
			}
		}
	}
	return nil
}

func validateActivitySubagent(activity *ActivityEvent) error {
	if activity.Kind == ActivityKindSubagent &&
		!nonEmptyStringPointer(activity.ProviderSubagentThreadID) {
		return errors.New("agent subagent activity requires provider subagent thread id")
	}
	if activity.Kind != ActivityKindSubagent && activity.ProviderSubagentThreadID != nil {
		return fmt.Errorf("agent activity kind %q must not carry a provider subagent thread id", activity.Kind)
	}
	return nil
}

func validateActivityFileChangePresence(activity *ActivityEvent) error {
	if activity.Kind != ActivityKindFileChange && len(activity.FileChanges) > 0 {
		return fmt.Errorf("agent activity kind %q must not carry file changes", activity.Kind)
	}
	return nil
}

func validateActivityFileChangeEntries(activity *ActivityEvent) error {
	for index, change := range activity.FileChanges {
		if strings.TrimSpace(change.Path) == "" ||
			strings.TrimSpace(change.Path) != change.Path ||
			!containsEnumValue(fileChangeKinds, change.Kind) {
			return fmt.Errorf("agent file change %d is invalid", index)
		}
		if change.Kind != FileChangeKindUpdate && change.MovePath != nil {
			return fmt.Errorf("agent file change %d kind %q must not carry a move path", index, change.Kind)
		}
		if change.MovePath != nil && !nonEmptyStringPointer(change.MovePath) {
			return fmt.Errorf("agent file change %d move path must be non-empty without surrounding whitespace", index)
		}
	}
	return nil
}

func validateActivitySavedPath(activity *ActivityEvent) error {
	if activity.Kind != ActivityKindImageGeneration {
		if activity.SavedPath != nil {
			return fmt.Errorf("agent activity kind %q must not carry a saved path", activity.Kind)
		}
		return nil
	}
	if activity.SavedPath != nil && !nonEmptyStringPointer(activity.SavedPath) {
		return errors.New("agent image generation saved path must be non-empty without surrounding whitespace")
	}
	return nil
}

func nonEmptyStringPointer(value *string) bool {
	return value != nil && strings.TrimSpace(*value) != "" && strings.TrimSpace(*value) == *value
}

func validateApprovalEvent(event Event) error {
	if event.Approval == nil {
		return errors.New("agent approval event requires approval payload")
	}
	return nil
}

func validateApprovalSupersededEvent(event Event) error {
	if event.ApprovalSuperseded == nil ||
		strings.TrimSpace(event.ApprovalSuperseded.ApprovalID) == "" ||
		strings.TrimSpace(event.ApprovalSuperseded.ApprovalID) != event.ApprovalSuperseded.ApprovalID {
		return errors.New("agent approval superseded event requires an approval id")
	}
	return nil
}

func validateValidationEvent(event Event) error {
	if event.Validation == nil {
		return errors.New("agent validation event requires validation payload")
	}
	validation := event.Validation
	if strings.TrimSpace(validation.ID) == "" ||
		strings.TrimSpace(validation.ID) != validation.ID {
		return errors.New("agent validation event requires a validation id")
	}
	if err := validateValidationEnums(validation); err != nil {
		return err
	}
	return validateValidationPublicMetadata(validation)
}

func validateValidationEnums(validation *ValidationEvent) error {
	if !containsEnumValue(validationKinds, validation.Kind) {
		return fmt.Errorf("unsupported agent validation kind %q", validation.Kind)
	}
	if !containsEnumValue(validationStatuses, validation.Status) {
		return fmt.Errorf("unsupported agent validation status %q", validation.Status)
	}
	if validation.Risk != nil && !containsEnumValue(validationRisks, *validation.Risk) {
		return fmt.Errorf("unsupported agent validation risk %q", *validation.Risk)
	}
	if validation.Kind == ValidationKindModelVerification && validation.Risk != nil {
		return errors.New("model verification must not carry Guardian risk")
	}
	return nil
}

func validateValidationPublicMetadata(validation *ValidationEvent) error {
	if validation.Subject != nil && !nonEmptyStringPointer(validation.Subject) {
		return errors.New("agent validation subject must be non-empty without surrounding whitespace")
	}
	if strings.TrimSpace(validation.Summary) == "" ||
		strings.TrimSpace(validation.Summary) != validation.Summary {
		return errors.New("agent validation event requires a trimmed public summary")
	}
	return nil
}

func validateModelRerouteEvent(event Event) error {
	if event.ModelReroute == nil {
		return errors.New("agent model-reroute event requires payload")
	}
	if strings.TrimSpace(event.ModelReroute.FromModel) == "" ||
		strings.TrimSpace(event.ModelReroute.FromModel) != event.ModelReroute.FromModel {
		return errors.New("agent model-reroute event requires a trimmed source model")
	}
	if strings.TrimSpace(event.ModelReroute.ToModel) == "" ||
		strings.TrimSpace(event.ModelReroute.ToModel) != event.ModelReroute.ToModel {
		return errors.New("agent model-reroute event requires a trimmed target model")
	}
	if event.ModelReroute.FromModel == event.ModelReroute.ToModel {
		return errors.New("agent model-reroute event must change model")
	}
	if !containsEnumValue(modelRerouteReasons, event.ModelReroute.Reason) {
		return fmt.Errorf("unsupported agent model-reroute reason %q", event.ModelReroute.Reason)
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
	if event.Lifecycle.State != lifecycleStateForReason(event.Lifecycle.Reason) {
		return fmt.Errorf(
			"agent lifecycle reason %q cannot produce state %q",
			event.Lifecycle.Reason,
			event.Lifecycle.State,
		)
	}
	return nil
}

func lifecycleStateForReason(reason LifecycleReason) LifecycleState {
	switch reason {
	case LifecycleReasonThreadIdle,
		LifecycleReasonThreadActive,
		LifecycleReasonEnvironmentConnected:
		return LifecycleStateReady
	case LifecycleReasonTurnRetrying:
		return LifecycleStateRestarting
	case LifecycleReasonSessionFailed,
		LifecycleReasonTurnFailed,
		LifecycleReasonThreadNotLoaded,
		LifecycleReasonThreadSystemError,
		LifecycleReasonEnvironmentDisconnected:
		return LifecycleStateUnavailable
	case LifecycleReasonThreadClosed:
		return LifecycleStateClosed
	default:
		return ""
	}
}

func containsEnumValue[T ~string](catalog []T, value T) bool {
	for _, candidate := range catalog {
		if candidate == value {
			return true
		}
	}
	return false
}
