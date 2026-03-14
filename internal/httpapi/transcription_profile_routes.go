package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/transcriptionprofiles"
)

const RouteGetTranscriptionProfiles = "/getTranscriptionProfiles"
const RouteCreateTranscriptionProfile = "/createTranscriptionProfile"
const RouteUpdateTranscriptionProfile = "/updateTranscriptionProfile"
const RouteDeleteTranscriptionProfile = "/deleteTranscriptionProfile"

type TranscriptionProfileRouteDependencies struct {
	ModePolicy modes.Policy
	Profiles   *transcriptionprofiles.Service
}

type createTranscriptionProfileRequest struct {
	Name                     string                              `json:"name"`
	TranscriptionLLMConfigID string                              `json:"transcriptionLlmConfigId"`
	TransportMode            transcriptionprofiles.TransportMode `json:"transportMode"`
	ChunkMs                  int                                 `json:"chunkMs"`
	Language                 *string                             `json:"language"`
}

type updateTranscriptionProfileRequest struct {
	Profile *transcriptionprofiles.Profile `json:"profile"`
}

type deleteTranscriptionProfileRequest struct {
	ProfileID string `json:"profileId"`
}

func RegisterTranscriptionProfileRoutes(router chi.Router, deps TranscriptionProfileRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Profiles == nil {
		return fmt.Errorf("transcription profile service is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetTranscriptionProfiles, getTranscriptionProfilesHandler(deps.Profiles))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateTranscriptionProfile, createTranscriptionProfileHandler(deps.Profiles))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateTranscriptionProfile, updateTranscriptionProfileHandler(deps.Profiles))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteTranscriptionProfile, deleteTranscriptionProfileHandler(deps.Profiles))
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

func createTranscriptionProfileHandler(service *transcriptionprofiles.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[createTranscriptionProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		profile := transcriptionprofiles.Profile{
			ID:                       newTranscriptionProfileID(),
			Name:                     payload.Name,
			TranscriptionLLMConfigID: payload.TranscriptionLLMConfigID,
			TransportMode:            payload.TransportMode,
			ChunkMs:                  payload.ChunkMs,
			Language:                 payload.Language,
		}
		created, err := service.Create(profile)
		if err != nil {
			if writeTranscriptionProfileServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, created)
	}
}

func updateTranscriptionProfileHandler(service *transcriptionprofiles.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[updateTranscriptionProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if payload.Profile == nil {
			writeError(w, r, http.StatusBadRequest, "transcription_profile_required", "Transcription profile is required.")
			return
		}
		if strings.TrimSpace(payload.Profile.ID) == "" {
			writeError(w, r, http.StatusBadRequest, "profile_id_required", "Profile id is required.")
			return
		}

		updated, err := service.Update(*payload.Profile)
		if err != nil {
			if writeTranscriptionProfileServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteTranscriptionProfileHandler(service *transcriptionprofiles.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[deleteTranscriptionProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		profileID := strings.TrimSpace(payload.ProfileID)
		if profileID == "" {
			writeError(w, r, http.StatusBadRequest, "profile_id_required", "Profile id is required.")
			return
		}
		if err := service.Delete(profileID); err != nil {
			if writeTranscriptionProfileServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func writeTranscriptionProfileServiceError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, transcriptionprofiles.ErrInvalidProfile):
		writeError(w, r, http.StatusBadRequest, "invalid_transcription_profile", err.Error())
	case errors.Is(err, transcriptionprofiles.ErrInvalidTranscriptionLLMConfig):
		writeError(w, r, http.StatusBadRequest, "invalid_transcription_llm_config", err.Error())
	case errors.Is(err, transcriptionprofiles.ErrRealtimeTranscriptionUnavailable):
		writeError(w, r, http.StatusBadRequest, "realtime_transcription_unavailable", err.Error())
	case errors.Is(err, transcriptionprofiles.ErrProfileNotFound):
		writeError(w, r, http.StatusNotFound, "transcription_profile_not_found", "Transcription profile not found.")
	default:
		return false
	}
	return true
}

func newTranscriptionProfileID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("transcription-profile-%d", time.Now().UnixNano())
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
