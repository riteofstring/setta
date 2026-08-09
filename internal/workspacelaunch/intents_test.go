package workspacelaunch

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/frontendorigins"
)

func TestIntentServiceCreateAndConsumeRoundTrip(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot:    runtimeRoot,
		TrustedOrigins: trustedOrigins,
		Now:            func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	request := decodeLaunchRequest(t, `{
		"workspaceRoot":"/tmp/workspace",
		"settaHome":"/tmp/setta-home",
		"settaFilesLocation":"global"
	}`)
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}

	result, err := service.CreateIntent(CreateIntentInput{
		Request:        request,
		ReturnURL:      "http://127.0.0.1:3000/home",
		RequestOrigin:  "http://127.0.0.1:3000",
		CurrentSession: currentSession,
	})
	if err != nil {
		t.Fatalf("create intent: %v", err)
	}
	if result.LaunchIntentToken == "" {
		t.Fatal("expected launch intent token")
	}
	if result.RequestedAt != now.UnixMilli() {
		t.Fatalf("expected requestedAt %d, got %d", now.UnixMilli(), result.RequestedAt)
	}

	storedRequest, returnURL, err := service.ConsumeIntent(currentSession, result.LaunchIntentToken)
	if err != nil {
		t.Fatalf("consume intent: %v", err)
	}
	if trimmedStringPointer(storedRequest.WorkspaceRoot) != "/tmp/workspace" {
		t.Fatalf("unexpected stored workspace root %q", trimmedStringPointer(storedRequest.WorkspaceRoot))
	}
	if returnURL != "http://127.0.0.1:3000/home" {
		t.Fatalf("unexpected return URL %q", returnURL)
	}

	if _, _, err := service.ConsumeIntent(currentSession, result.LaunchIntentToken); err == nil {
		t.Fatal("expected consumed launch intent to fail")
	}
}

func TestIntentServicePersistsIntentAcrossReinitializationAndKeepsConsumeSingleUse(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}

	firstService, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new first intent service: %v", err)
	}
	result, err := firstService.CreateIntent(CreateIntentInput{
		Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","settaHome":"/tmp/setta-home"}`),
		ReturnURL:      "http://127.0.0.1:3000/home",
		RequestOrigin:  "http://127.0.0.1:3000",
		CurrentSession: currentSession,
	})
	if err != nil {
		t.Fatalf("create intent: %v", err)
	}

	// A fresh service instance should still see the persisted intent on disk,
	// and once any instance consumes it the token must be single-use globally.
	secondService, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new second intent service: %v", err)
	}
	storedRequest, returnURL, err := secondService.ConsumeIntent(currentSession, result.LaunchIntentToken)
	if err != nil {
		t.Fatalf("consume persisted intent from second service: %v", err)
	}
	if trimmedStringPointer(storedRequest.WorkspaceRoot) != "/tmp/workspace" {
		t.Fatalf("unexpected stored workspace root %q", trimmedStringPointer(storedRequest.WorkspaceRoot))
	}
	if returnURL != "http://127.0.0.1:3000/home" {
		t.Fatalf("unexpected return URL %q", returnURL)
	}

	thirdService, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new third intent service: %v", err)
	}
	if _, _, err := thirdService.ConsumeIntent(currentSession, result.LaunchIntentToken); err == nil {
		t.Fatal("expected consumed launch intent to fail across service instances")
	}
}

func TestIntentServiceAllowsTrustedReturnURL(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	if _, err := trustedOrigins.TrustOrigin("http://127.0.0.1:9001", "session-1", now.Add(time.Hour).Unix()); err != nil {
		t.Fatalf("trust launcher origin: %v", err)
	}
	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot:    runtimeRoot,
		TrustedOrigins: trustedOrigins,
		Now:            func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	_, err = service.CreateIntent(CreateIntentInput{
		Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
		ReturnURL:      "http://127.0.0.1:9001/home",
		RequestOrigin:  "http://127.0.0.1:7000",
		CurrentSession: &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("secret")},
	})
	if err != nil {
		t.Fatalf("expected trusted return URL to be allowed, got %v", err)
	}
}

