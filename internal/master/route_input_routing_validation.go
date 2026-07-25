package master

import (
	"errors"
	"fmt"
	"time"
)

func (audit RouteClarificationAudit) Validate() error {
	if err := validateRouteReference("master route clarification decision id", audit.DecisionID); err != nil {
		return err
	}
	if audit.InputSequence <= 0 {
		return errors.New("master route clarification input sequence must be positive")
	}
	return validateBoundedRouteConversationTargetIDs(
		"clarification candidate target",
		audit.CandidateTargetIDs,
		MaxRouteConversationTargets,
	)
}

func (work InputRoutingWork) Validate() error {
	if err := work.Input.Validate(); err != nil {
		return err
	}
	if work.RoutingAttempt <= 0 {
		return errors.New("master input routing work attempt must be positive")
	}
	startedAt, err := normalizeTimestamp("master input routing startedAt", work.RoutingStartedAt)
	if err != nil || startedAt != work.RoutingStartedAt {
		return errors.New("master input routing startedAt must be normalized")
	}
	started, _ := time.Parse(time.RFC3339Nano, startedAt)
	accepted, _ := time.Parse(time.RFC3339Nano, work.Input.AcceptedAt)
	if started.Before(accepted) {
		return errors.New("master input routing starts before input acceptance")
	}
	if work.PriorClarification != nil {
		if err := validateInputRoutingPriorClarification(work); err != nil {
			return err
		}
	}
	return nil
}

func validateInputRoutingPriorClarification(work InputRoutingWork) error {
	prior := work.PriorClarification
	if err := prior.Validate(); err != nil {
		return err
	}
	if prior.Context.InputSequence >= work.Input.Sequence {
		return errors.New("master input routing prior clarification must precede the routed input")
	}
	if prior.Decision.Kind != RouteDecisionKindClarify ||
		prior.ResultingCommand.Kind != RouteDecisionKindClarify ||
		prior.ResultingCommand.Clarify == nil {
		return errors.New("master input routing prior clarification must be a clarify decision")
	}
	return validateBoundedRouteConversationTargetIDs(
		"clarification candidate target",
		prior.ResultingCommand.Clarify.CandidateTargetIDs,
		MaxRouteConversationTargets,
	)
}

func validateBoundedRouteConversationTargetIDs(label string, values []string, maximum int) error {
	if values == nil {
		return fmt.Errorf("master route %s ids must be an array", label)
	}
	if len(values) > maximum {
		return fmt.Errorf("master route %s ids exceed %d", label, maximum)
	}
	return validateUniqueRouteReferences(label, values)
}
