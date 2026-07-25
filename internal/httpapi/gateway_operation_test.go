package httpapi

import (
	"net/http"
	"testing"
)

func TestGatewayOperationUsesEndpointRegistryNames(t *testing.T) {
	tests := []struct {
		method string
		path   string
		want   string
	}{
		{method: http.MethodGet, path: "/conversations/events", want: "ConversationEventStream"},
		{method: http.MethodPost, path: "/conversations/turns/stop", want: "StopTopicConversationTurn"},
		{method: http.MethodPost, path: "/conversations/approvals/submit", want: "SubmitTopicConversationApproval"},
		{method: http.MethodPost, path: "/conversations/artifacts/read", want: "ReadConversationArtifact"},
		{method: http.MethodGet, path: "/workspace-session", want: "WorkspaceSession"},
		{method: http.MethodPost, path: "/workspace-session", want: ""},
		{method: http.MethodGet, path: "/not-an-endpoint", want: ""},
	}
	for _, test := range tests {
		if got := GatewayOperation(test.method, test.path); got != test.want {
			t.Fatalf("GatewayOperation(%q, %q) = %q, want %q", test.method, test.path, got, test.want)
		}
	}
}

func TestControlPlaneEndpointRegistryOwnsRuntimeAccountingWithoutDesktopExposure(t *testing.T) {
	endpoints := ControlPlaneEndpoints()
	if len(endpoints) != 1 {
		t.Fatalf("control-plane endpoints = %+v", endpoints)
	}
	endpoint := endpoints[0]
	if endpoint.Name != "RecordRuntimeAccountingTransition" ||
		endpoint.Method != http.MethodPost ||
		endpoint.Path != "/control-plane/runtime-accounting/events" ||
		endpoint.RequestBodyLimitBytes != 64*1024 {
		t.Fatalf("runtime accounting endpoint = %+v", endpoint)
	}
	for _, desktopEndpoint := range Contracts().Endpoints {
		if desktopEndpoint.Name == endpoint.Name || desktopEndpoint.Path == endpoint.Path {
			t.Fatalf("runtime reporting endpoint leaked into desktop contracts: %+v", desktopEndpoint)
		}
	}
	endpoints[0].Path = "/mutated"
	if ControlPlaneEndpoints()[0].Path != "/control-plane/runtime-accounting/events" {
		t.Fatal("control-plane endpoint registry returned mutable storage")
	}
}