func TestIntentServiceValidateAndNormalizeReturnURL(t *testing.T) {
	t.Parallel()

	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	tests := []struct {
		name          string
		returnURL     string
		requestOrigin string
		wantURL       string
		wantErr       string
	}{
		{
			name:          "normalizes origin and default path",
			returnURL:     "https://example.com?tab=files#focus",
			requestOrigin: "https://example.com",
			wantURL:       "https://example.com/?tab=files#focus",
		},
		{
			name:          "preserves path and query",
			returnURL:     "https://example.com/users/home?q=1",
			requestOrigin: "https://example.com",
			wantURL:       "https://example.com/users/home?q=1",
		},
		{
			name:          "allows blank request origin when trusted-origins service is absent",
			returnURL:     "https://launcher.example.com/home",
			requestOrigin: "   ",
			wantURL:       "https://launcher.example.com/home",
		},
		{
			name:          "rejects blank url",
			returnURL:     "   ",
			requestOrigin: "https://example.com",
			wantErr:       "returnUrl must not be blank.",
		},
		{
			name:          "rejects non-http scheme",
			returnURL:     "ftp://example.com/home",
			requestOrigin: "https://example.com",
			wantErr:       "returnUrl must use http or https.",
		},
		{
			name:          "rejects credentials",
			returnURL:     "https://user:pass@example.com/home",
			requestOrigin: "https://example.com",
			wantErr:       "returnUrl must not include credentials.",
		},
		{
			name:          "rejects missing origin",
			returnURL:     "https:///home",
			requestOrigin: "https://example.com",
			wantErr:       "returnUrl must include an origin.",
		},
		{
			name:          "rejects mismatched origin without trust",
			returnURL:     "https://launcher.example.com/home",
			requestOrigin: "https://example.com",
			wantErr:       "returnUrl origin is not allowed.",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			gotURL, err := service.validateAndNormalizeReturnURL(tc.returnURL, tc.requestOrigin, "session-1")
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error %q, got nil", tc.wantErr)
				}
				if err.Error() != tc.wantErr {
					t.Fatalf("expected error %q, got %q", tc.wantErr, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("validate and normalize return URL: %v", err)
			}
			if gotURL != tc.wantURL {
				t.Fatalf("expected normalized return URL %q, got %q", tc.wantURL, gotURL)
			}
		})
	}
}

