package httpapi

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/realtime"
	"setta/internal/transcriptionprofiles"
)

const RouteGetTranscriptionProfiles = "/getTranscriptionProfiles"
const RouteCreateTranscriptionProfile = "/createTranscriptionProfile"
const RouteUpdateTranscriptionProfile = "/updateTranscriptionProfile"
const RouteDeleteTranscriptionProfile = "/deleteTranscriptionProfile"

type TranscriptionProfileRouteDependencies struct {
	ModePolicy   modes.Policy
	Profiles     *transcriptionprofiles.Service
	Deployment   *deployments.Runtime
	WebsocketHub *realtime.WebsocketHub
}

type CreateTranscriptionProfileRequest struct {
	Name                     *string                              `json:"name"`
	TranscriptionLLMConfigID *string                              `json:"transcriptionLlmConfigId"`
	TransportMode            *transcriptionprofiles.TransportMode `json:"transportMode"`
	ChunkMs                  *int                                 `json:"chunkMs"`
	Language                 *string                              `json:"language"`
}

type UpdateTranscriptionProfileRequest struct {
	Profile *TranscriptionProfilePayload `json:"profile"`
}

type DeleteTranscriptionProfileRequest struct {
	ProfileID *string `json:"profileId"`
}

type TranscriptionProfilePayload struct {
	ID                       *string                              `json:"id"`
	Name                     *string                              `json:"name"`
	TranscriptionLLMConfigID *string                              `json:"transcriptionLlmConfigId"`
	TransportMode            *transcriptionprofiles.TransportMode `json:"transportMode"`
	ChunkMs                  *int                                 `json:"chunkMs"`
	SupportsRealtime         *bool                                `json:"supportsRealtimeTranscription"`
	Language                 *string                              `json:"language"`
}

