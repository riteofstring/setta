package master

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"setta/internal/conversationindex"
)

func TestRouteContextTargetIDsPreserveRequiredTargetsBeforeGlobalState(t *testing.T) {
	focusedConversationID := "conversation-focused"
	originatingConversationID := "conversation-originating"
	input := MasterInput{
		FocusedConversationID:     &focusedConversationID,
		OriginatingConversationID: &originatingConversationID,
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

	conversationIDs, err := routeContextTargetIDs(input, candidates, contextConversationIDs)
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

func TestRouteContextTargetIDsBoundAndValidateGlobalState(t *testing.T) {
	contextConversationIDs := make([]string, MaxRouteConversationTargets)
	for index := range contextConversationIDs {
		contextConversationIDs[index] = fmt.Sprintf("conversation-context-%02d", index)
	}
	conversationIDs, err := routeContextTargetIDs(MasterInput{}, nil, contextConversationIDs)
	if err != nil || len(conversationIDs) != MaxRouteConversationTargets {
		t.Fatalf("bounded route context ids = %v err=%v", conversationIDs, err)
	}

	contextConversationIDs[1] = contextConversationIDs[0]
	_, err = routeContextTargetIDs(MasterInput{}, nil, contextConversationIDs)
	if err == nil || !strings.Contains(err.Error(), "repeats context conversation") {
		t.Fatalf("duplicate route context id error = %v", err)
	}
	if _, err := routeContextTargetIDs(MasterInput{}, nil, nil); err == nil {
		t.Fatal("nil route context conversation ids were accepted")
	}
}

func TestRouteServiceBuildsStableSideAndForkPresentationCommands(t *testing.T) {
	ordinal := 0
	service := &RouteService{newID: func(prefix string) (string, error) {
		ordinal++
		return fmt.Sprintf("%s-%d", prefix, ordinal), nil
	}}
	activeTurnID := "turn-active"
	bundle := RouteContextBundle{ConversationTargets: []RouteConversationTarget{{
		ConversationID:      "conversation-alpha",
		WorkspaceID:         "workspace-alpha",
		Title:               "Alpha topic",
		OpenPaneIDs:         []string{"pane-alpha"},
		OpenPaneCount:       1,
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
		side.CreateSideConversation.Target.PreferredPaneID == nil {
		t.Fatalf("side route command = %+v err=%v", side, err)
	}
	bundle.ConversationTargets[0].OpenPaneIDs = []string{}
	bundle.ConversationTargets[0].OpenPaneCount = 0
	ordinalBeforePaneLessSide := ordinal
	withoutPane, err := service.buildRouteCommand(sideDecision, bundle)
	ordinal = ordinalBeforePaneLessSide
	if err != nil || withoutPane.ValidateDecision(sideDecision) != nil ||
		withoutPane.CreateSideConversation == nil ||
		withoutPane.CreateSideConversation.Target.PreferredPaneID != nil {
		t.Fatalf("side route command without pane = %+v err=%v", withoutPane, err)
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