func TestIntentServiceRejectsNestedLaunchIntentToken(t *testing.T) {
	t.Parallel()

	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}
	_, err = service.CreateIntent(CreateIntentInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"nested","workspaceRoot":"/tmp/workspace"}`),
		ReturnURL:      "http://127.0.0.1:3000/home",
		RequestOrigin:  "http://127.0.0.1:3000",
		CurrentSession: &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("secret")},
	})
	if err == nil {
		t.Fatal("expected nested launch intent token to fail")
	}
	intentErr, ok := err.(*IntentError)
	if !ok {
		t.Fatalf("expected intent error, got %T", err)
	}
	if intentErr.Code != "BadRequest" {
		t.Fatalf("expected bad request error, got %#v", intentErr)
	}
}

func TestIntentServiceCreateIntentRejectsMissingAndWhitespaceWorkspaceRoot(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}
	for _, rawRequest := range []string{
		`{}`,
		`{"workspaceRoot":"   "}`,
	} {
		_, err := service.CreateIntent(CreateIntentInput{
			Request:        decodeLaunchRequest(t, rawRequest),
			ReturnURL:      "http://127.0.0.1:3000/home",
			RequestOrigin:  "http://127.0.0.1:3000",
			CurrentSession: currentSession,
		})
		if err == nil {
			t.Fatalf("expected workspace-root validation failure for %s", rawRequest)
		}
		intentErr, ok := err.(*IntentError)
		if !ok {
			t.Fatalf("expected intent error, got %T", err)
		}
		if intentErr.Code != "BadRequest" || intentErr.Message != "launchRequest.workspaceRoot is required." {
			t.Fatalf("unexpected error payload %#v", intentErr)
		}
	}
}

func TestIntentServiceCreateIntentMapsStoreUnavailableStateAndCapacityErrors(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}

	t.Run("store unavailable", func(t *testing.T) {
		t.Parallel()

		runtimeRootPath := filepath.Join(t.TempDir(), "runtime-root-file")
		if err := os.WriteFile(runtimeRootPath, []byte("not a directory"), 0o644); err != nil {
			t.Fatalf("write runtime-root file: %v", err)
		}
		service, err := NewIntentService(IntentServiceOptions{
			RuntimeRoot: runtimeRootPath,
			Now:         func() time.Time { return now },
		})
		if err != nil {
			t.Fatalf("new intent service: %v", err)
		}

		_, err = service.CreateIntent(CreateIntentInput{
			Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
			ReturnURL:      "http://127.0.0.1:3000/home",
			RequestOrigin:  "http://127.0.0.1:3000",
			CurrentSession: currentSession,
		})
		intentErr, ok := err.(*IntentError)
		if !ok {
			t.Fatalf("expected intent error, got %T", err)
		}
		if intentErr.Code != "LaunchIntentStoreUnavailable" {
			t.Fatalf("expected store unavailable error, got %#v", intentErr)
		}
	})

	t.Run("store invalid", func(t *testing.T) {
		t.Parallel()

		runtimeRoot := filepath.Join(t.TempDir(), "runtime")
		if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
			t.Fatalf("mkdir runtime root: %v", err)
		}
		if err := os.WriteFile(filepath.Join(runtimeRoot, launchIntentStoreFileName), []byte("{not-json"), 0o644); err != nil {
			t.Fatalf("write invalid store payload: %v", err)
		}
		service, err := NewIntentService(IntentServiceOptions{
			RuntimeRoot: runtimeRoot,
			Now:         func() time.Time { return now },
		})
		if err != nil {
			t.Fatalf("new intent service: %v", err)
		}

		_, err = service.CreateIntent(CreateIntentInput{
			Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
			ReturnURL:      "http://127.0.0.1:3000/home",
			RequestOrigin:  "http://127.0.0.1:3000",
			CurrentSession: currentSession,
		})
		intentErr, ok := err.(*IntentError)
		if !ok {
			t.Fatalf("expected intent error, got %T", err)
		}
		if intentErr.Code != "LaunchIntentStoreInvalid" {
			t.Fatalf("expected store invalid error, got %#v", intentErr)
		}
	})

	t.Run("session capacity exceeded", func(t *testing.T) {
		t.Parallel()

		service, err := NewIntentService(IntentServiceOptions{
			RuntimeRoot:   filepath.Join(t.TempDir(), "runtime"),
			Now:           func() time.Time { return now },
			MaxPerSession: 1,
			MaxTotal:      1,
		})
		if err != nil {
			t.Fatalf("new intent service: %v", err)
		}

		for attempt := 0; attempt < 2; attempt++ {
			_, err = service.CreateIntent(CreateIntentInput{
				Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
				ReturnURL:      "http://127.0.0.1:3000/home",
				RequestOrigin:  "http://127.0.0.1:3000",
				CurrentSession: currentSession,
			})
			if attempt == 0 {
				if err != nil {
					t.Fatalf("expected first create to succeed, got %v", err)
				}
				continue
			}
			intentErr, ok := err.(*IntentError)
			if !ok {
				t.Fatalf("expected intent error, got %T", err)
			}
			if intentErr.Code != "LaunchIntentStoreCapacityExceeded" {
				t.Fatalf("expected capacity error, got %#v", intentErr)
			}
		}
	})
}

func TestIntentServiceConsumeIntentRejectsTamperedExpiredAndReplayedTokens(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	currentTime := now
	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: filepath.Join(t.TempDir(), "runtime"),
		Now:         func() time.Time { return currentTime },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}

	createIntent := func() string {
		result, err := service.CreateIntent(CreateIntentInput{
			Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
			ReturnURL:      "http://127.0.0.1:3000/home",
			RequestOrigin:  "http://127.0.0.1:3000",
			CurrentSession: currentSession,
		})
		if err != nil {
			t.Fatalf("create intent: %v", err)
		}
		return result.LaunchIntentToken
	}

	tamperedToken := createIntent()
	lastByte := tamperedToken[len(tamperedToken)-1]
	replacement := byte('a')
	if lastByte == 'a' {
		replacement = 'b'
	}
	tamperedToken = tamperedToken[:len(tamperedToken)-1] + string(replacement)
	_, _, err = service.ConsumeIntent(currentSession, tamperedToken)
	if err == nil {
		t.Fatal("expected tampered token to fail")
	}
	tamperedErr, ok := err.(*IntentError)
	if !ok {
		t.Fatalf("expected intent error, got %T", err)
	}
	if tamperedErr.Code != "InvalidLaunchIntent" || tamperedErr.Message != "Launch intent token is invalid." {
		t.Fatalf("unexpected tampered-token error %#v", tamperedErr)
	}

	replayedToken := createIntent()
	if _, _, err := service.ConsumeIntent(currentSession, replayedToken); err != nil {
		t.Fatalf("expected first consume to succeed, got %v", err)
	}
	_, _, err = service.ConsumeIntent(currentSession, replayedToken)
	if err == nil {
		t.Fatal("expected replayed token to fail")
	}
	replayErr, ok := err.(*IntentError)
	if !ok {
		t.Fatalf("expected intent error, got %T", err)
	}
	if replayErr.Code != "InvalidLaunchIntent" || replayErr.Message != "Launch intent token is missing or already consumed." {
		t.Fatalf("unexpected replay error %#v", replayErr)
	}

	expiredToken := createIntent()
	currentTime = currentTime.Add(DefaultIntentTTL + time.Second)
	_, _, err = service.ConsumeIntent(currentSession, expiredToken)
	if err == nil {
		t.Fatal("expected expired token to fail")
	}
	expiredErr, ok := err.(*IntentError)
	if !ok {
		t.Fatalf("expected intent error, got %T", err)
	}
	if expiredErr.Code != "InvalidLaunchIntent" || expiredErr.Message != "Launch intent token is invalid." {
		t.Fatalf("unexpected expiry error %#v", expiredErr)
	}
}

func TestIntentServiceConsumeIntentMapsStoreUnavailableErrors(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}

	result, err := service.CreateIntent(CreateIntentInput{
		Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
		ReturnURL:      "http://127.0.0.1:3000/home",
		RequestOrigin:  "http://127.0.0.1:3000",
		CurrentSession: currentSession,
	})
	if err != nil {
		t.Fatalf("create intent: %v", err)
	}
	if err := os.RemoveAll(runtimeRoot); err != nil {
		t.Fatalf("remove runtime root: %v", err)
	}
	if err := os.WriteFile(runtimeRoot, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("replace runtime root with file: %v", err)
	}

	_, _, err = service.ConsumeIntent(currentSession, result.LaunchIntentToken)
	if err == nil {
		t.Fatal("expected store unavailable error")
	}
	intentErr, ok := err.(*IntentError)
	if !ok {
		t.Fatalf("expected intent error, got %T", err)
	}
	if intentErr.Code != "LaunchIntentStoreUnavailable" {
		t.Fatalf("expected LaunchIntentStoreUnavailable, got %#v", intentErr)
	}
}

func TestIntentServiceConsumeIntentRevalidatesStoredPayload(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_710_000_000, 0).UTC()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	service, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{ID: "session-1"},
		Secret:   []byte("secret"),
	}

	result, err := service.CreateIntent(CreateIntentInput{
		Request:        decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`),
		ReturnURL:      "http://127.0.0.1:3000/home",
		RequestOrigin:  "http://127.0.0.1:3000",
		CurrentSession: currentSession,
	})
	if err != nil {
		t.Fatalf("create intent: %v", err)
	}

	storePath := filepath.Join(runtimeRoot, launchIntentStoreFileName)
	content, err := os.ReadFile(storePath)
	if err != nil {
		t.Fatalf("read launch intent store: %v", err)
	}
	var payload map[string]map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode launch intent store: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected exactly one stored intent, got %#v", payload)
	}
	for tokenDigest, entry := range payload {
		entry["launchRequestPayload"] = map[string]any{"workspaceRoot": "   "}
		payload[tokenDigest] = entry
	}
	updatedContent, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("encode mutated launch intent store: %v", err)
	}
	if err := os.WriteFile(storePath, updatedContent, 0o600); err != nil {
		t.Fatalf("write mutated launch intent store: %v", err)
	}

	_, _, err = service.ConsumeIntent(currentSession, result.LaunchIntentToken)
	if err == nil {
		t.Fatal("expected invalid stored payload")
	}
	intentErr, ok := err.(*IntentError)
	if !ok {
		t.Fatalf("expected intent error, got %T", err)
	}
	if intentErr.Code != "InvalidLaunchIntent" {
		t.Fatalf("expected InvalidLaunchIntent, got %#v", intentErr)
	}
	if intentErr.Message != "launchRequest.workspaceRoot is required." {
		t.Fatalf("unexpected invalid stored payload message %#v", intentErr)
	}
}

