package realtime

import (
	"encoding/json"
	"testing"

	"setta/internal/pythonsdkcontracts"
)

func TestBuildListenerRealtimeDependencyValuesFromSDKContractsRendersAffectedDependents(t *testing.T) {
	t.Helper()

	catalog := pythonsdkcontracts.ListenerDependencyCatalog{
		Entries: []pythonsdkcontracts.ListenerDependencyCatalogEntry{
			{
				DependencyKey:    "section-config",
				Name:             "Config",
				FullPathName:     "Config",
				Dependencies:     []string{"section-config.param-count"},
				IncludeInCodegen: true,
				SectionType:      stringPointer("Dict"),
			},
			{
				DependencyKey:       "section-config.param-count",
				Name:                "count",
				FullPathName:        "Config.count",
				IncludeInCodegen:    true,
				CodeObjType:         stringPointer("CodeParam"),
				ValueRepresentation: stringPointer("expression"),
			},
		},
	}
	current := pythonsdkcontracts.ListenerRenderedDependencyValues{
		Entries: []pythonsdkcontracts.ListenerRenderedDependencyValue{
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

	values, err := BuildListenerRealtimeDependencyValuesFromSDKContracts(
		catalog,
		current,
		[]pythonsdkcontracts.LocalCoreListenerRealtimeDelta{
			{
				Dependency: "section-config.param-count",
				Value:      deltaValue,
			},
		},
	)
	if err != nil {
		t.Fatalf("BuildListenerRealtimeDependencyValuesFromSDKContracts() error = %v", err)
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
