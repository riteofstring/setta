package sprites

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

func TestSDKClientFindRuntimeUsesDetailedObservation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/v1/sprites/setta-u-missing" {
			response.WriteHeader(http.StatusNotFound)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"name":"setta-u-runtime","status":"running","labels":["setta-managed"]}`))
	}))
	t.Cleanup(server.Close)

	client := newSDKClientWithBaseURL("phase1b-token", server.URL)
	runtime, found, err := client.FindRuntime(context.Background(), "setta-u-runtime")
	if err != nil || !found {
		t.Fatalf("FindRuntime: found=%t err=%v", found, err)
	}
	if runtime.Status != "running" || runtime.Name != "setta-u-runtime" {
		t.Fatalf("runtime = %#v", runtime)
	}
	if _, found, err := client.FindRuntime(context.Background(), "setta-u-missing"); err != nil || found {
		t.Fatalf("FindRuntime missing: found=%t err=%v", found, err)
	}
}

func TestSDKClientPaginatesOrganizationSnapshot(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests++
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Query().Get("continuation_token") {
		case "":
			_, _ = response.Write([]byte(
				`{"name":"setta-test","running":0,"warm":1,"cold":1,"running_limit":10,"warm_limit":10,"sprites":[{"name":"first"}],"has_more":true,"next_continuation_token":"page-2"}`,
			))
		case "page-2":
			_, _ = response.Write([]byte(
				`{"name":"setta-test","running":0,"warm":1,"cold":1,"running_limit":10,"warm_limit":10,"sprites":[{"name":"second"}],"has_more":false}`,
			))
		default:
			t.Fatalf("unexpected continuation token %q", request.URL.Query().Get("continuation_token"))
		}
	}))
	t.Cleanup(server.Close)

	client := newSDKClientWithBaseURL("phase1b-token", server.URL)
	snapshot, err := client.OrganizationSnapshot(context.Background())
	if err != nil {
		t.Fatalf("OrganizationSnapshot: %v", err)
	}
	names := make([]string, 0, len(snapshot.Runtimes))
	for _, runtime := range snapshot.Runtimes {
		names = append(names, runtime.Name)
	}
	if requests != 2 || !slices.Equal(names, []string{"first", "second"}) {
		t.Fatalf("requests=%d runtime names=%v", requests, names)
	}
}

func TestSDKClientRejectsAmbiguousOrganizationPagination(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(
			`{"name":"setta-test","running":0,"warm":0,"cold":1,"running_limit":10,"warm_limit":10,"sprites":[],"has_more":true}`,
		))
	}))
	t.Cleanup(server.Close)

	client := newSDKClientWithBaseURL("phase1b-token", server.URL)
	if _, err := client.OrganizationSnapshot(context.Background()); err == nil {
		t.Fatal("OrganizationSnapshot succeeded without a continuation token")
	}
}

func TestSDKClientAcceptsTokenlessTerminalPageWhenCountersProveCompleteness(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(
			`{"name":"setta-test","running":0,"warm":0,"cold":0,"running_limit":10,"warm_limit":10,"sprites":[],"has_more":true,"next_continuation_token":null}`,
		))
	}))
	t.Cleanup(server.Close)

	client := newSDKClientWithBaseURL("phase1b-token", server.URL)
	snapshot, err := client.OrganizationSnapshot(context.Background())
	if err != nil {
		t.Fatalf("OrganizationSnapshot: %v", err)
	}
	if len(snapshot.Runtimes) != 0 || snapshot.Info.Cold != 0 {
		t.Fatalf("snapshot = %#v", snapshot)
	}
}

func TestSDKClientReadsLiveTopLevelOrganizationCapacity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/sprites" || request.URL.Query().Get("max_results") != "50" {
			t.Fatalf("request URL = %s", request.URL.String())
		}
		_, _ = response.Write([]byte(
			`{"name":"setta-test","running":0,"warm":0,"cold":2,"running_limit":10,"warm_limit":10,"sprites":[{"name":"first","status":"cold"},{"name":"second","status":"cold"}]}`,
		))
	}))
	t.Cleanup(server.Close)

	client := newSDKClientWithBaseURL("phase1b-token", server.URL)
	snapshot, err := client.OrganizationSnapshot(context.Background())
	if err != nil {
		t.Fatalf("OrganizationSnapshot: %v", err)
	}
	if snapshot.Info.Name != "setta-test" || snapshot.Info.Cold != 2 || snapshot.Info.WarmLimit != 10 {
		t.Fatalf("organization snapshot = %#v", snapshot)
	}
}
