package master

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestSessionServiceStartsOnceAndResumesSameDurableThreadAfterRestart(t *testing.T) {
	store := &recordingSessionStore{}
	roles := &recordingMasterRoleResolver{configuration: validTestRoleConfiguration()}
	threads := &recordingRestrictedThreadRuntime{}
	service := newTestSessionService(t, store, roles, threads)

	first, err := service.EnsureSession(context.Background())
	if err != nil {
		t.Fatalf("EnsureSession: %v", err)
	}
	assertStartedMasterSession(t, first, threads, roles)
	second, err := service.EnsureSession(context.Background())
	if err != nil {
		t.Fatalf("second EnsureSession: %v", err)
	}
	assertAttachedMasterSession(t, first, second, threads, roles)
	assertRestartedMasterSession(t, store, first)
}

func assertStartedMasterSession(
	t *testing.T,
	session Session,
	threads *recordingRestrictedThreadRuntime,
	roles *recordingMasterRoleResolver,
) {
	t.Helper()
	if session.Status != SessionStatusReady || session.ProviderThreadID == nil ||
		threads.startCalls != 1 || threads.resumeCalls != 0 || roles.calls != 1 {
		t.Fatalf("initial master session = %+v starts=%d resumes=%d roles=%d", session, threads.startCalls, threads.resumeCalls, roles.calls)
	}
}

func assertAttachedMasterSession(
	t *testing.T,
	first Session,
	second Session,
	threads *recordingRestrictedThreadRuntime,
	roles *recordingMasterRoleResolver,
) {
	t.Helper()
	if second.ID != first.ID || threads.startCalls != 1 || threads.resumeCalls != 0 || roles.calls != 1 {
		t.Fatalf("attached master session restarted: %+v starts=%d resumes=%d roles=%d", second, threads.startCalls, threads.resumeCalls, roles.calls)
	}
}

func assertRestartedMasterSession(t *testing.T, store *recordingSessionStore, first Session) {
	t.Helper()
	restartedRoles := &recordingMasterRoleResolver{err: errors.New("new role resolution must not replace an existing thread")}
	restartedThreads := &recordingRestrictedThreadRuntime{}
	restarted := newTestSessionService(t, store, restartedRoles, restartedThreads)
	restored, err := restarted.EnsureSession(context.Background())
	if err != nil {
		t.Fatalf("restart EnsureSession: %v", err)
	}
	if restored.ID != first.ID || restored.ProviderThreadID == nil ||
		*restored.ProviderThreadID != *first.ProviderThreadID || restartedThreads.resumeCalls != 1 ||
		restartedThreads.startCalls != 0 || restartedRoles.calls != 0 {
		t.Fatalf("restored master session = %+v starts=%d resumes=%d roles=%d", restored, restartedThreads.startCalls, restartedThreads.resumeCalls, restartedRoles.calls)
	}
	if restartedThreads.lastRequest.Invocation.Model != "gpt-master-test" ||
		restartedThreads.lastRequest.Invocation.PermissionMode != agent.PermissionModeReadOnly ||
		restartedThreads.lastRequest.Invocation.ApprovalMode != agent.ApprovalModeNever {
		t.Fatalf("resumed restricted request = %+v", restartedThreads.lastRequest)
	}
}

func TestSessionServicePersistsDegradationAndRetriesFreshConfiguration(t *testing.T) {
	store := &recordingSessionStore{}
	roles := &recordingMasterRoleResolver{configuration: validTestRoleConfiguration()}
	startFailure := errors.New("provider unavailable")
	threads := &recordingRestrictedThreadRuntime{startErr: startFailure}
	service := newTestSessionService(t, store, roles, threads)

	if _, err := service.EnsureSession(context.Background()); !errors.Is(err, startFailure) {
		t.Fatalf("start failure = %v, want provider error", err)
	}
	degraded, found, err := store.ReadMasterSession(context.Background())
	if err != nil || !found || degraded.Status != SessionStatusDegraded ||
		degraded.Degradation == nil || degraded.ProviderThreadID != nil {
		t.Fatalf("degraded session = %+v found=%t err=%v", degraded, found, err)
	}

	threads.startErr = nil
	retried, err := service.EnsureSession(context.Background())
	if err != nil {
		t.Fatalf("retry EnsureSession: %v", err)
	}
	if retried.Status != SessionStatusReady || retried.ProviderThreadID == nil ||
		threads.startCalls != 2 || roles.calls != 2 {
		t.Fatalf("retried session = %+v starts=%d roles=%d", retried, threads.startCalls, roles.calls)
	}
}

