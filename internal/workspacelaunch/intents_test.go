package workspacelaunch

import (
	"encoding/json"
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

func decodeLaunchRequest(t *testing.T, raw string) Request {
	t.Helper()

	var request Request
	if err := json.Unmarshal([]byte(raw), &request); err != nil {
		t.Fatalf("decode launch request: %v", err)
	}
	return request
}
