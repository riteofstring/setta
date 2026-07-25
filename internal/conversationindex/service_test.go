package conversationindex

import (
	"context"
	"errors"
	"testing"

	"setta/internal/workspace"
)

func TestServiceReconcilesAndResolvesWorkspaceNamesOncePerCandidateSet(t *testing.T) {
	store := &candidateStoreStub{candidates: []StoredCandidate{
		storedCandidate("conversation-a", "2026-07-13T18:02:00Z"),
		storedCandidate("conversation-b", "2026-07-13T18:01:00Z"),
		storedFolderlessCandidate("conversation-folderless", "2026-07-13T18:00:00Z"),
	}}
	resolver := &workspaceResolverStub{summary: workspace.WorkspaceSummary{
		ID:          "workspace-a",
		DisplayName: "Setta",
	}}
	service, err := NewService(store, resolver)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	if store.reconcileCalls != 1 {
		t.Fatalf("reconcile calls = %d, want 1", store.reconcileCalls)
	}

	candidates, err := service.RetrieveCandidates(context.Background(), CandidateRequest{
		Limit: 3,
	})
	if err != nil {
		t.Fatalf("RetrieveCandidates: %v", err)
	}
	if len(candidates) != 3 || candidates[0].Card.WorkspaceName != "Setta" ||
		candidates[1].Card.WorkspaceName != "Setta" ||
		candidates[2].Card.WorkspaceName != "" {
		t.Fatalf("candidates = %+v", candidates)
	}
	if resolver.resolveCalls != 1 {
		t.Fatalf("workspace resolve calls = %d, want 1", resolver.resolveCalls)
	}
	store.candidates[0].Card.OpenPaneIDs[0] = "mutated"
	if candidates[0].Card.OpenPaneIDs[0] != "pane-a" {
		t.Fatal("service result aliases candidate store state")
	}
}

func TestServiceRejectsInvalidStoreStateAndWorkspaceResolution(t *testing.T) {
	rank := 1.0
	store := &candidateStoreStub{candidates: []StoredCandidate{storedCandidate("conversation-a", "2026-07-13T18:02:00Z")}}
	store.candidates[0].LexicalRank = &rank
	resolver := &workspaceResolverStub{summary: workspace.WorkspaceSummary{ID: "workspace-a", DisplayName: "Setta"}}
	service, err := NewService(store, resolver)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	if _, err := service.RetrieveCandidates(context.Background(), CandidateRequest{Limit: 1}); err == nil {
		t.Fatal("recency candidate with lexical rank was accepted")
	}

	store.candidates[0].LexicalRank = nil
	resolver.err = errors.New("workspace unavailable")
	if _, err := service.RetrieveCandidates(context.Background(), CandidateRequest{Limit: 1}); err == nil {
		t.Fatal("workspace resolution failure was ignored")
	}
}

type candidateStoreStub struct {
	candidates     []StoredCandidate
	reconcileCalls int
}

func (store *candidateStoreStub) ReconcileTopicIndex(context.Context) error {
	store.reconcileCalls++
	return nil
}

func (store *candidateStoreStub) RetrieveTopicCandidates(
	context.Context,
	CandidateRequest,
) ([]StoredCandidate, error) {
	return store.candidates, nil
}

type workspaceResolverStub struct {
	err          error
	resolveCalls int
	summary      workspace.WorkspaceSummary
}

func (resolver *workspaceResolverStub) ResolveWorkspace(string) (workspace.WorkspaceSummary, error) {
	resolver.resolveCalls++
	return resolver.summary, resolver.err
}

func storedCandidate(conversationID string, updatedAt string) StoredCandidate {
	return StoredCandidate{Card: StoredTopicCard{
		ConversationID:       conversationID,
		ResourceScope:        FolderResourceScopeForWorkspaceID("workspace-a"),
		Title:                "Topic " + conversationID,
		RecentUserRequests:   []TextExcerpt{},
		RecentFinalSummaries: []TextExcerpt{},
		UpdatedAt:            updatedAt,
		ActiveStatus:         "idle",
		OpenPaneIDs:          []string{"pane-a"},
		OpenPaneCount:        1,
	}}
}

func storedFolderlessCandidate(conversationID string, updatedAt string) StoredCandidate {
	return StoredCandidate{Card: StoredTopicCard{
		ConversationID:       conversationID,
		ResourceScope:        FolderlessResourceScope(),
		Title:                "Topic " + conversationID,
		RecentUserRequests:   []TextExcerpt{},
		RecentFinalSummaries: []TextExcerpt{},
		UpdatedAt:            updatedAt,
		ActiveStatus:         "idle",
		OpenPaneIDs:          []string{},
		OpenPaneCount:        0,
	}}
}
