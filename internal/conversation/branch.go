package conversation

import "fmt"

type BranchKind string
type SideConversationStatus string
type SideConversationEventKind string

const (
	BranchKindFork BranchKind = "fork"

	SideConversationStatusPreparing SideConversationStatus = "preparing"
	SideConversationStatusActive    SideConversationStatus = "active"
	SideConversationStatusDisposing SideConversationStatus = "disposing"
	SideConversationStatusFailed    SideConversationStatus = "failed"

	SideConversationEventAgentTextDelta     SideConversationEventKind = "agent_text_delta"
	SideConversationEventAgentTextCompleted SideConversationEventKind = "agent_text_completed"
	SideConversationEventActivity           SideConversationEventKind = "activity"
	SideConversationEventTerminal           SideConversationEventKind = "terminal"
)

type ConversationBranch struct {
	ChildConversationID      string            `json:"childConversationId"`
	ParentConversationID     string            `json:"parentConversationId"`
	Kind                     BranchKind        `json:"kind"`
	ForkedAtTurnID           string            `json:"forkedAtTurnId"`
	SourceTrajectorySequence int               `json:"sourceTrajectorySequence"`
	ProviderMetadata         map[string]string `json:"providerMetadata"`
	CreatedAt                string            `json:"createdAt"`
}

type SideConversation struct {
	ID                          string                 `json:"id"`
	ParentConversationID        string                 `json:"parentConversationId"`
	ParentPaneID                string                 `json:"parentPaneId"`
	ProviderThreadID            *string                `json:"providerThreadId"`
	SourceProviderTurnID        *string                `json:"sourceProviderTurnId"`
	SourceTrajectorySequence    int                    `json:"sourceTrajectorySequence"`
	Status                      SideConversationStatus `json:"status"`
	ResolvedSideAgentInvocation ResolvedInvocation     `json:"resolvedSideAgentInvocation"`
	CreatedAt                   string                 `json:"createdAt"`
	UpdatedAt                   string                 `json:"updatedAt"`
	DisposedAt                  *string                `json:"disposedAt"`
	Failure                     *Failure               `json:"failure"`
}

type SideInFlightContextFrame struct {
	SourceTrajectorySequence int                        `json:"sourceTrajectorySequence"`
	CurrentObjective         string                     `json:"currentObjective"`
	AcceptedSteering         []string                   `json:"acceptedSteering"`
	CurrentPlan              *TrajectoryPlanChanged     `json:"currentPlan"`
	ActiveActivities         []TrajectoryActivity       `json:"activeActivities"`
	ActiveSubagents          []Subagent                 `json:"activeSubagents"`
	PendingApproval          *TrajectoryApprovalRequest `json:"pendingApproval"`
	Artifacts                []Artifact                 `json:"artifacts"`
}

type SideConversationEvent struct {
	SideID               string                    `json:"sideId"`
	ParentConversationID string                    `json:"parentConversationId"`
	Kind                 SideConversationEventKind `json:"kind"`
	ProviderEventID      *string                   `json:"providerEventId"`
	Text                 *string                   `json:"text"`
	Activity             *TrajectoryActivity       `json:"activity"`
	Outcome              *InvocationOutcome        `json:"outcome"`
	Failure              *Failure                  `json:"failure"`
	EmittedAt            string                    `json:"emittedAt"`
}