func TestIntentStoreConsumeOnceAndPruneExpiredTokens(t *testing.T) {
	t.Parallel()

	// The disk-backed store should return the stored payload once, then fail closed on
	// replay, and pruning should remove expired records before they can be consumed again.
	store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), defaultMaxIntentsPerSession, defaultMaxIntentsTotal)
	if err := store.create("token-1", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 120, 100); err != nil {
		t.Fatalf("create token: %v", err)
	}

	stored, err := store.consumeOnce("token-1", "session-1", 110)
	if err != nil {
		t.Fatalf("consume token once: %v", err)
	}
	if stored.LaunchRequestPayload["workspaceRoot"] != "/tmp/workspace" || stored.ReturnURL != "http://localhost/home" {
		t.Fatalf("unexpected stored intent %#v", stored)
	}

	_, err = store.consumeOnce("token-1", "session-1", 110)
	if err == nil || err.Error() != "Launch intent token is missing or already consumed." {
		t.Fatalf("expected consumed token failure, got %v", err)
	}

	if err := store.create("expired", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 99, 90); err != nil {
		t.Fatalf("create expired token: %v", err)
	}
	pruneIntentStoreAt(t, store, 100)
	_, err = store.consumeOnce("expired", "session-1", 100)
	if err == nil || err.Error() != "Launch intent token is missing or already consumed." {
		t.Fatalf("expected pruned token failure, got %v", err)
	}
}

