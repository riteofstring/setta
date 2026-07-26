package conversation

import "fmt"

const (
	MaxNarratorContextTrajectoryEvents = 512
	MaxNarratorContextFinalSummaries   = 32
)

type NarratorContextReadKind string

const (
	NarratorContextReadProjection NarratorContextReadKind = "projection"
	NarratorContextReadStatus     NarratorContextReadKind = "status"
	NarratorContextReadCheckpoint NarratorContextReadKind = "checkpoint"
)

type TrajectorySequenceRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type NarratorContextReadRequest struct {
	ConversationID            string
	TurnID                    *string
	Kind                      NarratorContextReadKind
	ProjectionThroughSequence int
	MaxTrajectoryEvents       int
	MaxFinalSummaries         int
}

type NarratorAcceptedSteering struct {
	Sequence int           `json:"sequence"`
	Input    AuthoredInput `json:"input"`
}

type NarratorCurrentPlan struct {
	Sequence int                   `json:"sequence"`
	Plan     TrajectoryPlanChanged `json:"plan"`
}

type NarratorActiveActivity struct {
	StartedAtSequence     int                         `json:"startedAtSequence"`
	LastUpdatedAtSequence int                         `json:"lastUpdatedAtSequence"`
	Activity              TrajectoryActivity          `json:"activity"`
	LatestProgress        string                      `json:"latestProgress"`
	LatestOutput          *TrajectoryContentReference `json:"latestOutput"`
}

type NarratorPendingApproval struct {
	RequestedAtSequence int                       `json:"requestedAtSequence"`
	Approval            TrajectoryApprovalRequest `json:"approval"`
}

type NarratorActiveSubagent struct {
	StartedAtSequence     int      `json:"startedAtSequence"`
	LastUpdatedAtSequence int      `json:"lastUpdatedAtSequence"`
	Subagent              Subagent `json:"subagent"`
}

type NarratorCurrentTurnProjection struct {
	Turn                   *ConversationTurn                 `json:"turn"`
	AcceptedSteering       []NarratorAcceptedSteering        `json:"acceptedSteering"`
	LatestAssistantMessage *NarratorSemanticAssistantMessage `json:"latestAssistantMessage"`
	Plan                   *NarratorCurrentPlan              `json:"plan"`
	ActiveActivities       []NarratorActiveActivity          `json:"activeActivities"`
	PendingApprovals       []NarratorPendingApproval         `json:"pendingApprovals"`
	ActiveSubagents        []NarratorActiveSubagent          `json:"activeSubagents"`
	Artifacts              []Artifact                        `json:"artifacts"`
}

type NarratorTrajectoryWindow struct {
	AvailableRange *TrajectorySequenceRange `json:"availableRange"`
	IncludedRange  *TrajectorySequenceRange `json:"includedRange"`
	Events         []TrajectoryEvent        `json:"events"`
	HasEarlier     bool                     `json:"hasEarlier"`
	HasLater       bool                     `json:"hasLater"`
}

type NarratorContextSource struct {
	Conversation            TopicConversation             `json:"conversation"`
	NarratorState           NarratorState                 `json:"narratorState"`
	CurrentTurn             NarratorCurrentTurnProjection `json:"currentTurn"`
	Trajectory              NarratorTrajectoryWindow      `json:"trajectory"`
	PriorMilestones         []NarrationEvent              `json:"priorMilestones"`
	CurrentTurnFinalSummary *NarrationEvent               `json:"currentTurnFinalSummary"`
	RecentFinalSummaries    []NarrationEvent              `json:"recentFinalSummaries"`
}

func (value TrajectorySequenceRange) Validate() error {
	if value.Start <= 0 {
		return fmt.Errorf("trajectory sequence range start must be positive: %d", value.Start)
	}
	if value.End < value.Start {
		return fmt.Errorf("trajectory sequence range %d..%d is invalid", value.Start, value.End)
	}
	return nil
}

func (request NarratorContextReadRequest) Validate() error {
	if err := validateIdentifier("narrator context conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("narrator context turn id", request.TurnID); err != nil {
		return err
	}
	if err := request.validateTarget(); err != nil {
		return err
	}
	if request.MaxTrajectoryEvents <= 0 || request.MaxTrajectoryEvents > MaxNarratorContextTrajectoryEvents {
		return fmt.Errorf(
			"narrator context trajectory limit must be between 1 and %d: %d",
			MaxNarratorContextTrajectoryEvents,
			request.MaxTrajectoryEvents,
		)
	}
	if request.MaxFinalSummaries < 0 || request.MaxFinalSummaries > MaxNarratorContextFinalSummaries {
		return fmt.Errorf(
			"narrator context final-summary limit must be between 0 and %d: %d",
			MaxNarratorContextFinalSummaries,
			request.MaxFinalSummaries,
		)
	}
	return nil
}

func (request NarratorContextReadRequest) validateTarget() error {
	switch request.Kind {
	case NarratorContextReadProjection:
		if request.TurnID == nil {
			return fmt.Errorf("narrator projection context requires turn id")
		}
		if request.ProjectionThroughSequence <= 0 {
			return fmt.Errorf("narrator projection context requires a positive through sequence")
		}
	case NarratorContextReadStatus, NarratorContextReadCheckpoint:
		if request.ProjectionThroughSequence != 0 {
			return fmt.Errorf(
				"narrator %s context must not include a projection through sequence",
				request.Kind,
			)
		}
	default:
		return fmt.Errorf("unsupported narrator context read kind %q", request.Kind)
	}
	return nil
}
