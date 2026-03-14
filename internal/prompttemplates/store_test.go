package prompttemplates

import "testing"

func TestStoreListReturnsEmptyWhenDirectoryMissing(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	templates, err := store.List()
	if err != nil {
		t.Fatalf("list templates: %v", err)
	}
	if len(templates) != 0 {
		t.Fatalf("expected empty templates, got %#v", templates)
	}
}

func TestStoreRoundTripPromptTemplates(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	first := Template{
		ID:          "template-b",
		Name:        "Greeting",
		Description: "Greeting template",
		Template:    "Hello {{ name }}",
		InputSchema: map[string]any{"name": map[string]any{"type": "string"}},
		Metadata:    map[string]any{"category": "greeting"},
	}
	second := Template{
		ID:       "template-a",
		Name:     "Closing",
		Template: "Goodbye {{ name }}",
	}
	if err := store.Save(first); err != nil {
		t.Fatalf("save first template: %v", err)
	}
	if err := store.Save(second); err != nil {
		t.Fatalf("save second template: %v", err)
	}

	loaded, err := store.Get(first.ID)
	if err != nil {
		t.Fatalf("get template: %v", err)
	}
	if loaded.Format != FormatJinja {
		t.Fatalf("expected default Jinja format, got %q", loaded.Format)
	}
	if loaded.InputSchema["name"] == nil {
		t.Fatalf("expected input schema, got %#v", loaded)
	}

	templates, err := store.List()
	if err != nil {
		t.Fatalf("list templates: %v", err)
	}
	if len(templates) != 2 {
		t.Fatalf("expected two templates, got %#v", templates)
	}
	if templates[0].ID != "template-a" || templates[1].ID != "template-b" {
		t.Fatalf("expected filename order, got %#v", templates)
	}

	if err := store.Delete(first.ID); err != nil {
		t.Fatalf("delete template: %v", err)
	}
	templates, err = store.List()
	if err != nil {
		t.Fatalf("list templates after delete: %v", err)
	}
	if len(templates) != 1 || templates[0].ID != second.ID {
		t.Fatalf("expected remaining template %#v, got %#v", second.ID, templates)
	}
}

func TestStoreGetReturnsNotFoundForMissingTemplate(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if _, err := store.Get("missing"); err == nil {
		t.Fatal("expected missing template error")
	}
}

func TestStoreAllowsEmptyNameAndTemplate(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	template := Template{
		ID:       "template-empty",
		Name:     "",
		Template: "",
	}
	if err := store.Save(template); err != nil {
		t.Fatalf("save template: %v", err)
	}

	loaded, err := store.Get(template.ID)
	if err != nil {
		t.Fatalf("get template: %v", err)
	}
	if loaded.Name != "" || loaded.Template != "" {
		t.Fatalf("expected empty fields to round-trip, got %#v", loaded)
	}
}
