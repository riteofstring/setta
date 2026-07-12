package master

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"slices"
	"strings"
	"time"
)

const (
	MaxRouteDecisionIDBytes        = MaxInputIDBytes
	MaxRouteReferenceBytes         = MaxFocusHintBytes
	MaxRouteAuthoredInputBytes     = MaxInputTextBytes
	MaxRouteQuestionBytes          = 16 * 1024
	MaxRouteAnswerBytes            = 64 * 1024
	MaxRouteConversationTitle      = 200
	MaxRouteFailureMessageBytes    = 16 * 1024
	MaxRouteDiagnosticReference    = 512
	MaxRecentRouteDecisionCount    = 8
	MaxRouteConversationTargets    = 24
	MaxRouteForkPointsPerTarget    = 8
	RouteInputRoutingStartedKind   = "master.route_started"
	RouteInputRoutingFailedKind    = "master.route_failed"
	RouteInputRoutingRecoveredKind = "master.route_recovered"
	RouteDecisionCommittedKind     = "master.route_decided"
	RouteDecisionCommittedStream   = "master:routes"
)

type RouteDecisionKind string
type InputRoutingStatus string

const (
	RouteDecisionKindSendToAgent            RouteDecisionKind = "send_to_agent"
	RouteDecisionKindQueueAgentTurn         RouteDecisionKind = "queue_agent_turn"
	RouteDecisionKindSteerActiveTurn        RouteDecisionKind = "steer_active_turn"
	RouteDecisionKindAskNarrator            RouteDecisionKind = "ask_narrator"
	RouteDecisionKindFocusConversation      RouteDecisionKind = "focus_conversation"
	RouteDecisionKindCreateConversation     RouteDecisionKind = "create_conversation"
	RouteDecisionKindCreateSideConversation RouteDecisionKind = "create_side_conversation"
	RouteDecisionKindForkConversation       RouteDecisionKind = "fork_conversation"
	RouteDecisionKindClarify                RouteDecisionKind = "clarify"
	RouteDecisionKindAnswerGlobal           RouteDecisionKind = "answer_global"

	InputRoutingStatusAccepted InputRoutingStatus = "accepted"
	InputRoutingStatusRouting  InputRoutingStatus = "routing"
	InputRoutingStatusDecided  InputRoutingStatus = "decided"
	InputRoutingStatusFailed   InputRoutingStatus = "failed"
)

type MasterSendToAgentRouteDecision struct {
	ConversationID string `json:"conversationId"`
	AuthoredInput  string `json:"authoredInput"`
}

type MasterQueueAgentTurnRouteDecision struct {
	ConversationID string `json:"conversationId"`
	AuthoredInput  string `json:"authoredInput"`
}

type MasterSteerActiveTurnRouteDecision struct {
	ConversationID string `json:"conversationId"`
	AuthoredInput  string `json:"authoredInput"`
}

type MasterAskNarratorRouteDecision struct {
	ConversationID string `json:"conversationId"`
	Question       string `json:"question"`
}

type MasterFocusConversationRouteDecision struct {
	ConversationID string `json:"conversationId"`
}

type MasterCreateConversationRouteDecision struct {
	WorkspaceID   string `json:"workspaceId"`
	InitialInput  string `json:"initialInput"`
	ProposedTitle string `json:"proposedTitle"`
}

type MasterCreateSideConversationRouteDecision struct {
	ParentConversationID string `json:"parentConversationId"`
	Input                string `json:"input"`
}

type MasterForkConversationRouteDecision struct {
	ParentConversationID string `json:"parentConversationId"`
	ForkedAtTurnID       string `json:"forkedAtTurnId"`
	Input                string `json:"input"`
}

type MasterClarifyRouteDecision struct {
	Question string `json:"question"`
}

type MasterAnswerGlobalRouteDecision struct {
	Text string `json:"text"`
}

// RouteDecision is the complete authority a global routing model may return.
// Provider ids, command ids, endpoint names, renderer commands, and arbitrary
// tool requests are intentionally absent.
type RouteDecision struct {
	Kind                   RouteDecisionKind                          `json:"kind"`
	SendToAgent            *MasterSendToAgentRouteDecision            `json:"sendToAgent"`
	QueueAgentTurn         *MasterQueueAgentTurnRouteDecision         `json:"queueAgentTurn"`
	SteerActiveTurn        *MasterSteerActiveTurnRouteDecision        `json:"steerActiveTurn"`
	AskNarrator            *MasterAskNarratorRouteDecision            `json:"askNarrator"`
	FocusConversation      *MasterFocusConversationRouteDecision      `json:"focusConversation"`
	CreateConversation     *MasterCreateConversationRouteDecision     `json:"createConversation"`
	CreateSideConversation *MasterCreateSideConversationRouteDecision `json:"createSideConversation"`
	ForkConversation       *MasterForkConversationRouteDecision       `json:"forkConversation"`
	Clarify                *MasterClarifyRouteDecision                `json:"clarify"`
	AnswerGlobal           *MasterAnswerGlobalRouteDecision           `json:"answerGlobal"`
}

