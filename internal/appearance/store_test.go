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
	if settings.Developer.ShowPerformanceStats {
		t.Fatal("default performance stats setting = true, want false")
	}
	if settings.Developer.AllowResizedPanesToOverflowViewport {
		t.Fatal("default resized panes overflow setting = true, want false")
	}
	if settings.Developer.OverviewCardMinWidthPx != defaultOverviewCardMinWidthPx {
		t.Fatalf("default overview card min width = %d, want %d", settings.Developer.OverviewCardMinWidthPx, defaultOverviewCardMinWidthPx)
	}
	if settings.Developer.OverviewCardMaxWidthPx != defaultOverviewCardMaxWidthPx {
		t.Fatalf("default overview card max width = %d, want %d", settings.Developer.OverviewCardMaxWidthPx, defaultOverviewCardMaxWidthPx)
	}
	if settings.Shortcuts.WorkspaceNavigation != WorkspaceNavigationModAltArrows {
		t.Fatalf("default workspace navigation shortcut = %q, want %q", settings.Shortcuts.WorkspaceNavigation, WorkspaceNavigationModAltArrows)
	}
	if settings.Dark.Tailwind.Setta900 != "oklch(0.1631 0.0125 264.14)" {
		t.Fatalf("dark setta 900 = %q, want original Setta dark scale", settings.Dark.Tailwind.Setta900)
	}
	if settings.Light.Shadcn.Primary != settings.Light.Tailwind.Setta600 {
		t.Fatalf("light primary = %q, want darker Setta logo color", settings.Light.Shadcn.Primary)
	}
	if settings.Dark.Shadcn.Primary != settaLogoCyan {
		t.Fatalf("dark primary = %q, want Setta logo cyan", settings.Dark.Shadcn.Primary)
	}
	if settings.Dark.Shadcn.Border != settings.Dark.Tailwind.Setta850 {
		t.Fatalf("dark border = %q, want subtle Setta surface border", settings.Dark.Shadcn.Border)
	}
	if settings.Dark.Shadcn.Muted != settings.Dark.Tailwind.Setta850 {
		t.Fatalf("dark muted = %q, want Setta raised surface", settings.Dark.Shadcn.Muted)
	}
	if settings.Dark.Shadcn.Sidebar != settings.Dark.Tailwind.Setta850 {
		t.Fatalf("dark sidebar = %q, want lighter Setta sidebar surface", settings.Dark.Shadcn.Sidebar)
	}
	if settings.Dark.Accent.Cyan != settaLogoCyan {
		t.Fatalf("dark accent cyan = %q, want Setta logo cyan", settings.Dark.Accent.Cyan)
	}
	if settings.Dark.Status.Success != settings.Dark.Accent.Green {
		t.Fatalf("dark status success = %q, want accent green %q", settings.Dark.Status.Success, settings.Dark.Accent.Green)
	}
	if settings.Light.Status.Alert != settings.Light.Accent.Magenta {
		t.Fatalf("light status alert = %q, want accent magenta %q", settings.Light.Status.Alert, settings.Light.Accent.Magenta)
	}
}

func TestStoreRejectsMissingAccentPalette(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Dark.Accent.Violet = ""

	err := store.Save(settings)
	if err == nil {
		t.Fatal("save succeeded, want missing accent color error")
	}
	if !IsCorruptSettingsError(err) || !strings.Contains(err.Error(), "dark.accent.violet") {
		t.Fatalf("error = %T %v, want corrupt settings accent path", err, err)
	}
}

func TestDefaultPresetListUsesSettaAccentOnlyForSettaStandard(t *testing.T) {
	presetList := DefaultPresetList()
	for _, preset := range presetList.Presets {
		if err := Validate(preset.Settings); err != nil {
			t.Fatalf("preset %q settings are invalid: %v", preset.ID, err)
		}
		switch preset.ID {
		case PresetSettaStandard:
			if preset.Settings.Dark.Shadcn.Primary != settaLogoCyan {
				t.Fatalf("setta standard dark primary = %q, want Setta logo cyan", preset.Settings.Dark.Shadcn.Primary)
			}
		default:
			if preset.Settings.Dark.Shadcn.Primary == settaLogoCyan {
				t.Fatalf("preset %q inherited Setta logo cyan primary", preset.ID)
			}
		}
	}
}

