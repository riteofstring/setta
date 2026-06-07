package httpapi

import (
	"net/http"

	"setta/internal/appearance"
)

func (handler handler) readAppearanceSettings(response http.ResponseWriter, request *http.Request) {
	service := requireAppearanceService(response, handler.appearanceService)
	if service == nil {
		return
	}
	settings, err := service.Read(request.Context())
	if err != nil {
		writeAppearanceError(response, "read_appearance_settings_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, settings)
}

func (handler handler) readAppearancePresets(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, appearance.DefaultPresetList())
}

func (handler handler) updateAppearanceSettings(response http.ResponseWriter, request *http.Request) {
	service := requireAppearanceService(response, handler.appearanceService)
	if service == nil {
		return
	}
	var payload UpdateAppearanceSettingsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	settings, err := service.Update(request.Context(), payload.Settings)
	if err != nil {
		writeAppearanceError(response, "update_appearance_settings_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, settings)
}
