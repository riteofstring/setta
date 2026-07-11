package master

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/conversationindex"
)

func (service *Service) validateDecisionPolicy(ctx context.Context, input Input, candidates []conversationindex.TopicCandidate, decision RouteDecision) error {
	switch value := decision.(type) {
	case CreateConversationDecision:
		if _, err := service.workspaces.ResolveWorkspace(value.WorkspaceID); err != nil {
			return err
		}
		if hasLexicalCandidate(candidates) {
			return errors.New("create_conversation is ambiguous while lexical topic candidates remain; clarification is required")
		}
		return nil
	case ClarifyDecision, AnswerGlobalDecision:
		return nil
	}
	targetID, err := routeTargetID(decision)
	if err != nil {
		return err
	}
	record, err := service.store.ReadConversation(ctx, targetID)
	if err != nil {
		return err
	}
	if !candidatePermitsTarget(candidates, input.FocusedConversationID, targetID) {
		return fmt.Errorf("route target %s is outside the retrieved candidate set", targetID)
	}
	if input.FocusedWorkspaceID != nil && input.FocusedConversationID != nil && targetID == *input.FocusedConversationID && record.WorkspaceID != *input.FocusedWorkspaceID {
		return errors.New("route target does not belong to the focused workspace")
	}
	return nil
}

func (service *Service) executeDecision(ctx context.Context, input Input, decision RouteDecision) (*CommandResult, []PresentationIntent, error) {
	switch value := decision.(type) {
	case SendToAgentDecision:
		record, err := service.store.ReadConversation(ctx, value.ConversationID)
		if err != nil {
			return nil, nil, err
		}
		if _, err := service.conversations.Send(ctx, conversation.SendConversationInputRequest{
			WorkspaceID: record.WorkspaceID, ConversationID: record.ID, Input: value.AuthoredInput,
		}); err != nil {
			return nil, nil, err
		}
		intent, err := service.presentationIntent(ctx, input, record)
		return commandForConversation(value.routeDecisionType(), record.ID), intentSlice(intent), err
	case AskNarratorDecision:
		event, err := service.narrator.RequestStatus(ctx, value.ConversationID, value.Question)
		if err != nil {
			return nil, nil, err
		}
		command := commandForConversation(value.routeDecisionType(), value.ConversationID)
		command.NarrationEvent = &event
		return command, []PresentationIntent{ShowMasterReplyIntent{Type: PresentationIntentShowReply, Text: event.StatusReply.Text}}, nil
	case FocusConversationDecision:
		record, err := service.store.ReadConversation(ctx, value.ConversationID)
		if err != nil {
			return nil, nil, err
		}
		intent, err := service.presentationIntent(ctx, input, record)
		return commandForConversation(value.routeDecisionType(), record.ID), intentSlice(intent), err
	case CreateConversationDecision:
		snapshot, err := service.conversations.Create(ctx, conversation.CreateConversationRequest{
			WorkspaceID: value.WorkspaceID, Title: value.ProposedTitle, InitialInput: &value.InitialInput,
		})
		if err != nil {
			return nil, nil, err
		}
		intent := OpenConversationPaneIntent{Type: PresentationIntentOpenConversation, WorkspaceID: value.WorkspaceID, ConversationID: snapshot.Conversation.ID}
		return commandForConversation(value.routeDecisionType(), snapshot.Conversation.ID), []PresentationIntent{intent}, nil
	case CreateSideConversationDecision:
		return service.executeSideDecision(ctx, input, value)
	case ForkConversationDecision:
		return service.executeForkDecision(ctx, value)
	case ClarifyDecision:
		return nil, []PresentationIntent{ShowMasterReplyIntent{Type: PresentationIntentShowReply, Text: value.Question}}, nil
	case AnswerGlobalDecision:
		return nil, []PresentationIntent{ShowMasterReplyIntent{Type: PresentationIntentShowReply, Text: value.Text}}, nil
	default:
		return nil, nil, fmt.Errorf("unsupported route execution %T", decision)
	}
}

