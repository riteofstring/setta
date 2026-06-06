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
