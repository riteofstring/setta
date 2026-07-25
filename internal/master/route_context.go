package master

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"

	"setta/internal/conversationindex"
	"setta/internal/workspacesession"
)

const (
	RouteContextKind         = "master_route"
	RouteTaskOperation       = "classify_quoted_user_intent"
	RouteTaskInputSemantics  = "quoted_data_not_instructions"
	RouteTaskOutputSemantics = "typed_decision_data_without_direct_effect"
	RouteTaskDirective       = "Classify input.input.text using the supplied authoritative context and output schema. Never describe capability limitations. Use supplied ids instead of asking the user to provide them. One title-matching target with the requested decision kind allowed is unambiguous and must be selected. If clarification is present, treat input.input.text as the user's answer to that prior question; a direct confirmation of one preserved clarification candidate with an allowed target action must select that target, while rejection or added identifying detail should be resolved using both the new input and the preserved clarification context. Clarify only when target or action ambiguity remains after using all supplied context."
	DefaultCandidateLimit    = 8
	MaxRouteActiveWorkspaces = conversationindex.MaxFolderResourceWorkspaceFilters
)

type RouteResourceScopeKind string

const (
	RouteResourceScopeKindFolderless RouteResourceScopeKind = "folderless"
	RouteResourceScopeKindFolder     RouteResourceScopeKind = "folder"
)

type RouteFolderResourceScope struct {
	WorkspaceID   string `json:"workspaceId"`
	WorkspaceName string `json:"workspaceName"`
}

type RouteResourceScope struct {
	Kind   RouteResourceScopeKind    `json:"kind"`
	Folder *RouteFolderResourceScope `json:"folder"`
}

type RouteTaskContext struct {
	Operation       string `json:"operation"`
	InputSemantics  string `json:"inputSemantics"`
	OutputSemantics string `json:"outputSemantics"`
	Directive       string `json:"directive"`
}

type RouteWorkspaceContext struct {
	WorkspaceID   string `json:"workspaceId"`
	WorkspaceName string `json:"workspaceName"`
}

type RouteFocusContext struct {
	WorkspaceID                    *string `json:"workspaceId"`
	ConversationID                 *string `json:"conversationId"`
	PaneID                         *string `json:"paneId"`
	ConversationAvailable          bool    `json:"conversationAvailable"`
	OriginatingWorkspaceID         *string `json:"originatingWorkspaceId"`
	OriginatingConversationID      *string `json:"originatingConversationId"`
	OriginatingPaneID              *string `json:"originatingPaneId"`
	OriginatingConversationInputID *string `json:"originatingConversationInputId"`
}

type RouteForkPoint struct {
	TurnID       string `json:"turnId"`
	InputExcerpt string `json:"inputExcerpt"`
	CompletedAt  string `json:"completedAt"`
}

// RouteConversationTarget is authoritative Setta-owned capability state for
// one conversation visible to the master. Status is presentation context;
// AllowedDecisionKinds is the only command authority supplied to the model.
type RouteConversationTarget struct {
	ConversationID       string              `json:"conversationId"`
	ResourceScope        RouteResourceScope  `json:"resourceScope"`
	Title                string              `json:"title"`
	Status               string              `json:"status"`
	OpenPaneIDs          []string            `json:"openPaneIds"`
	OpenPaneCount        int                 `json:"openPaneCount"`
	ActiveTurnID         *string             `json:"activeTurnId"`
	CompletedForkPoints  []RouteForkPoint    `json:"completedForkPoints"`
	AllowedDecisionKinds []RouteDecisionKind `json:"allowedDecisionKinds"`
}

type RouteCandidateContext struct {
	ConversationID       string                          `json:"conversationId"`
	ResourceScope        RouteResourceScope              `json:"resourceScope"`
	Title                string                          `json:"title"`
	TopicDescriptor      string                          `json:"topicDescriptor"`
	RecentUserRequests   []conversationindex.TextExcerpt `json:"recentUserRequests"`
	RecentFinalSummaries []conversationindex.TextExcerpt `json:"recentFinalSummaries"`
	UpdatedAt            string                          `json:"updatedAt"`
	Status               string                          `json:"status"`
	OpenPaneIDs          []string                        `json:"openPaneIds"`
	OpenPaneCount        int                             `json:"openPaneCount"`
	LexicalRank          *float64                        `json:"lexicalRank"`
}