func TestIntentStoreRejectsSessionMismatchWithoutConsumingToken(t *testing.T) {
	t.Parallel()

	// A wrong session id must fail closed without consuming the stored token, so the
	// original session can still consume it afterwards.
	store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), defaultMaxIntentsPerSession, defaultMaxIntentsTotal)
	if err := store.create("token-1", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 200, 100); err != nil {
		t.Fatalf("create token: %v", err)
	}

	_, err := store.consumeOnce("token-1", "session-2", 110)
	if err == nil || err.Error() != "Launch intent token is bound to a different session." {
		t.Fatalf("expected session-mismatch failure, got %v", err)
	}

	stored, err := store.consumeOnce("token-1", "session-1", 110)
	if err != nil {
		t.Fatalf("consume token with original session: %v", err)
	}
	if stored.LaunchRequestPayload["workspaceRoot"] != "/tmp/workspace" || stored.ReturnURL != "http://localhost/home" {
		t.Fatalf("unexpected stored intent %#v", stored)
	}
}

func TestIntentStorePersistsAcrossInstancesIgnoresStaleLockAndKeepsConsumeSingleUse(t *testing.T) {
	t.Parallel()

	// Persisted intents should survive a fresh store instance, a stale lock file should
	// not block normal operations, and cross-instance consume must still be globally single-use.
	storePath := filepath.Join(t.TempDir(), launchIntentStoreFileName)
	lockPath := storePath + ".lock"
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		t.Fatalf("mkdir stale lock dir: %v", err)
	}
	if err := os.WriteFile(lockPath, []byte("stale"), 0o644); err != nil {
		t.Fatalf("write stale lock file: %v", err)
	}

	storeA := newIntentStoreForTest(storePath, defaultMaxIntentsPerSession, defaultMaxIntentsTotal)
	storeB := newIntentStoreForTest(storePath, defaultMaxIntentsPerSession, defaultMaxIntentsTotal)
	if err := storeA.create("token-1", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 200, 100); err != nil {
		t.Fatalf("create persisted token: %v", err)
	}

	stored, err := storeB.consumeOnce("token-1", "session-1", 110)
	if err != nil {
		t.Fatalf("consume persisted token from second store: %v", err)
	}
	if stored.LaunchRequestPayload["workspaceRoot"] != "/tmp/workspace" || stored.ReturnURL != "http://localhost/home" {
		t.Fatalf("unexpected stored intent %#v", stored)
	}

	if err := storeA.create("token-2", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 220, 120); err != nil {
		t.Fatalf("create token for cross-instance consume: %v", err)
	}

	start := make(chan struct{})
	results := make(chan string, 2)
	consume := func(store *intentStore) {
		<-start
		if _, err := store.consumeOnce("token-2", "session-1", 130); err != nil {
			results <- err.Error()
			return
		}
		results <- "ok"
	}

	go consume(storeA)
	go consume(storeB)
	close(start)

	resultA := <-results
	resultB := <-results
	resultSet := []string{resultA, resultB}
	okCount := 0
	missingCount := 0
	for _, result := range resultSet {
		switch result {
		case "ok":
			okCount++
		case "Launch intent token is missing or already consumed.":
			missingCount++
		default:
			t.Fatalf("unexpected concurrent consume result %q", result)
		}
	}
	if okCount != 1 || missingCount != 1 {
		t.Fatalf("expected one success and one consumed failure, got %#v", resultSet)
	}
}

