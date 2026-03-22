package app

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/observability"
)

func TestAppRetainedPythonListenerBootstrapsFromLiveGoWebsocket(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("expected tcp listener, got %T", listener.Addr())
	}
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = tcpAddr.Port
	prepareAppCurrentSession(t, cfg)
	t.Setenv("SETTA_SESSIONS_ROOT", filepath.Join(cfg.Paths.RuntimeRoot, "sessions"))

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunnerSummaryProject(t, app)

	server := httptest.NewUnstartedServer(app.Handler())
	server.Listener = listener
	server.Start()
	t.Cleanup(func() {
		server.CloseClientConnections()
		server.Close()
	})

	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	cookieValue, _, err := app.Auth().MintAuthCookie(time.Now())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}

	serverURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	serverPort := serverURL.Port()
	if serverPort == "" {
		t.Fatalf("expected server url port in %q", server.URL)
	}

	repoRoot := appTestRepoRoot(t)
	pythonPath := appTestWorkerPython(t, repoRoot)
	script := `
import asyncio
import contextlib
import json
import sys

from setta.api.listener import SettaListener


async def main() -> None:
    listener = SettaListener(
        project_config_id="project-alpha",
        host=sys.argv[1],
        port=int(sys.argv[2]),
        auth_headers={"Cookie": f"{sys.argv[3]}={sys.argv[4]}"},
    )
    task = asyncio.create_task(listener._connect_once())
    payload = None
    try:
        for _ in range(200):
            if (
                listener._runtime_state is not None
                and listener._latest_dependency_metadata is not None
                and listener._project_config_id == "project-alpha"
                and listener._is_registered
            ):
                payload = {
                    "project_config_id": listener._project_config_id,
                    "metadata_hydrated": listener._latest_dependency_metadata is not None,
                    "is_registered": listener._is_registered,
                }
                break
            await asyncio.sleep(0.01)
        if payload is None:
            raise RuntimeError("listener bootstrap timeout")
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    print(json.dumps(payload))


asyncio.run(main())
`
	command := exec.CommandContext(
		t.Context(),
		pythonPath,
		"-c",
		script,
		cfg.Server.Host,
		serverPort,
		cookieName,
		cookieValue,
	)
	command.Dir = cfg.Paths.WorkspaceRoot
	command.Env = append(command.Environ(), "PYTHONPATH="+filepath.Join(repoRoot, "backend"))
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run retained python listener integration script: %v\n%s", err, string(output))
	}

	var payload struct {
		ProjectConfigID  string `json:"project_config_id"`
		MetadataHydrated bool   `json:"metadata_hydrated"`
		IsRegistered     bool   `json:"is_registered"`
	}
	if err := json.Unmarshal(output, &payload); err != nil {
		t.Fatalf("decode retained python listener payload: %v\n%s", err, string(output))
	}
	if payload.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %#v", payload.ProjectConfigID)
	}
	if !payload.MetadataHydrated || !payload.IsRegistered {
		t.Fatalf("expected hydrated registered listener payload, got %#v", payload)
	}
}