type RouteInvocationAudit struct {
	Configuration     RouteModelConfigurationAudit `json:"configuration"`
	ProviderRequestID string                       `json:"providerRequestId"`
	ProviderThreadID  string                       `json:"providerThreadId"`
	ProviderTurnID    string                       `json:"providerTurnId"`
	InputBytes        int                          `json:"inputBytes"`
	OutputBytes       int                          `json:"outputBytes"`
	StartedAt         string                       `json:"startedAt"`
	EndedAt           string                       `json:"endedAt"`
}

type RouteModelConfigurationAudit struct {
	RequestedProfile         json.RawMessage `json:"requestedProfile"`
	RequestedModel           string          `json:"requestedModel"`
	ResolvedModel            string          `json:"resolvedModel"`
	RequestedReasoningEffort string          `json:"requestedReasoningEffort"`
	ResolvedReasoningEffort  string          `json:"resolvedReasoningEffort"`
	RequestedServiceTier     *string         `json:"requestedServiceTier"`
	ResolvedServiceTier      *string         `json:"resolvedServiceTier"`
	RequestedPermissionMode  string          `json:"requestedPermissionMode"`
	ResolvedPermissionMode   string          `json:"resolvedPermissionMode"`
	RequestedApprovalMode    string          `json:"requestedApprovalMode"`
	ResolvedApprovalMode     string          `json:"resolvedApprovalMode"`
	MaxInputBytes            int             `json:"maxInputBytes"`
}

type RouteCandidateAudit struct {
	ConversationID string   `json:"conversationId"`
	WorkspaceID    string   `json:"workspaceId"`
	LexicalRank    *float64 `json:"lexicalRank"`
}

type RouteTargetAuthority struct {
	ConversationID       string              `json:"conversationId"`
	WorkspaceID          string              `json:"workspaceId"`
	AllowedDecisionKinds []RouteDecisionKind `json:"allowedDecisionKinds"`
	CompletedForkTurnIDs []string            `json:"completedForkTurnIds"`
}

type RouteContextAudit struct {
	InputSequence             int                    `json:"inputSequence"`
	CandidateQuery            string                 `json:"candidateQuery"`
	CandidateQueryTruncated   bool                   `json:"candidateQueryTruncated"`
	RetrievedCandidates       []RouteCandidateAudit  `json:"retrievedCandidates"`
	IncludedCandidateIDs      []string               `json:"includedCandidateIds"`
	ActiveWorkspaceIDs        []string               `json:"activeWorkspaceIds"`
	FocusedWorkspaceID        *string                `json:"focusedWorkspaceId"`
	FocusedConversationID     *string                `json:"focusedConversationId"`
	OriginatingConversationID *string                `json:"originatingConversationId"`
	TargetAuthorities         []RouteTargetAuthority `json:"targetAuthorities"`
	PriorDecisionCount        int                    `json:"priorDecisionCount"`
}

type RouteDecisionCommit struct {
	ID                 string               `json:"id"`
	MasterSessionID    string               `json:"masterSessionId"`
	InputID            string               `json:"inputId"`
	RoutingAttempt     int                  `json:"routingAttempt"`
	Context            RouteContextAudit    `json:"context"`
	ResolvedInvocation RouteInvocationAudit `json:"resolvedInvocation"`
	Decision           RouteDecision        `json:"decision"`
	DecidedAt          string               `json:"decidedAt"`
}

type RouteDecisionRecord struct {
	StreamSequence     int                  `json:"streamSequence"`
	ID                 string               `json:"id"`
	MasterSessionID    string               `json:"masterSessionId"`
	InputID            string               `json:"inputId"`
	RoutingAttempt     int                  `json:"routingAttempt"`
	Context            RouteContextAudit    `json:"context"`
	ResolvedInvocation RouteInvocationAudit `json:"resolvedInvocation"`
	Decision           RouteDecision        `json:"decision"`
	DecidedAt          string               `json:"decidedAt"`
}

type RouteFailure struct {
	Code                string `json:"code"`
	Message             string `json:"message"`
	Retryable           bool   `json:"retryable"`
	DiagnosticReference string `json:"diagnosticReference"`
}

type InputRoutingFailure struct {
	InputID        string       `json:"inputId"`
	RoutingAttempt int          `json:"routingAttempt"`
	Failure        RouteFailure `json:"failure"`
	FailedAt       string       `json:"failedAt"`
}

type InputRoutingRecovery struct {
	InputID        string `json:"inputId"`
	RoutingAttempt int    `json:"routingAttempt"`
	RecoveredAt    string `json:"recoveredAt"`
}

