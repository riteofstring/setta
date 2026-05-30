package uisettings

import "testing"

func TestFrontendValueOverviewTabUIConfigUsesCanonicalTabMetadata(t *testing.T) {
	t.Parallel()

	got := FrontendValueOverviewTabUIConfig()
	if got.Names.Overview != OverviewTabNameOverview {
		t.Fatalf("expected overview tab %q, got %q", OverviewTabNameOverview, got.Names.Overview)
	}
	if got.Names.RunInstructions != OverviewTabNameRunInstructions {
		t.Fatalf("expected run instructions tab %q, got %q", OverviewTabNameRunInstructions, got.Names.RunInstructions)
	}
	if got.Names.ProjectAISettings != OverviewTabNameProjectAISettings {
		t.Fatalf("expected project ai settings tab %q, got %q", OverviewTabNameProjectAISettings, got.Names.ProjectAISettings)
	}
	if got.Titles.FileBrowser != "Explorer" {
		t.Fatalf("expected file browser title Explorer, got %q", got.Titles.FileBrowser)
	}
	if got.Titles.RunInstructions != "Custom Runs" {
		t.Fatalf("expected run instructions title Custom Runs, got %q", got.Titles.RunInstructions)
	}
	if got.PluginPanePrefix != PluginOverviewTabPrefixValue {
		t.Fatalf("expected plugin pane prefix %q, got %q", PluginOverviewTabPrefixValue, got.PluginPanePrefix)
	}
}

func TestFrontendValueUIEditorTabUIConfigUsesCanonicalTabMetadata(t *testing.T) {
	t.Parallel()

	got := FrontendValueUIEditorTabUIConfig()
	if got.Names.SectionConfig != UIEditorTabNameSectionConfig {
		t.Fatalf("expected section config tab %q, got %q", UIEditorTabNameSectionConfig, got.Names.SectionConfig)
	}
	if got.Names.QuickInfoConfig != UIEditorTabNameQuickInfoConfig {
		t.Fatalf("expected quick info tab %q, got %q", UIEditorTabNameQuickInfoConfig, got.Names.QuickInfoConfig)
	}
	if got.Names.SectionVariantsConfig != UIEditorTabNameSectionVariantsConfig {
		t.Fatalf("expected section variants tab %q, got %q", UIEditorTabNameSectionVariantsConfig, got.Names.SectionVariantsConfig)
	}
	if got.Titles.UIConfig != "Params" {
		t.Fatalf("expected UI config title Params, got %q", got.Titles.UIConfig)
	}
	if got.Titles.InfoConfig != "Text Editor" {
		t.Fatalf("expected info config title Text Editor, got %q", got.Titles.InfoConfig)
	}
}
