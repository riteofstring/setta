package conversationindex

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	MaxCandidateLimit                 = 20
	MaxCandidateQueryBytes            = 4096
	MaxCandidateQueryTerms            = 64
	MaxFolderResourceWorkspaceFilters = 64
	MaxWorkspaceIDBytes               = 512
	MaxRecentUserRequests             = 3
	MaxRecentFinalSummaries           = 3
	MaxTopicCardExcerptCharacters     = 512
)

type CandidateRequest struct {
	Query        string               `json:"query"`
	Scope        CandidateScopeFilter `json:"scope"`
	UpdatedSince *string              `json:"updatedSince"`
	Limit        int                  `json:"limit"`
}

type CandidateScopeFilter struct {
	IncludeFolderless          bool     `json:"includeFolderless"`
	FolderResourceWorkspaceIDs []string `json:"folderResourceWorkspaceIds"`
}

type TextExcerpt struct {
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"`
}

type ResourceScopeKind string

const (
	ResourceScopeKindFolderless ResourceScopeKind = "folderless"
	ResourceScopeKindFolder     ResourceScopeKind = "folder"
)

type FolderResourceScope struct {
	WorkspaceID string `json:"workspaceId"`
}

type ResourceScope struct {
	Kind   ResourceScopeKind    `json:"kind"`
	Folder *FolderResourceScope `json:"folder"`
}

type StoredTopicCard struct {
	ConversationID       string        `json:"conversationId"`
	ResourceScope        ResourceScope `json:"resourceScope"`
	Title                string        `json:"title"`
	TopicDescriptor      string        `json:"topicDescriptor"`
	RecentUserRequests   []TextExcerpt `json:"recentUserRequests"`
	RecentFinalSummaries []TextExcerpt `json:"recentFinalSummaries"`
	UpdatedAt            string        `json:"updatedAt"`
	ActiveStatus         string        `json:"activeStatus"`
}

type StoredCandidate struct {
	Card        StoredTopicCard `json:"card"`
	LexicalRank *float64        `json:"lexicalRank"`
}

type TopicCard struct {
	StoredTopicCard
	WorkspaceName string `json:"workspaceName"`
}

type Candidate struct {
	Card        TopicCard `json:"card"`
	LexicalRank *float64  `json:"lexicalRank"`
}

func NormalizeCandidateRequest(request CandidateRequest) (CandidateRequest, error) {
	request.Query = strings.TrimSpace(request.Query)
	if len(request.Query) > MaxCandidateQueryBytes {
		return CandidateRequest{}, fmt.Errorf("conversation index query exceeds %d bytes", MaxCandidateQueryBytes)
	}
	terms := SearchTerms(request.Query)
	if len(terms) > MaxCandidateQueryTerms {
		return CandidateRequest{}, fmt.Errorf("conversation index query exceeds %d searchable terms", MaxCandidateQueryTerms)
	}
	scope, err := normalizeCandidateScopeFilter(request.Scope)
	if err != nil {
		return CandidateRequest{}, err
	}
	request.Scope = scope
	updatedSince, err := normalizeOptionalTimestamp(request.UpdatedSince)
	if err != nil {
		return CandidateRequest{}, err
	}
	request.UpdatedSince = updatedSince
	if request.Limit <= 0 || request.Limit > MaxCandidateLimit {
		return CandidateRequest{}, fmt.Errorf(
			"conversation index candidate limit must be between 1 and %d: %d",
			MaxCandidateLimit,
			request.Limit,
		)
	}
	return request, nil
}

func FolderlessResourceScope() ResourceScope {
	return ResourceScope{Kind: ResourceScopeKindFolderless}
}

func FolderResourceScopeForWorkspaceID(workspaceID string) ResourceScope {
	return ResourceScope{
		Kind:   ResourceScopeKindFolder,
		Folder: &FolderResourceScope{WorkspaceID: workspaceID},
	}
}

func ResourceScopeForWorkspaceID(workspaceID *string) ResourceScope {
	if workspaceID == nil {
		return FolderlessResourceScope()
	}
	return FolderResourceScopeForWorkspaceID(*workspaceID)
}

func (scope ResourceScope) Validate() error {
	switch scope.Kind {
	case ResourceScopeKindFolderless:
		if scope.Folder != nil {
			return errors.New("folderless topic card resource scope cannot include folder data")
		}
		return nil
	case ResourceScopeKindFolder:
		if scope.Folder == nil {
			return errors.New("folder topic card resource scope requires folder data")
		}
		if err := validateWorkspaceID("topic card folder resource workspace id", scope.Folder.WorkspaceID); err != nil {
			return err
		}
		return nil
	default:
		return fmt.Errorf("topic card resource scope kind %q is invalid", scope.Kind)
	}
}

