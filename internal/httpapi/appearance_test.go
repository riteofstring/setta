package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"setta/internal/appearance"
)

func TestAppearanceEndpointsReadAndUpdateSettings(t *testing.T) {
	handler := newAppearanceHandler(t)

	initial := getJSON[appearance.AppearanceSettings](t, handler, "/appearance/settings", http.StatusOK)
	if initial.Mode != appearance.ColorModeDark {
		t.Fatalf("initial mode = %q, want dark", initial.Mode)
	}

	next := initial
	next.Mode = appearance.ColorModeLight
	next.Fonts.Heading = `"Work Sans", ui-sans-serif, sans-serif`
	next.Developer.ShowPerformanceStats = true
	updated := postJSON[appearance.AppearanceSettings](t, handler, "/appearance/settings", UpdateAppearanceSettingsRequest{
		Settings: next,
	}, http.StatusOK)
	if updated.Mode != appearance.ColorModeLight {
		t.Fatalf("updated mode = %q, want light", updated.Mode)
	}

	reloaded := getJSON[appearance.AppearanceSettings](t, handler, "/appearance/settings", http.StatusOK)
	if reloaded.Fonts.Heading != next.Fonts.Heading {
		t.Fatalf("heading font = %q, want %q", reloaded.Fonts.Heading, next.Fonts.Heading)
	}
	if !reloaded.Developer.ShowPerformanceStats {
		t.Fatal("performance stats setting = false, want true")
	}
}

func TestAppearanceEndpointRejectsInvalidColor(t *testing.T) {
	handler := newAppearanceHandler(t)
	settings := appearance.DefaultSettings()
	settings.Dark.Status.Warning = "#f59e0b"

	errResponse := postJSON[ErrorResponse](t, handler, "/appearance/settings", UpdateAppearanceSettingsRequest{
		Settings: settings,
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "update_appearance_settings_failed" {
		t.Fatalf("error code = %q, want update_appearance_settings_failed", errResponse.Error.Code)
	}
	if !strings.Contains(errResponse.Error.Message, "dark.status.warning") {
		t.Fatalf("error message = %q, want field path", errResponse.Error.Message)
	}
}

func TestAppearanceEndpointReadsPresetList(t *testing.T) {
	handler := newAppearanceHandler(t)

	presets := getJSON[appearance.AppearancePresetList](t, handler, "/appearance/presets", http.StatusOK)
	if presets.DefaultPresetID != appearance.PresetSettaStandard {
		t.Fatalf("default preset id = %q, want %q", presets.DefaultPresetID, appearance.PresetSettaStandard)
	}
	if len(presets.Presets) != 27 {
		t.Fatalf("preset count = %d, want 27", len(presets.Presets))
	}

	seen := map[appearance.AppearancePresetID]bool{}
	for _, preset := range presets.Presets {
		if preset.Name == "" {
			t.Fatalf("preset %q has empty name", preset.ID)
		}
		if err := appearance.Validate(preset.Settings); err != nil {
			t.Fatalf("preset %q settings are invalid: %v", preset.ID, err)
		}
		seen[preset.ID] = true
	}
	for _, presetID := range []appearance.AppearancePresetID{
		appearance.PresetSettaStandard,
		appearance.PresetTailwindGray,
		appearance.PresetTailwindNeutral,
		appearance.PresetTailwindSlate,
		appearance.PresetTailwindStone,
		appearance.PresetTailwindZinc,
		appearance.PresetTailwindBlue,
		appearance.PresetShadcnMauve,
	} {
		if !seen[presetID] {
			t.Fatalf("preset %q missing from response", presetID)
		}
	}
}

func TestAppearanceEndpointsRequireService(t *testing.T) {
	handler := NewHandler(HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	response := getJSON[ErrorResponse](t, handler, "/appearance/settings", http.StatusServiceUnavailable)
	if response.Error.Code != "appearance_service_unavailable" {
		t.Fatalf("error code = %q, want appearance_service_unavailable", response.Error.Code)
	}
}

func newAppearanceHandler(t *testing.T) http.Handler {
	t.Helper()

	store, err := appearance.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new appearance store: %v", err)
	}
	service, err := appearance.NewService(store)
	if err != nil {
		t.Fatalf("new appearance service: %v", err)
	}
	return NewHandler(HandlerConfig{
		AppearanceService: service,
		Metadata:          BackendMetadata{Name: BackendName, Version: "test"},
	})
}
