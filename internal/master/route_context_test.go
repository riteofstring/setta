package master

import (
	"slices"
	"testing"

	"setta/internal/conversationindex"
	"setta/internal/workspacesession"
)

func TestMaterializeRouteContextIncludesPriorClarification(t *testing.T) {
	input := MasterInput{
		ID:          "master-input-clarification-reply",
		Text:        "Yeah, exactly.",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-13T18:00:05Z",
	}
	prior := validRouteClarificationRecord(t)
	work := InputRoutingWork{
		Input: AcceptedMasterInput{
			Sequence:      2,
			Input:         input,
			ReplyDelivery: ReplyDeliveryForInput(input),
			AcceptedAt:    "2026-07-13T18:00:06Z",
		},
		RoutingAttempt:     1,
		RoutingStartedAt:   "2026-07-13T18:00:07Z",
		PriorClarification: &prior,
	}
	retrieval, _, err := CandidateRequestForInput(input)
	if err != nil {
		t.Fatalf("CandidateRequestForInput: %v", err)
	}
	target := RouteConversationTarget{
		ConversationID:      "conversation-folderless",
		ResourceScope:       FolderlessRouteResourceScope(),
		Title:               "Folderless topic",
		Status:              "idle",
		CompletedForkPoints: []RouteForkPoint{},
		AllowedDecisionKinds: []RouteDecisionKind{
			RouteDecisionKindFocusConversation,
		},
	}

	materialized, err := MaterializeRouteContext(
		work,
		validTestSession(),
		workspacesession.WorkspaceSession{},
		retrieval,
		false,
		[]conversationindex.Candidate{},
		[]RouteConversationTarget{target},
		[]RouteDecisionRecord{},
	)
	if err != nil {
		t.Fatalf("MaterializeRouteContext: %v", err)
	}
	clarification := materialized.Bundle.Clarification
	if clarification == nil ||
		clarification.DecisionID != prior.ID ||
		clarification.InputID != prior.InputID ||
		clarification.Question != prior.ResultingCommand.Clarify.Question ||
		!slices.Equal(clarification.CandidateTargetIDs, []string{"conversation-folderless"}) {
		t.Fatalf("clarification context = %+v", clarification)
	}
	if materialized.Audit.Clarification == nil ||
		materialized.Audit.Clarification.DecisionID != prior.ID ||
		!slices.Equal(materialized.Audit.Clarification.CandidateTargetIDs, []string{"conversation-folderless"}) {
		t.Fatalf("clarification audit = %+v", materialized.Audit.Clarification)
	}
}

func validRouteClarificationRecord(t *testing.T) RouteDecisionRecord {
	t.Helper()
	configuration, err := NewRouteModelConfigurationAudit(validTestRoleConfiguration())
	if err != nil {
		t.Fatalf("NewRouteModelConfigurationAudit: %v", err)
	}
	record := RouteDecisionRecord{
		StreamSequence:  1,
		ID:              "master-route-decision-clarify",
		MasterSessionID: "master-session",
		InputID:         "master-input-clarification",
		RoutingAttempt:  1,
		Context: RouteContextAudit{
			InputSequence:       1,
			CandidateQuery:      "",
			RetrievedCandidates: []RouteCandidateAudit{{ConversationID: "conversation-folderless", ResourceScope: FolderlessRouteResourceScope()}},
			IncludedCandidateIDs: []string{
				"conversation-folderless",
			},
			ActiveWorkspaceIDs: []string{},
			TargetAuthorities: []RouteTargetAuthority{{
				ConversationID:       "conversation-folderless",
				ResourceScope:        FolderlessRouteResourceScope(),
				AllowedDecisionKinds: []RouteDecisionKind{RouteDecisionKindFocusConversation},
				CompletedForkTurnIDs: []string{},
			}},
		},
		ResolvedInvocation: RouteInvocationAudit{
			Configuration:     configuration,
			ProviderRequestID: "master-route-call-clarify",
			ProviderThreadID:  "provider-thread",
			ProviderTurnID:    "master-route-provider-turn-clarify",
			StartedAt:         "2026-07-13T18:00:02Z",
			EndedAt:           "2026-07-13T18:00:03Z",
		},
		Decision: RouteDecision{
			Kind:    RouteDecisionKindClarify,
			Clarify: &MasterClarifyRouteDecision{Question: "Do you mean the folderless topic?"},
		},
		ResultingCommand: RouteCommand{
			Kind: RouteDecisionKindClarify,
			Clarify: &MasterClarifyRouteCommand{
				Question:           "Do you mean the folderless topic?",
				CandidateTargetIDs: []string{"conversation-folderless"},
			},
		},
		DecidedAt: "2026-07-13T18:00:04Z",
	}
	if err := record.Validate(); err != nil {
		t.Fatalf("valid route clarification record: %v", err)
	}
	return record
}