type InputRoutingWork struct {
	Input            AcceptedMasterInput `json:"input"`
	RoutingAttempt   int                 `json:"routingAttempt"`
	RoutingStartedAt string              `json:"routingStartedAt"`
}

type InputRoutingState struct {
	Input            AcceptedMasterInput  `json:"input"`
	Status           InputRoutingStatus   `json:"status"`
	RoutingAttempt   int                  `json:"routingAttempt"`
	RoutingStartedAt *string              `json:"routingStartedAt"`
	Decision         *RouteDecisionRecord `json:"decision"`
	Failure          *RouteFailure        `json:"failure"`
}

func (decision RouteDecision) Validate() error {
	if decision.payloadCount() != 1 {
		return errors.New("master route decision requires exactly one payload")
	}
	if isConversationRouteDecisionKind(decision.Kind) {
		return validateConversationRouteDecision(decision)
	}
	return validateGlobalRouteDecision(decision)
}

func isConversationRouteDecisionKind(kind RouteDecisionKind) bool {
	switch kind {
	case RouteDecisionKindSendToAgent,
		RouteDecisionKindQueueAgentTurn,
		RouteDecisionKindSteerActiveTurn,
		RouteDecisionKindAskNarrator,
		RouteDecisionKindFocusConversation:
		return true
	default:
		return false
	}
}

func validateConversationRouteDecision(decision RouteDecision) error {
	if isAgentWorkRouteDecisionKind(decision.Kind) {
		return validateAgentWorkRouteDecision(decision)
	}
	return validateConversationPresentationRouteDecision(decision)
}

func isAgentWorkRouteDecisionKind(kind RouteDecisionKind) bool {
	switch kind {
	case RouteDecisionKindSendToAgent,
		RouteDecisionKindQueueAgentTurn,
		RouteDecisionKindSteerActiveTurn:
		return true
	default:
		return false
	}
}

func validateAgentWorkRouteDecision(decision RouteDecision) error {
	switch decision.Kind {
	case RouteDecisionKindSendToAgent:
		if decision.SendToAgent == nil {
			return errors.New("send-to-agent decision requires sendToAgent")
		}
		return validateRouteConversationInput(decision.SendToAgent.ConversationID, decision.SendToAgent.AuthoredInput)
	case RouteDecisionKindQueueAgentTurn:
		if decision.QueueAgentTurn == nil {
			return errors.New("queue-agent-turn decision requires queueAgentTurn")
		}
		return validateRouteConversationInput(decision.QueueAgentTurn.ConversationID, decision.QueueAgentTurn.AuthoredInput)
	case RouteDecisionKindSteerActiveTurn:
		if decision.SteerActiveTurn == nil {
			return errors.New("steer-active-turn decision requires steerActiveTurn")
		}
		return validateRouteConversationInput(decision.SteerActiveTurn.ConversationID, decision.SteerActiveTurn.AuthoredInput)
	default:
		return fmt.Errorf("unsupported agent-work master route decision kind %q", decision.Kind)
	}
}

func validateConversationPresentationRouteDecision(decision RouteDecision) error {
	switch decision.Kind {
	case RouteDecisionKindAskNarrator:
		if decision.AskNarrator == nil {
			return errors.New("ask-narrator decision requires askNarrator")
		}
		if err := validateRouteReference("master route narrator conversation id", decision.AskNarrator.ConversationID); err != nil {
			return err
		}
		return validateRouteText("master route narrator question", decision.AskNarrator.Question, MaxRouteQuestionBytes)
	case RouteDecisionKindFocusConversation:
		if decision.FocusConversation == nil {
			return errors.New("focus-conversation decision requires focusConversation")
		}
		return validateRouteReference("master route focused conversation id", decision.FocusConversation.ConversationID)
	default:
		return fmt.Errorf("unsupported conversation master route decision kind %q", decision.Kind)
	}
}

func validateGlobalRouteDecision(decision RouteDecision) error {
	switch decision.Kind {
	case RouteDecisionKindCreateConversation:
		return validateCreateConversationDecision(decision.CreateConversation)
	case RouteDecisionKindCreateSideConversation:
		if decision.CreateSideConversation == nil {
			return errors.New("create-side-conversation decision requires createSideConversation")
		}
		return validateRouteConversationInput(
			decision.CreateSideConversation.ParentConversationID,
			decision.CreateSideConversation.Input,
		)
	case RouteDecisionKindForkConversation:
		return validateForkConversationDecision(decision.ForkConversation)
	case RouteDecisionKindClarify:
		if decision.Clarify == nil {
			return errors.New("clarify decision requires clarify")
		}
		return validateRouteText("master route clarification", decision.Clarify.Question, MaxRouteQuestionBytes)
	case RouteDecisionKindAnswerGlobal:
		if decision.AnswerGlobal == nil {
			return errors.New("answer-global decision requires answerGlobal")
		}
		return validateRouteText("master global answer", decision.AnswerGlobal.Text, MaxRouteAnswerBytes)
	default:
		return fmt.Errorf("unsupported master route decision kind %q", decision.Kind)
	}
}