func TestIntentStoreMapsUnavailableReadAndLockParentFailures(t *testing.T) {
	t.Parallel()

	t.Run("lock parent failure stays unavailable", func(t *testing.T) {
		t.Parallel()

		lockParent := filepath.Join(t.TempDir(), "lock-parent-as-file")
		if err := os.WriteFile(lockParent, []byte("not-a-directory"), 0o644); err != nil {
			t.Fatalf("write lock-parent file: %v", err)
		}
		store := newIntentStoreForTest(filepath.Join(lockParent, launchIntentStoreFileName), defaultMaxIntentsPerSession, defaultMaxIntentsTotal)

		err := store.create("token-1", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 120, 100)
		var unavailableErr *IntentStoreUnavailableError
		if !errors.As(err, &unavailableErr) {
			t.Fatalf("expected unavailable error, got %v", err)
		}
		if !strings.Contains(unavailableErr.Message, "Failed creating launch-intent store directory") {
			t.Fatalf("unexpected lock-parent error %#v", unavailableErr)
		}
	})

	t.Run("read failures keep unavailable read wording", func(t *testing.T) {
		t.Parallel()

		storePath := filepath.Join(t.TempDir(), launchIntentStoreFileName)
		if err := os.MkdirAll(storePath, 0o755); err != nil {
			t.Fatalf("mkdir store path as directory: %v", err)
		}
		store := newIntentStoreForTest(storePath, defaultMaxIntentsPerSession, defaultMaxIntentsTotal)

		err := store.create("token-1", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 120, 100)
		var unavailableErr *IntentStoreUnavailableError
		if !errors.As(err, &unavailableErr) {
			t.Fatalf("expected unavailable error, got %v", err)
		}
		if !strings.Contains(unavailableErr.Message, "Failed reading launch-intent store") {
			t.Fatalf("unexpected read-failure error %#v", unavailableErr)
		}
		if strings.Contains(unavailableErr.Message, "Failed acquiring launch-intent store lock") {
			t.Fatalf("expected read failure wording to stay distinct, got %#v", unavailableErr)
		}
	})
}

