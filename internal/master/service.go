package master

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/conversationindex"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

const (
	masterCandidateLimit = 12
	masterHistoryLimit   = 50
)

type TopicIndex interface {
	Search(context.Context, conversationindex.SearchRequest) ([]conversationindex.TopicCandidate, error)
	List(context.Context, conversationindex.ListRequest) (conversationindex.TopicCardPage, error)
}

type ConversationCommands interface {
	Create(context.Context, conversation.CreateConversationRequest) (conversation.ConversationSnapshot, error)
	Send(context.Context, conversation.SendConversationInputRequest) (conversation.ConversationSnapshot, error)
	ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error)
	Fork(context.Context, conversation.ForkConversationRequest) (conversation.ConversationSnapshot, error)
	CreateSide(context.Context, conversation.CreateSideConversationRequest) (conversation.SideConversation, error)
}

type Narrator interface {
	RequestStatus(context.Context, string, string) (conversation.NarrationEvent, error)
}

type Config struct {
	Store         *conversation.Store
	Index         TopicIndex
	Conversations ConversationCommands
	Narrator      Narrator
	Workspaces    MasterWorkspaceCatalog
	Caller        ModelCaller
	RuntimeRoot   string
	Now           func() time.Time
	NewID         func(string) (string, error)
}

type MasterWorkspaceCatalog interface {
	Session() workspacesession.WorkspaceSession
	ResolveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	store         *conversation.Store
	index         TopicIndex
	conversations ConversationCommands
	narrator      Narrator
	workspaces    MasterWorkspaceCatalog
	caller        ModelCaller
	runtimeRoot   string
	now           func() time.Time
	newID         func(string) (string, error)

	submitMu sync.Mutex
	cancelMu sync.Mutex
	cancel   context.CancelFunc
}

type SubmissionResult struct {
	Interaction Interaction          `json:"interaction"`
	Intents     []PresentationIntent `json:"intents"`
}

