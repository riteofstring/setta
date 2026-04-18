package app

import (
	"context"
	"errors"
	"testing"

	"setta/internal/lsp"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

type stubProjectLSPAdmin struct {
	restartCalls    int
	restartContexts []context.Context
	typeCheckCalls  int
	restartErr      error
	typeCheckErr    error
}

func (s *stubProjectLSPAdmin) Restart(ctx context.Context, _ projectstate.Document) error {
	s.restartCalls++
	s.restartContexts = append(s.restartContexts, ctx)
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
	restartCalls int
	restartCtx   context.Context
}

func (s *stubRuntimeLSPRefresher) Refresh(_ context.Context) (plugins.DiscoverySnapshot, error) {
	s.refreshCalls++
	return plugins.DiscoverySnapshot{}, s.refreshErr
}

func (s *stubRuntimeLSPRefresher) RestartProject(
	ctx context.Context,
	_ projectstate.Document,
	restart func(context.Context) error,
) error {
	s.restartCalls++
	if s.refreshErr != nil {
		return s.refreshErr
	}
	if !s.hasSpecs {
		return lsp.ErrLanguageServerNotConfigured
	}
	if restart == nil {
		return nil
	}
	if s.restartCtx != nil {
		return restart(s.restartCtx)
	}
	return restart(ctx)
}

func TestWorkspaceLSPAdminRestartRefreshesRuntimeBeforeSync(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: true}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	if err := admin.Restart(context.Background(), projectstate.Document{}); err != nil {
		t.Fatalf("restart language server: %v", err)
	}
	if runtime.restartCalls != 1 {
		t.Fatalf("expected one runtime restart transition, got %d", runtime.restartCalls)
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
	if projectAdmin.restartCalls != 0 {
		t.Fatalf("expected restart to stop before project sync, got %d calls", projectAdmin.restartCalls)
	}
}

func TestWorkspaceLSPAdminRestartUsesRuntimeProvidedContext(t *testing.T) {
	t.Parallel()

	requestCtx, cancel := context.WithCancel(context.Background())
	cancel()

	projectAdmin := &stubProjectLSPAdmin{}
	restoreCtx := context.Background()
	runtime := &stubRuntimeLSPRefresher{
		hasSpecs:   true,
		restartCtx: restoreCtx,
	}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	if err := admin.Restart(requestCtx, projectstate.Document{}); err != nil {
		t.Fatalf("restart language server: %v", err)
	}
	if len(projectAdmin.restartContexts) != 1 {
		t.Fatalf("expected one restart context, got %d", len(projectAdmin.restartContexts))
	}
	if projectAdmin.restartContexts[0] != restoreCtx {
		t.Fatalf("expected runtime-provided restart context, got %#v", projectAdmin.restartContexts[0])
	}
	if err := projectAdmin.restartContexts[0].Err(); err != nil {
		t.Fatalf("expected uncanceled restart context, got %v", err)
	}
}
