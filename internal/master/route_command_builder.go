package master

import (
	"errors"
	"fmt"
	"slices"
)

func (service *RouteService) buildRouteCommand(
	decision RouteDecision,
	bundle RouteContextBundle,
) (RouteCommand, error) {
	switch decision.Kind {
	case RouteDecisionKindSendToAgent:
		return service.buildSendToAgentCommand(decision, bundle)
	case RouteDecisionKindQueueAgentTurn:
		return service.buildQueueAgentTurnCommand(decision, bundle)
	case RouteDecisionKindSteerActiveTurn:
		return service.buildSteerActiveTurnCommand(decision, bundle)
	case RouteDecisionKindAskNarrator:
		return service.buildAskNarratorCommand(decision, bundle)
	case RouteDecisionKindFocusConversation:
		return service.buildFocusConversationCommand(decision, bundle)
	case RouteDecisionKindCreateConversation:
		return service.buildCreateConversationCommand(decision, bundle)
	case RouteDecisionKindCreateSideConversation:
		return service.buildCreateSideConversationCommand(decision, bundle)
	case RouteDecisionKindForkConversation:
		return service.buildForkConversationCommand(decision, bundle)
	case RouteDecisionKindClarify:
		return RouteCommand{
			Kind: decision.Kind,
			Clarify: &MasterClarifyRouteCommand{
				Question:           decision.Clarify.Question,
				CandidateTargetIDs: routeClarificationCandidateTargetIDs(bundle),
			},
		}, nil
	case RouteDecisionKindAnswerGlobal:
		return RouteCommand{Kind: decision.Kind, AnswerGlobal: &MasterAnswerGlobalRouteCommand{Text: decision.AnswerGlobal.Text}}, nil
	default:
		return RouteCommand{}, NewRouteAttemptFailure(
			RouteFailureKindInternal,
			fmt.Errorf("unsupported master route command kind %q", decision.Kind),
		)
	}
}

func routeClarificationCandidateTargetIDs(bundle RouteContextBundle) []string {
	ids := make([]string, 0, len(bundle.Candidates))
	for _, candidate := range bundle.Candidates {
		if !slices.Contains(ids, candidate.ConversationID) {
			ids = append(ids, candidate.ConversationID)
		}
	}
	return ids
}

func (service *RouteService) buildSendToAgentCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.SendToAgent.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	presentationTarget, err := service.presentationTargetFor(target)
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		SendToAgent: &MasterSendToAgentRouteCommand{
			Target: presentationTarget, TurnID: turnID, AuthoredInput: decision.SendToAgent.AuthoredInput,
		},
	}, err
}

func (service *RouteService) buildQueueAgentTurnCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.QueueAgentTurn.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	presentationTarget, err := service.presentationTargetFor(target)
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		QueueAgentTurn: &MasterQueueAgentTurnRouteCommand{
			Target: presentationTarget, TurnID: turnID, AuthoredInput: decision.QueueAgentTurn.AuthoredInput,
		},
	}, err
}

func (service *RouteService) buildSteerActiveTurnCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.SteerActiveTurn.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	if target.ActiveTurnID == nil {
		return RouteCommand{}, NewRouteAttemptFailure(
			RouteFailureKindStateUnavailable,
			errors.New("master route steering target has no active turn"),
		)
	}
	presentationTarget, err := service.presentationTargetFor(target)
	if err != nil {
		return RouteCommand{}, err
	}
	return RouteCommand{
		Kind: decision.Kind,
		SteerActiveTurn: &MasterSteerActiveTurnRouteCommand{
			Target: presentationTarget, TargetTurnID: *target.ActiveTurnID, AuthoredInput: decision.SteerActiveTurn.AuthoredInput,
		},
	}, nil
}

func (service *RouteService) buildAskNarratorCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.AskNarrator.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	presentationTarget, err := service.presentationTargetFor(target)
	if err != nil {
		return RouteCommand{}, err
	}
	requestID, err := service.routeCommandID("narrator_status")
	return RouteCommand{
		Kind: decision.Kind,
		AskNarrator: &MasterAskNarratorRouteCommand{
			Target: presentationTarget, RequestID: requestID, Question: decision.AskNarrator.Question,
		},
	}, err
}

func (service *RouteService) buildFocusConversationCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.FocusConversation.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	presentationTarget, err := service.presentationTargetFor(target)
	if err != nil {
		return RouteCommand{}, err
	}
	return RouteCommand{
		Kind:              decision.Kind,
		FocusConversation: &MasterFocusConversationRouteCommand{Target: presentationTarget},
	}, nil
}

func (service *RouteService) buildCreateConversationCommand(
	decision RouteDecision,
	bundle RouteContextBundle,
) (RouteCommand, error) {
	conversationID, err := service.routeCommandID("conversation")
	if err != nil {
		return RouteCommand{}, err
	}
	resourceBindings, err := service.presentationResourceBindingsForScope(decision.CreateConversation.ResourceScope)
	if err != nil {
		return RouteCommand{}, err
	}
	inputID, err := service.routeCommandID("conversation_input")
	return RouteCommand{
		Kind: decision.Kind,
		CreateConversation: &MasterCreateConversationRouteCommand{
			Target: ConversationPresentationTarget{
				ConversationID:   conversationID,
				ResourceScope:    cloneRouteResourceScope(decision.CreateConversation.ResourceScope),
				ResourceBindings: resourceBindings,
				Title:            decision.CreateConversation.ProposedTitle,
			},
			InitialInputID:        inputID,
			InitialInput:          decision.CreateConversation.InitialInput,
			InitialInputModality:  bundle.Input.Input.Modality,
			InitialInputSubmitted: bundle.Input.Input.SubmittedAt,
		},
	}, err
}

