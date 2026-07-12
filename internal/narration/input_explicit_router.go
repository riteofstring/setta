package narration

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

func (router *ConversationInputRouter) routeClaimedExplicitInput(
	ctx context.Context,
	work conversation.ConversationInputRoutingWork,
) (conversation.ConversationRouteDecisionRecord, error) {
	if work.ClarificationReply != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
			FailureKindStateCorrupt,
			errors.New("explicit conversation input cannot be a clarification reply"),
		)
	}
	workspaceID, err := router.store.ReadConversationWorkspaceID(
		ctx,
		work.Input.Input.ConversationID,
	)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
			FailureKindStateUnavailable,
			err,
		)
	}
	snapshot, err := router.store.ReadSnapshot(ctx, workspaceID, work.Input.Input.ConversationID)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
			FailureKindStateUnavailable,
			err,
		)
	}
	decision, command, err := router.buildExplicitDecision(work.Input.Input, snapshot)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, err
	}
	decisionID, err := router.newID("conversation_route_decision")
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	decidedAt, err := router.timestampAfter(work.RoutingStartedAt)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	commit := conversation.ConversationRouteDecisionCommit{
		ID:               decisionID,
		ConversationID:   work.Input.Input.ConversationID,
		InputID:          work.Input.Input.ID,
		RoutingAttempt:   work.RoutingAttempt,
		Source:           conversation.ConversationRouteDecisionSourceExplicit,
		Decision:         decision,
		ResultingCommand: command,
		DecidedAt:        decidedAt,
	}
	if err := commit.Validate(); err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(FailureKindInternal, err)
	}
	record, err := router.store.CommitConversationRouteDecision(ctx, commit)
	if err != nil {
		return conversation.ConversationRouteDecisionRecord{}, NewAttemptFailure(
			FailureKindStateUnavailable,
			err,
		)
	}
	return record, nil
}

func (router *ConversationInputRouter) buildExplicitDecision(
	input conversation.ConversationInput,
	snapshot conversation.ConversationSnapshot,
) (conversation.ConversationRouteDecision, conversation.ConversationRouteCommand, error) {
	authored := conversation.AuthoredInput{Text: input.Text}
	switch input.RequestedMode {
	case conversation.ConversationInputModeSend:
		turnID, err := conversationRouteCommandID(router.newID, "conversation_turn")
		return conversation.ConversationRouteDecision{
				Kind: conversation.ConversationRouteDecisionKindSendToParent,
				SendToParent: &conversation.SendToParentConversationRouteDecision{
					AuthoredInput: authored,
				},
			}, conversation.ConversationRouteCommand{
				Kind: conversation.ConversationRouteDecisionKindSendToParent,
				SendToParent: &conversation.SendToParentConversationRouteCommand{
					TurnID: turnID, AuthoredInput: authored,
				},
			}, err
	case conversation.ConversationInputModeQueue:
		turnID, err := conversationRouteCommandID(router.newID, "conversation_turn")
		return conversation.ConversationRouteDecision{
				Kind: conversation.ConversationRouteDecisionKindQueueParentTurn,
				QueueParentTurn: &conversation.QueueParentTurnConversationRouteDecision{
					AuthoredInput: authored,
				},
			}, conversation.ConversationRouteCommand{
				Kind: conversation.ConversationRouteDecisionKindQueueParentTurn,
				QueueParentTurn: &conversation.QueueParentTurnConversationRouteCommand{
					TurnID: turnID, AuthoredInput: authored,
				},
			}, err
	case conversation.ConversationInputModeSteer:
		return explicitSteerDecision(snapshot, authored)
	case conversation.ConversationInputModeAskNarrator:
		requestID, err := conversationRouteCommandID(router.newID, "narrator_status")
		return conversation.ConversationRouteDecision{
				Kind: conversation.ConversationRouteDecisionKindAnswerAsNarrator,
				AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteDecision{
					Question: input.Text,
				},
			}, conversation.ConversationRouteCommand{
				Kind: conversation.ConversationRouteDecisionKindAnswerAsNarrator,
				AnswerAsNarrator: &conversation.AnswerAsNarratorConversationRouteCommand{
					RequestID: requestID, Question: input.Text,
				},
			}, err
	case conversation.ConversationInputModeSide:
		return router.explicitSideDecision(input, authored)
	case conversation.ConversationInputModeFork:
		return router.explicitForkDecision(snapshot, authored)
	default:
		return conversation.ConversationRouteDecision{}, conversation.ConversationRouteCommand{},
			NewAttemptFailure(
				FailureKindInternal,
				fmt.Errorf("unsupported explicit conversation input mode %q", input.RequestedMode),
			)
	}
}

