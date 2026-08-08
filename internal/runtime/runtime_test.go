package runtime

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestManagerShutdownCancelsTasks(t *testing.T) {
	t.Parallel()

	manager := New(context.Background(), nil)
	done := make(chan struct{})

	manager.Go("waiter", func(ctx context.Context) error {
		defer close(done)
		<-ctx.Done()
		return nil
	})

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := manager.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown manager: %v", err)
	}

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("background task did not exit after shutdown")
	}
}

func TestManagerReturnsFirstTaskError(t *testing.T) {
	t.Parallel()

	manager := New(context.Background(), nil)
	expectedErr := errors.New("boom")

	manager.Go("fails", func(context.Context) error {
		return expectedErr
	})

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := manager.Shutdown(shutdownCtx); !errors.Is(err, expectedErr) {
		t.Fatalf("expected %v, got %v", expectedErr, err)
	}
}
