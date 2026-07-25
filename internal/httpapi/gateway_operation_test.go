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
