package master

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"setta/internal/agent"
)

const masterDeveloperInstructionsBase = `You are Setta's app-global master router.

Use only application state and strict Setta capabilities supplied by the caller. Never inspect the filesystem, run shell commands, mutate a workspace, request approval, or use unrelated endpoints. You cannot execute effects directly; you only classify user intent into typed decision data for Setta.

The typed decision describes requested intent and does not itself perform or propose an application action. Return only the constrained response requested for the current turn; Setta separately validates the data and controls every effect.`

var masterDeveloperInstructions = masterDeveloperInstructionsBase + "\n\n" + routeInstructions()

const masterThreadCleanupTimeout = 5 * time.Second

type SessionStore interface {
	ReadMasterSession(context.Context) (Session, bool, error)
	CreateMasterSession(context.Context, Session) (Session, bool, error)
	UpdateMasterSession(context.Context, string, Session) error
}

type RoleConfigurationResolver interface {
	ResolveMasterRoleConfiguration(context.Context) (RoleConfiguration, error)
}

type RestrictedThreadRuntime interface {
	StartRestrictedThread(context.Context, agent.RestrictedThreadRequest) (agent.Thread, error)
	ResumeRestrictedThread(context.Context, string, agent.RestrictedThreadRequest) (agent.Thread, error)
	RunRestrictedStructuredTurn(
		context.Context,
		agent.RestrictedStructuredTurnRequest,
	) (agent.RestrictedStructuredTurnResult, error)
	UnsubscribeThread(context.Context, string) error
}

type StructuredSessionTurnRequest struct {
	ID           string
	Input        json.RawMessage
	OutputSchema json.RawMessage
}

type StructuredSessionTurnResult struct {
	Session          Session
	ProviderThreadID string
	ProviderTurnID   string
	Output           json.RawMessage
}

type SessionService struct {
	store            SessionStore
	roles            RoleConfigurationResolver
	threads          RestrictedThreadRuntime
	workspaceRoot    string
	newID            func(string) (string, error)
	now              func() time.Time
	attachedThreadID string
	mu               sync.Mutex
}

func NewSessionService(
	store SessionStore,
	roles RoleConfigurationResolver,
	threads RestrictedThreadRuntime,
	workspaceRoot string,
) (*SessionService, error) {
	return newSessionService(store, roles, threads, workspaceRoot, randomSessionID, time.Now)
}

func newSessionService(
	store SessionStore,
	roles RoleConfigurationResolver,
	threads RestrictedThreadRuntime,
	workspaceRoot string,
	newID func(string) (string, error),
	now func() time.Time,
) (*SessionService, error) {
	if store == nil || roles == nil || threads == nil {
		return nil, errors.New("master session service requires store, role resolver, and restricted thread runtime")
	}
	if workspaceRoot == "" || !filepath.IsAbs(workspaceRoot) {
		return nil, fmt.Errorf("master session workspace root must be absolute: %s", workspaceRoot)
	}
	if newID == nil || now == nil {
		return nil, errors.New("master session service requires id and clock sources")
	}
	return &SessionService{
		store:         store,
		roles:         roles,
		threads:       threads,
		workspaceRoot: filepath.Clean(workspaceRoot),
		newID:         newID,
		now:           now,
	}, nil
}

