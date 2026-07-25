package conversation

import "setta/internal/master"

func requireCurrentMasterRouteCommandAuthority(
	transaction *WriteTransaction,
	command master.RouteCommand,
) error {
	if masterRouteCommandHasNoConversationAuthority(command.Kind) {
		return nil
	}
	conversationID, target, activeTurnID := masterRouteCommandTarget(command)
	current, found, err := readMasterRouteTarget(
		transaction.ctx,
		transaction.tx,
		conversationID,
		master.MaxRouteForkPointsPerTarget,
	)
	if err != nil {
		return err
	}
	if !found || current.WorkspaceID != target.WorkspaceID {
		return masterRouteCommandStateConflict(command, "presentation target changed before commit")
	}
	if command.Kind == master.RouteDecisionKindForkConversation {
		return nil
	}
	if current.Title != target.Title {
		return masterRouteCommandStateConflict(command, "presentation title changed before commit")
	}
	if !equalOptionalStrings(masterRoutePreferredPaneID(current), target.PreferredPaneID) {
		return masterRouteCommandStateConflict(command, "preferred pane changed before commit")
	}
	if !masterRouteActiveTurnMatches(current.ActiveTurnID, activeTurnID) {
		return masterRouteCommandStateConflict(command, "active turn changed before commit")
	}
	return nil
}

func masterRouteCommandHasNoConversationAuthority(kind master.RouteDecisionKind) bool {
	return kind == master.RouteDecisionKindCreateConversation ||
		kind == master.RouteDecisionKindClarify ||
		kind == master.RouteDecisionKindAnswerGlobal
}

func masterRoutePreferredPaneID(target master.RouteConversationTarget) *string {
	if len(target.OpenPaneIDs) == 0 {
		return nil
	}
	return &target.OpenPaneIDs[0]
}

func masterRouteActiveTurnMatches(current *string, expected *string) bool {
	return expected == nil || (current != nil && *current == *expected)
}

func masterRouteCommandStateConflict(command master.RouteCommand, message string) error {
	return stateConflict("master route command", commandTargetIdentifier(command), message)
}

func masterRouteCommandTarget(
	command master.RouteCommand,
) (string, master.ConversationPresentationTarget, *string) {
	switch command.Kind {
	case master.RouteDecisionKindSendToAgent:
		return routeCommandTarget(command.SendToAgent.Target, nil)
	case master.RouteDecisionKindQueueAgentTurn:
		return routeCommandTarget(command.QueueAgentTurn.Target, nil)
	case master.RouteDecisionKindSteerActiveTurn:
		return routeCommandTarget(command.SteerActiveTurn.Target, &command.SteerActiveTurn.TargetTurnID)
	case master.RouteDecisionKindAskNarrator:
		return routeCommandTarget(command.AskNarrator.Target, nil)
	case master.RouteDecisionKindFocusConversation:
		return routeCommandTarget(command.FocusConversation.Target, nil)
	case master.RouteDecisionKindCreateSideConversation:
		return routeCommandTarget(command.CreateSideConversation.Target, nil)
	case master.RouteDecisionKindForkConversation:
		return masterForkCommandParentTarget(command.ForkConversation)
	default:
		return "", master.ConversationPresentationTarget{}, nil
	}
}

func routeCommandTarget(
	target master.ConversationPresentationTarget,
	activeTurnID *string,
) (string, master.ConversationPresentationTarget, *string) {
	return target.ConversationID, target, activeTurnID
}

func masterForkCommandParentTarget(
	command *master.MasterForkConversationRouteCommand,
) (string, master.ConversationPresentationTarget, *string) {
	parent := master.ConversationPresentationTarget{
		WorkspaceID:    command.Target.WorkspaceID,
		ConversationID: command.ParentConversationID,
		Title:          "",
	}
	return command.ParentConversationID, parent, nil
}

func commandTargetIdentifier(command master.RouteCommand) string {
	conversationID, _, _ := masterRouteCommandTarget(command)
	if conversationID != "" {
		return conversationID
	}
	return string(command.Kind)
}