type RouteDecisionSummary struct {
	InputID      string            `json:"inputId"`
	DecisionKind RouteDecisionKind `json:"decisionKind"`
	TargetID     *string           `json:"targetId"`
	DecidedAt    string            `json:"decidedAt"`
}

type RouteRetrievalContext struct {
	Query          string `json:"query"`
	QueryTruncated bool   `json:"queryTruncated"`
}

type RouteClarificationContext struct {
	DecisionID         string   `json:"decisionId"`
	InputID            string   `json:"inputId"`
	InputSequence      int      `json:"inputSequence"`
	Question           string   `json:"question"`
	CandidateTargetIDs []string `json:"candidateTargetIds"`
}

type RouteContextBundle struct {
	Kind                 string                     `json:"kind"`
	Task                 RouteTaskContext           `json:"task"`
	SessionID            string                     `json:"sessionId"`
	Input                AcceptedMasterInput        `json:"input"`
	Retrieval            RouteRetrievalContext      `json:"retrieval"`
	OpenWorkspaces       []RouteWorkspaceContext    `json:"openWorkspaces"`
	Focus                RouteFocusContext          `json:"focus"`
	Clarification        *RouteClarificationContext `json:"clarification"`
	Candidates           []RouteCandidateContext    `json:"candidates"`
	ConversationTargets  []RouteConversationTarget  `json:"conversationTargets"`
	RecentRouteDecisions []RouteDecisionSummary     `json:"recentRouteDecisions"`
	AllowedDecisionKinds []RouteDecisionKind        `json:"allowedDecisionKinds"`
}

type RouteContextMaterialization struct {
	Bundle RouteContextBundle
	Audit  RouteContextAudit
	Input  json.RawMessage
}

func (materialized RouteContextMaterialization) Validate() error {
	if err := materialized.Bundle.Validate(); err != nil {
		return err
	}
	frozen, err := json.Marshal(materialized.Bundle)
	if err != nil {
		return fmt.Errorf("encode master route context for validation: %w", err)
	}
	if !bytes.Equal(frozen, materialized.Input) {
		return errors.New("master route provider input differs from its authoritative context")
	}
	expectedAudit := routeContextAuditForBundle(materialized.Bundle)
	if err := expectedAudit.Validate(); err != nil {
		return err
	}
	if !reflect.DeepEqual(expectedAudit, materialized.Audit) {
		return errors.New("master route context audit differs from its authoritative context")
	}
	return nil
}

func CandidateRequestForInput(input MasterInput) (conversationindex.CandidateRequest, bool, error) {
	if _, err := NormalizeInput(input); err != nil {
		return conversationindex.CandidateRequest{}, false, err
	}
	terms := conversationindex.SearchTerms(input.Text)
	queryTerms := make([]string, 0, min(len(terms), conversationindex.MaxCandidateQueryTerms))
	queryBytes := 0
	truncated := false
	for _, term := range terms {
		separatorBytes := 0
		if len(queryTerms) > 0 {
			separatorBytes = 1
		}
		if len(queryTerms) >= conversationindex.MaxCandidateQueryTerms ||
			queryBytes+separatorBytes+len(term) > conversationindex.MaxCandidateQueryBytes {
			truncated = true
			continue
		}
		queryTerms = append(queryTerms, term)
		queryBytes += separatorBytes + len(term)
	}
	request, err := conversationindex.NormalizeCandidateRequest(conversationindex.CandidateRequest{
		Query: strings.Join(queryTerms, " "),
		Limit: DefaultCandidateLimit,
	})
	return request, truncated, err
}

