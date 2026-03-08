package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/transcriptionprofiles"
)

const RouteGetTranscriptionProfiles = "/getTranscriptionProfiles"

type TranscriptionProfileRouteDependencies struct {
	ModePolicy modes.Policy
	Profiles   *transcriptionprofiles.Service
}

func RegisterTranscriptionProfileRoutes(router chi.Router, deps TranscriptionProfileRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Profiles == nil {
		return fmt.Errorf("transcription profile service is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetTranscriptionProfiles, getTranscriptionProfilesHandler(deps.Profiles))
	return nil
}

func getTranscriptionProfilesHandler(service *transcriptionprofiles.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		profiles, err := service.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, profiles)
	}
}
