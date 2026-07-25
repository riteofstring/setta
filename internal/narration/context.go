package narration

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/conversation"
)

var (
	ErrContextBudgetExceeded = errors.New("narrator required context exceeds its byte budget")
	ErrNoProjectionWork      = errors.New("narrator projection has no unobserved trajectory")
	ErrNoCheckpointWork      = errors.New("narrator checkpoint has no observed trajectory to compact")
)

type ContextKind string
type ProjectionChannel string
type ContextAuthority string

const (
	ContextKindFocus      ContextKind = "focus"
	ContextKindProjection ContextKind = "projection"
	ContextKindStatus     ContextKind = "status"
	ContextKindCheckpoint ContextKind = "checkpoint"

	ProjectionChannelWorking  ProjectionChannel = "working_projection"
	ProjectionChannelTerminal ProjectionChannel = "terminal_projection"

	ContextAuthorityCurrentInputs ContextAuthority = "current_objective_and_steering_override_historical_checkpoint"
	ContextAuthorityHistorical    ContextAuthority = "historical_only_current_structured_fields_are_authoritative"
)

type ContextLimits struct {
	MaxInputBytes             int
	MaxTrajectoryEvents       int
	RecentFinalSummaries      int
	MaxCheckpointSummaryBytes int
}

type ContextBudgetError struct {
	Kind          ContextKind
	MaxInputBytes int
	RequiredBytes int
	Reason        string
}

type ConversationIdentity struct {
	ConversationID           string                          `json:"conversationId"`
	WorkspaceID              string                          `json:"workspaceId"`
	Title                    string                          `json:"title"`
	TopicDescriptor          string                          `json:"topicDescriptor"`
	NarratorTopicDescriptor  string                          `json:"narratorTopicDescriptor"`
	Status                   conversation.ConversationStatus `json:"status"`
	LatestTrajectorySequence int                             `json:"latestTrajectorySequence"`
}

type CurrentInstructions struct {
	TurnID                 string                                         `json:"turnId"`
	TurnStatus             conversation.TurnStatus                        `json:"turnStatus"`
	Objective              conversation.AuthoredInput                     `json:"objective"`
	AcceptedSteering       []conversation.NarratorAcceptedSteering        `json:"acceptedSteering"`
	LatestAssistantMessage *conversation.NarratorSemanticAssistantMessage `json:"latestAssistantMessage"`
	Authority              ContextAuthority                               `json:"authority"`
}

type AuthoritativeContext struct {
	Conversation        ConversationIdentity                   `json:"conversation"`
	CurrentInstructions *CurrentInstructions                   `json:"currentInstructions"`
	CurrentPlan         *conversation.NarratorCurrentPlan      `json:"currentPlan"`
	ActiveActivities    []conversation.NarratorActiveActivity  `json:"activeActivities"`
	PendingApprovals    []conversation.NarratorPendingApproval `json:"pendingApprovals"`
	ActiveSubagents     []conversation.NarratorActiveSubagent  `json:"activeSubagents"`
	Artifacts           []conversation.Artifact                `json:"artifacts"`
	CurrentFocus        string                                 `json:"currentFocus"`
}

type HistoricalCheckpoint struct {
	CoveredThroughSequence int              `json:"coveredThroughSequence"`
	HistoricalSummary      string           `json:"historicalSummary"`
	Authority              ContextAuthority `json:"authority"`
}

type NarratorCursor struct {
	ObservedThroughSequence   int    `json:"observedThroughSequence"`
	CheckpointThroughSequence int    `json:"checkpointThroughSequence"`
	CurrentFocusRevision      int    `json:"currentFocusRevision"`
	UpdatedAt                 string `json:"updatedAt"`
}

type PriorMilestone struct {
	ID                  string `json:"id"`
	SourceSequenceStart int    `json:"sourceSequenceStart"`
	SourceSequenceEnd   int    `json:"sourceSequenceEnd"`
	Text                string `json:"text"`
	CreatedAt           string `json:"createdAt"`
}

type PriorFinalSummary struct {
	ID                  string `json:"id"`
	TurnID              string `json:"turnId"`
	SourceSequenceStart int    `json:"sourceSequenceStart"`
	SourceSequenceEnd   int    `json:"sourceSequenceEnd"`
	Text                string `json:"text"`
	CreatedAt           string `json:"createdAt"`
}