func (scope ResourceScope) FolderWorkspaceID() (string, bool) {
	if scope.Kind != ResourceScopeKindFolder || scope.Folder == nil {
		return "", false
	}
	return scope.Folder.WorkspaceID, true
}

func (scope ResourceScope) Equal(other ResourceScope) bool {
	if scope.Kind != other.Kind {
		return false
	}
	leftWorkspaceID, leftFolder := scope.FolderWorkspaceID()
	rightWorkspaceID, rightFolder := other.FolderWorkspaceID()
	return leftFolder == rightFolder && leftWorkspaceID == rightWorkspaceID
}

func (filter CandidateScopeFilter) Constrained() bool {
	return candidateScopeFilterConstrained(filter)
}

func SearchTerms(query string) []string {
	terms := make([]string, 0)
	seen := map[string]bool{}
	var token []rune
	flush := func() {
		if len(token) == 0 {
			return
		}
		term := strings.ToLower(string(token))
		token = token[:0]
		if seen[term] {
			return
		}
		seen[term] = true
		terms = append(terms, term)
	}
	for _, character := range query {
		if unicode.IsLetter(character) || unicode.IsNumber(character) || unicode.IsMark(character) {
			token = append(token, character)
			continue
		}
		flush()
	}
	flush()
	return terms
}

func NewTextExcerpt(text string) TextExcerpt {
	characters := []rune(text)
	if len(characters) <= MaxTopicCardExcerptCharacters {
		return TextExcerpt{Text: text}
	}
	return TextExcerpt{
		Text:      string(characters[:MaxTopicCardExcerptCharacters]),
		Truncated: true,
	}
}

func ValidateStoredCandidates(candidates []StoredCandidate, request CandidateRequest) error {
	normalized, err := NormalizeCandidateRequest(request)
	if err != nil {
		return err
	}
	if !equalCandidateRequests(normalized, request) {
		return errors.New("conversation index candidate request is not normalized")
	}
	if candidates == nil {
		return errors.New("conversation index candidates must be an array")
	}
	if len(candidates) > request.Limit {
		return fmt.Errorf("conversation index returned %d candidates for limit %d", len(candidates), request.Limit)
	}
	seen := make(map[string]bool, len(candidates))
	for index, candidate := range candidates {
		if err := candidate.Validate(request); err != nil {
			return fmt.Errorf("conversation index candidate %d: %w", index, err)
		}
		if seen[candidate.Card.ConversationID] {
			return fmt.Errorf("conversation index candidate %s is duplicated", candidate.Card.ConversationID)
		}
		seen[candidate.Card.ConversationID] = true
		if index > 0 && !storedCandidateBefore(candidates[index-1], candidate, request.Query != "") {
			return errors.New("conversation index candidates are not deterministically ordered")
		}
	}
	return nil
}

func (candidate StoredCandidate) Validate(request CandidateRequest) error {
	if err := candidate.Card.Validate(); err != nil {
		return err
	}
	if !candidateMatchesScopeFilter(candidate.Card.ResourceScope, request.Scope) {
		return fmt.Errorf("topic card %s is outside the requested resource scope filter", candidate.Card.ConversationID)
	}
	if request.UpdatedSince != nil {
		updatedAt, _ := time.Parse(time.RFC3339Nano, candidate.Card.UpdatedAt)
		updatedSince, _ := time.Parse(time.RFC3339Nano, *request.UpdatedSince)
		if updatedAt.Before(updatedSince) {
			return fmt.Errorf("topic card %s predates the requested recency filter", candidate.Card.ConversationID)
		}
	}
	if request.Query == "" {
		if candidate.LexicalRank != nil {
			return errors.New("recency-only topic card candidate cannot have a lexical rank")
		}
		return nil
	}
	if candidate.LexicalRank == nil || math.IsNaN(*candidate.LexicalRank) || math.IsInf(*candidate.LexicalRank, 0) {
		return errors.New("full-text topic card candidate requires a finite lexical rank")
	}
	return nil
}

func (card StoredTopicCard) Validate() error {
	if err := validateTopicCardIdentity(card); err != nil {
		return err
	}
	if err := card.ResourceScope.Validate(); err != nil {
		return err
	}
	if _, err := normalizeTimestamp("topic card updatedAt", card.UpdatedAt); err != nil {
		return err
	}
	if err := validateExcerpts("recent user requests", card.RecentUserRequests, MaxRecentUserRequests); err != nil {
		return err
	}
	return validateExcerpts("recent final summaries", card.RecentFinalSummaries, MaxRecentFinalSummaries)
}

func validateTopicCardIdentity(card StoredTopicCard) error {
	for label, value := range map[string]string{
		"conversation id": card.ConversationID,
		"title":           card.Title,
		"active status":   card.ActiveStatus,
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("topic card %s is required", label)
		}
	}
	return nil
}