func validateCreateConversationDecision(payload *MasterCreateConversationRouteDecision) error {
	if payload == nil {
		return errors.New("create-conversation decision requires createConversation")
	}
	if err := validateRouteReference("master route create workspace id", payload.WorkspaceID); err != nil {
		return err
	}
	if err := validateRouteText("master route initial input", payload.InitialInput, MaxRouteAuthoredInputBytes); err != nil {
		return err
	}
	return validateRouteText("master route proposed title", payload.ProposedTitle, MaxRouteConversationTitle)
}

func validateForkConversationDecision(payload *MasterForkConversationRouteDecision) error {
	if payload == nil {
		return errors.New("fork-conversation decision requires forkConversation")
	}
	if err := validateRouteReference("master route fork parent conversation id", payload.ParentConversationID); err != nil {
		return err
	}
	if err := validateRouteReference("master route fork turn id", payload.ForkedAtTurnID); err != nil {
		return err
	}
	return validateRouteText("master route fork input", payload.Input, MaxRouteAuthoredInputBytes)
}

func (decision RouteDecision) payloadCount() int {
	count := 0
	for _, present := range []bool{
		decision.SendToAgent != nil,
		decision.QueueAgentTurn != nil,
		decision.SteerActiveTurn != nil,
		decision.AskNarrator != nil,
		decision.FocusConversation != nil,
		decision.CreateConversation != nil,
		decision.CreateSideConversation != nil,
		decision.ForkConversation != nil,
		decision.Clarify != nil,
		decision.AnswerGlobal != nil,
	} {
		if present {
			count++
		}
	}
	return count
}

func (audit RouteInvocationAudit) Validate() error {
	if err := audit.Configuration.Validate(); err != nil {
		return fmt.Errorf("master route invocation configuration: %w", err)
	}
	if err := validateRouteInvocationReferences(audit); err != nil {
		return err
	}
	if audit.InputBytes <= 0 || audit.OutputBytes <= 0 {
		return errors.New("master route invocation must record positive input and output bytes")
	}
	if audit.InputBytes > audit.Configuration.MaxInputBytes {
		return errors.New("master route invocation input exceeds its configured byte budget")
	}
	return validateRouteInvocationTimestamps(audit)
}

func validateRouteInvocationReferences(audit RouteInvocationAudit) error {
	for label, value := range map[string]string{
		"provider request id": audit.ProviderRequestID,
		"provider thread id":  audit.ProviderThreadID,
		"provider turn id":    audit.ProviderTurnID,
	} {
		if err := validateRouteReference("master route "+label, value); err != nil {
			return err
		}
	}
	return nil
}

func validateRouteInvocationTimestamps(audit RouteInvocationAudit) error {
	startedAt, err := normalizeTimestamp("master route invocation startedAt", audit.StartedAt)
	if err != nil || startedAt != audit.StartedAt {
		return errors.New("master route invocation startedAt must be normalized")
	}
	endedAt, err := normalizeTimestamp("master route invocation endedAt", audit.EndedAt)
	if err != nil || endedAt != audit.EndedAt {
		return errors.New("master route invocation endedAt must be normalized")
	}
	started, _ := time.Parse(time.RFC3339Nano, startedAt)
	ended, _ := time.Parse(time.RFC3339Nano, endedAt)
	if ended.Before(started) {
		return errors.New("master route invocation endedAt precedes startedAt")
	}
	return nil
}

func (audit RouteModelConfigurationAudit) Validate() error {
	if err := validateRouteRequestedProfile(audit.RequestedProfile); err != nil {
		return err
	}
	if err := validateRouteModelConfigurationReferences(audit); err != nil {
		return err
	}
	if audit.RequestedPermissionMode != "read_only" || audit.ResolvedPermissionMode != "read_only" ||
		audit.RequestedApprovalMode != "never" || audit.ResolvedApprovalMode != "never" {
		return errors.New("master route configuration must remain read-only with approvals disabled")
	}
	if audit.MaxInputBytes <= 0 {
		return errors.New("master route configuration max input bytes must be positive")
	}
	return nil
}

func validateRouteRequestedProfile(requested json.RawMessage) error {
	profile, err := canonicalJSONObject(requested, "master route requested role profile")
	if err != nil {
		return err
	}
	if !bytes.Equal(profile, requested) {
		return errors.New("master route requested role profile must be canonical JSON")
	}
	return nil
}