func explicitSteerDecision(
	snapshot conversation.ConversationSnapshot,
	authored conversation.AuthoredInput,
) (conversation.ConversationRouteDecision, conversation.ConversationRouteCommand, error) {
	for index := len(snapshot.Turns.Turns) - 1; index >= 0; index-- {
		turn := snapshot.Turns.Turns[index]
		if turn.Status != conversation.TurnStatusRunning {
			continue
		}
		return conversation.ConversationRouteDecision{
				Kind: conversation.ConversationRouteDecisionKindSteerParentTurn,
				SteerParentTurn: &conversation.SteerParentTurnConversationRouteDecision{
					AuthoredInput: authored,
				},
			}, conversation.ConversationRouteCommand{
				Kind: conversation.ConversationRouteDecisionKindSteerParentTurn,
				SteerParentTurn: &conversation.SteerParentTurnConversationRouteCommand{
					TargetTurnID: turn.ID, AuthoredInput: authored,
				},
			}, nil
	}
	return conversation.ConversationRouteDecision{}, conversation.ConversationRouteCommand{},
		NewAttemptFailure(FailureKindStateUnavailable, errors.New("explicit steer has no active turn"))
}

func (router *ConversationInputRouter) explicitSideDecision(
	input conversation.ConversationInput,
	authored conversation.AuthoredInput,
) (conversation.ConversationRouteDecision, conversation.ConversationRouteCommand, error) {
	if input.SourcePaneID == nil {
		return conversation.ConversationRouteDecision{}, conversation.ConversationRouteCommand{},
			NewAttemptFailure(
				FailureKindStateUnavailable,
				errors.New("explicit side conversation has no source pane"),
			)
	}
	sideID, err := conversationRouteCommandID(router.newID, "side_conversation")
	return conversation.ConversationRouteDecision{
			Kind: conversation.ConversationRouteDecisionKindCreateSideConversation,
			CreateSideConversation: &conversation.CreateSideConversationRouteDecision{
				Input: authored,
			},
		}, conversation.ConversationRouteCommand{
			Kind: conversation.ConversationRouteDecisionKindCreateSideConversation,
			CreateSideConversation: &conversation.CreateSideConversationRouteCommand{
				SideConversationID: sideID,
				ParentPaneID:       *input.SourcePaneID,
				Input:              authored,
			},
		}, err
}

func (router *ConversationInputRouter) explicitForkDecision(
	snapshot conversation.ConversationSnapshot,
	authored conversation.AuthoredInput,
) (conversation.ConversationRouteDecision, conversation.ConversationRouteCommand, error) {
	for index := len(snapshot.Turns.Turns) - 1; index >= 0; index-- {
		turn := snapshot.Turns.Turns[index]
		if turn.Status != conversation.TurnStatusCompleted {
			continue
		}
		childID, err := conversationRouteCommandID(router.newID, "conversation")
		decision := conversation.ConversationRouteDecision{
			Kind: conversation.ConversationRouteDecisionKindForkConversation,
			ForkConversation: &conversation.ForkConversationRouteDecision{
				ForkedAtTurnID: turn.ID,
				Input:          authored,
				ProposedTitle:  explicitConversationForkTitle(snapshot.Conversation.Title),
			},
		}
		return decision, conversation.ConversationRouteCommand{
			Kind: conversation.ConversationRouteDecisionKindForkConversation,
			ForkConversation: &conversation.ForkConversationRouteCommand{
				ChildConversationID: childID,
				ForkedAtTurnID:      turn.ID,
				Input:               authored,
				ProposedTitle:       decision.ForkConversation.ProposedTitle,
			},
		}, err
	}
	return conversation.ConversationRouteDecision{}, conversation.ConversationRouteCommand{},
		NewAttemptFailure(
			FailureKindStateUnavailable,
			errors.New("explicit fork has no completed turn"),
		)
}

func explicitConversationForkTitle(parentTitle string) string {
	const suffix = " fork"
	if len(parentTitle)+len(suffix) <= conversation.MaxConversationTitleBytes {
		return parentTitle + suffix
	}
	return "Topic fork"
}
