package realtime

import (
	"encoding/json"
	"testing"
)

func TestBuildListenerRealtimeDependencyValuesFromCatalogRendersAffectedDependents(t *testing.T) {
	t.Helper()

	catalog := ListenerDependencyCatalog{
		Entries: []ListenerDependencyCatalogEntry{
			{
				DependencyKey:    "section-config",
				Name:             "Config",
				FullPathName:     "Config",
				Dependencies:     []string{"section-config.param-count"},
				IncludeInCodegen: true,
				SectionType:      "Dict",
			},
			{
				DependencyKey:       "section-config.param-count",
				Name:                "count",
				FullPathName:        "Config.count",
				IncludeInCodegen:    true,
				CodeObjType:         "CodeParam",
				ValueRepresentation: "expression",
			},
		},
	}
	current := ListenerRenderedDependencyValues{
		Entries: []ListenerRenderedDependencyValue{
			{
				DependencyKey: "section-config",
				RenderedValue: "{'count': 1}",
			},
			{
				DependencyKey: "section-config.param-count",
				RenderedValue: "1",
			},
		},
	}
	deltaValue, err := json.Marshal(map[string]any{
		"type":    "Literal",
		"payload": "2",
	})
	if err != nil {
		t.Fatalf("marshal delta value: %v", err)
	}

	values, err := BuildListenerRealtimeDependencyValuesFromCatalog(
		catalog,
		current,
		[]ListenerRealtimeDelta{
			{
				Dependency: "section-config.param-count",
				Value:      deltaValue,
			},
		},
	)
	if err != nil {
		t.Fatalf("BuildListenerRealtimeDependencyValuesFromCatalog() error = %v", err)
	}

	if len(values.Entries) != 2 {
		t.Fatalf("expected 2 affected values, got %d", len(values.Entries))
	}
	if values.Entries[0].DependencyKey != "section-config" {
		t.Fatalf("expected first affected dependency to be section-config, got %s", values.Entries[0].DependencyKey)
	}
	if values.Entries[0].RenderedValue != "{'count': 2}" {
		t.Fatalf("expected dict value to refresh dependents, got %q", values.Entries[0].RenderedValue)
	}
	if values.Entries[1].DependencyKey != "section-config.param-count" {
		t.Fatalf("expected second affected dependency to be the direct param, got %s", values.Entries[1].DependencyKey)
	}
	if values.Entries[1].RenderedValue != "2" {
		t.Fatalf("expected direct param override to be rendered as 2, got %q", values.Entries[1].RenderedValue)
	}
}

func TestBuildListenerRealtimeDependencyValuesFromCatalogUsesCurrentValuesForUnaffectedChildren(t *testing.T) {
	t.Parallel()

	catalog := ListenerDependencyCatalog{
		Entries: []ListenerDependencyCatalogEntry{
			{
				DependencyKey:    "section-config",
				Name:             "Config",
				FullPathName:     "Config",
				Dependencies:     []string{"section-config.param-count", "section-config.param-limit"},
				IncludeInCodegen: true,
				SectionType:      "Dict",
			},
			{
				DependencyKey:       "section-config.param-count",
				Name:                "count",
				FullPathName:        "Config.count",
				IncludeInCodegen:    true,
				CodeObjType:         "CodeParam",
				ValueRepresentation: "expression",
			},
			{
				DependencyKey:       "section-config.param-limit",
				Name:                "limit",
				FullPathName:        "Config.limit",
				IncludeInCodegen:    true,
				CodeObjType:         "CodeParam",
				ValueRepresentation: "expression",
			},
		},
	}
	current := ListenerRenderedDependencyValues{
		Entries: []ListenerRenderedDependencyValue{
			{
				DependencyKey: "section-config",
				RenderedValue: "{'count': 1, 'limit': 3}",
			},
			{
				DependencyKey: "section-config.param-count",
				RenderedValue: "1",
			},
			{
				DependencyKey: "section-config.param-limit",
				RenderedValue: "3",
			},
		},
	}
	deltaValue, err := json.Marshal(map[string]any{
		"type":    "Literal",
		"payload": "2",
	})
	if err != nil {
		t.Fatalf("marshal delta value: %v", err)
	}

	values, err := BuildListenerRealtimeDependencyValuesFromCatalog(
		catalog,
		current,
		[]ListenerRealtimeDelta{
			{
				Dependency: "section-config.param-count",
				Value:      deltaValue,
			},
		},
	)
	if err != nil {
		t.Fatalf("BuildListenerRealtimeDependencyValuesFromCatalog() error = %v", err)
	}

	if len(values.Entries) != 2 {
		t.Fatalf("expected 2 affected values, got %d", len(values.Entries))
	}
	if values.Entries[0].RenderedValue != "{'count': 2, 'limit': 3}" {
		t.Fatalf("expected parent to reuse unaffected child current value, got %q", values.Entries[0].RenderedValue)
	}
	if values.Entries[1].RenderedValue != "2" {
		t.Fatalf("expected changed param override to be rendered as 2, got %q", values.Entries[1].RenderedValue)
	}
}

func TestBuildListenerRealtimeDependencyValuesFromCatalogSkipsCyclicDependents(t *testing.T) {
	t.Parallel()

	catalog := ListenerDependencyCatalog{
		Entries: []ListenerDependencyCatalogEntry{
			{
				DependencyKey:       "section-config.param-count",
				Name:                "count",
				FullPathName:        "Config.count",
				IncludeInCodegen:    true,
				CodeObjType:         "CodeParam",
				ValueRepresentation: "expression",
			},
			{
				DependencyKey:    "section-config-a",
				Name:             "ConfigA",
				FullPathName:     "ConfigA",
				Dependencies:     []string{"section-config.param-count", "section-config-b"},
				IncludeInCodegen: true,
				SectionType:      "Dict",
			},
			{
				DependencyKey:    "section-config-b",
				Name:             "ConfigB",
				FullPathName:     "ConfigB",
				Dependencies:     []string{"section-config-a"},
				IncludeInCodegen: true,
				SectionType:      "Dict",
			},
		},
	}
	deltaValue, err := json.Marshal(map[string]any{
		"type":    "Literal",
		"payload": "2",
	})
	if err != nil {
		t.Fatalf("marshal delta value: %v", err)
	}

	values, err := BuildListenerRealtimeDependencyValuesFromCatalog(
		catalog,
		ListenerRenderedDependencyValues{},
		[]ListenerRealtimeDelta{
			{
				Dependency: "section-config.param-count",
				Value:      deltaValue,
			},
		},
	)
	if err != nil {
		t.Fatalf("BuildListenerRealtimeDependencyValuesFromCatalog() error = %v", err)
	}

	if len(values.Entries) != 1 {
		t.Fatalf("expected only the direct param to render through the cycle, got %d entries", len(values.Entries))
	}
	if values.Entries[0].DependencyKey != "section-config.param-count" {
		t.Fatalf("expected direct param to remain after cycle detection, got %s", values.Entries[0].DependencyKey)
	}
	if values.Entries[0].RenderedValue != "2" {
		t.Fatalf("expected direct param override to be rendered as 2, got %q", values.Entries[0].RenderedValue)
	}
}
