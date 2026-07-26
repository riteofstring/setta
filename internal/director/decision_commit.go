package director

import "fmt"

// Turning a validated decision into the durable fact.
//
// DirectorDecisionCommitted is what the graph projects a director_decision
// node from, so its public summary must be derived rather than copied out of
// model output. Every sentence below is built from the decision kind plus a
// title or summary the app already committed, which is why a decision can
// never label the graph with provider text.

// NewCommittedDecision builds the durable fact payload for a validated
// decision. createdWorkstreamID is the id trusted product code minted for a
// create decision; the protocol cannot name a workstream that does not exist
// yet, and every other decision must not supply one.
func NewCommittedDecision(
	context DirectorDecisionContext,
	decision DirectorDecision,
	createdWorkstreamID *string,
) (DirectorDecisionCommitted, error) {
	if err := ValidateDecisionAuthority(context, decision); err != nil {
		return DirectorDecisionCommitted{}, err
	}
	target, err := committedDecisionTarget(decision, createdWorkstreamID)
	if err != nil {
		return DirectorDecisionCommitted{}, err
	}
	summary, err := DecisionPublicSummary(context, decision)
	if err != nil {
		return DirectorDecisionCommitted{}, err
	}
	return DirectorDecisionCommitted{
		Decision:           decision.Kind,
		IntentID:           context.Intent.ID,
		PublicSummary:      summary,
		TargetWorkstreamID: target,
	}, nil
}

func committedDecisionTarget(decision DirectorDecision, createdWorkstreamID *string) (*string, error) {
	if decision.Kind == DirectorDecisionCreateWorkstream {
		if createdWorkstreamID == nil {
			return nil, fmt.Errorf("create_workstream requires the minted workstream id")
		}
		if err := validateIdentifier("created workstream id", *createdWorkstreamID); err != nil {
			return nil, err
		}
		return createdWorkstreamID, nil
	}
	if createdWorkstreamID != nil {
		return nil, fmt.Errorf("decision %q must not mint a workstream", decision.Kind)
	}
	return DecisionTargetWorkstreamID(decision), nil
}

// DecisionPublicSummary derives the public sentence a decision commits.
func DecisionPublicSummary(context DirectorDecisionContext, decision DirectorDecision) (string, error) {
	summary, err := decisionSummaryText(context, decision)
	if err != nil {
		return "", err
	}
	if err := validateTrimmedText("director decision public summary", summary); err != nil {
		return "", err
	}
	return summary, nil
}

func decisionSummaryText(context DirectorDecisionContext, decision DirectorDecision) (string, error) {
	switch decision.Kind {
	case DirectorDecisionCreateWorkstream:
		return fmt.Sprintf("Started the workstream %q.", decision.CreateWorkstream.ProposedTitle), nil
	case DirectorDecisionSendToWorkstream:
		return targetSummary(context, decision.SendToWorkstream.WorkstreamID, "Sent new work to %q.")
	case DirectorDecisionQueueBehindRun:
		return targetSummary(context, decision.QueueBehindRun.WorkstreamID, "Queued work behind the active run in %q.")
	case DirectorDecisionSteerRun:
		return targetSummary(context, decision.SteerRun.WorkstreamID, "Steered the active run in %q.")
	case DirectorDecisionSelectWorkstream:
		return targetSummary(context, decision.SelectWorkstream.WorkstreamID, "Selected %q.")
	case DirectorDecisionRecoverPath:
		return recoverPathSummary(context, *decision.RecoverPath)
	default:
		return "", fmt.Errorf("unknown director decision kind %q", decision.Kind)
	}
}

func targetSummary(context DirectorDecisionContext, workstreamID string, format string) (string, error) {
	target, found := context.Target(workstreamID)
	if !found {
		return "", fmt.Errorf("unknown workstream %s", workstreamID)
	}
	return fmt.Sprintf(format, target.Title), nil
}

func recoverPathSummary(context DirectorDecisionContext, payload RecoverPathDecision) (string, error) {
	target, found := context.Target(payload.WorkstreamID)
	if !found {
		return "", fmt.Errorf("unknown workstream %s", payload.WorkstreamID)
	}
	for _, failure := range target.RecoverableFailures {
		if failure.FailureEventID == payload.FailureEventID {
			return fmt.Sprintf("Recovering %q after: %s", target.Title, failure.PublicSummary), nil
		}
	}
	return "", fmt.Errorf("failure %s is not recoverable on workstream %s", payload.FailureEventID, payload.WorkstreamID)
}
