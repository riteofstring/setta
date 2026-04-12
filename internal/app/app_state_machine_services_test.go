package app

import (
	"testing"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
	"setta/internal/statemachineruns"
)

func TestResolveStateMachineProjectRuntime(t *testing.T) {
	t.Run("uses project runtime when share session is absent", func(t *testing.T) {
		projectRuntime := &projectstate.Runtime{}

		got, err := resolveStateMachineProjectRuntime(projectRuntime, nil, nil)
		if err != nil {
			t.Fatalf("resolveStateMachineProjectRuntime returned error: %v", err)
		}
		if got != projectRuntime {
			t.Fatalf("expected project runtime %p, got %p", projectRuntime, got)
		}
	})

	t.Run("treats blank share session as absent", func(t *testing.T) {
		projectRuntime := &projectstate.Runtime{}
		shareSessionID := "   "

		got, err := resolveStateMachineProjectRuntime(projectRuntime, nil, &shareSessionID)
		if err != nil {
			t.Fatalf("resolveStateMachineProjectRuntime returned error: %v", err)
		}
		if got != projectRuntime {
			t.Fatalf("expected project runtime %p, got %p", projectRuntime, got)
		}
	})

	t.Run("requires project runtime when no share session is provided", func(t *testing.T) {
		got, err := resolveStateMachineProjectRuntime(nil, nil, nil)
		if err == nil {
			t.Fatalf("expected error, got runtime %v", got)
		}
		if err.Error() != "project runtime is required" {
			t.Fatalf("expected missing project runtime error, got %v", err)
		}
	})

	t.Run("requires deployment runtime when share session is provided", func(t *testing.T) {
		shareSessionID := "  share-123  "

		got, err := resolveStateMachineProjectRuntime(nil, nil, &shareSessionID)
		if err == nil {
			t.Fatalf("expected error, got runtime %v", got)
		}
		if err.Error() != "deployment runtime is required for workflow share session share-123" {
			t.Fatalf("expected missing deployment runtime error, got %v", err)
		}
	})
}

func TestShouldHandleStateMachineTerminalChildRun(t *testing.T) {
	stateMachineRuntime := &statemachineruns.Runtime{}
	tests := []struct {
		name    string
		runtime *statemachineruns.Runtime
		run     agentruns.Run
		want    bool
	}{
		{
			name:    "requires runtime",
			runtime: nil,
			run: agentruns.Run{
				Status: agentruns.RunStatusCompleted,
				Inputs: map[string]any{
					"stateMachineParentRunType": statemachineruns.RunTypeStateMachine,
				},
			},
			want: false,
		},
		{
			name:    "ignores non terminal status",
			runtime: stateMachineRuntime,
			run: agentruns.Run{
				Status: agentruns.RunStatusRunning,
				Inputs: map[string]any{
					"stateMachineParentRunType": statemachineruns.RunTypeStateMachine,
				},
			},
			want: false,
		},
		{
			name:    "ignores missing parent run type",
			runtime: stateMachineRuntime,
			run: agentruns.Run{
				Status: agentruns.RunStatusCompleted,
				Inputs: map[string]any{},
			},
			want: false,
		},
		{
			name:    "ignores non state machine parent run type",
			runtime: stateMachineRuntime,
			run: agentruns.Run{
				Status: agentruns.RunStatusFailed,
				Inputs: map[string]any{
					"stateMachineParentRunType": "managed-chat",
				},
			},
			want: false,
		},
		{
			name:    "accepts trimmed state machine terminal child run",
			runtime: stateMachineRuntime,
			run: agentruns.Run{
				Status: agentruns.RunStatusCancelled,
				Inputs: map[string]any{
					"stateMachineParentRunType": "  " + statemachineruns.RunTypeStateMachine + "  ",
				},
			},
			want: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := shouldHandleStateMachineTerminalChildRun(test.runtime, test.run)
			if got != test.want {
				t.Fatalf("shouldHandleStateMachineTerminalChildRun() = %v, want %v", got, test.want)
			}
		})
	}
}
