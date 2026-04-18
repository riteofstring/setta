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

func (s *stubRuntimeLSPRefresher) Refresh(_ context.Context) (plugins.DiscoverySnapshot, error) {
	s.refreshCalls++
	return plugins.DiscoverySnapshot{}, s.refreshErr
}

func (s *stubRuntimeLSPRefresher) HasConfiguredLanguageServers() bool {
	return s.hasSpecs
}

func testProjectDocument() projectstate.Document {
	return projectstate.Document{
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
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
	if projectAdmin.restartCalls != 0 {
		t.Fatalf("expected restart to stop before project sync, got %d calls", projectAdmin.restartCalls)
	}
}

func TestWorkspaceLSPAdminTypeCheckRefreshesRuntimeBeforeSync(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: true}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	if err := admin.TypeCheckProject(context.Background(), testProjectDocument(), "project-alpha"); err != nil {
		t.Fatalf("type check project: %v", err)
	}
	if runtime.refreshCalls != 1 {
		t.Fatalf("expected one runtime refresh, got %d", runtime.refreshCalls)
	}
	if projectAdmin.typeCheckCalls != 1 {
		t.Fatalf("expected one type-check call, got %d", projectAdmin.typeCheckCalls)
	}
}

func TestWorkspaceLSPAdminTypeCheckReturnsUnconfiguredWhenNoSpecsRemain(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: false}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	err := admin.TypeCheckProject(context.Background(), testProjectDocument(), "project-alpha")
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected unconfigured error, got %v", err)
	}
	if projectAdmin.typeCheckCalls != 0 {
		t.Fatalf("expected type check to stop before project sync, got %d calls", projectAdmin.typeCheckCalls)
	}
}

func TestWorkspaceLSPAdminTypeCheckPreservesMissingProjectNoOp(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: false}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	if err := admin.TypeCheckProject(context.Background(), testProjectDocument(), "project-missing"); err != nil {
		t.Fatalf("type check missing project: %v", err)
	}
	if runtime.refreshCalls != 0 {
		t.Fatalf("expected missing-project type check to skip runtime refresh, got %d", runtime.refreshCalls)
	}
	if projectAdmin.typeCheckCalls != 1 {
		t.Fatalf("expected missing-project type check to delegate once, got %d", projectAdmin.typeCheckCalls)
	}
}
