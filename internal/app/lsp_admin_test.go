package app

import (
	"context"
	"errors"
	"testing"

	"setta/internal/lsp"
	"setta/internal/projectstate"
)

type stubProjectLSPAdmin struct {
	restartCalls   int
	typeCheckCalls int
	restartErr     error
	typeCheckErr   error
}

func (s *stubProjectLSPAdmin) Restart(_ context.Context, _ projectstate.Document) error {
	s.restartCalls++
	return s.restartErr
}

func (s *stubProjectLSPAdmin) TypeCheckProject(_ context.Context, _ projectstate.Document, _ string) error {
	s.typeCheckCalls++
	return s.typeCheckErr
}

type stubRuntimeLSPRefresher struct {
	refreshCalls int
	refreshErr   error
	hasSpecs     bool
}

func (s *stubRuntimeLSPRefresher) RefreshLanguageServers(_ context.Context) error {
	s.refreshCalls++
	return s.refreshErr
}

func (s *stubRuntimeLSPRefresher) HasConfiguredLanguageServers() bool {
	return s.hasSpecs
}

func TestWorkspaceLSPAdminRestartRefreshesRuntimeBeforeSync(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: true}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	if err := admin.Restart(context.Background(), projectstate.Document{}); err != nil {
		t.Fatalf("restart language server: %v", err)
	}
	if runtime.refreshCalls != 1 {
		t.Fatalf("expected one runtime refresh, got %d", runtime.refreshCalls)
	}
	if projectAdmin.restartCalls != 1 {
		t.Fatalf("expected one project restart, got %d", projectAdmin.restartCalls)
	}
}

func TestWorkspaceLSPAdminRestartReturnsUnconfiguredWhenNoSpecsRemain(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: false}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	err := admin.Restart(context.Background(), projectstate.Document{})
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected unconfigured error, got %v", err)
	}
	if projectAdmin.restartCalls != 1 {
		t.Fatalf("expected restart to reconcile project state before returning unconfigured, got %d calls", projectAdmin.restartCalls)
	}
}
