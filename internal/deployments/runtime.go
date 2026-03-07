package deployments

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/projectstate"
)

var (
	ErrUnknownSession          = errors.New("deployment session was not found")
	ErrSessionConflict         = errors.New("deployment session already exists")
	ErrSessionGeneratorInvalid = errors.New("deployment session id generator returned a blank value")
	ErrRuntimeRequired         = errors.New("deployment runtime is required")
)

const DefaultSessionTTL = 30 * time.Minute

type Session struct {
	ID         string    `json:"id"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	RunCount   int       `json:"runCount"`
}

type RuntimeOptions struct {
	DeploymentRoot string
	RuntimeRoot    string
	IDGenerator    func() string
	Now            func() time.Time
	SessionTTL     time.Duration
}

type Runtime struct {
	paths    projectstate.DeploymentPathPolicy
	manifest Manifest
	policy   Policy
	base     *projectstate.Runtime
	overlays *projectstate.SessionOverlayRegistry

	idGenerator func() string
	now         func() time.Time
	sessionTTL  time.Duration

	mu       sync.Mutex
	sessions map[string]Session
}

func Open(ctx context.Context, opts RuntimeOptions) (*Runtime, error) {
	paths, err := projectstate.ResolveDeploymentPathPolicy(opts.DeploymentRoot, opts.RuntimeRoot)
	if err != nil {
		return nil, err
	}

	manifest, err := LoadManifest(paths.DeploymentRoot)
	if err != nil {
		return nil, err
	}
	policy, err := LoadPolicy(paths.DeploymentRoot)
	if err != nil {
		return nil, err
	}

	store, err := projectstate.NewStore(filepath.Join(paths.DeploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		return nil, fmt.Errorf("open deployment project store: %w", err)
	}
	document, err := store.Load(ctx)
	if err != nil {
		return nil, fmt.Errorf("load deployment project document: %w", err)
	}
	document, err = applyManifestDefaultProject(document, manifest)
	if err != nil {
		return nil, err
	}

	baseRuntime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		return nil, err
	}
	overlayRegistry, err := projectstate.OpenSessionOverlayRegistry(baseRuntime, projectstate.OverlayRegistryOptions{
		DeploymentRoot: paths.DeploymentRoot,
		RuntimeRoot:    paths.RuntimeRoot,
	})
	if err != nil {
		_ = baseRuntime.Close()
		return nil, err
	}

	idGenerator := opts.IDGenerator
	if idGenerator == nil {
		idGenerator = newRandomSessionID
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	sessionTTL := opts.SessionTTL
	if sessionTTL <= 0 {
		sessionTTL = DefaultSessionTTL
	}

	return &Runtime{
		paths:       paths,
		manifest:    manifest,
		policy:      policy,
		base:        baseRuntime,
		overlays:    overlayRegistry,
		idGenerator: idGenerator,
		now:         now,
		sessionTTL:  sessionTTL,
		sessions:    map[string]Session{},
	}, nil
}

func (r *Runtime) Close() error {
	if r == nil {
		return nil
	}
	return errors.Join(r.overlays.Close(), r.base.Close())
}

func (r *Runtime) Paths() projectstate.DeploymentPathPolicy {
	if r == nil {
		return projectstate.DeploymentPathPolicy{}
	}
	return r.paths
}

func (r *Runtime) Manifest() Manifest {
	if r == nil {
		return Manifest{}
	}
	return r.manifest
}

func (r *Runtime) Policy() Policy {
	if r == nil {
		return Policy{}
	}
	return r.policy
}

func (r *Runtime) SessionTTL() time.Duration {
	if r == nil {
		return 0
	}
	return r.sessionTTL
}

func (r *Runtime) Base() *projectstate.Runtime {
	if r == nil {
		return nil
	}
	return r.base
}

func (r *Runtime) Session(sessionID string) (Session, bool) {
	if r == nil {
		return Session{}, false
	}

	trimmedID := strings.TrimSpace(sessionID)
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[trimmedID]
	return session, ok
}

func (r *Runtime) HasSession(sessionID string) bool {
	_, ok := r.Session(sessionID)
	return ok
}

func (r *Runtime) GetOrCreateSession(sessionID string) (Session, bool, error) {
	if r == nil {
		return Session{}, false, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID != "" {
		session, reused, err := r.tryReuseSession(trimmedID)
		if err != nil {
			return Session{}, false, err
		}
		if reused {
			return session, false, nil
		}
	}

	session, err := r.CreateSession()
	if err != nil {
		return Session{}, false, err
	}
	return session, true, nil
}

func (r *Runtime) CreateSession() (Session, error) {
	if r == nil {
		return Session{}, ErrRuntimeRequired
	}

	for attempts := 0; attempts < 8; attempts++ {
		sessionID := strings.TrimSpace(r.idGenerator())
		if sessionID == "" {
			return Session{}, ErrSessionGeneratorInvalid
		}
		session, err := r.CreateSessionWithID(sessionID)
		if errors.Is(err, ErrSessionConflict) {
			continue
		}
		return session, err
	}

	return Session{}, ErrSessionConflict
}

func (r *Runtime) CreateSessionWithID(sessionID string) (Session, error) {
	if r == nil {
		return Session{}, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return Session{}, projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.sessions[trimmedID]; ok {
		return Session{}, fmt.Errorf("%w: %q", ErrSessionConflict, trimmedID)
	}
	if _, err := r.overlays.GetOrCreate(trimmedID); err != nil {
		return Session{}, err
	}

	now := r.now().UTC()
	session := Session{
		ID:         trimmedID,
		CreatedAt:  now,
		LastSeenAt: now,
		RunCount:   0,
	}
	r.sessions[trimmedID] = session
	return session, nil
}

func (r *Runtime) CleanupExpiredSessions() ([]string, error) {
	if r == nil {
		return nil, ErrRuntimeRequired
	}

	cutoff := r.now().UTC().Add(-r.sessionTTL)

	r.mu.Lock()
	expiredIDs := make([]string, 0)
	for sessionID, session := range r.sessions {
		if session.LastSeenAt.After(cutoff) {
			continue
		}
		expiredIDs = append(expiredIDs, sessionID)
		delete(r.sessions, sessionID)
	}
	r.mu.Unlock()

	if len(expiredIDs) == 0 {
		return nil, nil
	}

	sort.Strings(expiredIDs)

	var err error
	for _, sessionID := range expiredIDs {
		if deleteErr := r.overlays.Delete(sessionID); deleteErr != nil && !errors.Is(deleteErr, projectstate.ErrUnknownOverlaySession) {
			err = errors.Join(err, deleteErr)
		}
	}
	return expiredIDs, err
}

func (r *Runtime) TouchSession(sessionID string) error {
	if r == nil {
		return ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[trimmedID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}
	session.LastSeenAt = r.now().UTC()
	r.sessions[trimmedID] = session
	return nil
}

func (r *Runtime) DeleteSession(sessionID string) error {
	if r == nil {
		return ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	if _, ok := r.sessions[trimmedID]; !ok {
		r.mu.Unlock()
		return fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}
	delete(r.sessions, trimmedID)
	r.mu.Unlock()

	if err := r.overlays.Delete(trimmedID); err != nil {
		if errors.Is(err, projectstate.ErrUnknownOverlaySession) {
			return fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
		}
		return err
	}
	return nil
}

func (r *Runtime) Overlay(sessionID string) (*projectstate.Runtime, error) {
	if r == nil {
		return nil, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return nil, projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	_, ok := r.sessions[trimmedID]
	r.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}

	runtime, err := r.overlays.Get(trimmedID)
	if err != nil {
		if errors.Is(err, projectstate.ErrUnknownOverlaySession) {
			return nil, fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
		}
		return nil, err
	}
	return runtime, nil
}

func (r *Runtime) SessionSnapshot(sessionID string) (projectstate.Snapshot, error) {
	if r == nil {
		return projectstate.Snapshot{}, ErrRuntimeRequired
	}

	runtime, err := r.Overlay(sessionID)
	if err != nil {
		return projectstate.Snapshot{}, err
	}
	return runtime.Snapshot(), nil
}

func (r *Runtime) LoadAppSpec(appDefinition *projectstate.AppDefinition) (any, error) {
	if r == nil {
		return nil, ErrRuntimeRequired
	}
	if appDefinition == nil {
		return nil, nil
	}

	appSpecPath := strings.TrimSpace(appDefinition.AppSpecPath)
	if appSpecPath == "" {
		return nil, nil
	}

	resolvedPath, err := r.paths.ResolveDeploymentPath(appSpecPath)
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read app spec: %w", err)
	}

	trimmedContent := bytes.TrimSpace(content)
	if len(trimmedContent) == 0 {
		return nil, nil
	}

	var payload any
	if err := json.Unmarshal(trimmedContent, &payload); err != nil {
		return nil, fmt.Errorf("decode app spec: %w", err)
	}
	if isEmptyJSONValue(payload) {
		return nil, nil
	}
	return payload, nil
}

func (r *Runtime) SessionRunCount(sessionID string) (int, error) {
	session, err := r.requireSession(sessionID)
	if err != nil {
		return 0, err
	}
	return session.RunCount, nil
}

func (r *Runtime) IncrementSessionRunCount(sessionID string) (int, error) {
	if r == nil {
		return 0, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return 0, projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[trimmedID]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}
	session.RunCount++
	r.sessions[trimmedID] = session
	return session.RunCount, nil
}

func (r *Runtime) TryReserveSessionRun(sessionID string) (bool, error) {
	if r == nil {
		return false, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return false, projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[trimmedID]
	if !ok {
		return false, fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}
	if session.RunCount > 0 {
		return false, nil
	}
	session.RunCount++
	r.sessions[trimmedID] = session
	return true, nil
}

func (r *Runtime) RollbackReservedSessionRun(sessionID string) (int, error) {
	if r == nil {
		return 0, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return 0, projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[trimmedID]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}
	if session.RunCount > 0 {
		session.RunCount--
	}
	r.sessions[trimmedID] = session
	return session.RunCount, nil
}

func (r *Runtime) requireSession(sessionID string) (Session, error) {
	if r == nil {
		return Session{}, ErrRuntimeRequired
	}

	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return Session{}, projectstate.ErrSessionIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[trimmedID]
	if !ok {
		return Session{}, fmt.Errorf("%w: %q", ErrUnknownSession, trimmedID)
	}
	return session, nil
}

func (r *Runtime) tryReuseSession(sessionID string) (Session, bool, error) {
	r.mu.Lock()
	session, ok := r.sessions[sessionID]
	if !ok {
		r.mu.Unlock()
		return Session{}, false, nil
	}
	session.LastSeenAt = r.now().UTC()
	r.sessions[sessionID] = session
	r.mu.Unlock()

	if _, err := r.overlays.GetOrCreate(sessionID); err != nil {
		return Session{}, false, err
	}

	return session, true, nil
}

func newRandomSessionID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return ""
	}
	return hex.EncodeToString(buffer)
}

func isEmptyJSONValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case bool:
		return !typed
	case string:
		return strings.TrimSpace(typed) == ""
	case []any:
		return len(typed) == 0
	case map[string]any:
		return len(typed) == 0
	case float64:
		return typed == 0
	default:
		return false
	}
}
