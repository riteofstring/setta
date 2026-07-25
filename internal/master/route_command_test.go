package master

import (
	"testing"
)

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
				ConversationID:   "conversation-alpha",
				ResourceScope:    FolderRouteResourceScope("workspace-alpha", ""),
				ResourceBindings: testPresentationResourceBindings(),
				Title:            "Alpha topic",
			},
			TurnID:        "turn-alpha",
			AuthoredInput: "Changed input.",
		},
	}
	if err := command.ValidateDecision(decision); err == nil {
		t.Fatal("RouteCommand.ValidateDecision accepted changed authored input")
	}
}

func testPresentationResourceBindings() []PresentationResourceBinding {
	return []PresentationResourceBinding{{
		Folder: &PresentationFolderResourceBinding{RootPath: "/tmp/setta-master-route-test"},
		Kind:   PresentationResourceBindingKindFolder,
	}}
}