func validateRouteModelConfigurationReferences(audit RouteModelConfigurationAudit) error {
	for label, value := range map[string]string{
		"requested model":            audit.RequestedModel,
		"resolved model":             audit.ResolvedModel,
		"requested reasoning effort": audit.RequestedReasoningEffort,
		"resolved reasoning effort":  audit.ResolvedReasoningEffort,
		"requested permission mode":  audit.RequestedPermissionMode,
		"resolved permission mode":   audit.ResolvedPermissionMode,
		"requested approval mode":    audit.RequestedApprovalMode,
		"resolved approval mode":     audit.ResolvedApprovalMode,
	} {
		if err := validateRouteText("master route "+label, value, MaxRouteReferenceBytes); err != nil {
			return err
		}
	}
	for label, value := range map[string]*string{
		"requested service tier": audit.RequestedServiceTier,
		"resolved service tier":  audit.ResolvedServiceTier,
	} {
		if value != nil {
			if err := validateRouteText("master route "+label, *value, MaxRouteReferenceBytes); err != nil {
				return err
			}
		}
	}
	return nil
}

func NewRouteModelConfigurationAudit(
	configuration RoleConfiguration,
) (RouteModelConfigurationAudit, error) {
	if err := configuration.Validate(); err != nil {
		return RouteModelConfigurationAudit{}, err
	}
	requested := configuration.ResolvedInvocation.Requested
	requestedModel := requested.Model
	if requested.ModelSelectionProviderDefault {
		requestedModel = "provider_default"
	}
	requestedReasoningEffort := requested.ReasoningEffort
	if requestedReasoningEffort == "" {
		requestedReasoningEffort = "provider_default"
	}
	audit := RouteModelConfigurationAudit{
		RequestedProfile:         append(json.RawMessage{}, configuration.RequestedProfile...),
		RequestedModel:           requestedModel,
		ResolvedModel:            configuration.ResolvedInvocation.Model,
		RequestedReasoningEffort: requestedReasoningEffort,
		ResolvedReasoningEffort:  configuration.ResolvedInvocation.ReasoningEffort,
		RequestedServiceTier:     cloneString(requested.ServiceTier),
		ResolvedServiceTier:      cloneString(configuration.ResolvedInvocation.ServiceTier),
		RequestedPermissionMode:  string(requested.PermissionMode),
		ResolvedPermissionMode:   string(configuration.ResolvedInvocation.PermissionMode),
		RequestedApprovalMode:    string(requested.ApprovalMode),
		ResolvedApprovalMode:     string(configuration.ResolvedInvocation.ApprovalMode),
		MaxInputBytes:            configuration.MaxInputBytes,
	}
	if err := audit.Validate(); err != nil {
		return RouteModelConfigurationAudit{}, err
	}
	return audit, nil
}

func RouteModelConfigurationMatches(
	configuration RoleConfiguration,
	audit RouteModelConfigurationAudit,
) bool {
	expected, err := NewRouteModelConfigurationAudit(configuration)
	return err == nil && reflect.DeepEqual(expected, audit)
}

func (audit RouteContextAudit) Validate() error {
	if err := validateRouteContextAuditBounds(audit); err != nil {
		return err
	}
	if err := validateRouteContextAuditReferences(audit); err != nil {
		return err
	}
	return validateRouteCandidateAudits(audit)
}

func validateRouteContextAuditBounds(audit RouteContextAudit) error {
	if audit.InputSequence <= 0 {
		return errors.New("master route context input sequence must be positive")
	}
	if len(audit.CandidateQuery) > 4096 {
		return errors.New("master route candidate query exceeds its index bound")
	}
	if !routeContextAuditCollectionsPresent(audit) {
		return errors.New("master route context collections must be arrays")
	}
	if audit.PriorDecisionCount < 0 || audit.PriorDecisionCount > MaxRecentRouteDecisionCount {
		return errors.New("master route context prior decision count is out of bounds")
	}
	return validateRouteContextAuditCollectionBounds(audit)
}

func routeContextAuditCollectionsPresent(audit RouteContextAudit) bool {
	return audit.RetrievedCandidates != nil && audit.IncludedCandidateIDs != nil &&
		audit.ActiveWorkspaceIDs != nil && audit.TargetAuthorities != nil
}

func validateRouteContextAuditCollectionBounds(audit RouteContextAudit) error {
	if len(audit.ActiveWorkspaceIDs) > MaxRouteActiveWorkspaces {
		return errors.New("master route context contains too many active workspaces")
	}
	if len(audit.TargetAuthorities) > MaxRouteConversationTargets {
		return errors.New("master route context contains too many target authorities")
	}
	if len(audit.RetrievedCandidates) > DefaultCandidateLimit {
		return errors.New("master route context contains too many retrieved candidates")
	}
	return nil
}

func validateRouteContextAuditReferences(audit RouteContextAudit) error {
	if err := validateUniqueRouteReferences("active workspace", audit.ActiveWorkspaceIDs); err != nil {
		return err
	}
	if err := validateUniqueRouteReferences("included candidate", audit.IncludedCandidateIDs); err != nil {
		return err
	}
	for label, reference := range map[string]*string{
		"focused workspace":        audit.FocusedWorkspaceID,
		"focused conversation":     audit.FocusedConversationID,
		"originating conversation": audit.OriginatingConversationID,
	} {
		if reference != nil {
			if err := validateRouteReference("master route "+label, *reference); err != nil {
				return err
			}
		}
	}
	if err := validateRouteTargetAuthorities(audit.TargetAuthorities); err != nil {
		return err
	}
	if len(audit.RetrievedCandidates) != len(audit.IncludedCandidateIDs) {
		return errors.New("master route retrieved and included candidate counts differ")
	}
	return nil
}

