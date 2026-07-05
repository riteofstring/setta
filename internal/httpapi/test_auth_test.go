package httpapi

import (
	"context"
	"net/http"
	"testing"

	"setta/internal/runtimeauth"
)

type authenticatedTestHandler struct {
	handler http.Handler
	token   string
}

func newAuthenticatedTestHandler(t *testing.T, config HandlerConfig) http.Handler {
	t.Helper()
	store, token := newTestRuntimeAuthStore(t)
	config.RuntimeAuthService = store
	if config.RuntimeMetadata.ID == "" {
		config.RuntimeMetadata = RuntimeMetadata{
			ID:          "runtime_test",
			DisplayName: "Test Runtime",
		}
	}
	return authenticatedTestHandler{
		handler: NewHandler(config),
		token:   token,
	}
}

func newTestRuntimeAuthStore(t *testing.T) (*runtimeauth.Store, string) {
	t.Helper()
	store, err := runtimeauth.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new runtime auth store: %v", err)
	}
	_, token, err := store.CreateDeviceSession(context.Background(), "Test device")
	if err != nil {
		t.Fatalf("create test device session: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close runtime auth store: %v", err)
		}
	})
	return store, token
}

func (handler authenticatedTestHandler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if request.Header.Get("Authorization") == "" {
		request.Header.Set("Authorization", "Bearer "+handler.token)
	}
	handler.handler.ServeHTTP(response, request)
}
