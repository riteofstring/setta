package workspacelaunch

import (
	"encoding/json"
	"os"
	"path/filepath"
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
	currentTime = currentTime.Add(defaultIntentTTLSeconds + time.Second)
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

func decodeLaunchRequest(t *testing.T, raw string) Request {
	t.Helper()

	var request Request
	if err := json.Unmarshal([]byte(raw), &request); err != nil {
		t.Fatalf("decode launch request: %v", err)
	}
	return request
}
