package settacmd

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/localsessions"
)

func TestRunMCPHelpPrintsUsage(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run([]string{"mcp", "--help"}, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		CWD:    t.TempDir(),
	})
	if err != nil {
		t.Fatalf("run mcp --help: %v", err)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
	output := stdout.String()
	if !strings.Contains(output, "setta mcp [options]") {
		t.Fatalf("expected mcp usage synopsis, got %q", output)
	}
	if !strings.Contains(output, "--backend URL") {
		t.Fatalf("expected backend flag help, got %q", output)
	}
}

func TestRunMCPBridgeWithBootstrapToken(t *testing.T) {
	t.Parallel()

	server := newAuthenticatedBridgeCommandTestServer(t, "setta_auth_bridge=bootstrap-cookie", func(w http.ResponseWriter, r *http.Request) {
		payload := struct {
			Token string `json:"token"`
		}{}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode bootstrap payload: %v", err)
		}
		if payload.Token != "bootstrap-token" {
			t.Fatalf("expected bootstrap token, got %q", payload.Token)
		}
		http.SetCookie(w, &http.Cookie{
			Name:  "setta_auth_bridge",
			Value: "bootstrap-cookie",
			Path:  "/",
		})
		_, _ = io.WriteString(w, `{"status":"ok"}`)
	})
	defer server.Close()

	session, closeBridge, bridgeErrCh := startSettaMCPBridgeSession(t, RunOptions{
		CWD:       t.TempDir(),
		Now:       func() time.Time { return time.Date(2026, time.March, 15, 12, 0, 0, 0, time.UTC) },
		EnvLookup: os.LookupEnv,
	}, "mcp", "--backend", server.URL+"/mcp", "--token", "bootstrap-token")
	defer closeBridge()

	assertBridgeToolCall(t, session)

	closeBridge()
	if err := <-bridgeErrCh; err != nil {
		t.Fatalf("mcp bridge returned error: %v", err)
	}
}

func TestRunMCPBridgeWithCurrentSessionAuth(t *testing.T) {
	now := time.Date(2026, time.March, 15, 12, 0, 0, 0, time.UTC)
	workspaceRoot, expectedCookie := prepareMCPBridgeCurrentSession(t, now)

	server := newAuthenticatedBridgeCommandTestServer(t, expectedCookie, nil)
	defer server.Close()

	session, closeBridge, bridgeErrCh := startSettaMCPBridgeSession(t, RunOptions{
		CWD:       workspaceRoot,
		Now:       func() time.Time { return now },
		EnvLookup: os.LookupEnv,
	}, "mcp", "--backend", server.URL+"/mcp")
	defer closeBridge()

	assertBridgeToolCall(t, session)

	closeBridge()
	if err := <-bridgeErrCh; err != nil {
		t.Fatalf("mcp bridge returned error: %v", err)
	}
}

func startSettaMCPBridgeSession(
	t *testing.T,
	options RunOptions,
	args ...string,
) (*sdkmcp.ClientSession, func(), <-chan error) {
	t.Helper()

	clientToBridgeR, clientToBridgeW := io.Pipe()
	bridgeToClientR, bridgeToClientW := io.Pipe()

	runOptions := options
	runOptions.Stdin = clientToBridgeR
	runOptions.Stdout = bridgeToClientW
	if runOptions.Stderr == nil {
		runOptions.Stderr = io.Discard
	}

	bridgeErrCh := make(chan error, 1)
	go func() {
		bridgeErrCh <- Run(args, runOptions)
	}()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "settacmd-mcp-test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.IOTransport{
		Reader: bridgeToClientR,
		Writer: clientToBridgeW,
	}, nil)
	if err != nil {
		_ = clientToBridgeW.Close()
		_ = bridgeToClientR.Close()
		t.Fatalf("connect test client: %v", err)
	}

	closeBridge := func() {
		_ = session.Close()
		_ = clientToBridgeW.Close()
		_ = bridgeToClientR.Close()
	}
	return session, closeBridge, bridgeErrCh
}

func assertBridgeToolCall(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(toolsResult.Tools) != 1 || toolsResult.Tools[0].Name != "echo" {
		t.Fatalf("expected echo tool, got %#v", toolsResult.Tools)
	}

	callResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "echo",
		Arguments: map[string]any{"text": "through-bridge"},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if len(callResult.Content) != 1 {
		t.Fatalf("expected one content item, got %#v", callResult.Content)
	}
	textContent, ok := callResult.Content[0].(*sdkmcp.TextContent)
	if !ok {
		t.Fatalf("expected text content, got %#v", callResult.Content[0])
	}
	if textContent.Text != "through-bridge" {
		t.Fatalf("expected echoed text, got %#v", textContent)
	}
}

func newAuthenticatedBridgeCommandTestServer(
	t *testing.T,
	requiredCookie string,
	bootstrapHandler func(http.ResponseWriter, *http.Request),
) *httptest.Server {
	t.Helper()

	server := sdkmcp.NewServer(&sdkmcp.Implementation{
		Name:    "settacmd-bridge-test-server",
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

	sseHandler := sdkmcp.NewSSEHandler(func(*http.Request) *sdkmcp.Server {
		return server
	}, nil)

	mux := http.NewServeMux()
	mux.Handle("/mcp", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != requiredCookie {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		sseHandler.ServeHTTP(w, r)
	}))
	if bootstrapHandler != nil {
		mux.HandleFunc("/__setta__/bootstrap/consume", bootstrapHandler)
	}
	return httptest.NewServer(mux)
}

func prepareMCPBridgeCurrentSession(t *testing.T, now time.Time) (string, string) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	runtimeRoot := filepath.Join(root, "runtime")
	sessionsRoot := filepath.Join(runtimeRoot, "sessions")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: sessionsRoot,
		Now: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}
	metadata, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot: workspaceRoot,
		Host:          "127.0.0.1",
		Port:          8000,
		PID:           os.Getpid(),
		RuntimeRoot:   runtimeRoot,
		SettaHome:     settaHome,
		ServerMode:    string(config.ModeIDE),
	})
	if err != nil {
		t.Fatalf("create current session: %v", err)
	}
	secret, err := registry.LoadSecret(metadata)
	if err != nil {
		t.Fatalf("load session secret: %v", err)
	}

	t.Setenv("SETTA_SESSION_ID", metadata.ID)
	t.Setenv("SETTA_SESSIONS_ROOT", sessionsRoot)

	cookieName, err := auth.CookieName(auth.DefaultAuthCookieName, metadata.ID)
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}
	cookieValue, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(metadata.ID, secret, now)
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}

	return workspaceRoot, cookieName + "=" + cookieValue
}