type ProjectionContextBundle struct {
	Kind                     ContextKind                           `json:"kind"`
	Trigger                  conversation.NarrationTrigger         `json:"trigger"`
	RequestedChannel         ProjectionChannel                     `json:"requestedChannel"`
	RequestedThroughSequence int                                   `json:"requestedThroughSequence"`
	Authoritative            AuthoritativeContext                  `json:"authoritative"`
	HistoricalCheckpoint     *HistoricalCheckpoint                 `json:"historicalCheckpoint"`
	PreCallCursor            NarratorCursor                        `json:"preCallCursor"`
	SemanticEvents           []conversation.NarratorSemanticEvent  `json:"semanticEvents"`
	SemanticSourceRange      *conversation.TrajectorySequenceRange `json:"semanticSourceRange"`
	EvaluationRange          conversation.TrajectorySequenceRange  `json:"evaluationRange"`
	RemainingUnobservedRange *conversation.TrajectorySequenceRange `json:"remainingUnobservedRange"`
	PriorMilestones          []PriorMilestone                      `json:"priorMilestones"`
	PriorFinalSummaries      []PriorFinalSummary                   `json:"priorFinalSummaries"`
	InputBytes               int                                   `json:"-"`
}

type FocusContextBundle struct {
	Kind                  ContextKind                   `json:"kind"`
	Trigger               conversation.NarrationTrigger `json:"trigger"`
	SourceThroughSequence int                           `json:"sourceThroughSequence"`
	Authoritative         AuthoritativeContext          `json:"authoritative"`
	PreCallCursor         NarratorCursor                `json:"preCallCursor"`
	InputBytes            int                           `json:"-"`
}

type StatusContextBundle struct {
	Kind                   ContextKind                           `json:"kind"`
	Trigger                conversation.NarrationTrigger         `json:"trigger"`
	Question               string                                `json:"question"`
	Authoritative          AuthoritativeContext                  `json:"authoritative"`
	PreCallCursor          NarratorCursor                        `json:"preCallCursor"`
	LatestEvents           []conversation.TrajectoryEvent        `json:"latestEvents"`
	IncludedRange          *conversation.TrajectorySequenceRange `json:"includedRange"`
	OmittedTrajectoryRange *conversation.TrajectorySequenceRange `json:"omittedTrajectoryRange"`
	OmittedUnobservedRange *conversation.TrajectorySequenceRange `json:"omittedUnobservedRange"`
	SourceThroughSequence  int                                   `json:"sourceThroughSequence"`
	RecentFinalSummaries   []PriorFinalSummary                   `json:"recentFinalSummaries"`
	InputBytes             int                                   `json:"-"`
}

type CheckpointContextBundle struct {
	Kind                      ContextKind                           `json:"kind"`
	Trigger                   conversation.NarrationTrigger         `json:"trigger"`
	Authoritative             AuthoritativeContext                  `json:"authoritative"`
	HistoricalCheckpoint      *HistoricalCheckpoint                 `json:"historicalCheckpoint"`
	PreCallCursor             NarratorCursor                        `json:"preCallCursor"`
	Trajectory                []conversation.TrajectoryEvent        `json:"trajectory"`
	RequestedRange            conversation.TrajectorySequenceRange  `json:"requestedRange"`
	RemainingEligibleRange    *conversation.TrajectorySequenceRange `json:"remainingEligibleRange"`
	MaxHistoricalSummaryBytes int                                   `json:"maxHistoricalSummaryBytes"`
	InputBytes                int                                   `json:"-"`
}

type ProjectionContextRequest struct {
	ConversationID  string
	TurnID          string
	Trigger         conversation.NarrationTrigger
	ThroughSequence int
	SemanticEvents  []conversation.NarratorSemanticEvent
	Limits          ContextLimits
}

type FocusContextRequest struct {
	ConversationID string
	TurnID         string
	Trigger        conversation.NarrationTrigger
	SourceSequence int
	Limits         ContextLimits
}

type StatusContextRequest struct {
	ConversationID string
	TurnID         *string
	Question       string
	Limits         ContextLimits
}

type CheckpointContextRequest struct {
	ConversationID string
	TurnID         *string
	Limits         ContextLimits
}

func (limits ContextLimits) Validate() error {
	if limits.MaxInputBytes <= 0 {
		return fmt.Errorf("narrator context max input bytes must be positive")
	}
	if limits.MaxTrajectoryEvents <= 0 || limits.MaxTrajectoryEvents > conversation.MaxNarratorContextTrajectoryEvents {
		return fmt.Errorf(
			"narrator context event limit must be between 1 and %d: %d",
			conversation.MaxNarratorContextTrajectoryEvents,
			limits.MaxTrajectoryEvents,
		)
	}
	if limits.RecentFinalSummaries < 0 || limits.RecentFinalSummaries > conversation.MaxNarratorContextFinalSummaries {
		return fmt.Errorf(
			"narrator recent final-summary limit must be between 0 and %d: %d",
			conversation.MaxNarratorContextFinalSummaries,
			limits.RecentFinalSummaries,
		)
	}
	if limits.MaxCheckpointSummaryBytes < 0 {
		return fmt.Errorf("narrator checkpoint summary byte limit must be non-negative")
	}
	return nil
}

