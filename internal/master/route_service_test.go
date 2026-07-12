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
