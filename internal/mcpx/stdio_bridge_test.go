package mcpx

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRunStdioBridgeForwardsMCPTraffic(t *testing.T) {
	t.Parallel()

	server, requestCount := newStdioBridgeTestServer(t, "")
	defer server.Close()

	session, closeBridge, bridgeErrCh := startBridgeClientSession(t, StdioBridgeConfig{
		BackendURL: server.URL + "/mcp",
	})
	defer closeBridge()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools through bridge: %v", err)
	}
	if len(toolsResult.Tools) != 1 || toolsResult.Tools[0].Name != "echo" {
		t.Fatalf("expected echo tool, got %#v", toolsResult.Tools)
	}

	callResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "echo",
		Arguments: map[string]any{"text": "hello"},
	})
	if err != nil {
		t.Fatalf("call tool through bridge: %v", err)
	}
	if len(callResult.Content) != 1 {
		t.Fatalf("expected one content item, got %#v", callResult.Content)
	}
	textContent, ok := callResult.Content[0].(*sdkmcp.TextContent)
	if !ok {
		t.Fatalf("expected text content, got %#v", callResult.Content[0])
	}
	if textContent.Text != "hello" {
		t.Fatalf("expected echoed payload, got %#v", textContent)
	}

	if requestCount.Load() == 0 {
		t.Fatal("expected bridge to reach backend server")
	}

	closeBridge()
	if err := <-bridgeErrCh; err != nil {
		t.Fatalf("bridge returned error: %v", err)
	}
}

func TestRunStdioBridgeForwardsConfiguredHeaders(t *testing.T) {
	t.Parallel()

	server, requestCount := newStdioBridgeTestServer(t, "setta_auth_session=test-cookie")
	defer server.Close()

	session, closeBridge, bridgeErrCh := startBridgeClientSession(t, StdioBridgeConfig{
		BackendURL:  server.URL + "/mcp",
		HTTPHeaders: http.Header{"Cookie": []string{"setta_auth_session=test-cookie"}},
	})
	defer closeBridge()

	if _, err := session.ListTools(context.Background(), nil); err != nil {
		t.Fatalf("list tools through authenticated bridge: %v", err)
	}
	if requestCount.Load() == 0 {
		t.Fatal("expected authenticated bridge request to reach backend server")
	}

	closeBridge()
	if err := <-bridgeErrCh; err != nil {
		t.Fatalf("bridge returned error: %v", err)
	}
}

func startBridgeClientSession(
	t *testing.T,
	config StdioBridgeConfig,
) (*sdkmcp.ClientSession, func(), <-chan error) {
	t.Helper()

	clientToBridgeR, clientToBridgeW := io.Pipe()
	bridgeToClientR, bridgeToClientW := io.Pipe()

	config.Stdin = clientToBridgeR
	config.Stdout = bridgeToClientW

	bridgeErrCh := make(chan error, 1)
	go func() {
		bridgeErrCh <- RunStdioBridge(context.Background(), config)
	}()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "bridge-test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.IOTransport{
		Reader: bridgeToClientR,
		Writer: clientToBridgeW,
	}, nil)
	if err != nil {
		_ = clientToBridgeW.Close()
		_ = bridgeToClientR.Close()
		t.Fatalf("connect test client to bridge: %v", err)
	}

	closeBridge := func() {
		_ = session.Close()
		_ = clientToBridgeW.Close()
		_ = bridgeToClientR.Close()
	}
	return session, closeBridge, bridgeErrCh
}

func newStdioBridgeTestServer(
	t *testing.T,
	requiredCookie string,
) (*httptest.Server, *atomic.Int32) {
	t.Helper()

	server := sdkmcp.NewServer(&sdkmcp.Implementation{
		Name:    "bridge-test-server",
		Version: "0.1.0",
	}, nil)

	type echoArgs struct {
		Text string `json:"text" mcp:"text to echo"`
	}

	sdkmcp.AddTool(server, &sdkmcp.Tool{
		Name:        "echo",
		Description: "Echo text.",
	}, func(
		_ context.Context,
		_ *sdkmcp.CallToolRequest,
		args echoArgs,
	) (*sdkmcp.CallToolResult, struct{}, error) {
		return &sdkmcp.CallToolResult{
			Content: []sdkmcp.Content{
				&sdkmcp.TextContent{Text: args.Text},
			},
		}, struct{}{}, nil
	})

	handler := sdkmcp.NewSSEHandler(func(*http.Request) *sdkmcp.Server {
		return server
	}, nil)

	var requestCount atomic.Int32
	mux := http.NewServeMux()
	mux.Handle("/mcp", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		if requiredCookie != "" && r.Header.Get("Cookie") != requiredCookie {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		handler.ServeHTTP(w, r)
	}))

	return httptest.NewServer(mux), &requestCount
}