func NewService(config Config) (*Service, error) {
	if config.Store == nil || config.Index == nil || config.Conversations == nil || config.Narrator == nil || config.Workspaces == nil || config.Caller == nil {
		return nil, errors.New("master store, index, conversation, narrator, workspace, and caller services are required")
	}
	if !filepath.IsAbs(config.RuntimeRoot) {
		return nil, errors.New("master runtime root must be absolute")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	newID := config.NewID
	if newID == nil {
		newID = randomID
	}
	return &Service{
		store: config.Store, index: config.Index, conversations: config.Conversations,
		narrator: config.Narrator, workspaces: config.Workspaces, caller: config.Caller,
		runtimeRoot: filepath.Clean(config.RuntimeRoot), now: now, newID: newID,
	}, nil
}

func (service *Service) Submit(ctx context.Context, input Input) (SubmissionResult, error) {
	if err := input.Validate(); err != nil {
		return SubmissionResult{}, err
	}
	service.submitMu.Lock()
	defer service.submitMu.Unlock()
	if err := service.validateHints(ctx, input); err != nil {
		return SubmissionResult{}, err
	}
	session, err := service.store.ReadMasterSession(ctx)
	if err != nil {
		return SubmissionResult{}, err
	}
	sessionID, err := service.sessionID(session)
	if err != nil {
		return SubmissionResult{}, err
	}
	candidates, err := service.retrieveCandidates(ctx, input)
	if err != nil {
		return SubmissionResult{}, err
	}
	candidateContext, err := service.candidateContext(ctx, input, session, candidates)
	if err != nil {
		return SubmissionResult{}, err
	}
	prompt, schema, err := routePrompt(input, candidateContext)
	if err != nil {
		return SubmissionResult{}, err
	}
	profile, err := service.store.ResolveRoleProfile(ctx, conversation.RoleMaster, "", "")
	if err != nil {
		return SubmissionResult{}, err
	}
	callID, err := service.newID("master_call")
	if err != nil {
		return SubmissionResult{}, err
	}
	startedAt := service.timestamp()
	providerThreadID := sessionThreadID(session)
	callContext, cancel := context.WithCancel(ctx)
	service.setCancel(cancel)
	callResult, err := service.caller.Call(callContext, ModelCallRequest{
		CallID: callID, SessionID: sessionID, ProviderThreadID: providerThreadID,
		RuntimeRoot: service.runtimeRoot, Profile: profile, Prompt: prompt, OutputSchema: schema,
	})
	cancel()
	service.clearCancel()
	endedAt := service.timestampAfter(startedAt)
	if err != nil {
		service.persistMasterDegradation(ctx, session, sessionID, callID, err, startedAt, endedAt)
		return SubmissionResult{}, err
	}
	decision, err := decodeRouteDecision(callResult.Text)
	if err != nil {
		return SubmissionResult{}, err
	}
	if err := service.validateDecisionPolicy(ctx, input, candidates, decision); err != nil {
		return SubmissionResult{}, err
	}
	invocation := masterInvocation(callID, profile, callResult, prompt, startedAt, endedAt)
	command, intents, actionErr := service.executeDecision(ctx, input, decision)
	interaction, persistErr := service.persistInteraction(ctx, persistInteractionRequest{
		PriorSession: session, SessionID: sessionID, Input: input,
		Candidates: candidates, CandidateContext: candidateContext, Decision: decision,
		Command: command, Intents: intents, Invocation: invocation, ActionError: actionErr,
		ProviderThreadID: callResult.ProviderThreadID,
	})
	if persistErr != nil {
		return SubmissionResult{}, errors.Join(actionErr, persistErr)
	}
	if actionErr != nil {
		return SubmissionResult{Interaction: interaction, Intents: intents}, actionErr
	}
	return SubmissionResult{Interaction: interaction, Intents: intents}, nil
}

func (service *Service) Cancel() error {
	service.cancelMu.Lock()
	defer service.cancelMu.Unlock()
	if service.cancel == nil {
		return errors.New("master has no active operation")
	}
	service.cancel()
	service.cancel = nil
	return nil
}

func (service *Service) setCancel(cancel context.CancelFunc) {
	service.cancelMu.Lock()
	service.cancel = cancel
	service.cancelMu.Unlock()
}

func (service *Service) clearCancel() {
	service.cancelMu.Lock()
	service.cancel = nil
	service.cancelMu.Unlock()
}

func (service *Service) ReadState(ctx context.Context) (State, error) {
	sessionRecord, err := service.store.ReadMasterSession(ctx)
	if err != nil {
		return State{}, err
	}
	state := State{SchemaVersion: MasterContractSchemaVersion, Interactions: []Interaction{}}
	if sessionRecord == nil {
		return state, nil
	}
	session := publicSession(*sessionRecord)
	state.Session = &session
	records, err := service.store.ListMasterRouteDecisions(ctx, session.ID, masterHistoryLimit)
	if err != nil {
		return State{}, err
	}
	for _, record := range records {
		interaction, err := interactionFromRecord(record)
		if err != nil {
			return State{}, err
		}
		state.Interactions = append(state.Interactions, interaction)
	}
	state.EventCursor, err = service.store.ReadCommittedStreamCursor(ctx, masterStreamID(session.ID))
	return state, err
}

func (service *Service) retrieveCandidates(ctx context.Context, input Input) ([]conversationindex.TopicCandidate, error) {
	matches, err := service.index.Search(ctx, conversationindex.SearchRequest{Query: input.Text, Limit: masterCandidateLimit})
	if err != nil {
		return nil, err
	}
	if len(matches) > 0 {
		return matches, nil
	}
	page, err := service.index.List(ctx, conversationindex.ListRequest{Limit: masterCandidateLimit})
	if err != nil {
		return nil, err
	}
	recent := make([]conversationindex.TopicCandidate, 0, len(page.Cards))
	for index, card := range page.Cards {
		recent = append(recent, conversationindex.TopicCandidate{Card: card, RecencyRank: index + 1})
	}
	return recent, nil
}

func (service *Service) candidateContext(ctx context.Context, input Input, session *conversation.MasterSessionRecord, candidates []conversationindex.TopicCandidate) (CandidateContext, error) {
	summaries := []RecentDecisionSummary{}
	if session != nil {
		records, err := service.store.ListMasterRouteDecisions(ctx, session.ID, 8)
		if err != nil {
			return CandidateContext{}, err
		}
		for _, record := range records {
			decision, err := decodeRouteDecision(string(record.RouteDecision))
			if err != nil {
				return CandidateContext{}, err
			}
			summaries = append(summaries, RecentDecisionSummary{
				InputText: record.InputText, DecisionType: decision.routeDecisionType(), CreatedAt: record.CreatedAt,
			})
		}
	}
	workspaces := service.workspaces.Session().ActiveWorkspaces
	return CandidateContext{
		Workspaces: workspaces, Candidates: candidates,
		FocusedWorkspaceID:    cloneString(input.FocusedWorkspaceID),
		FocusedConversationID: cloneString(input.FocusedConversationID),
		FocusedPaneID:         cloneString(input.FocusedPaneID), RecentDecisionSummaries: summaries,
	}, nil
}

func (service *Service) validateHints(ctx context.Context, input Input) error {
	if input.FocusedWorkspaceID != nil {
		if _, err := service.workspaces.ResolveWorkspace(*input.FocusedWorkspaceID); err != nil {
			return err
		}
	}
	if input.FocusedConversationID == nil {
		return nil
	}
	record, err := service.store.ReadConversation(ctx, *input.FocusedConversationID)
	if err != nil {
		return err
	}
	if input.FocusedWorkspaceID != nil && record.WorkspaceID != *input.FocusedWorkspaceID {
		return errors.New("focused conversation does not belong to the focused workspace")
	}
	return nil
}

func (service *Service) sessionID(session *conversation.MasterSessionRecord) (string, error) {
	if session != nil {
		return session.ID, nil
	}
	return service.newID("master_session")
}

func sessionThreadID(session *conversation.MasterSessionRecord) *string {
	if session == nil {
		return nil
	}
	return cloneString(session.ProviderThreadID)
}

func masterInvocation(id string, profile conversation.RoleProfile, result ModelCallResult, prompt string, startedAt string, endedAt string) conversation.ResolvedInvocation {
	return conversation.ResolvedInvocation{
		ID: id, Role: conversation.RoleMaster, Provider: conversation.ProviderCodex,
		Requested: profile,
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID: result.ResolvedInvocation.Model, ReasoningEffort: result.ResolvedInvocation.ReasoningEffort,
			ServiceTier: cloneString(result.ResolvedInvocation.ServiceTier), PermissionProfile: profile.PermissionProfile,
		},
		ContextUsage: conversation.InvocationContextUsage{
			InputBytes: len(prompt), EstimatedInputTokens: len(prompt) / 4,
			OutputBytes: len(result.Text), EstimatedOutputTokens: len(result.Text) / 4,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID: stringPointer(result.ProviderThreadID), TurnID: stringPointer(result.ProviderTurnID),
		},
		ModelReroutes: []conversation.InvocationModelReroute{}, StartedAt: startedAt,
		EndedAt: &endedAt, Outcome: conversation.InvocationOutcomeSucceeded,
	}
}

func (service *Service) timestamp() string {
	return service.now().UTC().Format(time.RFC3339Nano)
}

func (service *Service) timestampAfter(previous string) string {
	candidate := service.timestamp()
	prior, priorErr := time.Parse(time.RFC3339Nano, previous)
	next, nextErr := time.Parse(time.RFC3339Nano, candidate)
	if priorErr == nil && (nextErr != nil || !next.After(prior)) {
		return prior.Add(time.Nanosecond).Format(time.RFC3339Nano)
	}
	return candidate
}

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func stringPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

var _ agent.EventSink = (*masterCallSink)(nil)