func validateRouteCandidateAudits(audit RouteContextAudit) error {
	targetWorkspaces := make(map[string]string, len(audit.TargetAuthorities))
	for _, authority := range audit.TargetAuthorities {
		targetWorkspaces[authority.ConversationID] = authority.WorkspaceID
	}
	seenCandidates := map[string]bool{}
	for index, candidate := range audit.RetrievedCandidates {
		if err := validateRouteCandidateAudit(
			audit,
			index,
			candidate,
			targetWorkspaces,
			seenCandidates,
		); err != nil {
			return err
		}
		seenCandidates[candidate.ConversationID] = true
	}
	return nil
}

func validateRouteCandidateAudit(
	audit RouteContextAudit,
	index int,
	candidate RouteCandidateAudit,
	targetWorkspaces map[string]string,
	seenCandidates map[string]bool,
) error {
	if err := validateRouteReference("master route candidate conversation id", candidate.ConversationID); err != nil {
		return err
	}
	if err := validateRouteReference("master route candidate workspace id", candidate.WorkspaceID); err != nil {
		return err
	}
	if seenCandidates[candidate.ConversationID] ||
		audit.IncludedCandidateIDs[index] != candidate.ConversationID ||
		targetWorkspaces[candidate.ConversationID] != candidate.WorkspaceID {
		return errors.New("master route candidate audit is duplicated, reordered, or unauthorized")
	}
	return validateRouteCandidateRank(audit.CandidateQuery, candidate.LexicalRank)
}

func validateRouteCandidateRank(query string, rank *float64) error {
	if query == "" {
		if rank != nil {
			return errors.New("master route recency candidate cannot have a lexical rank")
		}
		return nil
	}
	if rank == nil || math.IsNaN(*rank) || math.IsInf(*rank, 0) {
		return errors.New("master route lexical candidate requires a finite rank")
	}
	return nil
}

func validateRouteTargetAuthorities(authorities []RouteTargetAuthority) error {
	seen := map[string]bool{}
	for _, authority := range authorities {
		if err := validateRouteReference("master route authority conversation id", authority.ConversationID); err != nil {
			return err
		}
		if seen[authority.ConversationID] {
			return fmt.Errorf("master route context repeats target %s", authority.ConversationID)
		}
		seen[authority.ConversationID] = true
		if err := validateRouteReference("master route authority workspace id", authority.WorkspaceID); err != nil {
			return err
		}
		if authority.AllowedDecisionKinds == nil || len(authority.AllowedDecisionKinds) == 0 {
			return fmt.Errorf("master route target %s has no allowed decisions", authority.ConversationID)
		}
		if len(authority.CompletedForkTurnIDs) > MaxRouteForkPointsPerTarget {
			return fmt.Errorf("master route target %s has too many fork points", authority.ConversationID)
		}
		if err := validateUniqueRouteDecisionKinds(authority.AllowedDecisionKinds); err != nil {
			return fmt.Errorf("master route target %s: %w", authority.ConversationID, err)
		}
		if err := validateUniqueRouteReferences("completed fork turn", authority.CompletedForkTurnIDs); err != nil {
			return err
		}
	}
	return nil
}

func (commit RouteDecisionCommit) Validate() error {
	if err := validateRouteDecisionCommitIdentity(commit); err != nil {
		return err
	}
	if err := validateRouteDecisionCommitContent(commit); err != nil {
		return err
	}
	return validateRouteDecisionCommitTiming(commit)
}

func validateRouteDecisionCommitIdentity(commit RouteDecisionCommit) error {
	if err := validateBoundedIdentifier("master route decision id", commit.ID, MaxRouteDecisionIDBytes); err != nil {
		return err
	}
	if err := validateRouteReference("master route session id", commit.MasterSessionID); err != nil {
		return err
	}
	if err := ValidateInputID(commit.InputID); err != nil {
		return err
	}
	if commit.RoutingAttempt <= 0 {
		return errors.New("master route decision routing attempt must be positive")
	}
	return nil
}

func validateRouteDecisionCommitContent(commit RouteDecisionCommit) error {
	if err := commit.Context.Validate(); err != nil {
		return err
	}
	if err := commit.ResolvedInvocation.Validate(); err != nil {
		return err
	}
	if err := commit.Decision.Validate(); err != nil {
		return err
	}
	if err := commit.Context.ValidateDecision(commit.Decision); err != nil {
		return err
	}
	return nil
}

