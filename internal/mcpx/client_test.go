package mcpx

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/tools"
)

type stubConnector struct {
	connect func(context.Context, ServerConfig, http.Header) (sessionHandle, error)
}

func (c *stubConnector) Connect(ctx context.Context, config ServerConfig, headers http.Header) (sessionHandle, error) {
	return c.connect(ctx, config, headers)
}

type stubSession struct {
	mu        sync.Mutex
	listTools []remoteTool
	listErr   error
	pingErr   error
	call      func(context.Context, string, map[string]any) (ToolCallResult, error)
	closed    int
}

func (s *stubSession) ListTools(context.Context) ([]remoteTool, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return append([]remoteTool(nil), s.listTools...), nil
}

func (s *stubSession) CallTool(ctx context.Context, toolName string, arguments map[string]any) (ToolCallResult, error) {
	if s.call != nil {
		return s.call(ctx, toolName, arguments)
	}
	return ToolCallResult{}, nil
}

func (s *stubSession) Ping(context.Context) error {
	return s.pingErr
}

func (s *stubSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed++
	return nil
}

func TestClientToolCacheNamespacesAndFilters(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientOptions{})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	client.updateToolCacheForServer(DefaultServerID, []remoteTool{
		{
			Name:     "read_file_range",
			Kind:     tools.KindInit,
			ReadOnly: true,
			Metadata: mustMetadata(t, "read_file_range", tools.Metadata{
				Kind:       tools.KindInit,
				AccessType: tools.AccessTypeRead,
			}),
		},
	})
	client.updateToolCacheForServer("github", []remoteTool{
		{
			Name: "search_repo",
			Kind: tools.KindDiscoverable,
		},
	})

	initTools := client.InitToolsForServers(nil)
	if _, ok := initTools[BuildNamespacedToolName(DefaultServerID, "read_file_range")]; !ok {
		t.Fatal("expected namespaced init tool")
	}

	discoverable := client.DiscoverableToolsForServers(map[string]struct{}{"github": {}})
	if _, ok := discoverable["github__search_repo"]; !ok {
		t.Fatal("expected github discoverable tool")
	}
	if _, ok := discoverable[BuildNamespacedToolName(DefaultServerID, "read_file_range")]; ok {
		t.Fatal("did not expect setta init tool in discoverable set")
	}
}

func TestClientCallToolRetriesReadOnlyAfterReconnect(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientOptions{ReconnectWait: time.Second})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	client.Start(context.Background())
	t.Cleanup(func() {
		if err := client.Close(context.Background()); err != nil {
			t.Fatalf("close client: %v", err)
		}
	})

	toolName := BuildNamespacedToolName(DefaultServerID, "read_file_range")
	client.updateToolCacheForServer(DefaultServerID, []remoteTool{
		{
			Name:     "read_file_range",
			Kind:     tools.KindDiscoverable,
			ReadOnly: true,
			Metadata: mustMetadata(t, "read_file_range", tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
			}),
		},
	})

	firstSession := &activeSession{session: &stubSession{
		call: func(context.Context, string, map[string]any) (ToolCallResult, error) {
			return ToolCallResult{}, sdkmcp.ErrConnectionClosed
		},
	}}
	secondSession := &activeSession{session: &stubSession{
		call: func(_ context.Context, toolName string, arguments map[string]any) (ToolCallResult, error) {
			if toolName != "read_file_range" {
				t.Fatalf("expected remote tool name read_file_range, got %q", toolName)
			}
			if arguments["path"] != "README.md" {
				t.Fatalf("expected routed arguments, got %#v", arguments)
			}
			return ToolCallResult{StructuredContent: map[string]any{"ok": true}}, nil
		},
	}}

	client.mu.Lock()
	client.sessions[DefaultServerID] = firstSession
	client.mu.Unlock()

	go func() {
		time.Sleep(50 * time.Millisecond)
		client.mu.Lock()
		client.sessions[DefaultServerID] = secondSession
		client.mu.Unlock()
	}()

	result, err := client.CallTool(context.Background(), toolName, map[string]any{"path": "README.md"})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	payload, ok := result.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("expected structured payload, got %#v", result.StructuredContent)
	}
	if payload["ok"] != true {
		t.Fatalf("expected retry success, got %#v", payload)
	}
}

