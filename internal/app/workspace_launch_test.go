package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppIDEModeCreatesWorkspaceLaunchIntentsOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	bootstrapToken, err := app.authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/__setta__/bootstrap/consume",
		strings.NewReader(`{"token":"`+bootstrapToken+`"}`),
	)
	if err != nil {
		t.Fatalf("new bootstrap consume request: %v", err)
	}
	consumeRequest.Header.Set("Content-Type", "application/json")

	consumeResponse, err := http.DefaultClient.Do(consumeRequest)
	if err != nil {
		t.Fatalf("post bootstrap consume: %v", err)
	}
	defer consumeResponse.Body.Close()
	if consumeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(consumeResponse.Body)
		t.Fatalf("expected bootstrap consume 200, got %d with body %q", consumeResponse.StatusCode, string(body))
	}
	cookies := consumeResponse.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected auth cookie, got %d", len(cookies))
	}

	launchIntentRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"`+cfg.Paths.WorkspaceRoot+`"},"returnUrl":"http://127.0.0.1:3000/home"}`),
	)
	if err != nil {
		t.Fatalf("new create workspace launch intent request: %v", err)
	}
	launchIntentRequest.Header.Set("Content-Type", "application/json")
	launchIntentRequest.Header.Set("Origin", "http://127.0.0.1:3000")
	launchIntentRequest.AddCookie(cookies[0])

	launchIntentResponse, err := http.DefaultClient.Do(launchIntentRequest)
	if err != nil {
		t.Fatalf("post create workspace launch intent: %v", err)
	}
	defer launchIntentResponse.Body.Close()
	if launchIntentResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(launchIntentResponse.Body)
		t.Fatalf("expected launch intent 200, got %d with body %q", launchIntentResponse.StatusCode, string(body))
	}

	var payload struct {
		Ok                bool    `json:"ok"`
		LaunchIntentToken *string `json:"launchIntentToken"`
		RequestedAt       *int64  `json:"requestedAt"`
	}
	if err := json.NewDecoder(launchIntentResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode launch intent payload: %v", err)
	}
	if !payload.Ok || payload.LaunchIntentToken == nil || strings.TrimSpace(*payload.LaunchIntentToken) == "" {
		t.Fatalf("unexpected launch intent payload %#v", payload)
	}
	if payload.RequestedAt == nil || *payload.RequestedAt <= 0 {
		t.Fatalf("expected requestedAt in launch intent payload, got %#v", payload)
	}
}