func RegisterTranscriptionProfileRoutes(router chi.Router, deps TranscriptionProfileRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.ModePolicy.IsIDE() && deps.Profiles == nil && !documentOnly {
		return fmt.Errorf("transcription profile service is required in ide mode")
	}
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil && !documentOnly {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}

	registerOpenAPIGet[[]transcriptionprofiles.Profile](
		router,
		"getTranscriptionProfiles",
		RouteGetTranscriptionProfiles,
		getTranscriptionProfilesHandler(deps),
		withOpenAPITags("Transcription Profiles"),
		withOpenAPISummary("List configured transcription profiles."),
	)
	registerOpenAPIPost[CreateTranscriptionProfileRequest, transcriptionprofiles.Profile](
		router,
		"createTranscriptionProfile",
		RouteCreateTranscriptionProfile,
		createTranscriptionProfileHandler(deps),
		withOpenAPITags("Transcription Profiles"),
		withOpenAPISummary("Create a transcription profile."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[UpdateTranscriptionProfileRequest, transcriptionprofiles.Profile](
		router,
		"updateTranscriptionProfile",
		RouteUpdateTranscriptionProfile,
		updateTranscriptionProfileHandler(deps),
		withOpenAPITags("Transcription Profiles"),
		withOpenAPISummary("Update a transcription profile."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[DeleteTranscriptionProfileRequest, openAPIJSONNull](
		router,
		"deleteTranscriptionProfile",
		RouteDeleteTranscriptionProfile,
		deleteTranscriptionProfileHandler(deps),
		withOpenAPITags("Transcription Profiles"),
		withOpenAPISummary("Delete a transcription profile."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func ensureTranscriptionProfileReadsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps TranscriptionProfileRouteDependencies,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		requestInfo = modes.RequestInfo{Policy: modes.NewPolicy(deps.ModePolicy.Mode())}
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deps.Deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if deps.Deployment.Policy().AllowLLM {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"llm_access_forbidden",
		"Deployment policy disallows LLM access.",
	)
	return false
}

func ensureTranscriptionProfileMutationAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps TranscriptionProfileRouteDependencies,
	detail string,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		requestInfo = modes.RequestInfo{Policy: modes.NewPolicy(deps.ModePolicy.Mode())}
	}
	if err := requestInfo.Policy.RequireNotLauncher(); err != nil {
		var violation *modes.Violation
		if errors.As(err, &violation) {
			writeDetail(w, violation.StatusCode, violation.Message)
			return false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return false
		}
		if !deps.Deployment.Policy().AllowLLM {
			writeError(
				w,
				r,
				http.StatusForbidden,
				"llm_access_forbidden",
				"Deployment policy disallows LLM access.",
			)
			return false
		}
	}
	if requestInfo.Policy.IsIDE() {
		return true
	}
	writeDetail(w, http.StatusForbidden, detail)
	return false
}

func getTranscriptionProfilesHandler(deps TranscriptionProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureTranscriptionProfileReadsAllowed(w, r, deps) {
			return
		}
		service := deps.Profiles
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

func createTranscriptionProfileHandler(deps TranscriptionProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureTranscriptionProfileMutationAllowed(w, r, deps, "Share mode does not allow creating transcription profiles.") {
			return
		}
		service := deps.Profiles
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[CreateTranscriptionProfileRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		profile, ok := buildCreatedTranscriptionProfile(w, payload)
		if !ok {
			return
		}
		created, err := service.Create(profile)
		if err != nil {
			if writeTranscriptionProfileServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if err := broadcastTranscriptionProfilesUpdated(r.Context(), service, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, created)
	}
}

func updateTranscriptionProfileHandler(deps TranscriptionProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureTranscriptionProfileMutationAllowed(w, r, deps, "Share mode does not allow updating transcription profiles.") {
			return
		}
		service := deps.Profiles
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[UpdateTranscriptionProfileRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.Profile == nil {
			writeValidationError(w, http.StatusUnprocessableEntity, "profile: Field required")
			return
		}
		profile, ok := buildUpdatedTranscriptionProfile(w, payload.Profile)
		if !ok {
			return
		}

		updated, err := service.Update(profile)
		if err != nil {
			if writeTranscriptionProfileServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if err := broadcastTranscriptionProfilesUpdated(r.Context(), service, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteTranscriptionProfileHandler(deps TranscriptionProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureTranscriptionProfileMutationAllowed(w, r, deps, "Share mode does not allow deleting transcription profiles.") {
			return
		}
		service := deps.Profiles
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[DeleteTranscriptionProfileRequest](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if payload.ProfileID == nil {
			writeValidationError(w, http.StatusUnprocessableEntity, "profileId: Field required")
			return
		}
		if err := service.Delete(*payload.ProfileID); err != nil {
			if writeTranscriptionProfileServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if err := broadcastTranscriptionProfilesUpdated(r.Context(), service, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func broadcastTranscriptionProfilesUpdated(
	ctx context.Context,
	service *transcriptionprofiles.Service,
	websocketHub *realtime.WebsocketHub,
) error {
	if websocketHub == nil || service == nil {
		return nil
	}
	profiles, err := service.List()
	if err != nil {
		return err
	}
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewTranscriptionProfilesUpdatedMessage(profiles),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
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

func buildCreatedTranscriptionProfile(
	w http.ResponseWriter,
	payload CreateTranscriptionProfileRequest,
) (transcriptionprofiles.Profile, bool) {
	name, llmConfigID, transportMode, chunkMs, ok := validateTranscriptionProfileFields(
		w,
		payload.Name,
		payload.TranscriptionLLMConfigID,
		payload.TransportMode,
		payload.ChunkMs,
		"name",
		"transcriptionLlmConfigId",
		"transportMode",
		"chunkMs",
	)
	if !ok {
		return transcriptionprofiles.Profile{}, false
	}
	return transcriptionprofiles.Profile{
		ID:                       newTranscriptionProfileID(),
		Name:                     name,
		TranscriptionLLMConfigID: llmConfigID,
		TransportMode:            transportMode,
		ChunkMs:                  chunkMs,
		Language:                 payload.Language,
	}, true
}

func buildUpdatedTranscriptionProfile(
	w http.ResponseWriter,
	payload *TranscriptionProfilePayload,
) (transcriptionprofiles.Profile, bool) {
	name, llmConfigID, transportMode, chunkMs, ok := validateTranscriptionProfileFields(
		w,
		payload.Name,
		payload.TranscriptionLLMConfigID,
		payload.TransportMode,
		payload.ChunkMs,
		"profile.name",
		"profile.transcriptionLlmConfigId",
		"profile.transportMode",
		"profile.chunkMs",
	)
	if !ok {
		return transcriptionprofiles.Profile{}, false
	}
	profileID := newTranscriptionProfileID()
	if payload.ID != nil {
		profileID = *payload.ID
	}
	supportsRealtime := false
	if payload.SupportsRealtime != nil {
		supportsRealtime = *payload.SupportsRealtime
	}
	return transcriptionprofiles.Profile{
		ID:                            profileID,
		Name:                          name,
		TranscriptionLLMConfigID:      llmConfigID,
		TransportMode:                 transportMode,
		ChunkMs:                       chunkMs,
		SupportsRealtimeTranscription: supportsRealtime,
		Language:                      payload.Language,
	}, true
}

func validateTranscriptionProfileFields(
	w http.ResponseWriter,
	name *string,
	transcriptionLLMConfigID *string,
	transportMode *transcriptionprofiles.TransportMode,
	chunkMs *int,
	nameField string,
	configField string,
	transportField string,
	chunkField string,
) (string, string, transcriptionprofiles.TransportMode, int, bool) {
	if name == nil {
		writeValidationError(w, http.StatusUnprocessableEntity, nameField+": Field required")
		return "", "", "", 0, false
	}
	if transcriptionLLMConfigID == nil {
		writeValidationError(w, http.StatusUnprocessableEntity, configField+": Field required")
		return "", "", "", 0, false
	}
	if transportMode == nil {
		writeValidationError(w, http.StatusUnprocessableEntity, transportField+": Field required")
		return "", "", "", 0, false
	}
	if chunkMs == nil {
		writeValidationError(w, http.StatusUnprocessableEntity, chunkField+": Field required")
		return "", "", "", 0, false
	}
	if *chunkMs < 200 {
		writeValidationError(w, http.StatusUnprocessableEntity, chunkField+": Input should be greater than or equal to 200")
		return "", "", "", 0, false
	}
	if *chunkMs > 10_000 {
		writeValidationError(w, http.StatusUnprocessableEntity, chunkField+": Input should be less than or equal to 10000")
		return "", "", "", 0, false
	}
	return *name, *transcriptionLLMConfigID, *transportMode, *chunkMs, true
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