func (branch ConversationBranch) Validate() error {
	if err := validateIdentifier("branch child conversation id", branch.ChildConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("branch parent conversation id", branch.ParentConversationID); err != nil {
		return err
	}
	if branch.ChildConversationID == branch.ParentConversationID {
		return fmt.Errorf("branch child and parent conversation ids must differ")
	}
	if branch.Kind != BranchKindFork {
		return fmt.Errorf("branch %s has unsupported kind %q", branch.ChildConversationID, branch.Kind)
	}
	if err := validateIdentifier("branch forked-at turn id", branch.ForkedAtTurnID); err != nil {
		return err
	}
	if branch.SourceTrajectorySequence < 0 {
		return fmt.Errorf("branch %s source trajectory sequence must be non-negative", branch.ChildConversationID)
	}
	if err := validateStringMap("branch provider metadata", branch.ProviderMetadata); err != nil {
		return err
	}
	_, err := validateTimestamp("branch createdAt", branch.CreatedAt)
	return err
}

func (side SideConversation) Validate() error {
	if err := validateSideConversationIdentity(side); err != nil {
		return err
	}
	if err := validateSideConversationInvocation(side); err != nil {
		return err
	}
	timeline, err := validateSideConversationTimeline(side)
	if err != nil {
		return err
	}
	if side.Failure != nil {
		if err := side.Failure.Validate(); err != nil {
			return fmt.Errorf("side conversation %s failure: %w", side.ID, err)
		}
	}
	return validateSideConversationLifecycle(side, timeline.hasDisposed)
}

func (event SideConversationEvent) Validate() error {
	if err := validateIdentifier("side event side id", event.SideID); err != nil {
		return err
	}
	if err := validateIdentifier("side event parent conversation id", event.ParentConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("side event provider id", event.ProviderEventID); err != nil {
		return err
	}
	switch event.Kind {
	case SideConversationEventAgentTextDelta, SideConversationEventAgentTextCompleted:
		if event.Text == nil || *event.Text == "" || event.Activity != nil || event.Outcome != nil || event.Failure != nil {
			return fmt.Errorf("side text event has invalid branch payload")
		}
	case SideConversationEventActivity:
		if event.Activity == nil || event.Text != nil || event.Outcome != nil || event.Failure != nil {
			return fmt.Errorf("side activity event has invalid branch payload")
		}
		if err := event.Activity.Validate(); err != nil {
			return err
		}
	case SideConversationEventTerminal:
		if event.Outcome == nil || event.Text != nil || event.Activity != nil {
			return fmt.Errorf("side terminal event has invalid branch payload")
		}
		if *event.Outcome == InvocationOutcomeFailed && event.Failure == nil {
			return fmt.Errorf("failed side terminal event requires failure")
		}
		if *event.Outcome != InvocationOutcomeFailed && event.Failure != nil {
			return fmt.Errorf("successful side terminal event must not contain failure")
		}
	default:
		return fmt.Errorf("unsupported side conversation event kind %q", event.Kind)
	}
	if event.Failure != nil {
		if err := event.Failure.Validate(); err != nil {
			return err
		}
	}
	_, err := validateTimestamp("side event emittedAt", event.EmittedAt)
	return err
}

func validateSideConversationIdentity(side SideConversation) error {
	if err := validateIdentifier("side conversation id", side.ID); err != nil {
		return err
	}
	if err := validateIdentifier("side conversation parent id", side.ParentConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("side conversation parent pane id", side.ParentPaneID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("side conversation provider thread id", side.ProviderThreadID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("side conversation source provider turn id", side.SourceProviderTurnID); err != nil {
		return err
	}
	if side.SourceTrajectorySequence < 0 {
		return fmt.Errorf("side conversation %s source trajectory sequence must be non-negative", side.ID)
	}
	if !validSideConversationStatus(side.Status) {
		return fmt.Errorf("side conversation %s has unsupported status %q", side.ID, side.Status)
	}
	return nil
}

func validateSideConversationInvocation(side SideConversation) error {
	if err := side.ResolvedSideAgentInvocation.Validate(); err != nil {
		return fmt.Errorf("side conversation %s invocation: %w", side.ID, err)
	}
	if side.ResolvedSideAgentInvocation.Role != RoleSideAgent {
		return fmt.Errorf("side conversation %s invocation role must be %s", side.ID, RoleSideAgent)
	}
	return nil
}

type sideConversationTimeline struct {
	hasDisposed bool
}

func validateSideConversationTimeline(side SideConversation) (sideConversationTimeline, error) {
	createdAt, err := validateTimestamp("side conversation createdAt", side.CreatedAt)
	if err != nil {
		return sideConversationTimeline{}, err
	}
	updatedAt, err := validateTimestamp("side conversation updatedAt", side.UpdatedAt)
	if err != nil {
		return sideConversationTimeline{}, err
	}
	if updatedAt.Before(createdAt) {
		return sideConversationTimeline{}, fmt.Errorf("side conversation %s updatedAt precedes createdAt", side.ID)
	}
	disposedAt, hasDisposed, err := optionalTimestamp("side conversation disposedAt", side.DisposedAt)
	if err != nil {
		return sideConversationTimeline{}, err
	}
	if hasDisposed && disposedAt.Before(createdAt) {
		return sideConversationTimeline{}, fmt.Errorf("side conversation %s disposedAt precedes createdAt", side.ID)
	}
	return sideConversationTimeline{hasDisposed: hasDisposed}, nil
}

func validateSideConversationLifecycle(side SideConversation, hasDisposed bool) error {
	switch side.Status {
	case SideConversationStatusPreparing:
		return validatePreparingSideConversation(side, hasDisposed)
	case SideConversationStatusActive:
		return validateActiveSideConversation(side, hasDisposed)
	case SideConversationStatusDisposing:
		return validateDisposingSideConversation(side)
	case SideConversationStatusFailed:
		return validateFailedSideConversation(side)
	default:
		return fmt.Errorf("side conversation %s has unsupported lifecycle status %q", side.ID, side.Status)
	}
}

func validatePreparingSideConversation(side SideConversation, hasDisposed bool) error {
	if side.ProviderThreadID != nil || hasDisposed || side.Failure != nil {
		return fmt.Errorf("preparing side conversation %s contains active or terminal state", side.ID)
	}
	return nil
}

func validateActiveSideConversation(side SideConversation, hasDisposed bool) error {
	if side.ProviderThreadID == nil || hasDisposed || side.Failure != nil {
		return fmt.Errorf("active side conversation %s must have provider thread without terminal state", side.ID)
	}
	return nil
}

func validateDisposingSideConversation(side SideConversation) error {
	if side.ProviderThreadID == nil || side.Failure != nil {
		return fmt.Errorf("disposing side conversation %s must have provider thread and no failure", side.ID)
	}
	return nil
}

func validateFailedSideConversation(side SideConversation) error {
	if side.Failure == nil {
		return fmt.Errorf("failed side conversation %s requires failure", side.ID)
	}
	return nil
}

func validSideConversationStatus(status SideConversationStatus) bool {
	switch status {
	case SideConversationStatusPreparing, SideConversationStatusActive, SideConversationStatusDisposing, SideConversationStatusFailed:
		return true
	default:
		return false
	}
}
