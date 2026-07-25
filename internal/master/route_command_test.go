package master

import "testing"

func TestPresentationIntentForCommandUsesTrustedPaneTargets(t *testing.T) {
	paneID := "pane-alpha"
	target := ConversationPresentationTarget{
		WorkspaceID:     "workspace-alpha",
		ConversationID:  "conversation-alpha",
		Title:           "Alpha topic",
		PreferredPaneID: &paneID,
	}
	input := MasterInput{
		ID:          "master-input-focus",
		Text:        "Focus Alpha.",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-14T08:00:00Z",
	}
	intent, err := PresentationIntentForCommand(input, RouteCommand{
		Kind: RouteDecisionKindFocusConversation,
		FocusConversation: &MasterFocusConversationRouteCommand{
			Target: target,
		},
	})
	if err != nil {
		t.Fatalf("PresentationIntentForCommand: %v", err)
	}
	if intent.Kind != PresentationIntentKindFocusExistingConversationPane ||
		intent.FocusExistingConversationPane == nil ||
		intent.FocusExistingConversationPane.Target.PreferredPaneID == nil ||
		*intent.FocusExistingConversationPane.Target.PreferredPaneID != paneID {
		t.Fatalf("focus presentation intent = %+v", intent)
	}

	target.PreferredPaneID = nil
	intent, err = PresentationIntentForCommand(input, RouteCommand{
		Kind: RouteDecisionKindFocusConversation,
		FocusConversation: &MasterFocusConversationRouteCommand{
			Target: target,
		},
	})
	if err != nil || intent.Kind != PresentationIntentKindOpenConversationPane ||
		intent.OpenConversationPane == nil {
		t.Fatalf("open presentation intent = %+v err=%v", intent, err)
	}
}

func TestPresentationIntentForCommandPreservesEscalationDelivery(t *testing.T) {
	workspaceID := "workspace-alpha"
	conversationID := "conversation-alpha"
	paneID := "pane-alpha"
	conversationInputID := "conversation-input-alpha"
	input := MasterInput{
		ID:                             "master-input-clarify",
		Text:                           "Route this unrelated request.",
		Modality:                       MasterInputModalityText,
		Source:                         MasterInputSourceConversationEscalation,
		SubmittedAt:                    "2026-07-14T08:00:00Z",
		OriginatingWorkspaceID:         &workspaceID,
		OriginatingConversationID:      &conversationID,
		OriginatingPaneID:              &paneID,
		OriginatingConversationInputID: &conversationInputID,
	}
	intent, err := PresentationIntentForCommand(input, RouteCommand{
		Kind:    RouteDecisionKindClarify,
		Clarify: &MasterClarifyRouteCommand{Question: "Which topic should handle this?"},
	})
	if err != nil {
		t.Fatalf("PresentationIntentForCommand: %v", err)
	}
	if intent.Kind != PresentationIntentKindShowMasterReply ||
		intent.ShowMasterReply == nil ||
		intent.ShowMasterReply.ReplyKind != MasterReplyKindClarification ||
		intent.OriginatingPaneID == nil || *intent.OriginatingPaneID != paneID ||
		intent.OriginatingConversationInputID == nil ||
		*intent.OriginatingConversationInputID != conversationInputID {
		t.Fatalf("escalation presentation intent = %+v", intent)
	}
}

func TestPresentationIntentForMasterSideAllowsRendererToResolveParentPane(t *testing.T) {
	input := MasterInput{
		ID:          "master-input-side",
		Text:        "Open a short tangent.",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-14T08:00:00Z",
	}
	intent, err := PresentationIntentForCommand(input, RouteCommand{
		Kind: RouteDecisionKindCreateSideConversation,
		CreateSideConversation: &MasterCreateSideConversationRouteCommand{
			Target: ConversationPresentationTarget{
				WorkspaceID: "workspace-alpha", ConversationID: "conversation-alpha", Title: "Alpha topic",
			},
			SideConversationID: "side-alpha",
			TurnID:             "side-turn-alpha",
			Input:              "Investigate briefly.",
		},
	})
	if err != nil || intent.Kind != PresentationIntentKindOpenSideConversation ||
		intent.OpenSideConversation == nil ||
		intent.OpenSideConversation.Target.PreferredPaneID != nil {
		t.Fatalf("side presentation intent = %+v err=%v", intent, err)
	}
	request := PresentationResolutionRequest{
		IntentID: intent.ID,
		InputID:  input.ID,
		PaneID:   "pane-alpha",
	}
	if err := request.Validate(); err != nil {
		t.Fatalf("presentation resolution request: %v", err)
	}
}

func TestRouteCommandRejectsDecisionPayloadDrift(t *testing.T) {
	decision := RouteDecision{
		Kind: RouteDecisionKindSendToAgent,
		SendToAgent: &MasterSendToAgentRouteDecision{
			ConversationID: "conversation-alpha",
			AuthoredInput:  "Continue alpha.",
		},
	}
	command := RouteCommand{
		Kind: RouteDecisionKindSendToAgent,
		SendToAgent: &MasterSendToAgentRouteCommand{
			Target: ConversationPresentationTarget{
				WorkspaceID:    "workspace-alpha",
				ConversationID: "conversation-alpha",
				Title:          "Alpha topic",
			},
			TurnID:        "turn-alpha",
			AuthoredInput: "Changed input.",
		},
	}
	if err := command.ValidateDecision(decision); err == nil {
		t.Fatal("RouteCommand.ValidateDecision accepted changed authored input")
	}
}