func (service *SessionService) EnsureSession(ctx context.Context) (Session, error) {
	if err := validateSessionServiceRequest(service, ctx); err != nil {
		return Session{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.ensureSessionLocked(ctx)
}

func (service *SessionService) ensureSessionLocked(ctx context.Context) (Session, error) {
	existing, found, err := service.store.ReadMasterSession(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("read durable master session: %w", err)
	}
	if !found {
		return service.createAndStartSession(ctx)
	}
	if existing.ProviderThreadID == nil {
		return service.retrySessionStart(ctx, existing)
	}
	if service.sessionIsAttached(existing) {
		return CloneSession(existing), nil
	}
	return service.resumeSession(ctx, existing)
}

func (service *SessionService) RunStructuredTurn(
	ctx context.Context,
	request StructuredSessionTurnRequest,
) (StructuredSessionTurnResult, error) {
	if err := validateSessionServiceRequest(service, ctx); err != nil {
		return StructuredSessionTurnResult{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	session, err := service.ensureSessionLocked(ctx)
	if err != nil {
		return StructuredSessionTurnResult{}, err
	}
	if session.ProviderThreadID == nil {
		return StructuredSessionTurnResult{}, errors.New("master structured turn requires a provider thread")
	}
	invocation, err := session.Configuration.PinnedInvocation()
	if err != nil {
		return StructuredSessionTurnResult{}, err
	}
	providerRequest := agent.RestrictedStructuredTurnRequest{
		ID:               request.ID,
		ProviderThreadID: *session.ProviderThreadID,
		WorkspaceRoot:    service.workspaceRoot,
		Invocation:       invocation,
		Input:            append(json.RawMessage{}, request.Input...),
		OutputSchema:     append(json.RawMessage{}, request.OutputSchema...),
	}
	if err := providerRequest.Validate(); err != nil {
		return StructuredSessionTurnResult{}, fmt.Errorf("validate master structured turn: %w", err)
	}
	running, err := service.transitionSessionStatus(ctx, session, SessionStatusRunning)
	if err != nil {
		return StructuredSessionTurnResult{}, err
	}
	providerResult, err := service.threads.RunRestrictedStructuredTurn(ctx, providerRequest)
	if err != nil {
		finalizeCtx, cancel := context.WithTimeout(context.Background(), masterThreadCleanupTimeout)
		defer cancel()
		return StructuredSessionTurnResult{}, service.degradeSession(
			finalizeCtx,
			running,
			"master_route_turn_failed",
			err,
		)
	}
	finalizeCtx, cancel := context.WithTimeout(context.Background(), masterThreadCleanupTimeout)
	defer cancel()
	ready, err := service.transitionSessionStatus(finalizeCtx, running, SessionStatusReady)
	if err != nil {
		return StructuredSessionTurnResult{}, err
	}
	return StructuredSessionTurnResult{
		Session:          ready,
		ProviderThreadID: providerResult.ProviderThreadID,
		ProviderTurnID:   providerResult.ProviderTurnID,
		Output:           append(json.RawMessage{}, providerResult.Output...),
	}, nil
}

func (service *SessionService) transitionSessionStatus(
	ctx context.Context,
	session Session,
	status SessionStatus,
) (Session, error) {
	previousUpdatedAt := session.UpdatedAt
	session.Status = status
	session.Degradation = nil
	session.UpdatedAt = service.timestampAfter(previousUpdatedAt)
	if err := service.store.UpdateMasterSession(ctx, previousUpdatedAt, session); err != nil {
		return Session{}, fmt.Errorf("set master session %s: %w", status, err)
	}
	return CloneSession(session), nil
}

func validateSessionServiceRequest(service *SessionService, ctx context.Context) error {
	if service == nil {
		return errors.New("master session service is unavailable")
	}
	if service.store == nil || service.roles == nil || service.threads == nil ||
		service.newID == nil || service.now == nil {
		return errors.New("master session service is unavailable")
	}
	if ctx == nil {
		return errors.New("master session context is required")
	}
	return nil
}

func (service *SessionService) sessionIsAttached(session Session) bool {
	return *session.ProviderThreadID == service.attachedThreadID &&
		(session.Status == SessionStatusReady || session.Status == SessionStatusRunning)
}

func (service *SessionService) ReadSession(ctx context.Context) (Session, bool, error) {
	if service == nil || service.store == nil {
		return Session{}, false, errors.New("master session service is unavailable")
	}
	if ctx == nil {
		return Session{}, false, errors.New("master session context is required")
	}
	return service.store.ReadMasterSession(ctx)
}

func (service *SessionService) createAndStartSession(ctx context.Context) (Session, error) {
	configuration, err := service.roles.ResolveMasterRoleConfiguration(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("resolve master role configuration: %w", err)
	}
	if err := configuration.Validate(); err != nil {
		return Session{}, fmt.Errorf("resolved master role configuration is invalid: %w", err)
	}
	sessionID, err := service.newID("master_session")
	if err != nil {
		return Session{}, err
	}
	now := service.timestamp()
	candidate := Session{
		ID:             sessionID,
		Provider:       "codex",
		Status:         SessionStatusInitializing,
		Configuration:  configuration,
		DurableContext: []byte(`{}`),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	created, didCreate, err := service.store.CreateMasterSession(ctx, candidate)
	if err != nil {
		return Session{}, fmt.Errorf("create durable master session: %w", err)
	}
	if !didCreate {
		if created.ProviderThreadID != nil {
			return service.resumeSession(ctx, created)
		}
		return service.retrySessionStart(ctx, created)
	}
	return service.startSession(ctx, created)
}

func (service *SessionService) retrySessionStart(ctx context.Context, session Session) (Session, error) {
	configuration, err := service.roles.ResolveMasterRoleConfiguration(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("resolve master role configuration for retry: %w", err)
	}
	if err := configuration.Validate(); err != nil {
		return Session{}, fmt.Errorf("retried master role configuration is invalid: %w", err)
	}
	previousUpdatedAt := session.UpdatedAt
	session.Status = SessionStatusInitializing
	session.Configuration = configuration
	session.ProviderThreadID = nil
	session.Degradation = nil
	session.UpdatedAt = service.timestampAfter(previousUpdatedAt)
	if err := service.store.UpdateMasterSession(ctx, previousUpdatedAt, session); err != nil {
		return Session{}, fmt.Errorf("prepare durable master session retry: %w", err)
	}
	return service.startSession(ctx, session)
}

func (service *SessionService) startSession(ctx context.Context, session Session) (Session, error) {
	request, err := service.threadRequest(session.Configuration)
	if err != nil {
		return Session{}, err
	}
	thread, err := service.threads.StartRestrictedThread(ctx, request)
	if err != nil {
		return Session{}, service.degradeSession(ctx, session, "master_thread_start_failed", err)
	}
	previousUpdatedAt := session.UpdatedAt
	session.ProviderThreadID = cloneString(&thread.ID)
	session.Status = SessionStatusReady
	session.Degradation = nil
	session.UpdatedAt = service.timestampAfter(previousUpdatedAt)
	if err := service.store.UpdateMasterSession(ctx, previousUpdatedAt, session); err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), masterThreadCleanupTimeout)
		defer cancel()
		cleanupErr := service.threads.UnsubscribeThread(cleanupCtx, thread.ID)
		return Session{}, errors.Join(
			fmt.Errorf("activate durable master session: %w", err),
			wrapOptionalError(cleanupErr, "unsubscribe uncommitted master thread %s", thread.ID),
		)
	}
	service.attachedThreadID = thread.ID
	return CloneSession(session), nil
}

func (service *SessionService) resumeSession(ctx context.Context, session Session) (Session, error) {
	request, err := service.threadRequest(session.Configuration)
	if err != nil {
		return Session{}, err
	}
	threadID := *session.ProviderThreadID
	thread, err := service.threads.ResumeRestrictedThread(ctx, threadID, request)
	if err != nil {
		return Session{}, service.degradeSession(ctx, session, "master_thread_resume_failed", err)
	}
	if thread.ID != threadID {
		return Session{}, service.degradeSession(
			ctx,
			session,
			"master_thread_resume_failed",
			fmt.Errorf("resumed master thread is %s, want %s", thread.ID, threadID),
		)
	}
	previousUpdatedAt := session.UpdatedAt
	if session.Status != SessionStatusRunning {
		session.Status = SessionStatusReady
	}
	session.Degradation = nil
	session.UpdatedAt = service.timestampAfter(previousUpdatedAt)
	if err := service.store.UpdateMasterSession(ctx, previousUpdatedAt, session); err != nil {
		return Session{}, fmt.Errorf("commit resumed master session: %w", err)
	}
	service.attachedThreadID = thread.ID
	return CloneSession(session), nil
}

func (service *SessionService) degradeSession(
	ctx context.Context,
	session Session,
	code string,
	cause error,
) error {
	diagnosticID, idErr := service.newID("master_diagnostic")
	if idErr != nil {
		return errors.Join(cause, idErr)
	}
	previousUpdatedAt := session.UpdatedAt
	degradedAt := service.timestampAfter(previousUpdatedAt)
	session.Status = SessionStatusDegraded
	session.Degradation = &SessionDegradation{
		Code:                code,
		DiagnosticReference: diagnosticID,
		OccurredAt:          degradedAt,
	}
	session.UpdatedAt = degradedAt
	if err := service.store.UpdateMasterSession(ctx, previousUpdatedAt, session); err != nil {
		return errors.Join(cause, fmt.Errorf("persist degraded master session: %w", err))
	}
	return fmt.Errorf("%s (%s): %w", code, diagnosticID, cause)
}

func (service *SessionService) threadRequest(
	configuration RoleConfiguration,
) (agent.RestrictedThreadRequest, error) {
	invocation, err := configuration.PinnedInvocation()
	if err != nil {
		return agent.RestrictedThreadRequest{}, fmt.Errorf("pin master provider invocation: %w", err)
	}
	return agent.RestrictedThreadRequest{
		WorkspaceRoot:         service.workspaceRoot,
		Invocation:            invocation,
		DeveloperInstructions: masterDeveloperInstructions,
	}, nil
}

func (service *SessionService) timestamp() string {
	return service.now().UTC().Format(time.RFC3339Nano)
}

func (service *SessionService) timestampAfter(previous string) string {
	candidate := service.timestamp()
	previousTime, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return candidate
	}
	candidateTime, err := time.Parse(time.RFC3339Nano, candidate)
	if err == nil && candidateTime.After(previousTime) {
		return candidate
	}
	return previousTime.Add(time.Nanosecond).UTC().Format(time.RFC3339Nano)
}

func randomSessionID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}

func wrapOptionalError(err error, format string, args ...any) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf(format+": %w", append(args, err)...)
}
