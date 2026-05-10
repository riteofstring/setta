package app

import (
	"context"
	"io"
	"testing"

	"setta/internal/config"
	"setta/internal/observability"
)

func TestAppLauncherDoesNotStartWatchCodeService(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect launcher mode to start watch code service")
	}
}

func TestAppLauncherModeBlocksWatchCodeProviderHost(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeLauncher
	prepareAppCurrentSession(t, cfg)
	const providerPluginID = "setta-watch-code"
	installAppRepoPlugin(t, cfg, providerPluginID)
	seedAppLauncherWatchCodeProviderData(t, cfg, providerPluginID)

	app, server, cookie := startAppServerWithAuthCookie(t, cfg)
	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect launcher mode to start watch code service")
	}

	runtimePayload := fetchAppPluginRuntime(t, server.URL, cookie)
	assertLauncherWatchCodeProviderUnavailable(t, runtimePayload, providerPluginID)

	initialRevision := app.ProjectStates().Main().Snapshot().Revision
	response := postAppWatchCodePluginRoute(
		t,
		server.URL,
		cookie,
		providerPluginID,
		"inputs",
		`{"projectConfigId":"project-alpha","folders":[],"files":[]}`,
	)
	assertLauncherWatchCodeRouteFailsClosed(t, response)
	assertLauncherWatchCodeProjectUnchanged(t, app, providerPluginID, initialRevision)
}
