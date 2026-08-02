package evalharness

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"setta/internal/conversation"
	"setta/internal/httpapi"
)

func TestNewBackendClientRequiresNumericLoopbackOrigin(t *testing.T) {
	for _, baseURL := range []string{
		"http://127.0.0.1:8080",
		"http://127.0.0.2:1",
		"http://[::1]:65535",
	} {
		t.Run(baseURL, func(t *testing.T) {
			if _, err := NewBackendClient(BackendClientConfig{BaseURL: baseURL, Token: "token"}); err != nil {
				t.Fatalf("valid loopback origin: %v", err)
			}
		})
	}

	for _, baseURL := range []string{
		"https://127.0.0.1:8080",
		"http://localhost:8080",
		"http://192.0.2.1:8080",
		"http://127.0.0.1",
		"http://127.0.0.1:8080/",
		"http://127.0.0.1:8080?",
		"http://user@127.0.0.1:8080",
	} {
		t.Run(baseURL, func(t *testing.T) {
			if _, err := NewBackendClient(BackendClientConfig{BaseURL: baseURL, Token: "token"}); err == nil {
				t.Fatal("unsafe backend origin was accepted")
			}
		})
	}
}

func TestBackendClientUpdatesRoleConfigurationsThroughProductionEndpoints(t *testing.T) {
	global, workspace := validTestRoleConfigurations()
	profile := conversation.DefaultDirectorRoleProfile()
	updates := []conversation.RoleProfileUpdate{{Role: conversation.RoleDirector, Profile: &profile}}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/roles/configuration/global/update":
			var payload httpapi.UpdateGlobalRoleProfilesRequest
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Errorf("decode global update: %v", err)
			}
			if !reflect.DeepEqual(payload.Updates, updates) {
				t.Errorf("global updates = %#v", payload.Updates)
			}
			_ = json.NewEncoder(response).Encode(global)
		case "/workspaces/roles/update":
			var payload httpapi.UpdateWorkspaceRoleProfilesRequest
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Errorf("decode workspace update: %v", err)
			}
			if payload.WorkspaceID != "workspace-eval" || !reflect.DeepEqual(payload.Updates, updates) {
				t.Errorf("workspace update = %#v", payload)
			}
			_ = json.NewEncoder(response).Encode(workspace)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client, err := NewBackendClient(BackendClientConfig{BaseURL: server.URL, Token: "token"})
	if err != nil {
		t.Fatalf("create backend client: %v", err)
	}
	if _, err := client.UpdateGlobalRoleConfiguration(context.Background(), updates); err != nil {
		t.Fatalf("update global roles: %v", err)
	}
	if _, err := client.UpdateWorkspaceRoleConfiguration(
		context.Background(),
		"workspace-eval",
		updates,
	); err != nil {
		t.Fatalf("update workspace roles: %v", err)
	}
}

func TestNewBackendClientRejectsUnsafeBootstrapTokens(t *testing.T) {
	for name, token := range map[string]string{
		"empty":      "",
		"whitespace": "token with space",
		"oversized":  strings.Repeat("x", backendMaximumTokenBytes+1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := NewBackendClient(BackendClientConfig{
				BaseURL: "http://127.0.0.1:8080",
				Token:   token,
			}); err == nil {
				t.Fatal("unsafe backend token was accepted")
			}
		})
	}
}

func TestBackendClientDoesNotFollowRedirects(t *testing.T) {
	var redirectedRequests atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		redirectedRequests.Add(1)
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"reached":true}`))
	}))
	defer target.Close()

	source := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer bootstrap-token" {
			t.Errorf("authorization header = %q", request.Header.Get("Authorization"))
		}
		http.Redirect(response, request, target.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()

	client, err := NewBackendClient(BackendClientConfig{
		BaseURL: source.URL,
		Token:   "bootstrap-token",
	})
	if err != nil {
		t.Fatalf("create backend client: %v", err)
	}
	_, err = getBackendJSON[map[string]bool](context.Background(), client, "/redirect")
	if err == nil || !strings.Contains(err.Error(), "HTTP 307") {
		t.Fatalf("redirect error = %v", err)
	}
	if redirectedRequests.Load() != 0 {
		t.Fatalf("redirect target received %d requests", redirectedRequests.Load())
	}
}
