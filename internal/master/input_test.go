package master

import (
	"strings"
	"testing"
)

func TestNormalizeInputPreservesTextAndNormalizesUTCMetadata(t *testing.T) {
	workspaceID := "workspace_alpha"
	conversationID := "conversation_alpha"
	paneID := "pane_alpha"
	input := MasterInput{
		ID:                    "input_alpha",
		Text:                  "  Keep the provider transcript exact.  ",
		Modality:              MasterInputModalityVoice,
		Source:                MasterInputSourceShell,
		SubmittedAt:           "2026-07-12T18:00:00.000Z",
		FocusedWorkspaceID:    &workspaceID,
		FocusedConversationID: &conversationID,
		FocusedPaneID:         &paneID,
	}

	normalized, err := NormalizeInput(input)
	if err != nil {
		t.Fatalf("NormalizeInput: %v", err)
	}
	if normalized.Text != input.Text {
		t.Fatalf("text = %q, want exact %q", normalized.Text, input.Text)
	}
	if normalized.SubmittedAt != "2026-07-12T18:00:00Z" {
		t.Fatalf("submittedAt = %q, want canonical UTC", normalized.SubmittedAt)
	}
	workspaceID = "mutated"
	if *normalized.FocusedWorkspaceID != "workspace_alpha" {
		t.Fatalf("normalized focus hint changed through caller pointer: %+v", normalized)
	}
}

func TestNormalizeInputRejectsInvalidContracts(t *testing.T) {
	valid := MasterInput{
		ID:          "input_valid",
		Text:        "Route this request",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}
	tests := []struct {
		name   string
		mutate func(*MasterInput)
	}{
		{name: "missing id", mutate: func(input *MasterInput) { input.ID = "" }},
		{name: "unsafe id", mutate: func(input *MasterInput) { input.ID = "input\nforged" }},
		{name: "blank text", mutate: func(input *MasterInput) { input.Text = " \n " }},
		{name: "oversized text", mutate: func(input *MasterInput) { input.Text = strings.Repeat("x", MaxInputTextBytes+1) }},
		{name: "unknown modality", mutate: func(input *MasterInput) { input.Modality = "audio" }},
		{name: "unknown source", mutate: func(input *MasterInput) { input.Source = "sidebar" }},
		{name: "non UTC timestamp", mutate: func(input *MasterInput) { input.SubmittedAt = "2026-07-12T11:00:00-07:00" }},
		{name: "invalid timestamp", mutate: func(input *MasterInput) { input.SubmittedAt = "today" }},
		{name: "empty focus hint", mutate: func(input *MasterInput) { empty := ""; input.FocusedPaneID = &empty }},
		{name: "spaced focus hint", mutate: func(input *MasterInput) { spaced := " pane "; input.FocusedPaneID = &spaced }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := valid
			test.mutate(&input)
			if _, err := NormalizeInput(input); err == nil {
				t.Fatal("NormalizeInput succeeded, want validation error")
			}
		})
	}
}

func TestAcceptedInputRequiresNormalizedDurableRecord(t *testing.T) {
	accepted := AcceptedMasterInput{
		Sequence: 1,
		Input: MasterInput{
			ID:          "input_valid",
			Text:        "Route this request",
			Modality:    MasterInputModalityVoice,
			Source:      MasterInputSourceShell,
			SubmittedAt: "2026-07-12T18:00:00Z",
		},
		ReplyDelivery: MasterReplyDelivery{},
		AcceptedAt:    "2026-07-12T18:00:01Z",
	}
	if err := accepted.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	accepted.Input.SubmittedAt = "2026-07-12T18:00:00.000Z"
	if err := accepted.Validate(); err == nil {
		t.Fatal("Validate accepted non-normalized submittedAt")
	}
}

func TestMasterInputSourceLinkageDerivesReplyDelivery(t *testing.T) {
	workspaceID := "workspace_alpha"
	conversationID := "conversation_alpha"
	paneID := "pane_alpha"
	conversationInputID := "conversation_input_alpha"
	escalation := MasterInput{
		ID:                             "master_input_escalation",
		Text:                           "Route this unrelated topic.",
		Modality:                       MasterInputModalityText,
		Source:                         MasterInputSourceConversationEscalation,
		SubmittedAt:                    "2026-07-12T18:00:00Z",
		OriginatingWorkspaceID:         &workspaceID,
		OriginatingConversationID:      &conversationID,
		OriginatingPaneID:              &paneID,
		OriginatingConversationInputID: &conversationInputID,
	}
	if _, err := NormalizeInput(escalation); err != nil {
		t.Fatalf("NormalizeInput escalation: %v", err)
	}
	delivery := ReplyDeliveryForInput(escalation)
	if delivery.OriginatingConversationID == nil ||
		*delivery.OriginatingConversationID != conversationID ||
		delivery.OriginatingPaneID == nil ||
		*delivery.OriginatingPaneID != paneID ||
		delivery.OriginatingConversationInputID == nil ||
		*delivery.OriginatingConversationInputID != conversationInputID {
		t.Fatalf("reply delivery = %+v", delivery)
	}

	shellWithOrigin := escalation
	shellWithOrigin.Source = MasterInputSourceShell
	if _, err := NormalizeInput(shellWithOrigin); err == nil {
		t.Fatal("NormalizeInput accepted shell input with escalation linkage")
	}
	incomplete := escalation
	incomplete.OriginatingConversationInputID = nil
	if _, err := NormalizeInput(incomplete); err == nil {
		t.Fatal("NormalizeInput accepted incomplete conversation escalation")
	}
}
