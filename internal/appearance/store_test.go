package appearance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultSettingsValidate(t *testing.T) {
	settings := DefaultSettings()
	if err := Validate(settings); err != nil {
		t.Fatalf("default appearance settings are invalid: %v", err)
	}
	if settings.Mode != ColorModeDark {
		t.Fatalf("default mode = %q, want dark", settings.Mode)
	}
	if settings.Dark.Tailwind.Zinc900 != "oklch(0.1631 0.0125 264.14)" {
		t.Fatalf("dark zinc 900 = %q, want imported go-rewrite OKLCH value", settings.Dark.Tailwind.Zinc900)
	}
}

func TestStorePersistsAppearanceSettings(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Mode = ColorModeLight
	settings.Fonts.Sans = `"Aptos", ui-sans-serif, sans-serif`

	if err := store.Save(settings); err != nil {
		t.Fatalf("save appearance settings: %v", err)
	}
	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("load appearance settings: %v", err)
	}

	if loaded.Mode != ColorModeLight {
		t.Fatalf("mode = %q, want light", loaded.Mode)
	}
	if loaded.Fonts.Sans != settings.Fonts.Sans {
		t.Fatalf("font = %q, want %q", loaded.Fonts.Sans, settings.Fonts.Sans)
	}
}

func TestLoadMissingAppearanceSettingsReturnsDefaults(t *testing.T) {
	store := newTestStore(t)
	settings, err := store.Load()
	if err != nil {
		t.Fatalf("load missing settings: %v", err)
	}
	if settings.SchemaVersion != SchemaVersion || settings.Dark.Shadcn.Background == "" {
		t.Fatalf("settings = %+v, want defaults", settings)
	}
}

func TestStoreRejectsMalformedAppearanceSettings(t *testing.T) {
	store := newTestStore(t)
	writeAppearanceFixture(t, store, "{")

	_, err := store.Load()
	if err == nil {
		t.Fatal("load succeeded, want malformed appearance settings error")
	}
	if !IsCorruptSettingsError(err) {
		t.Fatalf("error = %T %v, want corrupt settings", err, err)
	}
}

func TestStoreRejectsUnknownAppearanceFields(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	raw, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}
	rawText := strings.TrimSuffix(string(raw), "}") + `,"extra":true}`
	writeAppearanceFixture(t, store, rawText)

	_, err = store.Load()
	if err == nil {
		t.Fatal("load succeeded, want unknown field error")
	}
	if !strings.Contains(err.Error(), `unknown field "extra"`) {
		t.Fatalf("error = %q, want unknown field", err)
	}
}

func TestStoreRejectsInvalidColor(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Light.Shadcn.Background = "#ffffff"

	err := store.Save(settings)
	if err == nil {
		t.Fatal("save succeeded, want invalid color error")
	}
	if !IsCorruptSettingsError(err) || !strings.Contains(err.Error(), "light.shadcn.background") {
		t.Fatalf("error = %T %v, want corrupt settings color path", err, err)
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func writeAppearanceFixture(t *testing.T, store *Store, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(store.Path()), 0o755); err != nil {
		t.Fatalf("create appearance settings dir: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte(content), 0o644); err != nil {
		t.Fatalf("write appearance fixture: %v", err)
	}
}
