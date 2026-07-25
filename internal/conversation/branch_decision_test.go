package conversation

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBranchDecisionAcceptsOnlyMatchingRestrictedPayload(t *testing.T) {
	side := BranchDecision{
		Kind:                   BranchDecisionKindCreateSideConversation,
		CreateSideConversation: &CreateSideConversationBranchDecision{},
	}
	if err := side.Validate(); err != nil {
		t.Fatalf("valid side decision: %v", err)
	}
	fork := BranchDecision{
		Kind: BranchDecisionKindForkConversation,
		ForkConversation: &ForkConversationBranchDecision{
			ForkedAtTurnID: "turn-completed",
			ProposedTitle:  "Durable tangent",
		},
	}
	if err := fork.Validate(); err != nil {
		t.Fatalf("valid fork decision: %v", err)
	}

	invalid := []BranchDecision{
		{},
		{Kind: BranchDecisionKindCreateSideConversation},
		{
			Kind:                   BranchDecisionKindCreateSideConversation,
			CreateSideConversation: &CreateSideConversationBranchDecision{},
			ForkConversation:       fork.ForkConversation,
		},
		{Kind: BranchDecisionKindForkConversation},
		{
			Kind: BranchDecisionKindForkConversation,
			ForkConversation: &ForkConversationBranchDecision{
				ForkedAtTurnID: " turn-completed ",
				ProposedTitle:  "Durable tangent",
			},
		},
		{
			Kind: BranchDecisionKindForkConversation,
			ForkConversation: &ForkConversationBranchDecision{
				ForkedAtTurnID: "turn-completed",
				ProposedTitle:  " ",
			},
		},
	}
	for index, decision := range invalid {
		if err := decision.Validate(); err == nil {
			t.Fatalf("invalid decision %d passed validation: %+v", index, decision)
		}
	}
}

func TestBranchDecisionScopeKeepsExecutionAuthorityOutsideModelDecision(t *testing.T) {
	childConversationID := "conversation-child"
	side := BranchDecision{
		Kind:                   BranchDecisionKindCreateSideConversation,
		CreateSideConversation: &CreateSideConversationBranchDecision{},
	}
	if err := (BranchDecisionExecutionScope{
		ParentConversationID: "conversation-parent",
		Source:               BranchDecisionSourceConversationRouter,
	}).Validate(side); err != nil {
		t.Fatalf("valid local side scope: %v", err)
	}
	if err := (BranchDecisionExecutionScope{
		ParentConversationID: "conversation-parent",
		ChildConversationID:  &childConversationID,
		Source:               BranchDecisionSourceMaster,
	}).Validate(side); err == nil {
		t.Fatal("side decision accepted a child conversation id")
	}

	fork := BranchDecision{
		Kind: BranchDecisionKindForkConversation,
		ForkConversation: &ForkConversationBranchDecision{
			ForkedAtTurnID: "turn-completed",
			ProposedTitle:  "Durable tangent",
		},
	}
	sideConversationID := "side-conversation"
	if err := (BranchDecisionExecutionScope{
		ParentConversationID: "conversation-parent",
		SideConversationID:   &sideConversationID,
		Source:               BranchDecisionSourceConversationRouter,
	}).Validate(fork); err == nil {
		t.Fatal("fork decision accepted side-conversation scope")
	}
	if err := (BranchDecisionExecutionScope{
		ParentConversationID: "conversation-parent",
		Source:               "untrusted",
	}).Validate(fork); err == nil {
		t.Fatal("fork decision accepted an unknown authorship source")
	}
}

func TestBranchDecisionJSONContainsNoProviderOrRendererAuthority(t *testing.T) {
	decision := BranchDecision{
		Kind: BranchDecisionKindForkConversation,
		ForkConversation: &ForkConversationBranchDecision{
			ForkedAtTurnID: "turn-completed",
			ProposedTitle:  "Durable tangent",
		},
	}
	encoded, err := json.Marshal(decision)
	if err != nil {
		t.Fatalf("marshal branch decision: %v", err)
	}
	serialized := string(encoded)
	for _, forbidden := range []string{"provider", "threadId", "paneId", "command"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("branch decision leaked %q authority: %s", forbidden, serialized)
		}
	}
}
