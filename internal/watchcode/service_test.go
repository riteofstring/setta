package watchcode

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestServiceSyncConfigsPreservesFirstScanForNewlyTrackedExistingFiles(t *testing.T) {
	t.Parallel()

	// Project state owns watch-code baseline suppression. When a new config starts
	// tracking an already-existing file, the watcher still needs to emit the first
	// scan so project state can decide whether it is baseline-only or a real update.
	workspaceRoot := t.TempDir()
	watchDir := filepath.Join(workspaceRoot, "pkg")
	watchFile := filepath.Join(watchDir, "existing.py")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	if err := os.WriteFile(watchFile, []byte("print('existing')\n"), 0o644); err != nil {
		t.Fatalf("write watch file: %v", err)
	}

	updateCh := make(chan FileUpdate, 4)
	service, err := NewService(ServiceOptions{
		WorkspaceRoot: workspaceRoot,
		PollInterval:  20 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updateCh <- update
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

	if err := service.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	update := waitForMatchingFileUpdate(t, updateCh, nil, func(update FileUpdate) bool {
		return update.ConfigID == "project-alpha" &&
			update.Path == watchFile &&
			update.Raw == "print('existing')\n"
	})
	if update.BaselineOnly {
		t.Fatalf("expected first tracked scan to stay non-baseline at watcher layer, got %#v", update)
	}
}

func TestServicePollsCreateModifyDeleteCallbacks(t *testing.T) {
	t.Parallel()

	// The polling runtime should translate real filesystem edits into update and delete callbacks.
	workspaceRoot := t.TempDir()
	watchDir := filepath.Join(workspaceRoot, "pkg")
	watchFile := filepath.Join(watchDir, "watch.py")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}

	updateCh := make(chan FileUpdate, 8)
	deleteCh := make(chan DeleteRequest, 8)
	errCh := make(chan error, 1)
	service, err := NewService(ServiceOptions{
		WorkspaceRoot: workspaceRoot,
		PollInterval:  20 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updateCh <- update
			return nil
		},
		OnFileDelete: func(_ context.Context, deleteRequest DeleteRequest) error {
			deleteCh <- deleteRequest
			return nil
		},
		OnError: func(err error) {
			select {
			case errCh <- err:
			default:
			}
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

	if err := service.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: "pkg", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}

	if err := os.WriteFile(watchFile, []byte("print('created')\n"), 0o644); err != nil {
		t.Fatalf("write created file: %v", err)
	}
	created := waitForMatchingFileUpdate(t, updateCh, errCh, func(update FileUpdate) bool {
		return update.Path == watchFile && update.Raw == "print('created')\n"
	})
	if created.Path != watchFile || created.ConfigID != "project-alpha" || created.MovedFrom != "" {
		t.Fatalf("unexpected created update %#v", created)
	}

	if err := os.WriteFile(watchFile, []byte("print('modified')\n"), 0o644); err != nil {
		t.Fatalf("rewrite file: %v", err)
	}
	modified := waitForMatchingFileUpdate(t, updateCh, errCh, func(update FileUpdate) bool {
		return update.Path == watchFile && update.Raw == "print('modified')\n"
	})
	if modified.Path != watchFile || modified.ConfigID != "project-alpha" || modified.Raw != "print('modified')\n" {
		t.Fatalf("unexpected modified update %#v", modified)
	}

	if err := os.Remove(watchFile); err != nil {
		t.Fatalf("remove file: %v", err)
	}
	deleted := waitForDelete(t, deleteCh, errCh)
	if deleted != (DeleteRequest{ConfigID: "project-alpha", Path: watchFile}) {
		t.Fatalf("unexpected delete callback %#v", deleted)
	}
}

func TestServicePollsMoveAcrossConfigs(t *testing.T) {
	t.Parallel()

	// A cross-config move should delete from the source config and update the destination config with moved_from.
	workspaceRoot := t.TempDir()
	sourceDir := filepath.Join(workspaceRoot, "source")
	destDir := filepath.Join(workspaceRoot, "dest")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		t.Fatalf("mkdir dest dir: %v", err)
	}
	sourcePath := filepath.Join(sourceDir, "moved.py")
	destPath := filepath.Join(destDir, "moved.py")
	if err := os.WriteFile(sourcePath, []byte("print('move')\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	updateCh := make(chan FileUpdate, 8)
	deleteCh := make(chan DeleteRequest, 8)
	errCh := make(chan error, 1)
	service, err := NewService(ServiceOptions{
		WorkspaceRoot: workspaceRoot,
		PollInterval:  20 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updateCh <- update
			return nil
		},
		OnFileDelete: func(_ context.Context, deleteRequest DeleteRequest) error {
			deleteCh <- deleteRequest
			return nil
		},
		OnError: func(err error) {
			select {
			case errCh <- err:
			default:
			}
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

	if err := service.SyncConfigs(map[string]ConfigInputs{
		"project-alpha": {
			Folders: []FolderInput{{Path: "source", Recursive: false}},
		},
		"project-beta": {
			Folders: []FolderInput{{Path: "dest", Recursive: false}},
		},
	}); err != nil {
		t.Fatalf("sync configs: %v", err)
	}
	initialSourceUpdate := waitForMatchingFileUpdate(t, updateCh, errCh, func(update FileUpdate) bool {
		return update.ConfigID == "project-alpha" &&
			update.Path == sourcePath &&
			update.Raw == "print('move')\n" &&
			update.MovedFrom == ""
	})
	if initialSourceUpdate.BaselineOnly {
		t.Fatalf("expected initial tracked source scan to stay non-baseline, got %#v", initialSourceUpdate)
	}

	if err := os.Rename(sourcePath, destPath); err != nil {
		t.Fatalf("rename file: %v", err)
	}

	deleted := waitForDelete(t, deleteCh, errCh)
	expectedDelete := DeleteRequest{ConfigID: "project-alpha", Path: sourcePath}
	if deleted != expectedDelete {
		t.Fatalf("unexpected delete callback %#v", deleted)
	}
	update := waitForFileUpdate(t, updateCh, errCh)
	expectedUpdate := FileUpdate{
		ConfigID:     "project-beta",
		Path:         destPath,
		Raw:          "print('move')\n",
		BaselineOnly: false,
		MovedFrom:    sourcePath,
	}
	if !reflect.DeepEqual(update, expectedUpdate) {
		t.Fatalf("unexpected move update %#v", update)
	}
}

func waitForFileUpdate(t *testing.T, updates <-chan FileUpdate, errCh <-chan error) FileUpdate {
	t.Helper()

	timeout := time.After(2 * time.Second)
	for {
		select {
		case err := <-errCh:
			t.Fatalf("service error: %v", err)
		case update := <-updates:
			return update
		case <-timeout:
			t.Fatal("timed out waiting for file update")
		}
	}
}

func waitForMatchingFileUpdate(
	t *testing.T,
	updates <-chan FileUpdate,
	errCh <-chan error,
	match func(FileUpdate) bool,
) FileUpdate {
	t.Helper()

	timeout := time.After(2 * time.Second)
	for {
		select {
		case err := <-errCh:
			t.Fatalf("service error: %v", err)
		case update := <-updates:
			if match(update) {
				return update
			}
		case <-timeout:
			t.Fatal("timed out waiting for matching file update")
		}
	}
}

func waitForDelete(t *testing.T, deletes <-chan DeleteRequest, errCh <-chan error) DeleteRequest {
	t.Helper()

	timeout := time.After(2 * time.Second)
	for {
		select {
		case err := <-errCh:
			t.Fatalf("service error: %v", err)
		case deleteRequest := <-deletes:
			return deleteRequest
		case <-timeout:
			t.Fatal("timed out waiting for delete callback")
		}
	}
}
