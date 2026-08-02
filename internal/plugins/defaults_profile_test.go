package plugins

import (
	"reflect"
	"testing"
)

func TestDefaultsInstallProfileIsExplicitAndVersioned(t *testing.T) {
	t.Parallel()

	profile := DefaultsInstallProfile()
	if profile.ID != DefaultsInstallProfileID {
		t.Fatalf("expected defaults profile id %q, got %q", DefaultsInstallProfileID, profile.ID)
	}
	if profile.Version != DefaultsInstallProfileVersion {
		t.Fatalf("expected defaults profile version %d, got %d", DefaultsInstallProfileVersion, profile.Version)
	}
	if !reflect.DeepEqual(profile.PackageSpecs, []string{"setta-basedpyright==0.1.0"}) {
		t.Fatalf("unexpected defaults profile package specs %#v", profile.PackageSpecs)
	}
	if !reflect.DeepEqual(profile.LanguageServerPluginByLanguage, map[string]string{
		"python": "setta-basedpyright",
	}) {
		t.Fatalf("unexpected defaults profile language server selections %#v", profile.LanguageServerPluginByLanguage)
	}
}

func TestDefaultsInstallProfileAvailableLanguageServerSelectionsRequireActiveRegistration(t *testing.T) {
	t.Parallel()

	profile := DefaultsInstallProfile()
	snapshot := DiscoverySnapshot{
		Plugins: []DiscoveredPlugin{
			{
				PluginID:      "setta-basedpyright",
				State:         PluginRuntimeStateDisabled,
				SourceManager: PluginSourceManagerSetta,
				Manifest: &PluginManifest{
					ID:                "setta-basedpyright",
					Name:              "Setta Basedpyright",
					Version:           "0.1.0",
					SchemaVersion:     1,
					SettaVersionRange: ">=0.0.0",
					EnabledByDefault:  true,
					Capabilities:      []string{"registerLanguageServer"},
				},
				EffectiveCapabilities: []string{"registerLanguageServer"},
				RegisteredLanguageServers: []PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Language: "python",
					},
				},
			},
			{
				PluginID:      "setta-basedpyright",
				State:         PluginRuntimeStateActive,
				SourceManager: PluginSourceManagerPackageManager,
				Manifest: &PluginManifest{
					ID:                "setta-basedpyright",
					Name:              "Setta Basedpyright",
					Version:           "0.1.0",
					SchemaVersion:     1,
					SettaVersionRange: ">=0.0.0",
					EnabledByDefault:  true,
					Capabilities:      []string{"registerLanguageServer"},
				},
				EffectiveCapabilities: []string{"registerLanguageServer"},
				RegisteredLanguageServers: []PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Language: "python",
					},
				},
			},
		},
	}

	if got := profile.AvailableLanguageServerSelections(snapshot); !reflect.DeepEqual(got, map[string]string{
		"python": "setta-basedpyright",
	}) {
		t.Fatalf("unexpected defaults profile selections %#v", got)
	}

	snapshot.Plugins[1].State = PluginRuntimeStateDisabled
	if got := profile.AvailableLanguageServerSelections(snapshot); len(got) != 0 {
		t.Fatalf("expected disabled defaults plugin to stay unselected, got %#v", got)
	}
}

func TestDefaultsInstallProfileAvailableLanguageServerSelectionsAcceptsLinkedWorkspacePlugin(t *testing.T) {
	t.Parallel()

	profile := DefaultsInstallProfile()
	snapshot := DiscoverySnapshot{
		Plugins: []DiscoveredPlugin{
			{
				PluginID:      "setta-basedpyright",
				State:         PluginRuntimeStateActive,
				SourceManager: PluginSourceManagerSetta,
				Manifest: &PluginManifest{
					ID:                "setta-basedpyright",
					Name:              "Setta Basedpyright",
					Version:           "0.1.0",
					SchemaVersion:     1,
					SettaVersionRange: ">=0.0.0",
					EnabledByDefault:  true,
					Capabilities:      []string{"registerLanguageServer"},
				},
				EffectiveCapabilities: []string{"registerLanguageServer"},
				RegisteredLanguageServers: []PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Language: "python",
					},
				},
			},
		},
	}

	if got := profile.AvailableLanguageServerSelections(snapshot); !reflect.DeepEqual(got, map[string]string{
		"python": "setta-basedpyright",
	}) {
		t.Fatalf("unexpected defaults profile selections for linked plugin %#v", got)
	}
}
