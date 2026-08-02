package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppServesDetachedRunUnknownRunUsesGenericInternalError(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 61238
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	authCookie := newAppTestAuthCookie(t, app)

	for _, routePath := range []string{httpapi.RouteGetRunStatus, httpapi.RouteCancelRun} {
		request, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+routePath,
			strings.NewReader(`{"runId":"missing"}`),
		)
		if err != nil {
			t.Fatalf("new %s request: %v", routePath, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", routePath, err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatalf("read %s payload: %v", routePath, err)
		}

		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("decode %s payload: %v (body %q)", routePath, err, string(body))
		}

		if response.StatusCode != http.StatusInternalServerError {
			t.Fatalf("expected %s 500, got %d with payload %#v", routePath, response.StatusCode, payload)
		}
		errorPayload, ok := payload["error"].(map[string]any)
		if !ok {
			t.Fatalf("expected %s error envelope, got %#v (body %q)", routePath, payload, string(body))
		}
		if errorPayload["code"] != "internal_error" {
			t.Fatalf("expected %s internal_error code, got %#v (body %q)", routePath, errorPayload["code"], string(body))
		}
	}
}