func validateRouteDecisionCommitTiming(commit RouteDecisionCommit) error {
	decidedAt, err := normalizeTimestamp("master route decision decidedAt", commit.DecidedAt)
	if err != nil || decidedAt != commit.DecidedAt {
		return errors.New("master route decision decidedAt must be normalized")
	}
	decided, _ := time.Parse(time.RFC3339Nano, decidedAt)
	invocationEnded, _ := time.Parse(time.RFC3339Nano, commit.ResolvedInvocation.EndedAt)
	if decided.Before(invocationEnded) {
		return errors.New("master route decision precedes its provider invocation")
	}
	return nil
}

func (record RouteDecisionRecord) Validate() error {
	if record.StreamSequence <= 0 {
		return errors.New("master route decision stream sequence must be positive")
	}
	return (RouteDecisionCommit{
		ID:                 record.ID,
		MasterSessionID:    record.MasterSessionID,
		InputID:            record.InputID,
		RoutingAttempt:     record.RoutingAttempt,
		Context:            record.Context,
		ResolvedInvocation: record.ResolvedInvocation,
		Decision:           record.Decision,
		DecidedAt:          record.DecidedAt,
	}).Validate()
}

func (failure RouteFailure) Validate() error {
	if err := validateBoundedIdentifier("master route failure code", failure.Code, MaxRouteReferenceBytes); err != nil {
		return err
	}
	if err := validateRouteText("master route failure message", failure.Message, MaxRouteFailureMessageBytes); err != nil {
		return err
	}
	return validateBoundedIdentifier(
		"master route failure diagnostic reference",
		failure.DiagnosticReference,
		MaxRouteDiagnosticReference,
	)
}

func (failure InputRoutingFailure) Validate() error {
	if err := ValidateInputID(failure.InputID); err != nil {
		return err
	}
	if failure.RoutingAttempt <= 0 {
		return errors.New("master input routing failure attempt must be positive")
	}
	if err := failure.Failure.Validate(); err != nil {
		return err
	}
	failedAt, err := normalizeTimestamp("master input routing failedAt", failure.FailedAt)
	if err != nil || failedAt != failure.FailedAt {
		return errors.New("master input routing failedAt must be normalized")
	}
	return nil
}

func (recovery InputRoutingRecovery) Validate() error {
	if err := ValidateInputID(recovery.InputID); err != nil {
		return err
	}
	if recovery.RoutingAttempt <= 0 {
		return errors.New("master input routing recovery attempt must be positive")
	}
	recoveredAt, err := normalizeTimestamp("master input routing recoveredAt", recovery.RecoveredAt)
	if err != nil || recoveredAt != recovery.RecoveredAt {
		return errors.New("master input routing recoveredAt must be normalized")
	}
	return nil
}

func (work InputRoutingWork) Validate() error {
	if err := work.Input.Validate(); err != nil {
		return err
	}
	if work.RoutingAttempt <= 0 {
		return errors.New("master input routing work attempt must be positive")
	}
	startedAt, err := normalizeTimestamp("master input routing startedAt", work.RoutingStartedAt)
	if err != nil || startedAt != work.RoutingStartedAt {
		return errors.New("master input routing startedAt must be normalized")
	}
	started, _ := time.Parse(time.RFC3339Nano, startedAt)
	accepted, _ := time.Parse(time.RFC3339Nano, work.Input.AcceptedAt)
	if started.Before(accepted) {
		return errors.New("master input routing starts before input acceptance")
	}
	return nil
}

func (state InputRoutingState) Validate() error {
	if err := state.Input.Validate(); err != nil {
		return err
	}
	if state.RoutingAttempt < 0 {
		return errors.New("master input routing attempt must be non-negative")
	}
	switch state.Status {
	case InputRoutingStatusAccepted:
		return validateAcceptedInputRoutingState(state)
	case InputRoutingStatusRouting:
		return validateActiveInputRoutingState(state)
	case InputRoutingStatusDecided:
		return validateDecidedInputRoutingState(state)
	case InputRoutingStatusFailed:
		return validateFailedInputRoutingState(state)
	default:
		return fmt.Errorf("unsupported master input routing status %q", state.Status)
	}
}

func validateAcceptedInputRoutingState(state InputRoutingState) error {
	if state.RoutingStartedAt != nil || state.Decision != nil || state.Failure != nil {
		return errors.New("accepted master input routing state contains terminal or active state")
	}
	return nil
}

func validateActiveInputRoutingState(state InputRoutingState) error {
	if state.RoutingAttempt <= 0 || state.RoutingStartedAt == nil || state.Decision != nil || state.Failure != nil {
		return errors.New("routing master input state is incomplete")
	}
	_, err := normalizeTimestamp("master input routing startedAt", *state.RoutingStartedAt)
	return err
}

