package runtimereporting

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/httpapi"
	"setta/internal/runtimeaccounting"
)

func TestClientReportsTransitionWithScopedBearerCredential(t *testing.T) {
	credential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	var received runtimeaccounting.ActivityTransition
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		endpoint := httpapi.RuntimeAccountingReportEndpoint()
		if request.URL.Path != endpoint.Path || request.Method != endpoint.Method ||
			request.Header.Get("Authorization") != "Bearer "+credential.Token {
			t.Fatalf("runtime report request = %s %s, authorization %q",
				request.Method, request.URL.Path, request.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(request.Body).Decode(&received); err != nil {
			t.Fatal(err)
		}
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	client, err := NewClient(ClientConfig{
		BaseURL: server.URL, Credential: credential, HTTPClient: server.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}
	transition := runtimeaccounting.ActivityTransition{
		EventID: "report-client-event", At: time.Now().UTC(),
		Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
	}
	if err := client.RecordTransition(context.Background(), transition); err != nil {
		t.Fatal(err)
	}
	if received != transition {
		t.Fatalf("received transition = %+v, want %+v", received, transition)
	}
}

func TestClientReturnsContentFreeStatusAndTransportErrors(t *testing.T) {
	credential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		http.Error(response, "provider content must stay private", http.StatusConflict)
	}))
	client, err := NewClient(ClientConfig{
		BaseURL: server.URL, Credential: credential, HTTPClient: server.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}
	err = client.RecordTransition(context.Background(), runtimeaccounting.ActivityTransition{})
	var reportErr *ReportError
	if !errors.As(err, &reportErr) || reportErr.StatusCode != http.StatusConflict ||
		strings.Contains(err.Error(), "provider content") ||
		strings.Contains(err.Error(), credential.Token) {
		t.Fatalf("runtime report error = %v", err)
	}
	server.Close()
	err = client.RecordTransition(context.Background(), runtimeaccounting.ActivityTransition{})
	if !errors.As(err, &reportErr) || reportErr.StatusCode != 0 {
		t.Fatalf("runtime transport error = %v", err)
	}
}

func TestClientRequiresSecureOriginAndPrivateCredentialFile(t *testing.T) {
	credential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	for _, origin := range []string{
		"", "http://example.com", "https://user@example.com", "https://example.com/path",
	} {
		if _, err := NewClient(ClientConfig{BaseURL: origin, Credential: credential}); err == nil {
			t.Fatalf("unsafe runtime reporting origin %q accepted", origin)
		}
	}
	directory := t.TempDir()
	path := filepath.Join(directory, "reporter.json")
	encoded, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	read, err := ReadCredentialFile(path)
	if err != nil || read != credential {
		t.Fatalf("read runtime reporting credential = %+v, %v", read, err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadCredentialFile(path); err == nil {
		t.Fatal("world-readable runtime reporting credential was accepted")
	}
}