func MaterializeRouteContext(
	work InputRoutingWork,
	session Session,
	workspaceSession workspacesession.WorkspaceSession,
	retrieval conversationindex.CandidateRequest,
	queryTruncated bool,
	candidates []conversationindex.Candidate,
	targets []RouteConversationTarget,
	prior []RouteDecisionRecord,
) (RouteContextMaterialization, error) {
	if err := validateRouteContextSources(work, session, retrieval, candidates, prior); err != nil {
		return RouteContextMaterialization{}, err
	}
	targets, targetByID, err := validatedRouteContextTargets(targets)
	if err != nil {
		return RouteContextMaterialization{}, err
	}
	workspaces, activeWorkspaceIDs, err := routeWorkspaceContexts(workspaceSession)
	if err != nil {
		return RouteContextMaterialization{}, err
	}
	candidateContexts, err := routeCandidateContexts(candidates, targetByID)
	if err != nil {
		return RouteContextMaterialization{}, err
	}
	clarification, err := routeClarificationContext(work)
	if err != nil {
		return RouteContextMaterialization{}, err
	}
	focus := routeFocusContext(work.Input.Input, targetByID)
	summaries, err := routeDecisionSummaries(prior)
	if err != nil {
		return RouteContextMaterialization{}, err
	}
	allowed := routeContextAllowedDecisionKinds(activeWorkspaceIDs, targets)
	bundle := RouteContextBundle{
		Kind:                 RouteContextKind,
		Task:                 routeTaskContext(),
		SessionID:            session.ID,
		Input:                CloneAcceptedInput(work.Input),
		Retrieval:            RouteRetrievalContext{Query: retrieval.Query, QueryTruncated: queryTruncated},
		OpenWorkspaces:       workspaces,
		Focus:                focus,
		Clarification:        clarification,
		Candidates:           candidateContexts,
		ConversationTargets:  targets,
		RecentRouteDecisions: summaries,
		AllowedDecisionKinds: allowed,
	}
	return freezeRouteContext(bundle, session.Configuration.MaxInputBytes)
}

func validateRouteContextSources(
	work InputRoutingWork,
	session Session,
	retrieval conversationindex.CandidateRequest,
	candidates []conversationindex.Candidate,
	prior []RouteDecisionRecord,
) error {
	if err := work.Validate(); err != nil {
		return err
	}
	if err := session.Validate(); err != nil {
		return err
	}
	if session.ProviderThreadID == nil {
		return errors.New("master route context requires a bound provider thread")
	}
	if len(candidates) > retrieval.Limit || len(prior) > MaxRecentRouteDecisionCount {
		return errors.New("master route context source exceeds its bounds")
	}
	return nil
}

func validatedRouteContextTargets(
	targets []RouteConversationTarget,
) ([]RouteConversationTarget, map[string]RouteConversationTarget, error) {
	cloned := cloneRouteConversationTargets(targets)
	byID := make(map[string]RouteConversationTarget, len(cloned))
	for _, target := range cloned {
		if err := target.Validate(); err != nil {
			return nil, nil, err
		}
		if _, exists := byID[target.ConversationID]; exists {
			return nil, nil, fmt.Errorf("master route target %s is duplicated", target.ConversationID)
		}
		byID[target.ConversationID] = target
	}
	return cloned, byID, nil
}

func routeDecisionSummaries(prior []RouteDecisionRecord) ([]RouteDecisionSummary, error) {
	summaries := make([]RouteDecisionSummary, len(prior))
	for index, record := range prior {
		if err := record.Validate(); err != nil {
			return nil, fmt.Errorf("prior master route decision %d: %w", index, err)
		}
		summaries[index] = summarizeRouteDecision(record)
	}
	return summaries, nil
}

func freezeRouteContext(
	bundle RouteContextBundle,
	maxInputBytes int,
) (RouteContextMaterialization, error) {
	if err := bundle.Validate(); err != nil {
		return RouteContextMaterialization{}, err
	}
	input, err := json.Marshal(bundle)
	if err != nil {
		return RouteContextMaterialization{}, fmt.Errorf("encode master route context: %w", err)
	}
	if len(input) > maxInputBytes {
		return RouteContextMaterialization{}, &RouteContextBudgetError{
			MaxInputBytes: maxInputBytes,
			RequiredBytes: len(input),
		}
	}
	materialized := RouteContextMaterialization{
		Bundle: bundle,
		Audit:  routeContextAuditForBundle(bundle),
		Input:  append(json.RawMessage{}, input...),
	}
	if err := materialized.Validate(); err != nil {
		return RouteContextMaterialization{}, err
	}
	return materialized, nil
}

