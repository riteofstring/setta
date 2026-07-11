package easyrun

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveNewRunPublishesOnlyCompleteRunDirectories(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	workspaceID := "workspace_api"
	if err := os.MkdirAll(store.easyRunsDir(workspaceID), 0o755); err != nil {
		t.Fatalf("create easy-runs directory: %v", err)
	}

	stop := make(chan struct{})
	observerReady := make(chan struct{})
	observerDone := make(chan struct{})
	observerErrors := make(chan error, 1)
	go func() {
		defer close(observerDone)
		firstRead := true
		for {
			entries, readErr := os.ReadDir(store.easyRunsDir(workspaceID))
			if firstRead {
				close(observerReady)
				firstRead = false
			}
			if readErr != nil {
				reportObserverError(observerErrors, readErr)
				return
			}
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}
				runPath := filepath.Join(store.easyRunsDir(workspaceID), entry.Name(), easyRunFileName)
				if _, statErr := os.Stat(runPath); statErr != nil {
					reportObserverError(observerErrors, fmt.Errorf("visible easy-run directory %s was incomplete: %w", entry.Name(), statErr))
					return
				}
			}
			select {
			case <-stop:
				return
			default:
			}
		}
	}()
	<-observerReady

	largeRequest := strings.TrimSpace(strings.Repeat("complete objective and constraints. ", 2_048))
	for index := 0; index < 12; index++ {
		run := testRun(fmt.Sprintf("easy_run_atomic_%02d", index))
		run.RequestText = largeRequest
		run.CurrentFocus.Text = largeRequest
		if err := store.saveNewRun(storedRunRecord{Run: run, SchemaVersion: SchemaVersion}); err != nil {
			close(stop)
			<-observerDone
			t.Fatalf("save easy-run %d: %v", index, err)
		}
	}
	close(stop)
	<-observerDone
	select {
	case err := <-observerErrors:
		t.Fatal(err)
	default:
	}
}

func reportObserverError(target chan<- error, err error) {
	select {
	case target <- err:
	default:
	}
}