func normalizeCandidateScopeFilter(filter CandidateScopeFilter) (CandidateScopeFilter, error) {
	workspaceIDs, err := normalizeFolderResourceWorkspaceIDs(filter.FolderResourceWorkspaceIDs)
	if err != nil {
		return CandidateScopeFilter{}, err
	}
	filter.FolderResourceWorkspaceIDs = workspaceIDs
	return filter, nil
}

func normalizeFolderResourceWorkspaceIDs(workspaceIDs []string) ([]string, error) {
	if len(workspaceIDs) > MaxFolderResourceWorkspaceFilters {
		return nil, fmt.Errorf("conversation index folder resource filters exceed %d", MaxFolderResourceWorkspaceFilters)
	}
	normalized := append([]string{}, workspaceIDs...)
	for _, workspaceID := range normalized {
		if err := validateWorkspaceID("conversation index folder resource workspace id", workspaceID); err != nil {
			return nil, err
		}
	}
	slices.Sort(normalized)
	normalized = slices.Compact(normalized)
	return normalized, nil
}

func validateWorkspaceID(label string, workspaceID string) error {
	if strings.TrimSpace(workspaceID) != workspaceID || workspaceID == "" {
		return fmt.Errorf("%s must be non-empty without surrounding whitespace", label)
	}
	if len(workspaceID) > MaxWorkspaceIDBytes {
		return fmt.Errorf("%s exceeds %d bytes", label, MaxWorkspaceIDBytes)
	}
	return nil
}

func candidateMatchesScopeFilter(scope ResourceScope, filter CandidateScopeFilter) bool {
	if !candidateScopeFilterConstrained(filter) {
		return true
	}
	switch scope.Kind {
	case ResourceScopeKindFolderless:
		return filter.IncludeFolderless
	case ResourceScopeKindFolder:
		workspaceID, ok := scope.FolderWorkspaceID()
		return ok && slices.Contains(filter.FolderResourceWorkspaceIDs, workspaceID)
	default:
		return false
	}
}

func candidateScopeFilterConstrained(filter CandidateScopeFilter) bool {
	return filter.IncludeFolderless || len(filter.FolderResourceWorkspaceIDs) > 0
}

func normalizeOptionalTimestamp(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	normalized, err := normalizeTimestamp("conversation index updatedSince", *value)
	if err != nil {
		return nil, err
	}
	return &normalized, nil
}

func normalizeTimestamp(label string, value string) (string, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return "", fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	_, offset := parsed.Zone()
	normalized := parsed.UTC().Format(time.RFC3339Nano)
	if offset != 0 || normalized != value {
		return "", fmt.Errorf("%s must be a canonical UTC RFC3339 timestamp", label)
	}
	return normalized, nil
}

func validateExcerpts(label string, excerpts []TextExcerpt, maximum int) error {
	if excerpts == nil {
		return fmt.Errorf("topic card %s must be an array", label)
	}
	if len(excerpts) > maximum {
		return fmt.Errorf("topic card %s exceed %d", label, maximum)
	}
	for index, excerpt := range excerpts {
		if !utf8.ValidString(excerpt.Text) || strings.TrimSpace(excerpt.Text) == "" {
			return fmt.Errorf("topic card %s excerpt %d must be non-empty UTF-8", label, index)
		}
		if utf8.RuneCountInString(excerpt.Text) > MaxTopicCardExcerptCharacters {
			return fmt.Errorf("topic card %s excerpt %d exceeds %d characters", label, index, MaxTopicCardExcerptCharacters)
		}
	}
	return nil
}

func storedCandidateBefore(left StoredCandidate, right StoredCandidate, ranked bool) bool {
	if ranked && *left.LexicalRank != *right.LexicalRank {
		return *left.LexicalRank < *right.LexicalRank
	}
	leftUpdatedAt, _ := time.Parse(time.RFC3339Nano, left.Card.UpdatedAt)
	rightUpdatedAt, _ := time.Parse(time.RFC3339Nano, right.Card.UpdatedAt)
	if !leftUpdatedAt.Equal(rightUpdatedAt) {
		return leftUpdatedAt.After(rightUpdatedAt)
	}
	return left.Card.ConversationID < right.Card.ConversationID
}

func equalCandidateRequests(left CandidateRequest, right CandidateRequest) bool {
	return left.Query == right.Query &&
		equalCandidateScopeFilters(left.Scope, right.Scope) &&
		equalOptionalString(left.UpdatedSince, right.UpdatedSince) &&
		left.Limit == right.Limit
}

func equalCandidateScopeFilters(left CandidateScopeFilter, right CandidateScopeFilter) bool {
	return left.IncludeFolderless == right.IncludeFolderless &&
		slices.Equal(left.FolderResourceWorkspaceIDs, right.FolderResourceWorkspaceIDs)
}

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
