package appspec

import "testing"

func TestDefaultComponentTypesPreserveCatalogOrder(t *testing.T) {
	t.Parallel()

	expected := []string{
		"Stack",
		"Box",
		"Grid",
		"Container",
		"Spacer",
		"Motion",
		"Stagger",
		"Card",
		"ConfigScope",
		"Tabs",
		"Tab",
		"Heading",
		"Text",
		"ParamInput",
		"ActionButton",
		"TextOutput",
		"ImageOutput",
		"Divider",
	}

	got := DefaultComponentTypes()
	if len(got) != len(expected) {
		t.Fatalf("expected %d component types, got %#v", len(expected), got)
	}
	for index, componentType := range expected {
		if got[index] != componentType {
			t.Fatalf("unexpected component order %#v", got)
		}
	}
}

func TestDefaultCatalogJSONIncludesDefaultsAndDescriptions(t *testing.T) {
	t.Parallel()

	catalog := DefaultCatalogJSON()
	if catalog["id"] != DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", DefaultCatalogID, catalog["id"])
	}
	if catalog["version"] != DefaultCatalogVersion {
		t.Fatalf("expected catalog version %q, got %#v", DefaultCatalogVersion, catalog["version"])
	}

	components, ok := catalog["components"].([]any)
	if !ok || len(components) == 0 {
		t.Fatalf("expected components array, got %#v", catalog["components"])
	}

	firstComponent, ok := components[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first component object, got %#v", components[0])
	}
	if firstComponent["type"] != "Stack" {
		t.Fatalf("expected first component Stack, got %#v", firstComponent["type"])
	}
	if firstComponent["description"] != "Layout container for vertical or horizontal stacks." {
		t.Fatalf("unexpected first component description %#v", firstComponent["description"])
	}

	props, ok := firstComponent["props"].(map[string]any)
	if !ok {
		t.Fatalf("expected props object, got %#v", firstComponent["props"])
	}
	gap, ok := props["gap"].(map[string]any)
	if !ok {
		t.Fatalf("expected gap prop object, got %#v", props["gap"])
	}
	if gap["default"] != float64(16) {
		t.Fatalf("expected gap default 16, got %#v", gap["default"])
	}
	direction, ok := props["direction"].(map[string]any)
	if !ok {
		t.Fatalf("expected direction prop object, got %#v", props["direction"])
	}
	if direction["default"] != "column" {
		t.Fatalf("expected direction default column, got %#v", direction["default"])
	}
}

func TestDefaultCatalogComponentDescriptionsCoverDefaultTypes(t *testing.T) {
	t.Parallel()

	for _, componentType := range defaultCatalogComponentOrder {
		if description := defaultCatalogComponentDescription(componentType); description == "" {
			t.Fatalf("expected description for default component %q", componentType)
		}
	}

	if description := defaultCatalogComponentDescription("Unknown"); description != "" {
		t.Fatalf("expected unknown component description to be empty, got %q", description)
	}
}
