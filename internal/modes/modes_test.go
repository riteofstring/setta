package modes

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/config"
)

type testShareSessionStore struct {
	sessions map[string]bool
	touched  map[string]int
}

func newTestShareSessionStore(sessionIDs ...string) *testShareSessionStore {
	sessions := make(map[string]bool, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		sessions[sessionID] = true
	}
	return &testShareSessionStore{
		sessions: sessions,
		touched:  make(map[string]int),
	}
}

func (s *testShareSessionStore) HasSession(sessionID string) bool {
	return s.sessions[sessionID]
}

func (s *testShareSessionStore) TouchSession(sessionID string) error {
	if !s.sessions[sessionID] {
		return errors.New("missing session")
	}
	s.touched[sessionID]++
	return nil
}

func TestPolicyRequireIDEModeRejectsDeploymentAndLauncher(t *testing.T) {
	t.Parallel()

	if err := NewPolicy(config.ModeIDE).RequireIDE(); err != nil {
		t.Fatalf("expected ide mode to pass, got %v", err)
	}

	deploymentErr := NewPolicy(config.ModeShare).RequireIDE()
	if deploymentErr == nil {
		t.Fatal("expected share mode to fail ide requirement")
	}
	var deploymentViolation *Violation
	if !errors.As(deploymentErr, &deploymentViolation) {
		t.Fatalf("expected violation, got %T", deploymentErr)
	}
	if deploymentViolation.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", deploymentViolation.StatusCode)
	}
	if deploymentViolation.Message != "Deployment mode does not allow this endpoint." {
		t.Fatalf("unexpected deployment message %q", deploymentViolation.Message)
	}

	launcherErr := NewPolicy(config.ModeLauncher).RequireIDE()
	if launcherErr == nil {
		t.Fatal("expected launcher mode to fail ide requirement")
	}
	var launcherViolation *Violation
	if !errors.As(launcherErr, &launcherViolation) {
		t.Fatalf("expected violation, got %T", launcherErr)
	}
	if launcherViolation.Message != "Launcher mode does not allow this endpoint." {
		t.Fatalf("unexpected launcher message %q", launcherViolation.Message)
	}
}

func TestMaybeShareSessionIDFromRequestPrefersHeaderThenCookieThenQuery(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/?shareSessionId=query", nil)
	request.Header.Set(ShareSessionHeaderName, "header")
	request.AddCookie(&http.Cookie{
		Name:  ShareSessionCookieName,
		Value: "cookie",
	})

	if sessionID := MaybeShareSessionIDFromRequest(request); sessionID != "header" {
		t.Fatalf("expected header precedence, got %q", sessionID)
	}
}

func TestResolverFallsBackToCookieThenQueryAndTouchesSession(t *testing.T) {
	t.Parallel()

	store := newTestShareSessionStore("cookie", "query")
	request := httptest.NewRequest(http.MethodGet, "/?shareSessionId=query", nil)
	request.AddCookie(&http.Cookie{
		Name:  ShareSessionCookieName,
		Value: "cookie",
	})

	requestInfo, err := (Resolver{
		Policy: NewPolicy(config.ModeShare),
		Store:  store,
	}).ResolveRequest(request)
	if err != nil {
		t.Fatalf("resolve request: %v", err)
	}
	if requestInfo.ShareSessionID != "cookie" {
		t.Fatalf("expected cookie fallback, got %q", requestInfo.ShareSessionID)
	}
	if store.touched["cookie"] != 1 {
		t.Fatalf("expected cookie session touch, got %d", store.touched["cookie"])
	}
}

func TestResolverReturnsMissingAndUnknownShareSessionErrors(t *testing.T) {
	t.Parallel()

	resolver := Resolver{
		Policy: NewPolicy(config.ModeShare),
		Store:  newTestShareSessionStore("known"),
	}

	_, err := resolver.ResolveRequest(httptest.NewRequest(http.MethodGet, "/", nil))
	var missingErr *MissingShareSessionError
	if !errors.As(err, &missingErr) {
		t.Fatalf("expected missing share session error, got %v", err)
	}

	unknownRequest := httptest.NewRequest(http.MethodGet, "/?shareSessionId=unknown", nil)
	_, err = resolver.ResolveRequest(unknownRequest)
	var unknownErr *UnknownShareSessionError
	if !errors.As(err, &unknownErr) {
		t.Fatalf("expected unknown share session error, got %v", err)
	}
	if unknownErr.SessionID != "unknown" {
		t.Fatalf("expected unknown session id %q, got %q", "unknown", unknownErr.SessionID)
	}
}

func TestResolverSkipsShareSessionRequirementOutsideDeploymentModes(t *testing.T) {
	t.Parallel()

	requestInfo, err := (Resolver{
		Policy: NewPolicy(config.ModeLauncher),
	}).ResolveRequest(httptest.NewRequest(http.MethodGet, "/", nil))
	if err != nil {
		t.Fatalf("resolve request: %v", err)
	}
	if requestInfo.Policy.Mode() != config.ModeLauncher {
		t.Fatalf("expected launcher mode, got %q", requestInfo.Policy.Mode())
	}
	if requestInfo.ShareSessionID != "" {
		t.Fatalf("expected empty share session id, got %q", requestInfo.ShareSessionID)
	}
}
