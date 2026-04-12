package uisettings

import (
	"reflect"
	"strings"
	"testing"
)

func TestBuildPluginPaneOverviewTabKeyMatchesEncodeURIComponentRules(t *testing.T) {
	t.Parallel()

	got := buildPluginPaneOverviewTabKey(
		"plugin!~*'() /",
		"pane!~*'() :?",
	)
	const want = string(PluginOverviewTabPrefixValue) + ":plugin!~*'()%20%2F:pane!~*'()%20%3A%3F"
	if got != want {
		t.Fatalf("expected plugin pane overview tab key %q, got %q", want, got)
	}
}

func TestParsePluginUISettingDefinitionsParsesSchemaDefinedEntry(t *testing.T) {
	t.Parallel()

	result, err := parsePluginUISettingDefinitions("plugin.alpha", map[string]any{
		pluginUISettingsSchemaKey: []any{
			map[string]any{
				"settingId":    "theme_mode",
				"title":        "Theme mode",
				"description":  "Controls the plugin theme.",
				"paneId":       "appearance",
				"revealKey":    "theme-mode",
				"configPath":   []any{"appearance", "themeMode"},
				"synonyms":     []any{"theme", "appearance"},
				"valueSchema":  map[string]any{"type": string(ValueTypeString)},
				"defaultValue": "auto",
			},
		},
	})
	if err != nil {
		t.Fatalf("parse plugin ui setting definitions: %v", err)
	}
	if len(result.InvalidSettingErrors) != 0 {
		t.Fatalf("expected no invalid setting errors, got %#v", result.InvalidSettingErrors)
	}
	if len(result.Definitions) != 1 {
		t.Fatalf("expected 1 definition, got %d", len(result.Definitions))
	}

	definition := result.Definitions[0]
	if definition.LocalSettingID != "theme_mode" {
		t.Fatalf("expected local setting id theme_mode, got %q", definition.LocalSettingID)
	}
	if definition.Title != "Theme mode" {
		t.Fatalf("expected title Theme mode, got %q", definition.Title)
	}
	if definition.Description != "Controls the plugin theme." {
		t.Fatalf("expected description, got %q", definition.Description)
	}
	if definition.PaneID != "appearance" {
		t.Fatalf("expected pane id appearance, got %q", definition.PaneID)
	}
	if definition.RevealKey != "theme-mode" {
		t.Fatalf("expected reveal key theme-mode, got %q", definition.RevealKey)
	}
	if !reflect.DeepEqual(definition.ConfigPath, []string{"appearance", "themeMode"}) {
		t.Fatalf("expected config path %#v, got %#v", []string{"appearance", "themeMode"}, definition.ConfigPath)
	}
	if !reflect.DeepEqual(definition.Synonyms, []string{"theme", "appearance"}) {
		t.Fatalf("expected synonyms %#v, got %#v", []string{"theme", "appearance"}, definition.Synonyms)
	}
	if definition.Mutability != MutabilityWritable {
		t.Fatalf("expected mutability %q, got %q", MutabilityWritable, definition.Mutability)
	}
	if definition.ValueSchema.Type != ValueTypeString {
		t.Fatalf("expected value schema type %q, got %q", ValueTypeString, definition.ValueSchema.Type)
	}
	if definition.DefaultValue != "auto" {
		t.Fatalf("expected default value auto, got %#v", definition.DefaultValue)
	}
}

func TestParsePluginUISettingDefinitionsCollectsPerSettingValidationError(t *testing.T) {
	t.Parallel()

	result, err := parsePluginUISettingDefinitions("plugin.alpha", map[string]any{
		pluginUISettingsSchemaKey: []any{
			map[string]any{
				"settingId":    "theme_mode",
				"description":  "Controls the plugin theme.",
				"paneId":       "appearance",
				"revealKey":    "theme-mode",
				"configPath":   []any{"appearance", "themeMode"},
				"valueSchema":  map[string]any{"type": string(ValueTypeString)},
				"defaultValue": "auto",
			},
		},
	})
	if err != nil {
		t.Fatalf("parse plugin ui setting definitions: %v", err)
	}
	if len(result.Definitions) != 0 {
		t.Fatalf("expected no parsed definitions, got %#v", result.Definitions)
	}

	settingErr, ok := result.InvalidSettingErrors["theme_mode"]
	if !ok {
		t.Fatalf("expected invalid setting error for theme_mode, got %#v", result.InvalidSettingErrors)
	}
	if settingErr.Code != ErrorCodePluginUnavailable {
		t.Fatalf("expected code %q, got %q", ErrorCodePluginUnavailable, settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "title must be a non-empty string") {
		t.Fatalf("expected title validation message, got %q", settingErr.Message)
	}
}
