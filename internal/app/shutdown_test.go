package app

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/llmconfig"
	settaruntime "setta/internal/runtime"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/transcriptionsessions"
)

func TestAppShutdownClosesSettingsStateEvenWhenRuntimeShutdownFails(t *testing.T) {
	t.Parallel()

	settingsDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime := newAppTestSettingsRuntime(t, settingsDocument)
	terminalService, err := terminals.New(terminals.Options{})
	if err != nil {
		t.Fatalf("new terminals service: %v", err)
	}
	appRuntime := settaruntime.New(context.Background(), nil)

	stopped := make(chan struct{})
	expectedErr := errors.New("runtime shutdown failed")
	appRuntime.Go("failing-background-task", func(ctx context.Context) error {
		<-ctx.Done()
		close(stopped)
		return expectedErr
	})

	application := &App{
		settingsState: settingsRuntime,
		terminals:     terminalService,
		runtime:       appRuntime,
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	err = application.Shutdown(shutdownCtx)
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected shutdown error %v, got %v", expectedErr, err)
	}

	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("expected runtime task to stop during shutdown")
	}

	if _, err := settingsRuntime.Mutate(func(document settingsstate.Document) (settingsstate.Document, error) {
		return document, nil
	}); !errors.Is(err, settingsstate.ErrRuntimeClosed) {
		t.Fatalf("expected settings runtime to be closed, got %v", err)
	}
}

func TestRunTranscriptionSessionCleanupLoopStopsOnContextCancel(t *testing.T) {
	t.Parallel()

	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs:    map[string]llmconfig.Config{},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := transcriptionsessions.NewService(transcriptionsessions.ServiceOptions{
		LLM: llmRuntime,
	})
	if err != nil {
		t.Fatalf("new transcription session service: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- runTranscriptionSessionCleanupLoop(ctx, service, time.Hour)
	}()

	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected cleanup loop to stop with context cancellation, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for transcription cleanup loop to stop")
	}
}
