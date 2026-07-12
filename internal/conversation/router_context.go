package conversation

import (
	"errors"
	"fmt"
	"reflect"
)

const (
	MaxConversationRouterTrajectoryEvents = 128
	MaxConversationRouterPriorNarration   = 24
	MaxConversationRouterPriorDecisions   = 24
	MaxConversationRouterForkPoints       = 32
)

// ConversationRouterContextReadRequest freezes one claimed routing exchange
// into the same read transaction as its authoritative conversation state.
type ConversationRouterContextReadRequest struct {
	Work                ConversationInputRoutingWork
	MaxTrajectoryEvents int
	MaxPriorNarration   int
	MaxPriorDecisions   int
	MaxForkPoints       int
}

type ConversationRouterPriorDecision struct {
	InputSequence   int                       `json:"inputSequence"`
	DecisionOrdinal int                       `json:"decisionOrdinal"`
	InputText       string                    `json:"inputText"`
	Decision        ConversationRouteDecision `json:"decision"`
	DecidedAt       string                    `json:"decidedAt"`
}

type ConversationRouterForkPoint struct {
	TurnID      string        `json:"turnId"`
	Objective   AuthoredInput `json:"objective"`
	CompletedAt string        `json:"completedAt"`
}

// ConversationRouterContextSource is store-owned input for the lightweight
// local router. It deliberately excludes provider thread ids, command ids,
// pane commands, and unrelated conversations.
type ConversationRouterContextSource struct {
	Work                     ConversationInputRoutingWork      `json:"work"`
	Conversation             TopicConversation                 `json:"conversation"`
	NarratorState            NarratorState                     `json:"narratorState"`
	CurrentTurn              NarratorCurrentTurnProjection     `json:"currentTurn"`
	Trajectory               NarratorTrajectoryWindow          `json:"trajectory"`
	PriorNarration           []NarrationEvent                  `json:"priorNarration"`
	PriorRouteDecisions      []ConversationRouterPriorDecision `json:"priorRouteDecisions"`
	ValidCompletedForkPoints []ConversationRouterForkPoint     `json:"validCompletedForkPoints"`
	AllowedDecisionKinds     []ConversationRouteDecisionKind   `json:"allowedDecisionKinds"`
}

func (request ConversationRouterContextReadRequest) Validate() error {
	if err := request.Work.Validate(); err != nil {
		return err
	}
	for _, limit := range []struct {
		label string
		value int
		max   int
	}{
		{label: "trajectory", value: request.MaxTrajectoryEvents, max: MaxConversationRouterTrajectoryEvents},
		{label: "prior narration", value: request.MaxPriorNarration, max: MaxConversationRouterPriorNarration},
		{label: "prior decisions", value: request.MaxPriorDecisions, max: MaxConversationRouterPriorDecisions},
		{label: "fork points", value: request.MaxForkPoints, max: MaxConversationRouterForkPoints},
	} {
		if limit.value <= 0 || limit.value > limit.max {
			return fmt.Errorf("conversation router %s limit must be between 1 and %d", limit.label, limit.max)
		}
	}
	return nil
}

func (source ConversationRouterContextSource) Validate(
	request ConversationRouterContextReadRequest,
) error {
	if err := request.Validate(); err != nil {
		return err
	}
	if err := validateConversationRouterSourceIdentity(source, request); err != nil {
		return err
	}
	if err := validateConversationRouterSourceBounds(source, request); err != nil {
		return err
	}
	if err := validateConversationRouterTrajectory(source); err != nil {
		return err
	}
	if err := validateConversationRouterPriorNarration(source); err != nil {
		return err
	}
	if err := validateConversationRouterPriorDecisions(source); err != nil {
		return err
	}
	if err := validateConversationRouterForkPoints(source); err != nil {
		return err
	}
	return conversationRouterContextAudit(source).Validate()
}

func validateConversationRouterSourceIdentity(
	source ConversationRouterContextSource,
	request ConversationRouterContextReadRequest,
) error {
	if !equalConversationInputRoutingWork(source.Work, request.Work) {
		return errors.New("conversation router context work changed during materialization")
	}
	conversationID := request.Work.Input.Input.ConversationID
	if source.Conversation.ID != conversationID || source.NarratorState.ConversationID != conversationID {
		return errors.New("conversation router context ownership does not match the routed input")
	}
	if source.Conversation.ArchivedAt != nil {
		return errors.New("conversation router context cannot target an archived conversation")
	}
	return nil
}

func validateConversationRouterSourceBounds(
	source ConversationRouterContextSource,
	request ConversationRouterContextReadRequest,
) error {
	if source.Trajectory.Events == nil || source.PriorNarration == nil ||
		source.PriorRouteDecisions == nil || source.ValidCompletedForkPoints == nil ||
		source.AllowedDecisionKinds == nil {
		return errors.New("conversation router bounded collections must be arrays")
	}
	if len(source.Trajectory.Events) > request.MaxTrajectoryEvents ||
		len(source.PriorNarration) > request.MaxPriorNarration ||
		len(source.PriorRouteDecisions) > request.MaxPriorDecisions ||
		len(source.ValidCompletedForkPoints) > request.MaxForkPoints {
		return errors.New("conversation router context exceeded a requested collection bound")
	}
	return nil
}