func validateDecidedInputRoutingState(state InputRoutingState) error {
	if state.RoutingStartedAt != nil || state.Decision == nil || state.Failure != nil {
		return errors.New("decided master input routing state is incomplete")
	}
	if err := state.Decision.Validate(); err != nil {
		return err
	}
	if state.Decision.InputID != state.Input.Input.ID ||
		state.Decision.RoutingAttempt != state.RoutingAttempt {
		return errors.New("decided master input routing state references another input attempt")
	}
	return nil
}

func validateFailedInputRoutingState(state InputRoutingState) error {
	if state.RoutingAttempt <= 0 || state.RoutingStartedAt != nil || state.Decision != nil || state.Failure == nil {
		return errors.New("failed master input routing state is incomplete")
	}
	return state.Failure.Validate()
}

func (audit RouteContextAudit) ValidateDecision(decision RouteDecision) error {
	if err := decision.Validate(); err != nil {
		return err
	}
	kind, conversationID, workspaceID, forkTurnID := decisionAuthorityReferences(decision)
	switch kind {
	case RouteDecisionKindClarify, RouteDecisionKindAnswerGlobal:
		return nil
	case RouteDecisionKindCreateConversation:
		if !slices.Contains(audit.ActiveWorkspaceIDs, workspaceID) {
			return fmt.Errorf("master route create workspace %s is not active", workspaceID)
		}
		return nil
	}
	for _, authority := range audit.TargetAuthorities {
		if authority.ConversationID != conversationID {
			continue
		}
		if !slices.Contains(authority.AllowedDecisionKinds, kind) {
			return fmt.Errorf("master route target %s does not allow %s", conversationID, kind)
		}
		if kind == RouteDecisionKindForkConversation &&
			!slices.Contains(authority.CompletedForkTurnIDs, forkTurnID) {
			return fmt.Errorf("master route fork point %s is unavailable for %s", forkTurnID, conversationID)
		}
		return nil
	}
	return fmt.Errorf("master route target %s was not supplied by authoritative context", conversationID)
}

func decisionAuthorityReferences(decision RouteDecision) (RouteDecisionKind, string, string, string) {
	switch decision.Kind {
	case RouteDecisionKindSendToAgent:
		return decision.Kind, decision.SendToAgent.ConversationID, "", ""
	case RouteDecisionKindQueueAgentTurn:
		return decision.Kind, decision.QueueAgentTurn.ConversationID, "", ""
	case RouteDecisionKindSteerActiveTurn:
		return decision.Kind, decision.SteerActiveTurn.ConversationID, "", ""
	case RouteDecisionKindAskNarrator:
		return decision.Kind, decision.AskNarrator.ConversationID, "", ""
	case RouteDecisionKindFocusConversation:
		return decision.Kind, decision.FocusConversation.ConversationID, "", ""
	case RouteDecisionKindCreateConversation:
		return decision.Kind, "", decision.CreateConversation.WorkspaceID, ""
	case RouteDecisionKindCreateSideConversation:
		return decision.Kind, decision.CreateSideConversation.ParentConversationID, "", ""
	case RouteDecisionKindForkConversation:
		return decision.Kind, decision.ForkConversation.ParentConversationID, "", decision.ForkConversation.ForkedAtTurnID
	default:
		return decision.Kind, "", "", ""
	}
}

func validateRouteConversationInput(conversationID string, input string) error {
	if err := validateRouteReference("master route conversation id", conversationID); err != nil {
		return err
	}
	return validateRouteText("master route authored input", input, MaxRouteAuthoredInputBytes)
}

func validateRouteReference(label string, value string) error {
	return validateBoundedIdentifier(label, value, MaxRouteReferenceBytes)
}

func validateRouteText(label string, value string, maximum int) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must be non-empty without surrounding whitespace", label)
	}
	if len(value) > maximum {
		return fmt.Errorf("%s exceeds %d bytes", label, maximum)
	}
	return nil
}

func validateUniqueRouteReferences(label string, values []string) error {
	seen := map[string]bool{}
	for _, value := range values {
		if err := validateRouteReference("master route "+label, value); err != nil {
			return err
		}
		if seen[value] {
			return fmt.Errorf("master route context repeats %s %s", label, value)
		}
		seen[value] = true
	}
	return nil
}

func validateUniqueRouteDecisionKinds(kinds []RouteDecisionKind) error {
	seen := map[RouteDecisionKind]bool{}
	for _, kind := range kinds {
		if !validRouteDecisionKind(kind) {
			return fmt.Errorf("unsupported master route decision kind %q", kind)
		}
		if kind == RouteDecisionKindCreateConversation || kind == RouteDecisionKindClarify ||
			kind == RouteDecisionKindAnswerGlobal {
			return fmt.Errorf("master route target authority cannot carry global decision kind %s", kind)
		}
		if seen[kind] {
			return fmt.Errorf("master route target authority repeats decision kind %s", kind)
		}
		seen[kind] = true
	}
	return nil
}
