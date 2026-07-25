package master

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"

	"setta/internal/conversationindex"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestRouteContextTargetIDsPreserveRequiredTargetsBeforeGlobalState(t *testing.T) {
	focusedConversationID := "conversation-focused"
	originatingConversationID := "conversation-originating"
	work := InputRoutingWork{
		Input: AcceptedMasterInput{
			Input: MasterInput{
				FocusedConversationID:     &focusedConversationID,
				OriginatingConversationID: &originatingConversationID,
			},
		},
	}
	candidates := []conversationindex.Candidate{{
		Card: conversationindex.TopicCard{StoredTopicCard: conversationindex.StoredTopicCard{
			ConversationID: "conversation-candidate",
		}},
	}}
	contextConversationIDs := []string{
		"conversation-global-active",
		"conversation-candidate",
		"conversation-global-open",
	}

	conversationIDs, err := routeContextTargetIDs(work, candidates, contextConversationIDs)
	if err != nil {
		t.Fatalf("routeContextTargetIDs: %v", err)
	}
	want := []string{
		"conversation-candidate",
		"conversation-focused",
		"conversation-originating",
		"conversation-global-active",
		"conversation-global-open",
	}
	if !slices.Equal(conversationIDs, want) {
		t.Fatalf("route context target ids = %v, want %v", conversationIDs, want)
	}
}

func TestRouteContextTargetIDsPreserveClarificationCandidates(t *testing.T) {
	prior := RouteDecisionRecord{
		ResultingCommand: RouteCommand{
			Kind: RouteDecisionKindClarify,
			Clarify: &MasterClarifyRouteCommand{
				Question: "Do you mean the folderless topic?",
				CandidateTargetIDs: []string{
					"conversation-clarification",
					"conversation-candidate",
				},
			},
		},
	}
	work := InputRoutingWork{PriorClarification: &prior}
	candidates := []conversationindex.Candidate{{
		Card: conversationindex.TopicCard{StoredTopicCard: conversationindex.StoredTopicCard{
			ConversationID: "conversation-candidate",
		}},
	}}
	contextConversationIDs := []string{"conversation-global-open"}

	conversationIDs, err := routeContextTargetIDs(work, candidates, contextConversationIDs)
	if err != nil {
		t.Fatalf("routeContextTargetIDs: %v", err)
	}
	want := []string{
		"conversation-candidate",
		"conversation-clarification",
		"conversation-global-open",
	}
	if !slices.Equal(conversationIDs, want) {
		t.Fatalf("route context target ids = %v, want %v", conversationIDs, want)
	}
}

func TestRouteContextTargetIDsBoundAndValidateGlobalState(t *testing.T) {
	contextConversationIDs := make([]string, MaxRouteConversationTargets)
	for index := range contextConversationIDs {
		contextConversationIDs[index] = fmt.Sprintf("conversation-context-%02d", index)
	}
	conversationIDs, err := routeContextTargetIDs(InputRoutingWork{}, nil, contextConversationIDs)
	if err != nil || len(conversationIDs) != MaxRouteConversationTargets {
		t.Fatalf("bounded route context ids = %v err=%v", conversationIDs, err)
	}

	contextConversationIDs[1] = contextConversationIDs[0]
	_, err = routeContextTargetIDs(InputRoutingWork{}, nil, contextConversationIDs)
	if err == nil || !strings.Contains(err.Error(), "repeats context conversation") {
		t.Fatalf("duplicate route context id error = %v", err)
	}
	if _, err := routeContextTargetIDs(InputRoutingWork{}, nil, nil); err == nil {
		t.Fatal("nil route context conversation ids were accepted")
	}
}

