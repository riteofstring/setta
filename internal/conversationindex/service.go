package conversationindex

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/workspace"
)

type CandidateStore interface {
	ReconcileTopicIndex(context.Context) error
	RetrieveTopicCandidates(context.Context, CandidateRequest) ([]StoredCandidate, error)
}

type WorkspaceResolver interface {
	ResolveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	store      CandidateStore
	workspaces WorkspaceResolver
}

func NewService(store CandidateStore, workspaces WorkspaceResolver) (*Service, error) {
	if store == nil || workspaces == nil {
		return nil, errors.New("conversation index requires candidate store and workspace resolver")
	}
	if err := store.ReconcileTopicIndex(context.Background()); err != nil {
		return nil, fmt.Errorf("reconcile conversation index: %w", err)
	}
	return &Service{store: store, workspaces: workspaces}, nil
}

func (service *Service) RetrieveCandidates(
	ctx context.Context,
	request CandidateRequest,
) ([]Candidate, error) {
	if service == nil || service.store == nil || service.workspaces == nil {
		return nil, errors.New("conversation index service is unavailable")
	}
	if ctx == nil {
		return nil, errors.New("conversation index retrieval context is required")
	}
	normalized, err := NormalizeCandidateRequest(request)
	if err != nil {
		return nil, err
	}
	stored, err := service.store.RetrieveTopicCandidates(ctx, normalized)
	if err != nil {
		return nil, err
	}
	if err := ValidateStoredCandidates(stored, normalized); err != nil {
		return nil, fmt.Errorf("candidate store returned invalid conversation index state: %w", err)
	}
	return service.resolveWorkspaceNames(stored)
}

func (service *Service) resolveWorkspaceNames(stored []StoredCandidate) ([]Candidate, error) {
	workspaceNames := make(map[string]string)
	candidates := make([]Candidate, 0, len(stored))
	for _, storedCandidate := range stored {
		workspaceID := storedCandidate.Card.WorkspaceID
		workspaceName, ok := workspaceNames[workspaceID]
		if !ok {
			summary, err := service.workspaces.ResolveWorkspace(workspaceID)
			if err != nil {
				return nil, fmt.Errorf("resolve topic card workspace %s: %w", workspaceID, err)
			}
			if summary.ID != workspaceID || strings.TrimSpace(summary.DisplayName) == "" {
				return nil, fmt.Errorf("workspace resolver returned invalid topic card workspace %s", workspaceID)
			}
			workspaceName = summary.DisplayName
			workspaceNames[workspaceID] = workspaceName
		}
		candidate := Candidate{
			Card: TopicCard{
				StoredTopicCard: cloneStoredTopicCard(storedCandidate.Card),
				WorkspaceName:   workspaceName,
			},
			LexicalRank: cloneFloat(storedCandidate.LexicalRank),
		}
		candidates = append(candidates, candidate)
	}
	return candidates, nil
}

func cloneStoredTopicCard(card StoredTopicCard) StoredTopicCard {
	card.RecentUserRequests = append([]TextExcerpt{}, card.RecentUserRequests...)
	card.RecentFinalSummaries = append([]TextExcerpt{}, card.RecentFinalSummaries...)
	card.OpenPaneIDs = append([]string{}, card.OpenPaneIDs...)
	return card
}

func cloneFloat(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
