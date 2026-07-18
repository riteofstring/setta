package master

import (
	"errors"
	"fmt"
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
		return buildFocusConversationCommand(decision, bundle)
	case RouteDecisionKindCreateConversation:
		return service.buildCreateConversationCommand(decision)
	case RouteDecisionKindCreateSideConversation:
		return service.buildCreateSideConversationCommand(decision, bundle)
	case RouteDecisionKindForkConversation:
		return service.buildForkConversationCommand(decision, bundle)
	case RouteDecisionKindClarify:
		return RouteCommand{Kind: decision.Kind, Clarify: &MasterClarifyRouteCommand{Question: decision.Clarify.Question}}, nil
	case RouteDecisionKindAnswerGlobal:
		return RouteCommand{Kind: decision.Kind, AnswerGlobal: &MasterAnswerGlobalRouteCommand{Text: decision.AnswerGlobal.Text}}, nil
	default:
		return RouteCommand{}, NewRouteAttemptFailure(
			RouteFailureKindInternal,
			fmt.Errorf("unsupported master route command kind %q", decision.Kind),
		)
	}
}

func (service *RouteService) buildSendToAgentCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.SendToAgent.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		SendToAgent: &MasterSendToAgentRouteCommand{
			Target: presentationTargetFor(target), TurnID: turnID, AuthoredInput: decision.SendToAgent.AuthoredInput,
		},
	}, err
}

func (service *RouteService) buildQueueAgentTurnCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.QueueAgentTurn.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		QueueAgentTurn: &MasterQueueAgentTurnRouteCommand{
			Target: presentationTargetFor(target), TurnID: turnID, AuthoredInput: decision.QueueAgentTurn.AuthoredInput,
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
	return RouteCommand{
		Kind: decision.Kind,
		SteerActiveTurn: &MasterSteerActiveTurnRouteCommand{
			Target: presentationTargetFor(target), TargetTurnID: *target.ActiveTurnID, AuthoredInput: decision.SteerActiveTurn.AuthoredInput,
		},
	}, nil
}

func (service *RouteService) buildAskNarratorCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.AskNarrator.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	requestID, err := service.routeCommandID("narrator_status")
	return RouteCommand{
		Kind: decision.Kind,
		AskNarrator: &MasterAskNarratorRouteCommand{
			Target: presentationTargetFor(target), RequestID: requestID, Question: decision.AskNarrator.Question,
		},
	}, err
}

func buildFocusConversationCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.FocusConversation.ConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	return RouteCommand{
		Kind:              decision.Kind,
		FocusConversation: &MasterFocusConversationRouteCommand{Target: presentationTargetFor(target)},
	}, nil
}

func (service *RouteService) buildCreateConversationCommand(decision RouteDecision) (RouteCommand, error) {
	conversationID, err := service.routeCommandID("conversation")
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		CreateConversation: &MasterCreateConversationRouteCommand{
			Target: ConversationPresentationTarget{
				WorkspaceID: decision.CreateConversation.WorkspaceID, ConversationID: conversationID, Title: decision.CreateConversation.ProposedTitle,
			},
			TurnID: turnID, InitialInput: decision.CreateConversation.InitialInput,
		},
	}, err
}

func (service *RouteService) buildCreateSideConversationCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	target, err := routeCommandTargetFor(bundle, decision.CreateSideConversation.ParentConversationID)
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
			Target: presentationTargetFor(target), SideConversationID: sideID, TurnID: turnID, Input: decision.CreateSideConversation.Input,
		},
	}, err
}

func (service *RouteService) buildForkConversationCommand(decision RouteDecision, bundle RouteContextBundle) (RouteCommand, error) {
	parent, err := routeCommandTargetFor(bundle, decision.ForkConversation.ParentConversationID)
	if err != nil {
		return RouteCommand{}, err
	}
	childID, err := service.routeCommandID("conversation")
	if err != nil {
		return RouteCommand{}, err
	}
	turnID, err := service.routeCommandID("conversation_turn")
	return RouteCommand{
		Kind: decision.Kind,
		ForkConversation: &MasterForkConversationRouteCommand{
			ParentConversationID: parent.ConversationID,
			Target: ConversationPresentationTarget{
				WorkspaceID: parent.WorkspaceID, ConversationID: childID, Title: masterForkTitle(parent.Title),
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

func presentationTargetFor(target RouteConversationTarget) ConversationPresentationTarget {
	var preferredPaneID *string
	if len(target.OpenPaneIDs) > 0 {
		paneID := target.OpenPaneIDs[0]
		preferredPaneID = &paneID
	}
	return ConversationPresentationTarget{
		WorkspaceID:     target.WorkspaceID,
		ConversationID:  target.ConversationID,
		Title:           target.Title,
		PreferredPaneID: preferredPaneID,
	}
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
