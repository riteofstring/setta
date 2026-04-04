package app

import (
	"context"
	"testing"
	"time"

	"setta/internal/projectstate"
	"setta/internal/realtime"
)

func TestWatchCodeWarningTrackerDedupesUntilCallableStateChanges(t *testing.T) {
	t.Parallel()

	tracker := newWatchCodeWarningTracker()
	tracker.idGenerator = func() string { return "notif-1" }
	tracker.timeNow = func() time.Time { return time.Unix(1_700_000_000, 0).UTC() }

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				WatchCodeRegistry: map[string]projectstate.WatchCodeRegistryEntry{
					"pkg.missing.MissingFunc:function": {
						CallableName: "MissingFunc",
					},
				},
			},
		},
	}

	first := tracker.ConsumeNotifications(document, "project-alpha", map[string]projectstate.SignatureHelpStatus{
		"MissingFunc": projectstate.SignatureHelpStatusNoMatch,
	})
	if len(first) != 1 {
		t.Fatalf("expected one warning notification, got %#v", first)
	}
	if first[0].MessageType != realtime.MessageTypeNotification {
		t.Fatalf("expected notification message type, got %#v", first[0])
	}
	if first[0].Content.ID != "notif-1" {
		t.Fatalf("expected stable notification id, got %#v", first[0].Content)
	}
	if first[0].Content.Type != realtime.NotificationTypeWarning {
		t.Fatalf("expected warning notification type, got %#v", first[0].Content)
	}
	if first[0].Content.Message != "Watch Code could not resolve params for MissingFunc. Verify the module import path or add imports in gen code prefix." {
		t.Fatalf("unexpected notification message %#v", first[0].Content)
	}

	second := tracker.ConsumeNotifications(document, "project-alpha", map[string]projectstate.SignatureHelpStatus{
		"MissingFunc": projectstate.SignatureHelpStatusNoMatch,
	})
	if len(second) != 0 {
		t.Fatalf("expected deduped warning notification, got %#v", second)
	}

	document.Projects["project-alpha"] = projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		WatchCodeRegistry: map[string]projectstate.WatchCodeRegistryEntry{
			"pkg.sorted.sorted:function": {
				CallableName: "sorted",
			},
		},
	}
	tracker.ReconcileDocument(document)

	document.Projects["project-alpha"] = projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		WatchCodeRegistry: map[string]projectstate.WatchCodeRegistryEntry{
			"pkg.missing.MissingFunc:function": {
				CallableName: "MissingFunc",
			},
		},
	}
	third := tracker.ConsumeNotifications(document, "project-alpha", map[string]projectstate.SignatureHelpStatus{
		"MissingFunc": projectstate.SignatureHelpStatusNoMatch,
	})
	if len(third) != 1 {
		t.Fatalf("expected warning notification after callable state change, got %#v", third)
	}
}

func TestWatchCodeSignatureObserverKeepsLatestAttemptForCallable(t *testing.T) {
	t.Parallel()

	observer := newWatchCodeSignatureObserver(nil)
	observer.recordAttempt("another_fn", projectstate.SignatureHelpStatusNoMatch)
	observer.recordAttempt("another_fn", projectstate.SignatureHelpStatusMatched)

	attempts := observer.Attempts()
	if attempts["another_fn"] != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected latest attempt to win, got %#v", attempts)
	}
}

type noMatchCallableSignatureResolver struct{}

func (noMatchCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	return projectstate.CallableSignatureResult{
		Status: projectstate.SignatureHelpStatusNoMatch,
	}, true, nil
}

func TestWatchCodeSignatureObserverRecordsFinalBoundWatchCodeStatus(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": watchCodeRootBoundProject(t, "watch_code_test.py"),
		},
	}

	if err := document.SetCode("project-alpha", "section-main", "def cool_fn(a, b, c):\n    return a + b + c\n"); err != nil {
		t.Fatalf("set bound watch-code source: %v", err)
	}

	observer := newWatchCodeSignatureObserver(noMatchCallableSignatureResolver{})
	if _, err := document.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		"project-alpha",
		"section-main",
		workspaceRoot,
		observer,
	); err != nil {
		t.Fatalf("apply bound watch-code update: %v", err)
	}

	attempts := observer.Attempts()
	if attempts["cool_fn"] != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected final bound watch-code status to be matched, got %#v", attempts)
	}
}
