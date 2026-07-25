package conversationindex

import (
	"fmt"
	"strings"
	"testing"
)

func TestNormalizeCandidateRequestBoundsAndCanonicalizesFilters(t *testing.T) {
	updatedSince := "2026-07-13T18:00:00Z"
	normalized, err := NormalizeCandidateRequest(CandidateRequest{
		Query: "  auth status  ",
		Scope: CandidateScopeFilter{
			FolderResourceWorkspaceIDs: []string{"workspace-z", "workspace-a", "workspace-z"},
		},
		UpdatedSince: &updatedSince,
		Limit:        MaxCandidateLimit,
	})
	if err != nil {
		t.Fatalf("NormalizeCandidateRequest: %v", err)
	}
	if normalized.Query != "auth status" ||
		len(normalized.Scope.FolderResourceWorkspaceIDs) != 2 ||
		normalized.Scope.FolderResourceWorkspaceIDs[0] != "workspace-a" ||
		normalized.Scope.FolderResourceWorkspaceIDs[1] != "workspace-z" {
		t.Fatalf("normalized request = %+v", normalized)
	}

	invalid := []CandidateRequest{
		{Query: strings.Repeat("x", MaxCandidateQueryBytes+1), Limit: 1},
		{Query: distinctTerms(MaxCandidateQueryTerms + 1), Limit: 1},
		{Scope: CandidateScopeFilter{FolderResourceWorkspaceIDs: []string{" workspace"}}, Limit: 1},
		{UpdatedSince: stringPointer("2026-07-13T11:00:00-07:00"), Limit: 1},
		{Limit: 0},
		{Limit: MaxCandidateLimit + 1},
	}
	for index, request := range invalid {
		if _, err := NormalizeCandidateRequest(request); err == nil {
			t.Errorf("invalid request %d was accepted: %+v", index, request)
		}
	}
}

func TestStoredTopicCardAllowsFolderlessResourceScope(t *testing.T) {
	candidate := StoredCandidate{Card: StoredTopicCard{
		ConversationID:       "conversation-folderless",
		ResourceScope:        FolderlessResourceScope(),
		Title:                "Folderless topic",
		RecentUserRequests:   []TextExcerpt{},
		RecentFinalSummaries: []TextExcerpt{},
		UpdatedAt:            "2026-07-13T18:00:00Z",
		ActiveStatus:         "idle",
	}}
	if err := candidate.Validate(CandidateRequest{
		Scope: CandidateScopeFilter{IncludeFolderless: true},
		Limit: 1,
	}); err != nil {
		t.Fatalf("folderless candidate validation: %v", err)
	}
	if err := candidate.Validate(CandidateRequest{
		Scope: CandidateScopeFilter{FolderResourceWorkspaceIDs: []string{"workspace-a"}},
		Limit: 1,
	}); err == nil {
		t.Fatal("folderless candidate matched a folder-only scope filter")
	}
}

func TestSearchTermsAreDeterministicLexicalTokens(t *testing.T) {
	terms := SearchTerms(`C++ auth/AUTH café_42 "quoted"`)
	want := []string{"c", "auth", "café", "42", "quoted"}
	if len(terms) != len(want) {
		t.Fatalf("SearchTerms = %#v, want %#v", terms, want)
	}
	for index := range want {
		if terms[index] != want[index] {
			t.Fatalf("SearchTerms = %#v, want %#v", terms, want)
		}
	}
}

func TestTextExcerptReportsBoundedTruncation(t *testing.T) {
	full := strings.Repeat("界", MaxTopicCardExcerptCharacters+1)
	excerpt := NewTextExcerpt(full)
	if !excerpt.Truncated || len([]rune(excerpt.Text)) != MaxTopicCardExcerptCharacters {
		t.Fatalf("excerpt = %+v", excerpt)
	}
	plain := NewTextExcerpt("short")
	if plain.Truncated || plain.Text != "short" {
		t.Fatalf("plain excerpt = %+v", plain)
	}
}

func stringPointer(value string) *string {
	return &value
}

func distinctTerms(count int) string {
	terms := make([]string, count)
	for index := range count {
		terms[index] = fmt.Sprintf("term%d", index)
	}
	return strings.Join(terms, " ")
}
