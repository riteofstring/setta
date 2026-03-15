package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

const (
	RouteLoadSettings = "/loadSettings"
	RouteSaveSettings = "/saveSettings"
)

type SettingsRouteDependencies struct {
	ModePolicy    modes.Policy
	SettingsState *settingsstate.Runtime
	WebsocketHub  *realtime.WebsocketHub
}

type SaveSettingsRequest struct {
	Settings any `json:"settings"`
}

func RegisterSettingsRoutes(router chi.Router, deps SettingsRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("settings routes: router is required")
	}
	if deps.ModePolicy.RequireFullIDE() == nil {
		if deps.SettingsState == nil {
			return fmt.Errorf("settings routes: settings runtime is required")
		}
		if deps.WebsocketHub == nil {
			return fmt.Errorf("settings routes: websocket hub is required")
		}
	}

	router.Post(RouteLoadSettings, loadSettingsHandler(deps))
	router.Post(RouteSaveSettings, saveSettingsHandler(deps))
	return nil
}

func loadSettingsHandler(deps SettingsRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := settingsLoadModeDetail(deps.ModePolicy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, deps.SettingsState.Snapshot().Document)
	}
}

func saveSettingsHandler(deps SettingsRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if detail, blocked := settingsSaveModeDetail(deps.ModePolicy); blocked {
			writeDetail(w, http.StatusForbidden, detail)
			return
		}
		if deps.SettingsState == nil || deps.WebsocketHub == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeJSONBody[SaveSettingsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		document, err := settingsstate.NormalizeRaw(payload.Settings)
		if err != nil {
			writeSettingsSaveError(w, r, err)
			return
		}

		snapshot, err := deps.SettingsState.ReplaceAndSave(r.Context(), document)
		if err != nil {
			writeSettingsSaveError(w, r, err)
			return
		}

		if _, err := deps.WebsocketHub.BroadcastJSON(
			r.Context(),
			realtime.NewSettingsUpdateMessage(snapshot.Document),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func settingsLoadModeDetail(policy modes.Policy) (string, bool) {
	switch {
	case policy.IsDeployment():
		return "Deployment mode does not allow this endpoint.", true
	case policy.IsLauncher():
		return "Launcher mode does not allow this endpoint.", true
	default:
		return "", false
	}
}

func settingsSaveModeDetail(policy modes.Policy) (string, bool) {
	switch {
	case policy.IsDeployment():
		return "Share mode does not allow updating settings.", true
	case policy.IsLauncher():
		return "Launcher mode does not allow this endpoint.", true
	default:
		return "", false
	}
}

func writeSettingsSaveError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, settingsstate.ErrSettingsPayloadNotObject):
		writeError(w, r, http.StatusBadRequest, "invalid_settings", "Settings payload must be a JSON object.")
	case errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusBadRequest, "invalid_settings", "Invalid settings payload.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
