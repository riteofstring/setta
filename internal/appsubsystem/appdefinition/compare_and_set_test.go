package appdefinition

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"setta/internal/projectstate"
)

func TestCompareAndSetAppDefinitionNoopWaitsBehindQueuedMutation(t *testing.T) {
	saveStarted := make(chan struct{}, 1)
	blockNextSave := make(chan chan struct{}, 1)
	_, runtime := openPersistedBackendRuntimeTestProjectWithOptions(t, projectstate.RuntimeOptions{
		BeforeSave: func(_ context.Context, _ projectstate.Snapshot) error {
			select {
			case release := <-blockNextSave:
				saveStarted <- struct{}{}
				<-release
			default:
			}
			return nil
		},
	})

	service := NewAppDefinitionService(runtime, "setta-json-render-app-gen")
	v1 := "v1"
	if _, _, err := service.SetAppDefinition(context.Background(), SetInput{
		AppSpec:        compareAndSetTestAppSpec(),
		AppSpecVersion: &v1,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	releaseSave := make(chan struct{})
	blockNextSave <- releaseSave
	setDone := make(chan error, 1)
	go func() {
		v2 := "v2"
		_, _, err := service.SetAppDefinition(context.Background(), SetInput{
			AppSpec:        compareAndSetTestAppSpec(),
			AppSpecVersion: &v2,
		})
		setDone <- err
	}()
	<-saveStarted

	casDone := make(chan error, 1)
	go func() {
		_, _, err := service.CompareAndSetAppDefinitionSpecVersion(
			context.Background(),
			"v1",
			&v1,
		)
		casDone <- err
	}()

	select {
	case err := <-casDone:
		t.Fatalf("no-op CAS returned before the queued mutation completed: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseSave)
	if err := <-setDone; err != nil {
		t.Fatalf("set v2 app definition: %v", err)
	}
	err := <-casDone
	if err == nil {
		t.Fatal("expected no-op CAS to observe queued v2 mutation and fail")
	}
	var mismatch *projectstate.ExpectedOldValueMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected ExpectedOldValueMismatchError, got %T (%v)", err, err)
	}
	if mismatch.ExpectedOldValue != "v1" || mismatch.ObservedOldValue != "v2" {
		t.Fatalf("unexpected mismatch values %#v", mismatch)
	}
}

func TestCompareAndSetAppDefinitionNoopCompletesFrontendOpID(t *testing.T) {
	_, runtime := openPersistedBackendRuntimeTestProject(t)
	service := NewAppDefinitionService(runtime, "setta-json-render-app-gen")
	v1 := "v1"
	if _, _, err := service.SetAppDefinition(context.Background(), SetInput{
		AppSpec:        compareAndSetTestAppSpec(),
		AppSpecVersion: &v1,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	before := runtime.Snapshot()
	snapshot, result, err := service.CompareAndSetAppDefinitionSpecVersion(
		projectstate.ContextWithFrontendOpID(context.Background(), "app-noop-op"),
		"v1",
		&v1,
	)
	if err != nil {
		t.Fatalf("no-op compare-and-set: %v", err)
	}
	if result.OldValue != "v1" || result.NewValue != "v1" {
		t.Fatalf("unexpected no-op result %#v", result)
	}
	if snapshot.Revision != before.Revision {
		t.Fatalf("expected no-op revision %d, got %d", before.Revision, snapshot.Revision)
	}

	_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("consume frontend ops: %v", err)
	}
	if !slices.Equal(ops.Completed, []string{"app-noop-op"}) || len(ops.Pending) != 0 {
		t.Fatalf("expected completed frontend op, got %#v", ops)
	}
}

func compareAndSetTestAppSpec() map[string]any {
	return map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
	}
}
