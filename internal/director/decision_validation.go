package director

import (
	"fmt"
	"slices"
)

// Strict trusted-target validation.
//
// A decision passes only if the trusted context that produced the schema also
// authorizes the exact kind, target, fork point, failure, and resource scope
// it names. Every rejection carries a typed reason, because the recovery
// policy routes on the reason and the user-facing text is derived from it
// rather than from provider output.

// ValidateDecisionAuthority rejects a decision the supplied context did not
// authorize. It re-runs the decision's own shape validation first, so a caller
// that only has the context and the decoded decision still cannot commit a
// malformed payload.
func ValidateDecisionAuthority(context DirectorDecisionContext, decision DirectorDecision) error {
	if err := context.Validate(); err != nil {
		return rejectedDecision(err.Error())
	}
	if err := decision.Validate(); err != nil {
		return err
	}
	if !context.allowsKind(decision.Kind) {
		return rejectedDecision(fmt.Sprintf("decision kind %q is not allowed by the supplied context", decision.Kind))
	}
	return validateAuthorizedDecisionPayload(context, decision)
}

func validateAuthorizedDecisionPayload(context DirectorDecisionContext, decision DirectorDecision) error {
	switch decision.Kind {
	case DirectorDecisionAnswerDirectly:
		return nil
	case DirectorDecisionCreateWorkstream:
		return validateAuthorizedCreation(context, decision.CreateWorkstream.Origin)
	case DirectorDecisionSendToWorkstream:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.SendToWorkstream.WorkstreamID)
	case DirectorDecisionQueueBehindRun:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.QueueBehindRun.WorkstreamID)
	case DirectorDecisionSteerRun:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.SteerRun.WorkstreamID)
	case DirectorDecisionSelectWorkstream:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.SelectWorkstream.WorkstreamID)
	case DirectorDecisionRecoverPath:
		return validateAuthorizedRecovery(context, *decision.RecoverPath)
	default:
		return rejectedDecision(fmt.Sprintf("unknown director decision kind %q", decision.Kind))
	}
}

func validateAuthorizedTargetKind(
	context DirectorDecisionContext,
	kind DirectorDecisionKind,
	workstreamID string,
) error {
	target, found := context.Target(workstreamID)
	if !found {
		return rejectedDecision(fmt.Sprintf("workstream %s was not supplied by authoritative context", workstreamID))
	}
	if !slices.Contains(target.AllowedDecisionKinds, kind) {
		return rejectedDecision(fmt.Sprintf("workstream %s does not allow %q", workstreamID, kind))
	}
	return nil
}

func validateAuthorizedRecovery(context DirectorDecisionContext, payload RecoverPathDecision) error {
	if err := validateAuthorizedTargetKind(context, DirectorDecisionRecoverPath, payload.WorkstreamID); err != nil {
		return err
	}
	target, _ := context.Target(payload.WorkstreamID)
	for _, failure := range target.RecoverableFailures {
		if failure.FailureEventID == payload.FailureEventID {
			return nil
		}
	}
	return rejectedDecision(fmt.Sprintf("failure %s is not recoverable on workstream %s", payload.FailureEventID, payload.WorkstreamID))
}

func validateAuthorizedCreation(context DirectorDecisionContext, origin WorkstreamCreationOrigin) error {
	switch origin.Kind {
	case WorkstreamCreationRoot:
		return validateAuthorizedScope(context, origin.Root.ResourceScope)
	case WorkstreamCreationChild:
		return validateAuthorizedChildParent(context, origin.Child.ParentWorkstreamID)
	case WorkstreamCreationFork:
		return validateAuthorizedForkPoint(context, *origin.Fork)
	default:
		return rejectedDecision(fmt.Sprintf("unknown workstream creation origin %q", origin.Kind))
	}
}

func validateAuthorizedScope(context DirectorDecisionContext, scope DecisionResourceScope) error {
	if scope.Kind == WorkstreamResourceScopeFolderless {
		return nil
	}
	for _, workspace := range context.Workspaces {
		if workspace.WorkspaceID == scope.Folder.WorkspaceID {
			return nil
		}
	}
	return rejectedDecision(fmt.Sprintf("workspace %s is not an offered folder resource", scope.Folder.WorkspaceID))
}

func validateAuthorizedChildParent(context DirectorDecisionContext, parentID string) error {
	target, found := context.Target(parentID)
	if !found {
		return rejectedDecision(fmt.Sprintf("parent workstream %s was not supplied by authoritative context", parentID))
	}
	if !target.AllowsChildWorkstream {
		return rejectedDecision(fmt.Sprintf("workstream %s does not accept a child workstream", parentID))
	}
	return nil
}

func validateAuthorizedForkPoint(context DirectorDecisionContext, origin ForkWorkstreamOrigin) error {
	target, found := context.Target(origin.ParentWorkstreamID)
	if !found {
		return rejectedDecision(fmt.Sprintf("fork parent %s was not supplied by authoritative context", origin.ParentWorkstreamID))
	}
	for _, point := range target.ForkPoints {
		if point.RunID == origin.ForkedAtRunID {
			return nil
		}
	}
	return rejectedDecision(fmt.Sprintf("run %s is not a fork point of workstream %s", origin.ForkedAtRunID, origin.ParentWorkstreamID))
}