func (service *RouteService) buildCreateSideConversationCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.CreateSideConversation.ParentConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	presentationTarget, err := service.presentationTargetFor(target)
	if err != nil {
		return RouteCommand{}, err
	}
	sideID, err := service.routeCommandID("side_conversation")
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("side_turn")
	return RouteCommand{
		Kind: decision.Kind,
		CreateSideConversation: &MasterCreateSideConversationRouteCommand{
			Target: presentationTarget, SideConversationID: sideID, TurnID: turnID, Input: decision.CreateSideConversation.Input,
		},
	}, err
}

func (service *RouteService) buildForkConversationCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	parent, err := routeCommandTargetFor(bundle, decision.ForkConversation.ParentConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	workspaceID, folderScoped := parent.ResourceScope.FolderWorkspaceID()
	if !folderScoped {
		return RouteCommand{}, NewRouteAttemptFailure(
			RouteFailureKindStateUnavailable,
			fmt.Errorf("master route fork parent %s has no folder resource", parent.ConversationID),
		)
	}
	childID, err := service.routeCommandID("conversation")
	if err != nil {
		return RouteCommand{}, err
	}
	resourceBindings, err := service.presentationResourceBindingsForWorkspace(workspaceID)
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		ForkConversation: &MasterForkConversationRouteCommand{
			ParentConversationID: parent.ConversationID,
			Target: ConversationPresentationTarget{
				ConversationID:   childID,
				ResourceScope:    FolderRouteResourceScope(workspaceID, ""),
				ResourceBindings: resourceBindings,
				Title:            masterForkTitle(parent.Title),
			},
			ForkedAtTurnID: decision.ForkConversation.ForkedAtTurnID, TurnID: turnID, Input: decision.ForkConversation.Input,
		},
	}, err
}

func routeCommandTargetFor(bundle RouteContextBundle, conversationID string) (RouteConversationTarget, error) {
	for _, target := range bundle.ConversationTargets {
		if target.ConversationID == conversationID {
			return target, nil
		}
	}
	return RouteConversationTarget{}, NewRouteAttemptFailure(
		RouteFailureKindStateUnavailable,
		fmt.Errorf("master route command target %s is unavailable", conversationID),
	)
}

func (service *RouteService) presentationTargetFor(target RouteConversationTarget) (ConversationPresentationTarget, error) {
	resourceBindings, err := service.presentationResourceBindingsForScope(target.ResourceScope)
	if err != nil {
		return ConversationPresentationTarget{}, err
	}
	var preferredPaneID *string
	if len(target.OpenPaneIDs) > 0 {
		paneID := target.OpenPaneIDs[0]
		preferredPaneID = &paneID
	}
	return ConversationPresentationTarget{
		ConversationID:   target.ConversationID,
		ResourceScope:    cloneRouteResourceScope(target.ResourceScope),
		ResourceBindings: resourceBindings,
		Title:            target.Title,
		PreferredPaneID:  preferredPaneID,
	}, nil
}

func (service *RouteService) presentationResourceBindingsForScope(
	scope RouteResourceScope,
) ([]PresentationResourceBinding, error) {
	if err := scope.Validate(); err != nil {
		return nil, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	workspaceID, folderScoped := scope.FolderWorkspaceID()
	if !folderScoped {
		return []PresentationResourceBinding{}, nil
	}
	return service.presentationResourceBindingsForWorkspace(workspaceID)
}

func (service *RouteService) presentationResourceBindingsForWorkspace(
	workspaceID string,
) ([]PresentationResourceBinding, error) {
	if service == nil || service.workspaces == nil {
		return nil, NewRouteAttemptFailure(
			RouteFailureKindStateUnavailable,
			errors.New("master route workspace source is unavailable"),
		)
	}
	resolved, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return nil, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	if resolved.ID != workspaceID {
		return nil, NewRouteAttemptFailure(
			RouteFailureKindStateUnavailable,
			fmt.Errorf("master route workspace resolved as %s, want %s", resolved.ID, workspaceID),
		)
	}
	bindings := []PresentationResourceBinding{{
		Folder: &PresentationFolderResourceBinding{RootPath: resolved.RootPath},
		Kind:   PresentationResourceBindingKindFolder,
	}}
	if err := validatePresentationResourceBindings(bindings); err != nil {
		return nil, NewRouteAttemptFailure(RouteFailureKindStateUnavailable, err)
	}
	return bindings, nil
}

func (service *RouteService) routeCommandID(prefix string) (string, error) {
	id, err := service.newID(prefix)
	if err != nil {
		return "", NewRouteAttemptFailure(
			RouteFailureKindInternal,
			fmt.Errorf("generate master route command %s id: %w", prefix, err),
		)
	}
	return id, nil
}

func masterForkTitle(parentTitle string) string {
	const prefix = "Fork of "
	available := MaxRouteConversationTitle - len(prefix)
	bytes := 0
	end := 0
	for offset, value := range parentTitle {
		width := len(string(value))
		if bytes+width > available {
			break
		}
		bytes += width
		end = offset + width
	}
	return prefix + parentTitle[:end]
}