func (err *ContextBudgetError) Error() string {
	return fmt.Sprintf(
		"narrator %s context requires %d bytes with a %d-byte limit: %s",
		err.Kind,
		err.RequiredBytes,
		err.MaxInputBytes,
		err.Reason,
	)
}

func (err *ContextBudgetError) Unwrap() error {
	return ErrContextBudgetExceeded
}

// ValidateObservedAdvance constrains a future working or terminal projection
// commit to the contiguous evaluation window materialized for that call. The
// output may stop within the window, but it cannot jump over an unevaluated
// event or move the durable cursor backward.
func (bundle ProjectionContextBundle) ValidateObservedAdvance(observedThroughSequence int) error {
	if bundle.Kind != ContextKindProjection {
		return fmt.Errorf("observed cursor advance requires projection context, got %q", bundle.Kind)
	}
	if err := bundle.EvaluationRange.Validate(); err != nil {
		return err
	}
	if bundle.EvaluationRange.Start != bundle.PreCallCursor.ObservedThroughSequence+1 {
		return fmt.Errorf("projection evaluation range does not begin after the durable observed cursor")
	}
	if bundle.RequestedThroughSequence <= 0 || bundle.EvaluationRange.End > bundle.RequestedThroughSequence {
		return fmt.Errorf("projection evaluation range exceeds its requested trajectory cutoff")
	}
	if observedThroughSequence < bundle.EvaluationRange.Start || observedThroughSequence > bundle.EvaluationRange.End {
		return fmt.Errorf(
			"projection observed cursor %d is outside supplied evaluation range %d..%d",
			observedThroughSequence,
			bundle.EvaluationRange.Start,
			bundle.EvaluationRange.End,
		)
	}
	return nil
}

func validateProjectionContextRequest(request ProjectionContextRequest) error {
	if err := validateIdentifier("narrator projection conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator projection turn id", request.TurnID); err != nil {
		return err
	}
	if !isProjectionTrigger(request.Trigger) {
		return fmt.Errorf("unsupported narrator projection trigger %q", request.Trigger)
	}
	if request.ThroughSequence <= 0 {
		return fmt.Errorf("narrator projection through sequence must be positive")
	}
	if err := validateProjectionContextSemanticEvents(request); err != nil {
		return err
	}
	return request.Limits.Validate()
}

func validateProjectionContextSemanticEvents(request ProjectionContextRequest) error {
	previous := 0
	for index, event := range request.SemanticEvents {
		if err := event.Validate(); err != nil {
			return fmt.Errorf("narrator projection context semantic event %d: %w", index, err)
		}
		if event.ConversationID != request.ConversationID || event.TurnID != request.TurnID {
			return fmt.Errorf(
				"narrator projection context semantic event %d belongs to %s/%s, want %s/%s",
				index,
				event.ConversationID,
				event.TurnID,
				request.ConversationID,
				request.TurnID,
			)
		}
		if event.SourceTrajectoryRange.End > request.ThroughSequence {
			return fmt.Errorf(
				"narrator projection context semantic event %d source %d exceeds projection cutoff %d",
				index,
				event.SourceTrajectoryRange.End,
				request.ThroughSequence,
			)
		}
		if event.SemanticSequence <= previous {
			return fmt.Errorf("narrator projection context semantic events must be strictly ordered")
		}
		previous = event.SemanticSequence
	}
	return nil
}

func validateFocusContextRequest(request FocusContextRequest) error {
	if err := validateIdentifier("narrator focus conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator focus turn id", request.TurnID); err != nil {
		return err
	}
	if !isFocusTrigger(request.Trigger) {
		return fmt.Errorf("unsupported narrator focus trigger %q", request.Trigger)
	}
	if request.SourceSequence <= 0 {
		return fmt.Errorf("narrator focus source sequence must be positive")
	}
	return request.Limits.Validate()
}

func validateStatusContextRequest(request StatusContextRequest) error {
	if err := validateIdentifier("narrator status conversation id", request.ConversationID); err != nil {
		return err
	}
	if request.TurnID != nil {
		if err := validateIdentifier("narrator status turn id", *request.TurnID); err != nil {
			return err
		}
	}
	if request.Question == "" || strings.TrimSpace(request.Question) != request.Question {
		return fmt.Errorf("narrator status question must be non-empty without surrounding whitespace")
	}
	return request.Limits.Validate()
}

func validateCheckpointContextRequest(request CheckpointContextRequest) error {
	if err := validateIdentifier("narrator checkpoint conversation id", request.ConversationID); err != nil {
		return err
	}
	if request.TurnID != nil {
		if err := validateIdentifier("narrator checkpoint turn id", *request.TurnID); err != nil {
			return err
		}
	}
	if err := request.Limits.Validate(); err != nil {
		return err
	}
	if request.Limits.MaxCheckpointSummaryBytes == 0 {
		return fmt.Errorf("narrator checkpoint summary byte limit must be positive")
	}
	return nil
}
