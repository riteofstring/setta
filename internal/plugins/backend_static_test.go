package plugins

import "testing"

func TestFindRegisteredStaticAssetMatchPrefersLongestPrefix(t *testing.T) {
	t.Parallel()

	match, ok, err := findRegisteredStaticAssetMatch(
		[]DiscoveredPlugin{
			newStaticDirTestPlugin("plugin-root", PluginRuntimeStateActive, "/static"),
			newStaticDirTestPlugin("plugin-images", PluginRuntimeStateActive, "/static/images"),
		},
		"/static/images/logo.png",
	)
	if err != nil {
		t.Fatalf("find registered static asset match: %v", err)
	}
	if !ok {
		t.Fatal("expected static asset match")
	}
	if match.Entry.PluginID != "plugin-images" {
		t.Fatalf("expected longest prefix plugin, got %#v", match)
	}
	if match.RelativePath != "logo.png" {
		t.Fatalf("expected relative path logo.png, got %#v", match.RelativePath)
	}
}

func TestFindRegisteredStaticAssetMatchRejectsConflictingPrefixes(t *testing.T) {
	t.Parallel()

	_, ok, err := findRegisteredStaticAssetMatch(
		[]DiscoveredPlugin{
			newStaticDirTestPlugin("plugin-a", PluginRuntimeStateActive, "/static"),
			newStaticDirTestPlugin("plugin-b", PluginRuntimeStatePendingRestart, "/static"),
		},
		"/static/logo.png",
	)
	if err == nil {
		t.Fatal("expected conflicting static dir registrations error")
	}
	if ok {
		t.Fatal("expected conflict to prevent a successful match")
	}
	if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Code != ServiceErrorCodeBackendRuntimeInvalid {
		t.Fatalf("expected backend runtime invalid error, got %#v", err)
	}
}

func newStaticDirTestPlugin(pluginID string, state PluginRuntimeState, routePrefix string) DiscoveredPlugin {
	return DiscoveredPlugin{
		PluginID: pluginID,
		Manifest: &PluginManifest{},
		State:    state,
		EffectiveCapabilities: []string{
			"registerStaticDir",
		},
		RegisteredStaticDirs: []PluginRegisteredStaticDir{
			{
				RoutePrefix: routePrefix,
				Dir:         "backend/static",
			},
		},
	}
}