func TestClientBuildHTTPHeadersMergesProviderAndConfig(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientOptions{
		HeaderProvider: func(serverID string) (http.Header, error) {
			if serverID != DefaultServerID {
				return nil, nil
			}
			headers := http.Header{}
			headers.Set("Cookie", "setta_auth=cookie-value")
			return headers, nil
		},
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	headers, err := client.buildHTTPHeaders(DefaultServerID, ServerConfig{
		Transport:   TransportSSE,
		URL:         "http://127.0.0.1:8000/mcp",
		HTTPHeaders: map[string]string{"Authorization": "Bearer token"},
	})
	if err != nil {
		t.Fatalf("build headers: %v", err)
	}
	if got := headers.Get("Authorization"); got != "Bearer token" {
		t.Fatalf("expected auth header, got %q", got)
	}
	if got := headers.Get("Cookie"); got != "setta_auth=cookie-value" {
		t.Fatalf("expected cookie header, got %q", got)
	}
}

func TestClientStartConnectsAndCloseMarksDisabled(t *testing.T) {
	t.Parallel()

	session := &stubSession{
		listTools: []remoteTool{
			{
				Name:     "read_file_range",
				Kind:     tools.KindDiscoverable,
				ReadOnly: true,
				Metadata: mustMetadata(t, "read_file_range", tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeRead,
				}),
			},
		},
	}
	client, err := NewClient(ClientOptions{
		Servers: map[string]ServerConfig{
			DefaultServerID: {
				Transport: TransportSSE,
				URL:       "http://127.0.0.1:8000/mcp",
			},
		},
		KeepAliveInterval: 10 * time.Millisecond,
		connector: &stubConnector{
			connect: func(context.Context, ServerConfig, http.Header) (sessionHandle, error) {
				return session, nil
			},
		},
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	client.Start(context.Background())
	waitForRuntimeState(t, client, DefaultServerID, RuntimeStateConnected)

	statuses := client.RuntimeStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected one runtime status, got %d", len(statuses))
	}
	if statuses[0].ToolCount != 1 {
		t.Fatalf("expected one tool, got %d", statuses[0].ToolCount)
	}

	if err := client.Close(context.Background()); err != nil {
		t.Fatalf("close client: %v", err)
	}
	statuses = client.RuntimeStatuses()
	if statuses[0].State != RuntimeStateDisabled {
		t.Fatalf("expected disabled state, got %q", statuses[0].State)
	}
	if statuses[0].ToolCount != 0 {
		t.Fatalf("expected zero tool count after close, got %d", statuses[0].ToolCount)
	}
}

func TestClientMissingEnvFailureDoesNotRetry(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientOptions{
		Servers: map[string]ServerConfig{
			"github": {
				Transport: TransportStdio,
				Command:   "${GITHUB_MCP_BIN}",
			},
		},
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	client.Start(context.Background())
	t.Cleanup(func() {
		if err := client.Close(context.Background()); err != nil {
			t.Fatalf("close client: %v", err)
		}
	})

	waitForRuntimeState(t, client, "github", RuntimeStateError)
	status := client.RuntimeStatuses()[0]
	if status.MissingEnvVar == nil || *status.MissingEnvVar != "GITHUB_MCP_BIN" {
		t.Fatalf("expected missing env var metadata, got %#v", status.MissingEnvVar)
	}
	if status.ConsecutiveFailures != 1 {
		t.Fatalf("expected one recorded failure, got %d", status.ConsecutiveFailures)
	}
}

func mustMetadata(t *testing.T, toolName string, metadata tools.Metadata) *tools.Metadata {
	t.Helper()
	normalized, err := metadata.Normalize(toolName)
	if err != nil {
		t.Fatalf("normalize metadata: %v", err)
	}
	return &normalized
}

func waitForRuntimeState(t *testing.T, client *Client, serverID string, want RuntimeState) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, status := range client.RuntimeStatuses() {
			if status.ServerID != serverID {
				continue
			}
			if status.State == want {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}

	var got RuntimeState
	for _, status := range client.RuntimeStatuses() {
		if status.ServerID == serverID {
			got = status.State
		}
	}
	t.Fatalf("expected runtime state %q, got %q", want, got)
}

func TestClientCallToolDoesNotRetryWriteTools(t *testing.T) {
	t.Parallel()

	client, err := NewClient(ClientOptions{ReconnectWait: 50 * time.Millisecond})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	client.Start(context.Background())
	t.Cleanup(func() {
		if err := client.Close(context.Background()); err != nil {
			t.Fatalf("close client: %v", err)
		}
	})

	writeErr := errors.New("write closed")
	client.updateToolCacheForServer(DefaultServerID, []remoteTool{
		{
			Name:     "write_file",
			Kind:     tools.KindDiscoverable,
			ReadOnly: false,
			Metadata: mustMetadata(t, "write_file", tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
			}),
		},
	})
	client.mu.Lock()
	client.sessions[DefaultServerID] = &activeSession{session: &stubSession{
		call: func(context.Context, string, map[string]any) (ToolCallResult, error) {
			return ToolCallResult{}, writeErr
		},
	}}
	client.mu.Unlock()

	_, err = client.CallTool(context.Background(), BuildNamespacedToolName(DefaultServerID, "write_file"), map[string]any{})
	if !errors.Is(err, writeErr) {
		t.Fatalf("expected write call error, got %v", err)
	}
}
