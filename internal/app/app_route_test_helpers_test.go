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
	"setta/internal/observability"
)

type appRouteTestFixture struct {
	app        *App
	serverURL  string
	authCookie *http.Cookie
}

func newAppRouteTestFixture(t *testing.T, cfg config.Config) appRouteTestFixture {
	t.Helper()

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
	t.Cleanup(server.Close)

	return appRouteTestFixture{
		app:        app,
		serverURL:  server.URL,
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func (fixture appRouteTestFixture) getAPI(t *testing.T, route string, label string) *http.Response {
	t.Helper()
	return fixture.doAPI(t, http.MethodGet, route, "", label)
}

func (fixture appRouteTestFixture) postAPI(t *testing.T, route string, body string, label string) *http.Response {
	t.Helper()
	return fixture.doAPI(t, http.MethodPost, route, body, label)
}

func (fixture appRouteTestFixture) getRaw(t *testing.T, path string, label string) *http.Response {
	t.Helper()
	return fixture.doRaw(t, http.MethodGet, path, "", label)
}

func (fixture appRouteTestFixture) postRaw(t *testing.T, path string, body string, label string) *http.Response {
	t.Helper()
	return fixture.doRaw(t, http.MethodPost, path, body, label)
}

func (fixture appRouteTestFixture) doAPI(t *testing.T, method string, route string, body string, label string) *http.Response {
	t.Helper()
	return fixture.doRaw(t, method, "/api"+route, body, label)
}

func (fixture appRouteTestFixture) doRaw(t *testing.T, method string, path string, body string, label string) *http.Response {
	t.Helper()

	request, err := http.NewRequest(method, fixture.serverURL+path, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new %s request: %v", label, err)
	}
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	request.AddCookie(fixture.authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	return response
}

func getAppRoutePublic(t *testing.T, serverURL string, path string, label string) *http.Response {
	t.Helper()

	response, err := http.Get(serverURL + path)
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	return response
}

func requireAppRouteStatusAndClose(t *testing.T, response *http.Response, wantStatus int, label string) {
	t.Helper()
	defer response.Body.Close()
	requireAppRouteStatus(t, response, wantStatus, label)
}

func requireAppRouteJSON[T any](t *testing.T, response *http.Response, wantStatus int, label string) T {
	t.Helper()
	defer response.Body.Close()
	requireAppRouteStatus(t, response, wantStatus, label)

	var payload T
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode %s payload: %v", label, err)
	}
	return payload
}

func readAppRouteBodyString(t *testing.T, response *http.Response, wantStatus int, label string) string {
	t.Helper()
	defer response.Body.Close()
	requireAppRouteStatus(t, response, wantStatus, label)

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s body: %v", label, err)
	}
	return string(body)
}

func requireAppRouteHeader(t *testing.T, response *http.Response, key string, want string, label string) {
	t.Helper()
	if got := response.Header.Get(key); got != want {
		t.Fatalf("expected %s header %s=%q, got %q", label, key, want, got)
	}
}

func requireAppRouteStatus(t *testing.T, response *http.Response, wantStatus int, label string) {
	t.Helper()
	if response.StatusCode != wantStatus {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s %d, got %d with body %q", label, wantStatus, response.StatusCode, string(body))
	}
}
