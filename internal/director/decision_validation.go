package director

import (
	"fmt"
	"slices"
)

// Strict trusted-target validation.
//
// A decision passes only if current trusted context authorizes the exact kind,
// target, failure, and resource scope it names. Tool refusals keep that
// rejection inside the Director conversation so the Director can repair its
// call or ask the user a useful question.

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
	case DirectorDecisionCreateWorkstream:
		return validateAuthorizedScope(context, decision.CreateWorkstream.ResourceScope)
	case DirectorDecisionSendToWorkstream:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.SendToWorkstream.WorkstreamID)
	case DirectorDecisionQueueBehindRun:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.QueueBehindRun.WorkstreamID)
	case DirectorDecisionSteerRun:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.SteerRun.WorkstreamID)
	case DirectorDecisionForkWorkstream:
		return validateAuthorizedTargetKind(context, decision.Kind, decision.ForkWorkstream.WorkstreamID)
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