func (service *Service) executeSideDecision(ctx context.Context, input Input, decision CreateSideConversationDecision) (*CommandResult, []PresentationIntent, error) {
	record, err := service.store.ReadConversation(ctx, decision.ParentConversationID)
	if err != nil {
		return nil, nil, err
	}
	paneID, err := service.boundPaneID(ctx, input.FocusedPaneID, decision.ParentConversationID)
	if err != nil {
		return nil, nil, err
	}
	side, err := service.conversations.CreateSide(ctx, conversation.CreateSideConversationRequest{
		WorkspaceID: record.WorkspaceID, ParentConversationID: record.ID,
		ParentPaneID: paneID, Input: decision.Input,
	})
	if err != nil {
		return nil, nil, err
	}
	command := commandForConversation(decision.routeDecisionType(), record.ID)
	command.SideID = stringPointer(side.ID)
	intent := OpenSideConversationIntent{
		Type: PresentationIntentOpenSide, ParentConversationID: record.ID,
		ParentPaneID: paneID, SideID: side.ID,
	}
	return command, []PresentationIntent{intent}, nil
}

func (service *Service) executeForkDecision(ctx context.Context, decision ForkConversationDecision) (*CommandResult, []PresentationIntent, error) {
	parent, err := service.store.ReadConversation(ctx, decision.ParentConversationID)
	if err != nil {
		return nil, nil, err
	}
	snapshot, err := service.conversations.Fork(ctx, conversation.ForkConversationRequest{
		WorkspaceID: parent.WorkspaceID, ParentConversationID: parent.ID,
		ForkedAtTurnID: decision.ForkedAtTurnID, InitialInput: &decision.Input,
	})
	if err != nil {
		return nil, nil, err
	}
	intent := OpenConversationPaneIntent{
		Type: PresentationIntentOpenConversation, WorkspaceID: parent.WorkspaceID,
		ConversationID: snapshot.Conversation.ID,
	}
	return commandForConversation(decision.routeDecisionType(), snapshot.Conversation.ID), []PresentationIntent{intent}, nil
}

func (service *Service) presentationIntent(ctx context.Context, input Input, record conversation.TopicConversation) (PresentationIntent, error) {
	bindings, err := service.store.ListPaneBindings(ctx, &record.ID)
	if err != nil {
		return nil, err
	}
	if input.FocusedPaneID != nil {
		for _, binding := range bindings {
			if binding.PaneID == *input.FocusedPaneID {
				return FocusExistingPaneIntent{Type: PresentationIntentFocusExisting, ConversationID: record.ID, PaneID: binding.PaneID}, nil
			}
		}
	}
	if len(bindings) > 0 {
		return FocusExistingPaneIntent{Type: PresentationIntentFocusExisting, ConversationID: record.ID, PaneID: bindings[0].PaneID}, nil
	}
	return OpenConversationPaneIntent{Type: PresentationIntentOpenConversation, WorkspaceID: record.WorkspaceID, ConversationID: record.ID}, nil
}

func (service *Service) boundPaneID(ctx context.Context, preferred *string, conversationID string) (string, error) {
	bindings, err := service.store.ListPaneBindings(ctx, &conversationID)
	if err != nil {
		return "", err
	}
	if preferred != nil {
		for _, binding := range bindings {
			if binding.PaneID == *preferred {
				return binding.PaneID, nil
			}
		}
	}
	if len(bindings) == 0 {
		return "", errors.New("side conversation requires an open parent conversation pane")
	}
	return bindings[0].PaneID, nil
}

func routeTargetID(decision RouteDecision) (string, error) {
	switch value := decision.(type) {
	case SendToAgentDecision:
		return value.ConversationID, nil
	case AskNarratorDecision:
		return value.ConversationID, nil
	case FocusConversationDecision:
		return value.ConversationID, nil
	case CreateSideConversationDecision:
		return value.ParentConversationID, nil
	case ForkConversationDecision:
		return value.ParentConversationID, nil
	default:
		return "", fmt.Errorf("route decision %T has no existing conversation target", decision)
	}
}

func hasLexicalCandidate(candidates []conversationindex.TopicCandidate) bool {
	for _, candidate := range candidates {
		if candidate.LexicalRank != nil {
			return true
		}
	}
	return false
}

func candidatePermitsTarget(candidates []conversationindex.TopicCandidate, focused *string, target string) bool {
	if focused != nil && *focused == target {
		return true
	}
	for _, candidate := range candidates {
		if candidate.Card.ConversationID == target {
			return true
		}
	}
	return false
}

func commandForConversation(action MasterRouteDecisionType, conversationID string) *CommandResult {
	return &CommandResult{Action: action, ConversationID: stringPointer(conversationID)}
}

func intentSlice(intent PresentationIntent) []PresentationIntent {
	if intent == nil {
		return []PresentationIntent{}
	}
	return []PresentationIntent{intent}
}

func marshalRouteDecision(decision RouteDecision) (json.RawMessage, error) {
	encoded, err := json.Marshal(decision)
	return json.RawMessage(encoded), err
}