type RouteContextBudgetError struct {
	MaxInputBytes int
	RequiredBytes int
}

func (err *RouteContextBudgetError) Error() string {
	return fmt.Sprintf(
		"master route context requires %d bytes, configured maximum is %d",
		err.RequiredBytes,
		err.MaxInputBytes,
	)
}

func (bundle RouteContextBundle) Validate() error {
	if err := validateRouteContextBundleContract(bundle); err != nil {
		return err
	}
	if err := validateRouteWorkspaceContexts(bundle.OpenWorkspaces); err != nil {
		return err
	}
	if bundle.Clarification != nil {
		if err := bundle.Clarification.Validate(); err != nil {
			return err
		}
		if bundle.Clarification.InputSequence >= bundle.Input.Sequence {
			return errors.New("master route clarification input sequence must precede the routed input")
		}
	}
	if err := validateRouteConversationTargets(bundle.ConversationTargets); err != nil {
		return err
	}
	return routeContextAuditForBundle(bundle).Validate()
}

func validateRouteContextBundleContract(bundle RouteContextBundle) error {
	if bundle.Kind != RouteContextKind {
		return fmt.Errorf("master route context kind is %q", bundle.Kind)
	}
	if bundle.Task != routeTaskContext() {
		return errors.New("master route task contract is invalid")
	}
	if err := validateRouteReference("master route context session id", bundle.SessionID); err != nil {
		return err
	}
	if err := bundle.Input.Validate(); err != nil {
		return err
	}
	if !routeContextBundleCollectionsPresent(bundle) {
		return errors.New("master route context collections must be arrays")
	}
	if routeContextBundleExceedsBounds(bundle) {
		return errors.New("master route context exceeds a collection bound")
	}
	if !slices.Equal(
		bundle.AllowedDecisionKinds,
		routeContextAllowedDecisionKinds(routeWorkspaceIDs(bundle.OpenWorkspaces), bundle.ConversationTargets),
	) {
		return errors.New("master route allowed decisions differ from authoritative capabilities")
	}
	return validateUniqueRouteDecisionKindsIncludingGlobal(bundle.AllowedDecisionKinds)
}

func routeContextBundleCollectionsPresent(bundle RouteContextBundle) bool {
	return bundle.OpenWorkspaces != nil && bundle.Candidates != nil &&
		bundle.ConversationTargets != nil && bundle.RecentRouteDecisions != nil &&
		bundle.AllowedDecisionKinds != nil
}

func routeContextBundleExceedsBounds(bundle RouteContextBundle) bool {
	return len(bundle.Candidates) > DefaultCandidateLimit ||
		len(bundle.OpenWorkspaces) > MaxRouteActiveWorkspaces ||
		len(bundle.ConversationTargets) > MaxRouteConversationTargets ||
		len(bundle.RecentRouteDecisions) > MaxRecentRouteDecisionCount
}

func validateRouteWorkspaceContexts(workspaces []RouteWorkspaceContext) error {
	for _, workspace := range workspaces {
		if err := validateRouteReference("master route open workspace id", workspace.WorkspaceID); err != nil {
			return err
		}
		if strings.TrimSpace(workspace.WorkspaceName) == "" {
			return fmt.Errorf("master route workspace %s has no name", workspace.WorkspaceID)
		}
	}
	return nil
}

