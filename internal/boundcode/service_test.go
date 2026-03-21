package boundcode

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// New tracks should baseline the current on-disk contents without replaying an
// immediate reload because this runtime only owns subsequent file changes.
func TestServiceBaselinesTrackedFilesWithoutImmediateCallback(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	path := filepath.Join(workspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir file parent: %v", err)
	}
	if err := os.WriteFile(path, []byte("print('baseline')\n"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	updates := make(chan FileUpdate, 1)
	service, err := NewService(ServiceOptions{
		PollInterval: 10 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updates <- update
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	if err := service.SyncInputs([]FileInput{
		{
			Path: path,
			Bindings: []Binding{
				{ProjectID: "project-alpha", SectionID: "section-main"},
			},
		},
	}); err != nil {
		t.Fatalf("sync inputs: %v", err)
	}

	select {
	case update := <-updates:
		t.Fatalf("did not expect initial baseline callback, got %#v", update)
	case <-time.After(80 * time.Millisecond):
	}
}

// Once a tracked file changes on disk, the runtime should emit the updated raw
// contents and the saved project/section bindings for the reload owner.
func TestServiceEmitsCallbackForTrackedFileChanges(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	path := filepath.Join(workspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir file parent: %v", err)
	}
	if err := os.WriteFile(path, []byte("print('baseline')\n"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	updates := make(chan FileUpdate, 1)
	service, err := NewService(ServiceOptions{
		PollInterval: 10 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updates <- update
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	input := FileInput{
		Path: path,
		Bindings: []Binding{
			{ProjectID: "project-alpha", SectionID: "section-main"},
			{ProjectID: "project-beta", SectionID: "section-main"},
		},
	}
	if err := service.SyncInputs([]FileInput{input}); err != nil {
		t.Fatalf("sync inputs: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	updated := "print('changed')\n"
	if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
		t.Fatalf("write updated file: %v", err)
	}

	select {
	case update := <-updates:
		if update.Path != path {
			t.Fatalf("expected updated path %q, got %q", path, update.Path)
		}
		if update.Raw != updated {
			t.Fatalf("expected updated raw content %q, got %q", updated, update.Raw)
		}
		if len(update.Bindings) != 2 {
			t.Fatalf("expected two bindings, got %#v", update.Bindings)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for tracked file update")
	}
}

// Missing files should still become active once the tracked path appears later,
// matching the external bound-file reload flow the app wires on top of this runtime.
func TestServiceEmitsCallbackWhenTrackedFileIsCreatedLater(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	path := filepath.Join(workspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir file parent: %v", err)
	}

	updates := make(chan FileUpdate, 1)
	service, err := NewService(ServiceOptions{
		PollInterval: 10 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updates <- update
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	if err := service.SyncInputs([]FileInput{
		{
			Path: path,
			Bindings: []Binding{
				{ProjectID: "project-alpha", SectionID: "section-main"},
			},
		},
	}); err != nil {
		t.Fatalf("sync inputs: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	created := "print('created')\n"
	if err := os.WriteFile(path, []byte(created), 0o644); err != nil {
		t.Fatalf("write created file: %v", err)
	}

	select {
	case update := <-updates:
		if update.Raw != created {
			t.Fatalf("expected created raw content %q, got %q", created, update.Raw)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for created tracked file update")
	}
}

// Newly created files can briefly exist as empty while the writer is still
// filling the final contents. The runtime should wait for a stable sample
// instead of broadcasting a transient empty reload into Watch Code.
func TestServiceDoesNotEmitTransientEmptyContentWhenTrackedFileAppears(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	path := filepath.Join(workspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir file parent: %v", err)
	}

	updates := make(chan FileUpdate, 1)
	service, err := NewService(ServiceOptions{
		PollInterval: 100 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updates <- update
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	if err := service.SyncInputs([]FileInput{
		{
			Path: path,
			Bindings: []Binding{
				{ProjectID: "project-alpha", SectionID: "section-main"},
			},
		},
	}); err != nil {
		t.Fatalf("sync inputs: %v", err)
	}
	time.Sleep(160 * time.Millisecond)

	if err := os.WriteFile(path, []byte(""), 0o644); err != nil {
		t.Fatalf("write transient empty file: %v", err)
	}
	time.Sleep(120 * time.Millisecond)

	select {
	case update := <-updates:
		t.Fatalf("did not expect transient update before final content write, got %#v", update)
	default:
	}

	created := "print('created')\n"
	if err := os.WriteFile(path, []byte(created), 0o644); err != nil {
		t.Fatalf("write created file: %v", err)
	}

	select {
	case update := <-updates:
		if update.Raw != created {
			t.Fatalf("expected stable created raw content %q, got %q", created, update.Raw)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for stable created tracked file update")
	}
}