func TestIntentStoreReadRejectsMalformedEntries(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		payload string
		wantErr string
	}{
		{
			name:    "entry must be object",
			payload: `{"token-1":"not-an-object"}`,
			wantErr: "Launch intent store entries must be objects.",
		},
		{
			name: "session id must be string",
			payload: `{"token-1":{
				"sessionId":1,
				"returnUrl":"http://localhost/home",
				"exp":120,
				"launchRequestPayload":{"workspaceRoot":"/tmp/workspace"}
			}}`,
			wantErr: "Launch intent store session ids must be strings.",
		},
		{
			name: "expiry must be integer",
			payload: `{"token-1":{
				"sessionId":"session-1",
				"returnUrl":"http://localhost/home",
				"exp":120.5,
				"launchRequestPayload":{"workspaceRoot":"/tmp/workspace"}
			}}`,
			wantErr: "Launch intent store expiry values must be integers.",
		},
		{
			name: "launch request payload must be object",
			payload: `{"token-1":{
				"sessionId":"session-1",
				"returnUrl":"http://localhost/home",
				"exp":120,
				"launchRequestPayload":"bad"
			}}`,
			wantErr: "Launch intent store launchRequestPayload must be an object.",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), defaultMaxIntentsPerSession, defaultMaxIntentsTotal)
			if err := os.WriteFile(store.path, []byte(tc.payload), 0o600); err != nil {
				t.Fatalf("write malformed store: %v", err)
			}

			_, err := store.read()
			var stateErr *IntentStoreStateError
			if !errors.As(err, &stateErr) {
				t.Fatalf("expected state error, got %v", err)
			}
			if stateErr.Message != tc.wantErr {
				t.Fatalf("expected state error %q, got %#v", tc.wantErr, stateErr)
			}
		})
	}
}

func TestIntentStoreUpdatePreservesCallbackError(t *testing.T) {
	t.Parallel()

	store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), defaultMaxIntentsPerSession, defaultMaxIntentsTotal)
	bodyErr := errors.New("body-io-error")

	err := store.update(func(record map[string]StoredIntent) (map[string]StoredIntent, error) {
		return nil, bodyErr
	})
	if !errors.Is(err, bodyErr) {
		t.Fatalf("expected callback error to survive, got %v", err)
	}

	var unavailableErr *IntentStoreUnavailableError
	if errors.As(err, &unavailableErr) {
		t.Fatalf("expected callback error to keep its original domain, got %#v", unavailableErr)
	}
}