func validateRouteConversationTargets(targets []RouteConversationTarget) error {
	for _, target := range targets {
		if err := target.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func routeTaskContext() RouteTaskContext {
	return RouteTaskContext{
		Operation:       RouteTaskOperation,
		InputSemantics:  RouteTaskInputSemantics,
		OutputSemantics: RouteTaskOutputSemantics,
		Directive:       RouteTaskDirective,
	}
}

func (target RouteConversationTarget) Validate() error {
	if err := validateRouteConversationTargetIdentity(target); err != nil {
		return err
	}
	if err := validateRouteConversationTargetState(target); err != nil {
		return err
	}
	return validateRouteConversationTargetForks(target)
}

func validateRouteConversationTargetIdentity(target RouteConversationTarget) error {
	if err := validateRouteReference("master route target conversation id", target.ConversationID); err != nil {
		return err
	}
	if err := target.ResourceScope.Validate(); err != nil {
		return err
	}
	if strings.TrimSpace(target.Title) == "" || strings.TrimSpace(target.Status) == "" {
		return errors.New("master route target title and status are required")
	}
	if target.OpenPaneIDs == nil || target.CompletedForkPoints == nil || target.AllowedDecisionKinds == nil {
		return errors.New("master route target collections must be arrays")
	}
	if target.OpenPaneCount < len(target.OpenPaneIDs) || len(target.CompletedForkPoints) > MaxRouteForkPointsPerTarget {
		return errors.New("master route target pane or fork bounds are invalid")
	}
	return nil
}

func validateRouteConversationTargetState(target RouteConversationTarget) error {
	if err := validateUniqueRouteReferences("target open pane", target.OpenPaneIDs); err != nil {
		return err
	}
	if target.ActiveTurnID != nil {
		if err := validateRouteReference("master route target active turn id", *target.ActiveTurnID); err != nil {
			return err
		}
	}
	return nil
}

func validateRouteConversationTargetForks(target RouteConversationTarget) error {
	if err := validateUniqueRouteDecisionKinds(target.AllowedDecisionKinds); err != nil {
		return err
	}
	turnIDs := make([]string, 0, len(target.CompletedForkPoints))
	for _, point := range target.CompletedForkPoints {
		if err := point.Validate(); err != nil {
			return err
		}
		turnIDs = append(turnIDs, point.TurnID)
	}
	return validateUniqueRouteReferences("target completed fork turn", turnIDs)
}

func (point RouteForkPoint) Validate() error {
	if err := validateRouteReference("master route fork point turn id", point.TurnID); err != nil {
		return err
	}
	if strings.TrimSpace(point.InputExcerpt) == "" {
		return errors.New("master route fork point input excerpt is required")
	}
	completedAt, err := normalizeTimestamp("master route fork point completedAt", point.CompletedAt)
	if err != nil || completedAt != point.CompletedAt {
		return errors.New("master route fork point completedAt must be normalized")
	}
	return nil
}

func (context RouteClarificationContext) Validate() error {
	if err := validateRouteReference("master route clarification decision id", context.DecisionID); err != nil {
		return err
	}
	if err := ValidateInputID(context.InputID); err != nil {
		return err
	}
	if context.InputSequence <= 0 {
		return errors.New("master route clarification input sequence must be positive")
	}
	if err := validateRouteText("master route clarification question", context.Question, MaxRouteQuestionBytes); err != nil {
		return err
	}
	return validateBoundedRouteConversationTargetIDs(
		"clarification candidate target",
		context.CandidateTargetIDs,
		MaxRouteConversationTargets,
	)
}

func routeWorkspaceContexts(
	session workspacesession.WorkspaceSession,
) ([]RouteWorkspaceContext, []string, error) {
	availableIDs, err := session.AvailableActiveWorkspaceIDs()
	if err != nil {
		return nil, nil, fmt.Errorf("resolve master route workspace availability: %w", err)
	}
	if len(availableIDs) > MaxRouteActiveWorkspaces {
		return nil, nil, fmt.Errorf(
			"master route context exceeds %d active workspaces",
			MaxRouteActiveWorkspaces,
		)
	}
	available := make(map[string]bool, len(availableIDs))
	for _, id := range availableIDs {
		available[id] = true
	}
	contexts := make([]RouteWorkspaceContext, 0, len(availableIDs))
	ids := make([]string, 0, len(availableIDs))
	seen := map[string]bool{}
	for _, summary := range session.ActiveWorkspaces {
		if !available[summary.ID] {
			continue
		}
		if err := validateRouteReference("master route open workspace id", summary.ID); err != nil {
			return nil, nil, err
		}
		if strings.TrimSpace(summary.DisplayName) == "" || seen[summary.ID] {
			return nil, nil, errors.New("master route open workspace state is invalid")
		}
		seen[summary.ID] = true
		contexts = append(contexts, RouteWorkspaceContext{
			WorkspaceID: summary.ID, WorkspaceName: summary.DisplayName,
		})
		ids = append(ids, summary.ID)
	}
	return contexts, ids, nil
}

func routeWorkspaceIDs(workspaces []RouteWorkspaceContext) []string {
	ids := make([]string, len(workspaces))
	for index, workspace := range workspaces {
		ids[index] = workspace.WorkspaceID
	}
	return ids
}

func routeContextAuditForBundle(bundle RouteContextBundle) RouteContextAudit {
	candidates := make([]RouteCandidateAudit, len(bundle.Candidates))
	candidateIDs := make([]string, len(bundle.Candidates))
	for index, candidate := range bundle.Candidates {
		candidates[index] = RouteCandidateAudit{
			ConversationID: candidate.ConversationID,
			ResourceScope:  cloneRouteResourceScope(candidate.ResourceScope),
			LexicalRank:    cloneFloat(candidate.LexicalRank),
		}
		candidateIDs[index] = candidate.ConversationID
	}
	return RouteContextAudit{
		InputSequence:             bundle.Input.Sequence,
		CandidateQuery:            bundle.Retrieval.Query,
		CandidateQueryTruncated:   bundle.Retrieval.QueryTruncated,
		RetrievedCandidates:       candidates,
		IncludedCandidateIDs:      candidateIDs,
		ActiveWorkspaceIDs:        routeWorkspaceIDs(bundle.OpenWorkspaces),
		FocusedWorkspaceID:        cloneString(bundle.Focus.WorkspaceID),
		FocusedConversationID:     cloneString(bundle.Focus.ConversationID),
		OriginatingConversationID: cloneString(bundle.Focus.OriginatingConversationID),
		Clarification:             routeClarificationAuditForContext(bundle.Clarification),
		TargetAuthorities:         routeTargetAuthorities(bundle.ConversationTargets),
		PriorDecisionCount:        len(bundle.RecentRouteDecisions),
	}
}

func routeClarificationAuditForContext(
	clarification *RouteClarificationContext,
) *RouteClarificationAudit {
	if clarification == nil {
		return nil
	}
	return &RouteClarificationAudit{
		DecisionID:         clarification.DecisionID,
		InputSequence:      clarification.InputSequence,
		CandidateTargetIDs: append([]string{}, clarification.CandidateTargetIDs...),
	}
}

func routeClarificationContext(work InputRoutingWork) (*RouteClarificationContext, error) {
	if work.PriorClarification == nil {
		return nil, nil
	}
	prior := work.PriorClarification
	if prior.ResultingCommand.Kind != RouteDecisionKindClarify || prior.ResultingCommand.Clarify == nil {
		return nil, errors.New("master route prior clarification command is invalid")
	}
	context := &RouteClarificationContext{
		DecisionID:         prior.ID,
		InputID:            prior.InputID,
		InputSequence:      prior.Context.InputSequence,
		Question:           prior.ResultingCommand.Clarify.Question,
		CandidateTargetIDs: append([]string{}, prior.ResultingCommand.Clarify.CandidateTargetIDs...),
	}
	if err := context.Validate(); err != nil {
		return nil, err
	}
	return context, nil
}

func routeCandidateContexts(
	candidates []conversationindex.Candidate,
	targets map[string]RouteConversationTarget,
) ([]RouteCandidateContext, error) {
	contexts := make([]RouteCandidateContext, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		card := candidate.Card
		scope, err := routeResourceScopeForCandidate(card)
		if err != nil {
			return nil, err
		}
		target, found := targets[card.ConversationID]
		if !found || !target.ResourceScope.Equal(scope) || target.Status != card.ActiveStatus {
			return nil, fmt.Errorf("master route candidate %s lacks matching target authority", card.ConversationID)
		}
		if seen[card.ConversationID] {
			return nil, fmt.Errorf("master route candidate %s is duplicated", card.ConversationID)
		}
		seen[card.ConversationID] = true
		contexts = append(contexts, RouteCandidateContext{
			ConversationID:       card.ConversationID,
			ResourceScope:        scope,
			Title:                card.Title,
			TopicDescriptor:      card.TopicDescriptor,
			RecentUserRequests:   append([]conversationindex.TextExcerpt{}, card.RecentUserRequests...),
			RecentFinalSummaries: append([]conversationindex.TextExcerpt{}, card.RecentFinalSummaries...),
			UpdatedAt:            card.UpdatedAt,
			Status:               card.ActiveStatus,
			OpenPaneIDs:          append([]string{}, card.OpenPaneIDs...),
			OpenPaneCount:        card.OpenPaneCount,
			LexicalRank:          cloneFloat(candidate.LexicalRank),
		})
	}
	return contexts, nil
}

func routeFocusContext(input MasterInput, targets map[string]RouteConversationTarget) RouteFocusContext {
	focus := RouteFocusContext{
		WorkspaceID:                    cloneString(input.FocusedWorkspaceID),
		ConversationID:                 cloneString(input.FocusedConversationID),
		PaneID:                         cloneString(input.FocusedPaneID),
		OriginatingWorkspaceID:         cloneString(input.OriginatingWorkspaceID),
		OriginatingConversationID:      cloneString(input.OriginatingConversationID),
		OriginatingPaneID:              cloneString(input.OriginatingPaneID),
		OriginatingConversationInputID: cloneString(input.OriginatingConversationInputID),
	}
	if input.FocusedConversationID != nil {
		_, focus.ConversationAvailable = targets[*input.FocusedConversationID]
	}
	return focus
}

func routeContextAllowedDecisionKinds(
	activeWorkspaceIDs []string,
	targets []RouteConversationTarget,
) []RouteDecisionKind {
	allowed := []RouteDecisionKind{}
	for _, target := range targets {
		for _, kind := range target.AllowedDecisionKinds {
			if !slices.Contains(allowed, kind) {
				allowed = append(allowed, kind)
			}
		}
	}
	allowed = append(allowed, RouteDecisionKindCreateConversation)
	allowed = append(allowed, RouteDecisionKindClarify, RouteDecisionKindAnswerGlobal)
	return allowed
}

func routeTargetAuthorities(targets []RouteConversationTarget) []RouteTargetAuthority {
	authorities := make([]RouteTargetAuthority, len(targets))
	for index, target := range targets {
		turnIDs := make([]string, len(target.CompletedForkPoints))
		for pointIndex, point := range target.CompletedForkPoints {
			turnIDs[pointIndex] = point.TurnID
		}
		authorities[index] = RouteTargetAuthority{
			ConversationID:       target.ConversationID,
			ResourceScope:        cloneRouteResourceScope(target.ResourceScope),
			AllowedDecisionKinds: append([]RouteDecisionKind{}, target.AllowedDecisionKinds...),
			CompletedForkTurnIDs: turnIDs,
		}
	}
	return authorities
}

func summarizeRouteDecision(record RouteDecisionRecord) RouteDecisionSummary {
	_, conversationID, createScope, _ := decisionAuthorityReferences(record.Decision)
	targetID := conversationID
	if targetID == "" && createScope.Kind != "" {
		if workspaceID, folderScoped := createScope.FolderWorkspaceID(); folderScoped {
			targetID = workspaceID
		} else {
			targetID = string(RouteResourceScopeKindFolderless)
		}
	}
	var optionalTarget *string
	if targetID != "" {
		optionalTarget = &targetID
	}
	return RouteDecisionSummary{
		InputID: record.InputID, DecisionKind: record.Decision.Kind,
		TargetID: optionalTarget, DecidedAt: record.DecidedAt,
	}
}

func cloneRouteConversationTargets(targets []RouteConversationTarget) []RouteConversationTarget {
	cloned := append([]RouteConversationTarget{}, targets...)
	for index := range cloned {
		cloned[index].ResourceScope = cloneRouteResourceScope(cloned[index].ResourceScope)
		cloned[index].OpenPaneIDs = append([]string{}, cloned[index].OpenPaneIDs...)
		cloned[index].ActiveTurnID = cloneString(cloned[index].ActiveTurnID)
		cloned[index].CompletedForkPoints = append([]RouteForkPoint{}, cloned[index].CompletedForkPoints...)
		cloned[index].AllowedDecisionKinds = append([]RouteDecisionKind{}, cloned[index].AllowedDecisionKinds...)
	}
	return cloned
}

func FolderlessRouteResourceScope() RouteResourceScope {
	return RouteResourceScope{Kind: RouteResourceScopeKindFolderless}
}

func FolderRouteResourceScope(workspaceID string, workspaceName string) RouteResourceScope {
	return RouteResourceScope{
		Kind: RouteResourceScopeKindFolder,
		Folder: &RouteFolderResourceScope{
			WorkspaceID:   workspaceID,
			WorkspaceName: workspaceName,
		},
	}
}

func RouteResourceScopeForWorkspaceID(workspaceID *string) RouteResourceScope {
	if workspaceID == nil {
		return FolderlessRouteResourceScope()
	}
	return FolderRouteResourceScope(*workspaceID, "")
}

func (scope RouteResourceScope) Validate() error {
	switch scope.Kind {
	case RouteResourceScopeKindFolderless:
		if scope.Folder != nil {
			return errors.New("folderless route resource scope cannot include folder data")
		}
		return nil
	case RouteResourceScopeKindFolder:
		if scope.Folder == nil {
			return errors.New("folder route resource scope requires folder data")
		}
		if err := validateRouteReference("master route folder resource workspace id", scope.Folder.WorkspaceID); err != nil {
			return err
		}
		if strings.TrimSpace(scope.Folder.WorkspaceName) != scope.Folder.WorkspaceName {
			return errors.New("master route folder resource workspace name cannot have surrounding whitespace")
		}
		return nil
	default:
		return fmt.Errorf("master route resource scope kind %q is invalid", scope.Kind)
	}
}

func (scope RouteResourceScope) FolderWorkspaceID() (string, bool) {
	if scope.Kind != RouteResourceScopeKindFolder || scope.Folder == nil {
		return "", false
	}
	return scope.Folder.WorkspaceID, true
}

func (scope RouteResourceScope) Equal(other RouteResourceScope) bool {
	if scope.Kind != other.Kind {
		return false
	}
	leftWorkspaceID, leftFolder := scope.FolderWorkspaceID()
	rightWorkspaceID, rightFolder := other.FolderWorkspaceID()
	return leftFolder == rightFolder && leftWorkspaceID == rightWorkspaceID
}

func routeResourceScopeForCandidate(card conversationindex.TopicCard) (RouteResourceScope, error) {
	switch card.ResourceScope.Kind {
	case conversationindex.ResourceScopeKindFolderless:
		scope := FolderlessRouteResourceScope()
		return scope, scope.Validate()
	case conversationindex.ResourceScopeKindFolder:
		workspaceID, ok := card.ResourceScope.FolderWorkspaceID()
		if !ok {
			return RouteResourceScope{}, fmt.Errorf("master route candidate %s has invalid folder resource scope", card.ConversationID)
		}
		if strings.TrimSpace(card.WorkspaceName) == "" {
			return RouteResourceScope{}, fmt.Errorf("master route candidate %s has no workspace name", card.ConversationID)
		}
		scope := FolderRouteResourceScope(workspaceID, card.WorkspaceName)
		return scope, scope.Validate()
	default:
		return RouteResourceScope{}, fmt.Errorf("master route candidate %s has invalid resource scope %q", card.ConversationID, card.ResourceScope.Kind)
	}
}

func cloneRouteResourceScope(scope RouteResourceScope) RouteResourceScope {
	if scope.Folder != nil {
		folder := *scope.Folder
		scope.Folder = &folder
	}
	return scope
}

func validateUniqueRouteDecisionKindsIncludingGlobal(kinds []RouteDecisionKind) error {
	seen := map[RouteDecisionKind]bool{}
	for _, kind := range kinds {
		if !validRouteDecisionKind(kind) || seen[kind] {
			return fmt.Errorf("master route context contains invalid or repeated decision kind %q", kind)
		}
		seen[kind] = true
	}
	return nil
}

func cloneFloat(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