func TestSessionServiceRetainsProviderBindingWhenResumeDegrades(t *testing.T) {
	store := &recordingSessionStore{}
	roles := &recordingMasterRoleResolver{configuration: validTestRoleConfiguration()}
	service := newTestSessionService(t, store, roles, &recordingRestrictedThreadRuntime{})
	started, err := service.EnsureSession(context.Background())
	if err != nil {
		t.Fatalf("start session: %v", err)
	}

	resumeFailure := errors.New("provider thread missing")
	restartedThreads := &recordingRestrictedThreadRuntime{resumeErr: resumeFailure}
	restarted := newTestSessionService(t, store, &recordingMasterRoleResolver{}, restartedThreads)
	if _, err := restarted.EnsureSession(context.Background()); !errors.Is(err, resumeFailure) {
		t.Fatalf("resume failure = %v, want provider error", err)
	}
	degraded, found, err := store.ReadMasterSession(context.Background())
	if err != nil || !found || degraded.Status != SessionStatusDegraded ||
		degraded.ProviderThreadID == nil || *degraded.ProviderThreadID != *started.ProviderThreadID {
		t.Fatalf("resume degradation = %+v found=%t err=%v", degraded, found, err)
	}
}

func TestSessionServiceSerializesConcurrentEnsureCalls(t *testing.T) {
	store := &recordingSessionStore{}
	roles := &recordingMasterRoleResolver{configuration: validTestRoleConfiguration()}
	threads := &recordingRestrictedThreadRuntime{}
	service := newTestSessionService(t, store, roles, threads)

	const callers = 12
	errorsFound := make(chan error, callers)
	var calls sync.WaitGroup
	for range callers {
		calls.Add(1)
		go func() {
			defer calls.Done()
			_, err := service.EnsureSession(context.Background())
			errorsFound <- err
		}()
	}
	calls.Wait()
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Errorf("EnsureSession: %v", err)
		}
	}
	if threads.startCalls != 1 || threads.resumeCalls != 0 || roles.calls != 1 {
		t.Fatalf("concurrent ensures starts=%d resumes=%d roles=%d", threads.startCalls, threads.resumeCalls, roles.calls)
	}
}

func newTestSessionService(
	t *testing.T,
	store SessionStore,
	roles RoleConfigurationResolver,
	threads RestrictedThreadRuntime,
) *SessionService {
	t.Helper()
	sequence := 0
	service, err := newSessionService(
		store,
		roles,
		threads,
		t.TempDir(),
		func(prefix string) (string, error) {
			sequence++
			return prefix + "-test-" + time.Unix(int64(sequence), 0).UTC().Format("150405"), nil
		},
		func() time.Time { return time.Date(2026, 7, 13, 18, 0, 0, 0, time.UTC) },
	)
	if err != nil {
		t.Fatalf("newSessionService: %v", err)
	}
	return service
}

type recordingSessionStore struct {
	mu      sync.Mutex
	session Session
	found   bool
}

func (store *recordingSessionStore) ReadMasterSession(context.Context) (Session, bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return CloneSession(store.session), store.found, nil
}

func (store *recordingSessionStore) CreateMasterSession(
	_ context.Context,
	candidate Session,
) (Session, bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.found {
		return CloneSession(store.session), false, nil
	}
	store.session = CloneSession(candidate)
	store.found = true
	return CloneSession(candidate), true, nil
}

func (store *recordingSessionStore) UpdateMasterSession(
	_ context.Context,
	expectedUpdatedAt string,
	next Session,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if !store.found || store.session.ID != next.ID || store.session.UpdatedAt != expectedUpdatedAt {
		return &SessionConflictError{SessionID: next.ID, Reason: "test version mismatch"}
	}
	store.session = CloneSession(next)
	return nil
}

type recordingMasterRoleResolver struct {
	configuration RoleConfiguration
	err           error
	calls         int
}

func (resolver *recordingMasterRoleResolver) ResolveMasterRoleConfiguration(
	context.Context,
) (RoleConfiguration, error) {
	resolver.calls++
	if resolver.err != nil {
		return RoleConfiguration{}, resolver.err
	}
	configuration := resolver.configuration
	configuration.RequestedProfile = append([]byte{}, configuration.RequestedProfile...)
	return configuration, nil
}

type recordingRestrictedThreadRuntime struct {
	startErr    error
	resumeErr   error
	startCalls  int
	resumeCalls int
	lastRequest agent.RestrictedThreadRequest
}

func (runtime *recordingRestrictedThreadRuntime) StartRestrictedThread(
	_ context.Context,
	request agent.RestrictedThreadRequest,
) (agent.Thread, error) {
	runtime.startCalls++
	runtime.lastRequest = request
	if runtime.startErr != nil {
		return agent.Thread{}, runtime.startErr
	}
	return agent.Thread{ID: "master-provider-thread", CWD: request.WorkspaceRoot, Model: request.Invocation.Model}, nil
}

func (runtime *recordingRestrictedThreadRuntime) ResumeRestrictedThread(
	_ context.Context,
	threadID string,
	request agent.RestrictedThreadRequest,
) (agent.Thread, error) {
	runtime.resumeCalls++
	runtime.lastRequest = request
	if runtime.resumeErr != nil {
		return agent.Thread{}, runtime.resumeErr
	}
	return agent.Thread{ID: threadID, CWD: request.WorkspaceRoot, Model: request.Invocation.Model}, nil
}

func (*recordingRestrictedThreadRuntime) UnsubscribeThread(context.Context, string) error {
	return nil
}