func TestIntentStoreCapacityLimitsRecoverAfterPruneAndRemainSessionIsolated(t *testing.T) {
	t.Parallel()

	t.Run("per-session capacity recovers after prune", func(t *testing.T) {
		t.Parallel()

		store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), 1, 4)
		if err := store.create("expired-token", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 100, 99); err != nil {
			t.Fatalf("create expired token: %v", err)
		}

		err := store.create("fresh-token-before-prune", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 130, 99)
		var capacityErr *IntentStoreCapacityError
		if !errors.As(err, &capacityErr) || capacityErr.Message != "Launch intent session capacity exceeded." {
			t.Fatalf("expected session-capacity error, got %v", err)
		}

		pruneIntentStoreAt(t, store, 101)
		if err := store.create("fresh-token-after-prune", "session-1", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 131, 101); err != nil {
			t.Fatalf("create token after prune: %v", err)
		}
		stored, err := store.consumeOnce("fresh-token-after-prune", "session-1", 102)
		if err != nil {
			t.Fatalf("consume token after prune: %v", err)
		}
		if stored.ReturnURL != "http://localhost/home" {
			t.Fatalf("unexpected stored intent after prune %#v", stored)
		}
	})

	t.Run("global capacity stays session isolated", func(t *testing.T) {
		t.Parallel()

		store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), 2, 3)
		for _, create := range []struct {
			token     string
			sessionID string
			exp       int64
		}{
			{token: "session-a-1", sessionID: "session-a", exp: 200},
			{token: "session-a-2", sessionID: "session-a", exp: 201},
			{token: "session-b-1", sessionID: "session-b", exp: 202},
		} {
			if err := store.create(create.token, create.sessionID, map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", create.exp, create.exp-100); err != nil {
				t.Fatalf("seed token %s: %v", create.token, err)
			}
		}

		err := store.create("session-c-1", "session-c", map[string]any{"workspaceRoot": "/tmp/workspace"}, "http://localhost/home", 203, 103)
		var capacityErr *IntentStoreCapacityError
		if !errors.As(err, &capacityErr) || capacityErr.Message != "Launch intent global capacity exceeded." {
			t.Fatalf("expected global-capacity error, got %v", err)
		}
	})
}

func TestIntentStoreConcurrentCreateAndPruneDoNotRace(t *testing.T) {
	t.Parallel()

	// Concurrent create/prune operations used to raise runtime errors in the source
	// store; the Go store should stay synchronized and finish without panics or write errors.
	store := newIntentStoreForTest(filepath.Join(t.TempDir(), launchIntentStoreFileName), 2000, 4000)
	errCh := make(chan error, 8)
	var wg sync.WaitGroup

	createWorker := func(workerID int) {
		defer wg.Done()
		for idx := 0; idx < 120; idx++ {
			now := int64(idx)
			if err := store.create(
				strconv.Itoa(workerID)+"-"+strconv.Itoa(idx),
				"session-1",
				map[string]any{"workspaceRoot": "/tmp/workspace"},
				"http://localhost/home",
				now+20,
				now,
			); err != nil {
				errCh <- err
				return
			}
		}
	}

	pruneWorker := func() {
		defer wg.Done()
		for idx := 0; idx < 240; idx++ {
			if err := store.update(func(record map[string]StoredIntent) (map[string]StoredIntent, error) {
				pruneIntents(record, int64(idx))
				return record, nil
			}); err != nil {
				errCh <- err
				return
			}
		}
	}

	for workerID := 0; workerID < 6; workerID++ {
		wg.Add(1)
		go createWorker(workerID)
	}
	for workerID := 0; workerID < 2; workerID++ {
		wg.Add(1)
		go pruneWorker()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatalf("concurrent create/prune: %v", err)
	}
}

func newIntentStoreForTest(path string, maxPerSession int, maxTotal int) *intentStore {
	return &intentStore{
		path:          path,
		maxPerSession: maxPerSession,
		maxTotal:      maxTotal,
	}
}

func pruneIntentStoreAt(t *testing.T, store *intentStore, now int64) {
	t.Helper()

	if err := store.update(func(record map[string]StoredIntent) (map[string]StoredIntent, error) {
		pruneIntents(record, now)
		return record, nil
	}); err != nil {
		t.Fatalf("prune intent store: %v", err)
	}
}

func decodeLaunchRequest(t *testing.T, raw string) Request {
	t.Helper()

	var request Request
	if err := json.Unmarshal([]byte(raw), &request); err != nil {
		t.Fatalf("decode launch request: %v", err)
	}
	return request
}
