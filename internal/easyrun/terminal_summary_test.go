package easyrun

import (
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestEasyRunDurationUsesSpokenWholeSecondGrammar(t *testing.T) {
	started := time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name     string
		elapsed  time.Duration
		expected string
	}{
		{name: "zero", elapsed: 0, expected: "less than 1 second"},
		{name: "below half second", elapsed: 499 * time.Millisecond, expected: "less than 1 second"},
		{name: "half second rounds up", elapsed: 500 * time.Millisecond, expected: "1 second"},
		{name: "below next half second", elapsed: 1499 * time.Millisecond, expected: "1 second"},
		{name: "next half second rounds up", elapsed: 1500 * time.Millisecond, expected: "2 seconds"},
		{name: "minute", elapsed: time.Minute, expected: "1 minute"},
		{name: "minute and second", elapsed: time.Minute + time.Second, expected: "1 minute 1 second"},
		{name: "omits zero middle units", elapsed: time.Hour + time.Second, expected: "1 hour 1 second"},
		{
			name:     "multiple days",
			elapsed:  49*time.Hour + 2*time.Minute + 3*time.Second,
			expected: "2 days 1 hour 2 minutes 3 seconds",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := easyRunDuration(timestamp(started), timestamp(started.Add(test.elapsed)))
			if err != nil {
				t.Fatalf("format duration: %v", err)
			}
			if actual != test.expected {
				t.Fatalf("duration = %q, want %q", actual, test.expected)
			}
		})
	}
}

func TestEasyRunDurationRejectsNegativeElapsedTime(t *testing.T) {
	_, err := easyRunDuration("2026-07-08T12:00:01Z", "2026-07-08T12:00:00Z")
	if err == nil || !strings.Contains(err.Error(), "ended before it started") {
		t.Fatalf("negative duration error = %v, want ordering failure", err)
	}
}

func TestMechanicalTerminalEasyRunSummaryUsesStatusAndArtifactGrammar(t *testing.T) {
	tests := []struct {
		name          string
		status        chat.RunStatus
		artifactCount int
		failureReason string
		expected      string
	}{
		{name: "completed zero", status: chat.RunStatusCompleted, expected: "Done in 1 second with no artifacts."},
		{name: "completed one", status: chat.RunStatusCompleted, artifactCount: 1, expected: "Done in 1 second with 1 artifact."},
		{name: "completed many", status: chat.RunStatusCompleted, artifactCount: 3, expected: "Done in 1 second with 3 artifacts."},
		{name: "stopped zero", status: chat.RunStatusCancelled, expected: "Stopped after 1 second with no artifacts."},
		{name: "stopped one", status: chat.RunStatusCancelled, artifactCount: 1, expected: "Stopped after 1 second with 1 artifact."},
		{name: "stopped many", status: chat.RunStatusCancelled, artifactCount: 3, expected: "Stopped after 1 second with 3 artifacts."},
		{
			name:          "failed zero",
			status:        chat.RunStatusFailed,
			failureReason: "worker failed",
			expected:      "Failed after 1 second: worker failed. No artifacts were preserved.",
		},
		{
			name:          "failed one",
			status:        chat.RunStatusFailed,
			artifactCount: 1,
			failureReason: "worker failed!",
			expected:      "Failed after 1 second: worker failed! 1 artifact was preserved.",
		},
		{
			name:          "failed many",
			status:        chat.RunStatusFailed,
			artifactCount: 3,
			failureReason: "worker failed",
			expected:      "Failed after 1 second: worker failed. 3 artifacts were preserved.",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			run := testRun("easy_run_summary")
			run.ArtifactCount = test.artifactCount
			actual, err := mechanicalTerminalEasyRunSummary(run, chat.Run{
				CompletedAt: "2026-07-08T12:00:01Z",
				Error:       test.failureReason,
				ID:          "run_summary",
				Status:      test.status,
			})
			if err != nil {
				t.Fatalf("format terminal summary: %v", err)
			}
			if actual != test.expected {
				t.Fatalf("summary = %q, want %q", actual, test.expected)
			}
		})
	}
}

func TestTerminalEasyRunPersistsExactNarratedMechanicalSummary(t *testing.T) {
	run := testRun("easy_run_narrated_summary")
	run.ArtifactCount = 1
	completed, err := terminalEasyRun(run, chat.Run{
		CompletedAt: "2026-07-08T12:02:14Z",
		ID:          "run_narrated_summary",
		Status:      chat.RunStatusCompleted,
	}, "The report is ready")
	if err != nil {
		t.Fatalf("complete easy-run: %v", err)
	}
	expected := "The report is ready. Done in 2 minutes 14 seconds with 1 artifact."
	if completed.Summary == nil || *completed.Summary != expected {
		t.Fatalf("persisted summary = %v, want %q", completed.Summary, expected)
	}
}

func TestMarkStartFailurePersistsHumanReadableMechanicalSummary(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	service, err := NewService(
		store,
		WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 0, 0, 750_000_000, time.UTC)
		}),
		withEventStreamID(EasyRunEventStreamID),
	)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	t.Cleanup(service.CloseEvents)
	run := testRun("easy_run_start_failure")
	if err := store.saveNewRun(storedRunRecord{Run: run, SchemaVersion: SchemaVersion}); err != nil {
		t.Fatalf("save working run: %v", err)
	}

	updated, err := service.markStartFailure(run.WorkspaceID, run.ID, errors.New("provider could not start"))
	if err != nil {
		t.Fatalf("mark start failure: %v", err)
	}
	if !updated {
		t.Fatal("mark start failure did not update the prepared easy-run")
	}
	persisted, err := store.loadRun(run.WorkspaceID, run.ID)
	if err != nil {
		t.Fatalf("load failed run: %v", err)
	}
	expected := "Failed after 1 second: provider could not start. No artifacts were preserved."
	if persisted.Run.Summary == nil || *persisted.Run.Summary != expected {
		t.Fatalf("start-failure summary = %v, want %q", persisted.Run.Summary, expected)
	}
}