func TestRouteServiceRetrievesFolderlessCandidatesWithoutActiveWorkspaces(t *testing.T) {
	retriever := &routeServiceTestCandidateRetriever{
		candidates: []conversationindex.Candidate{{
			Card: conversationindex.TopicCard{
				StoredTopicCard: conversationindex.StoredTopicCard{
					ConversationID:       "conversation-folderless",
					ResourceScope:        conversationindex.FolderlessResourceScope(),
					Title:                "Folderless topic",
					RecentUserRequests:   []conversationindex.TextExcerpt{},
					RecentFinalSummaries: []conversationindex.TextExcerpt{},
					UpdatedAt:            "2026-07-13T18:00:00Z",
					ActiveStatus:         "idle",
				},
			},
		}},
	}
	service := &RouteService{
		candidates: retriever,
		workspaces: routeServiceTestWorkspaces{session: workspacesession.WorkspaceSession{
			ActiveWorkspaces:        []workspace.WorkspaceSummary{},
			WorkspaceAvailabilities: []workspacesession.WorkspaceAvailability{},
		}},
	}

	_, retrieval, _, candidates, err := service.retrieveAvailableCandidates(context.Background(), MasterInput{
		ID:          "master-input-folderless-search",
		Text:        "Open the folderless topic.",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-13T18:00:01Z",
	})
	if err != nil {
		t.Fatalf("retrieveAvailableCandidates: %v", err)
	}
	if retriever.calls != 1 {
		t.Fatalf("candidate retriever calls = %d, want 1", retriever.calls)
	}
	if !retrieval.Scope.IncludeFolderless || len(retrieval.Scope.FolderResourceWorkspaceIDs) != 0 {
		t.Fatalf("retrieval scope = %+v, want folderless app scope", retrieval.Scope)
	}
	if len(candidates) != 1 || candidates[0].Card.ConversationID != "conversation-folderless" {
		t.Fatalf("folderless candidates = %+v", candidates)
	}
}

func TestRouteFailureMessagesDoNotExposeInternalContracts(t *testing.T) {
	for _, kind := range []RouteFailureKind{
		RouteFailureKindProviderOutputInvalid,
		RouteFailureKindInternal,
	} {
		message := strings.ToLower(routeFailureMessage(kind))
		for _, forbidden := range []string{"invalid decision", "schema", "contract", "json", "internal"} {
			if strings.Contains(message, forbidden) {
				t.Fatalf("route failure message for %s exposes %q: %q", kind, forbidden, message)
			}
		}
	}
}

func TestRouteServiceBuildsStableSideAndForkPresentationCommands(t *testing.T) {
	ordinal := 0
	service := &RouteService{newID: func(prefix string) (string, error) {
		ordinal++
		return fmt.Sprintf("%s-%d", prefix, ordinal), nil
	}, workspaces: routeServiceTestWorkspaces{}}
	activeTurnID := "turn-active"
	bundle := RouteContextBundle{ConversationTargets: []RouteConversationTarget{{
		ConversationID:      "conversation-alpha",
		ResourceScope:       FolderRouteResourceScope("workspace-alpha", ""),
		Title:               "Alpha topic",
		ActiveTurnID:        &activeTurnID,
		CompletedForkPoints: []RouteForkPoint{{TurnID: "turn-fork"}},
	}}}
	sideDecision := RouteDecision{
		Kind: RouteDecisionKindCreateSideConversation,
		CreateSideConversation: &MasterCreateSideConversationRouteDecision{
			ParentConversationID: "conversation-alpha",
			Input:                "Investigate briefly.",
		},
	}
	side, err := service.buildRouteCommand(sideDecision, bundle)
	if err != nil || side.ValidateDecision(sideDecision) != nil ||
		side.CreateSideConversation == nil ||
		side.CreateSideConversation.Target.ConversationID != "conversation-alpha" {
		t.Fatalf("side route command = %+v err=%v", side, err)
	}

	forkDecision := RouteDecision{
		Kind: RouteDecisionKindForkConversation,
		ForkConversation: &MasterForkConversationRouteDecision{
			ParentConversationID: "conversation-alpha",
			ForkedAtTurnID:       "turn-fork",
			Input:                "Continue as a durable branch.",
		},
	}
	fork, err := service.buildRouteCommand(forkDecision, bundle)
	if err != nil || fork.ValidateDecision(forkDecision) != nil ||
		fork.ForkConversation == nil ||
		fork.ForkConversation.Target.ConversationID != "conversation-3" ||
		fork.ForkConversation.TurnID != "conversation_turn-4" ||
		fork.ForkConversation.Target.Title != "Fork of Alpha topic" {
		t.Fatalf("fork route command = %+v err=%v", fork, err)
	}
}