func conversationRouterContextAudit(source ConversationRouterContextSource) ConversationRouteContextAudit {
	audit := ConversationRouteContextAudit{
		InputSequence:                source.Work.Input.Sequence,
		LatestTrajectorySequence:     source.Conversation.LastTrajectorySequence,
		AvailableTrajectoryRange:     cloneTrajectorySequenceRange(source.Trajectory.AvailableRange),
		IncludedTrajectoryRange:      cloneTrajectorySequenceRange(source.Trajectory.IncludedRange),
		PriorNarrationCount:          len(source.PriorNarration),
		PriorRouteDecisionCount:      len(source.PriorRouteDecisions),
		ValidCompletedForkPointCount: len(source.ValidCompletedForkPoints),
		AllowedDecisionKinds:         append([]ConversationRouteDecisionKind{}, source.AllowedDecisionKinds...),
	}
	if source.Work.ClarificationReply != nil {
		sequence := source.Work.ClarificationReply.Sequence
		audit.ClarificationInputSequence = &sequence
	}
	return audit
}

func validateConversationRouterTrajectory(source ConversationRouterContextSource) error {
	window := source.Trajectory
	if window.AvailableRange == nil {
		return validateEmptyConversationRouterTrajectory(window)
	}
	if err := window.AvailableRange.Validate(); err != nil {
		return err
	}
	if window.AvailableRange.End != source.Conversation.LastTrajectorySequence {
		return errors.New("conversation router trajectory is not anchored at the latest sequence")
	}
	if len(window.Events) == 0 || window.IncludedRange == nil {
		return errors.New("conversation router available trajectory has no included events")
	}
	if err := window.IncludedRange.Validate(); err != nil {
		return err
	}
	if err := validateConversationRouterTrajectoryEvents(source.Conversation.ID, window.Events); err != nil {
		return err
	}
	return validateConversationRouterTrajectorySuffix(window)
}

func validateEmptyConversationRouterTrajectory(window NarratorTrajectoryWindow) error {
	if window.IncludedRange != nil || len(window.Events) != 0 || window.HasEarlier || window.HasLater {
		return errors.New("conversation router empty trajectory has inconsistent bounds")
	}
	return nil
}

func validateConversationRouterTrajectoryEvents(
	conversationID string,
	events []TrajectoryEvent,
) error {
	for index, event := range events {
		if event.ConversationID != conversationID {
			return errors.New("conversation router trajectory contains another conversation")
		}
		if index > 0 && event.Sequence != events[index-1].Sequence+1 {
			return errors.New("conversation router trajectory is not contiguous")
		}
	}
	return nil
}

func validateConversationRouterTrajectorySuffix(window NarratorTrajectoryWindow) error {
	if window.IncludedRange.Start != window.Events[0].Sequence ||
		window.IncludedRange.End != window.Events[len(window.Events)-1].Sequence ||
		window.IncludedRange.End != window.AvailableRange.End || window.HasLater {
		return errors.New("conversation router trajectory is not the latest bounded suffix")
	}
	return nil
}

func validateConversationRouterPriorNarration(source ConversationRouterContextSource) error {
	previous := 0
	for _, event := range source.PriorNarration {
		if err := event.Validate(); err != nil {
			return err
		}
		if event.ConversationID != source.Conversation.ID || event.StreamSequence <= previous {
			return errors.New("conversation router prior narration is not owned and ordered")
		}
		previous = event.StreamSequence
	}
	return nil
}

func validateConversationRouterPriorDecisions(source ConversationRouterContextSource) error {
	previousSequence := 0
	previousOrdinal := 0
	for _, prior := range source.PriorRouteDecisions {
		if err := validateConversationRouterPriorDecisionOrder(
			prior,
			previousSequence,
			previousOrdinal,
			source.Work.Input.Sequence,
		); err != nil {
			return err
		}
		if err := validateTrimmedText("conversation router prior input", prior.InputText); err != nil {
			return err
		}
		if err := prior.Decision.Validate(); err != nil {
			return err
		}
		if _, err := validateTimestamp("conversation router prior decision decidedAt", prior.DecidedAt); err != nil {
			return err
		}
		previousSequence = prior.InputSequence
		previousOrdinal = prior.DecisionOrdinal
	}
	return nil
}

func validateConversationRouterPriorDecisionOrder(
	prior ConversationRouterPriorDecision,
	previousSequence int,
	previousOrdinal int,
	currentInputSequence int,
) error {
	if prior.InputSequence < previousSequence || prior.InputSequence >= currentInputSequence {
		return errors.New("conversation router prior decisions are not in input order")
	}
	if prior.DecisionOrdinal < 1 || prior.DecisionOrdinal > 2 ||
		(prior.InputSequence == previousSequence && prior.DecisionOrdinal <= previousOrdinal) {
		return errors.New("conversation router prior decision ordinals are not ordered")
	}
	return nil
}

func validateConversationRouterForkPoints(source ConversationRouterContextSource) error {
	seen := map[string]bool{}
	for _, point := range source.ValidCompletedForkPoints {
		if err := validateIdentifier("conversation router fork turn id", point.TurnID); err != nil {
			return err
		}
		if seen[point.TurnID] {
			return errors.New("conversation router fork point is duplicated")
		}
		seen[point.TurnID] = true
		if err := point.Objective.Validate(); err != nil {
			return err
		}
		if _, err := validateTimestamp("conversation router fork completedAt", point.CompletedAt); err != nil {
			return err
		}
	}
	return nil
}

func equalConversationInputRoutingWork(
	left ConversationInputRoutingWork,
	right ConversationInputRoutingWork,
) bool {
	return reflect.DeepEqual(left, right)
}