func TestDefaultPresetListTranslatesPalettesOntoSettaLightnessRamp(t *testing.T) {
	presetList := DefaultPresetList()
	expected := tailwindPaletteLightnesses(t, defaultSettaTailwindPalette())

	for _, preset := range presetList.Presets {
		actual := tailwindPaletteLightnesses(t, preset.Settings.Dark.Tailwind)
		for name, expectedLightness := range expected {
			if actual[name] != expectedLightness {
				t.Fatalf("preset %q %s lightness = %.4f, want Setta ramp %.4f", preset.ID, name, actual[name], expectedLightness)
			}
		}
		if preset.Settings.Light.Tailwind != preset.Settings.Dark.Tailwind {
			t.Fatalf("preset %q light and dark tailwind palettes diverged", preset.ID)
		}
	}
}

func TestStorePersistsAppearanceSettings(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Mode = ColorModeLight
	settings.Fonts.Sans = `"Aptos", ui-sans-serif, sans-serif`
	settings.Developer.AllowResizedPanesToOverflowViewport = true
	settings.Developer.OverviewCardMinWidthPx = 320
	settings.Developer.OverviewCardMaxWidthPx = 540
	settings.Developer.ShowPerformanceStats = true
	settings.Shortcuts.WorkspaceNavigation = WorkspaceNavigationCtrlAltArrows

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
	if !loaded.Developer.ShowPerformanceStats {
		t.Fatal("performance stats setting = false, want true")
	}
	if !loaded.Developer.AllowResizedPanesToOverflowViewport {
		t.Fatal("resized panes overflow setting = false, want true")
	}
	if loaded.Developer.OverviewCardMinWidthPx != 320 {
		t.Fatalf("overview card min width = %d, want 320", loaded.Developer.OverviewCardMinWidthPx)
	}
	if loaded.Developer.OverviewCardMaxWidthPx != 540 {
		t.Fatalf("overview card max width = %d, want 540", loaded.Developer.OverviewCardMaxWidthPx)
	}
	if loaded.Shortcuts.WorkspaceNavigation != WorkspaceNavigationCtrlAltArrows {
		t.Fatalf("workspace navigation shortcut = %q, want %q", loaded.Shortcuts.WorkspaceNavigation, WorkspaceNavigationCtrlAltArrows)
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

func TestStoreRejectsLowContrastColorPair(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Light.Shadcn.Foreground = settings.Light.Shadcn.Background

	err := store.Save(settings)
	if err == nil {
		t.Fatal("save succeeded, want low contrast error")
	}
	if !IsCorruptSettingsError(err) || !strings.Contains(err.Error(), "WCAG AA normal text") {
		t.Fatalf("error = %T %v, want WCAG AA contrast failure", err, err)
	}
}

func TestStoreRejectsInvalidOverviewCardWidthRange(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Developer.OverviewCardMinWidthPx = 620
	settings.Developer.OverviewCardMaxWidthPx = 360

	err := store.Save(settings)
	if err == nil {
		t.Fatal("save succeeded, want invalid overview card width error")
	}
	if !IsCorruptSettingsError(err) || !strings.Contains(err.Error(), "overview card min width") {
		t.Fatalf("error = %T %v, want overview card width failure", err, err)
	}
}

func TestStoreRejectsInvalidWorkspaceNavigationShortcut(t *testing.T) {
	store := newTestStore(t)
	settings := DefaultSettings()
	settings.Shortcuts.WorkspaceNavigation = "arrow_keys"

	err := store.Save(settings)
	if err == nil {
		t.Fatal("save succeeded, want invalid shortcut error")
	}
	if !IsCorruptSettingsError(err) || !strings.Contains(err.Error(), "workspace navigation shortcut") {
		t.Fatalf("error = %T %v, want workspace navigation shortcut failure", err, err)
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

func tailwindPaletteLightnesses(t *testing.T, palette AppearanceTailwindPalette) map[string]float64 {
	t.Helper()

	values := []namedValue{
		{"setta50", palette.Setta50},
		{"setta100", palette.Setta100},
		{"setta150", palette.Setta150},
		{"setta200", palette.Setta200},
		{"setta300", palette.Setta300},
		{"setta400", palette.Setta400},
		{"setta500", palette.Setta500},
		{"setta600", palette.Setta600},
		{"setta700", palette.Setta700},
		{"setta750", palette.Setta750},
		{"setta800", palette.Setta800},
		{"setta850", palette.Setta850},
		{"setta860", palette.Setta860},
		{"setta875", palette.Setta875},
		{"setta900", palette.Setta900},
		{"setta925", palette.Setta925},
		{"setta950", palette.Setta950},
		{"setta975", palette.Setta975},
	}
	lightnesses := make(map[string]float64, len(values))
	for _, value := range values {
		color, err := parseOKLCH(value.name, value.value)
		if err != nil {
			t.Fatalf("parse %s: %v", value.name, err)
		}
		lightnesses[value.name] = color.l
	}
	return lightnesses
}