func TestRouteServiceBuildsFolderlessCreateConversationInputCommand(t *testing.T) {
	ordinal := 0
	service := &RouteService{newID: func(prefix string) (string, error) {
		ordinal++
		return fmt.Sprintf("%s-%d", prefix, ordinal), nil
	}}
	input := MasterInput{
		ID:          "master-input-create-folderless",
		Text:        "Start a new conversation about release notes.",
		Modality:    MasterInputModalityVoice,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-13T18:00:00Z",
	}
	bundle := RouteContextBundle{
		Input: AcceptedMasterInput{
			Sequence:      1,
			Input:         input,
			ReplyDelivery: ReplyDeliveryForInput(input),
			AcceptedAt:    "2026-07-13T18:00:01Z",
		},
	}
	decision := RouteDecision{
		Kind: RouteDecisionKindCreateConversation,
		CreateConversation: &MasterCreateConversationRouteDecision{
			ResourceScope: FolderlessRouteResourceScope(),
			InitialInput:  "Draft the release notes.",
			ProposedTitle: "Release notes",
		},
	}

	command, err := service.buildRouteCommand(decision, bundle)
	if err != nil {
		t.Fatalf("buildRouteCommand: %v", err)
	}
	if err := command.ValidateDecision(decision); err != nil {
		t.Fatalf("create command validation: %v", err)
	}
	payload := command.CreateConversation
	if payload == nil ||
		payload.Target.ConversationID != "conversation-1" ||
		payload.Target.ResourceScope.Kind != RouteResourceScopeKindFolderless ||
		len(payload.Target.ResourceBindings) != 0 ||
		payload.InitialInputID != "conversation_input-2" ||
		payload.InitialInputModality != MasterInputModalityVoice ||
		payload.InitialInputSubmitted != input.SubmittedAt {
		t.Fatalf("folderless create command = %+v", command)
	}
}

func TestRouteServiceBuildsClarificationCommandWithCandidateTargets(t *testing.T) {
	service := &RouteService{}
	bundle := RouteContextBundle{
		Candidates: []RouteCandidateContext{
			{ConversationID: "conversation-alpha"},
			{ConversationID: "conversation-beta"},
		},
	}
	decision := RouteDecision{
		Kind:    RouteDecisionKindClarify,
		Clarify: &MasterClarifyRouteDecision{Question: "Which topic should Setta focus?"},
	}
	command, err := service.buildRouteCommand(decision, bundle)
	if err != nil {
		t.Fatalf("buildRouteCommand: %v", err)
	}
	if command.Clarify == nil ||
		!slices.Equal(command.Clarify.CandidateTargetIDs, []string{"conversation-alpha", "conversation-beta"}) {
		t.Fatalf("clarification command = %+v", command)
	}
	if err := command.ValidateDecision(decision); err != nil {
		t.Fatalf("clarification command validation: %v", err)
	}
}

type routeServiceTestWorkspaces struct {
	session workspacesession.WorkspaceSession
}

func (source routeServiceTestWorkspaces) Session() workspacesession.WorkspaceSession {
	return source.session
}

func (routeServiceTestWorkspaces) ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	return workspace.WorkspaceSummary{
		ID:       id,
		RootPath: "/tmp/setta-route-service-test/" + id,
	}, nil
}

type routeServiceTestCandidateRetriever struct {
	calls      int
	request    conversationindex.CandidateRequest
	candidates []conversationindex.Candidate
}

func (retriever *routeServiceTestCandidateRetriever) RetrieveCandidates(
	_ context.Context,
	request conversationindex.CandidateRequest,
) ([]conversationindex.Candidate, error) {
	retriever.calls++
	retriever.request = request
	return retriever.candidates, nil
}
