package httpapi

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/modes"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
)

const RouteStartTranscriptionSession = "/startTranscriptionSession"
const RouteAppendTranscriptionAudio = "/appendTranscriptionAudio"
const RouteStopTranscriptionSession = "/stopTranscriptionSession"
const RouteCancelTranscriptionSession = "/cancelTranscriptionSession"

type StartTranscriptionSessionRequest struct {
	TranscriptionProfileID string  `json:"transcriptionProfileId"`
	Language               *string `json:"language"`
}

type StartTranscriptionSessionResponse struct {
	SessionID             string `json:"sessionId"`
	ResolvedTransportMode string `json:"resolvedTransportMode"`
	ChunkMs               int    `json:"chunkMs"`
}

type AppendTranscriptionAudioRequest struct {
	SessionID        string `json:"sessionId"`
	AudioPcm16Base64 string `json:"audioPcm16Base64"`
	SampleRateHz     int    `json:"sampleRateHz"`
	Channels         int    `json:"channels"`
}

type StopTranscriptionSessionRequest struct {
	SessionID string `json:"sessionId"`
}

type CancelTranscriptionSessionRequest struct {
	SessionID string `json:"sessionId"`
}

type TranscriptionSessionDeltaResponse = transcriptionsessions.Delta

type CancelTranscriptionSessionResponse struct {
	OK bool `json:"ok"`
}

type transcriptionRouteError struct {
	status  int
	code    string
	message string
}

type startTranscriptionSessionPayload struct {
	TranscriptionProfileID *string `json:"transcriptionProfileId"`
	Language               *string `json:"language"`
}

type appendTranscriptionAudioPayload struct {
	SessionID        *string `json:"sessionId"`
	AudioPcm16Base64 *string `json:"audioPcm16Base64"`
	SampleRateHz     *int    `json:"sampleRateHz"`
	Channels         *int    `json:"channels"`
}

type stopTranscriptionSessionPayload struct {
	SessionID *string `json:"sessionId"`
}

type cancelTranscriptionSessionPayload struct {
	SessionID *string `json:"sessionId"`
}

func (e *transcriptionRouteError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func startTranscriptionSessionHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[startTranscriptionSessionPayload](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if deps.TranscriptionProfiles == nil || deps.TranscriptionSessions == nil || deps.Sessions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if !ensureTranscriptionRoutesAllowed(w, r, deps) {
			return
		}

		profileID, ok := requireTranscriptionStringField(w, payload.TranscriptionProfileID, "transcriptionProfileId")
		if !ok {
			return
		}
		scopeID, routeErr := currentTranscriptionScopeID(deps)
		if routeErr != nil {
			writeError(w, r, routeErr.status, routeErr.code, routeErr.message)
			return
		}

		resolved, err := deps.TranscriptionProfiles.Resolve(profileID)
		if err != nil {
			if writeTranscriptionServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		started, err := deps.TranscriptionSessions.StartSession(r.Context(), transcriptionsessions.StartRequest{
			ScopeID:         scopeID,
			ResolvedProfile: resolved,
			Language:        payload.Language,
		})
		if err != nil {
			if writeTranscriptionServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, StartTranscriptionSessionResponse{
			SessionID:             started.SessionID,
			ResolvedTransportMode: started.ResolvedTransportMode,
			ChunkMs:               started.ChunkMs,
		})
	}
}

func appendTranscriptionAudioHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[appendTranscriptionAudioPayload](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if deps.TranscriptionSessions == nil || deps.Sessions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if !ensureTranscriptionRoutesAllowed(w, r, deps) {
			return
		}

		sessionID, ok := requireTranscriptionStringField(w, payload.SessionID, "sessionId")
		if !ok {
			return
		}
		audioPcm16Base64, ok := requireTranscriptionStringField(w, payload.AudioPcm16Base64, "audioPcm16Base64")
		if !ok {
			return
		}
		sampleRateHz, ok := requireTranscriptionIntField(w, payload.SampleRateHz, "sampleRateHz")
		if !ok {
			return
		}
		channels := 1
		if payload.Channels != nil {
			channels = *payload.Channels
		}
		if sampleRateHz <= 0 {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "sampleRateHz must be greater than 0.")
			return
		}
		if channels <= 0 {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "channels must be greater than 0.")
			return
		}
		audioPCM16, routeErr := decodePCM16Payload(audioPcm16Base64)
		if routeErr != nil {
			writeError(w, r, routeErr.status, routeErr.code, routeErr.message)
			return
		}
		scopeID, scopeErr := currentTranscriptionScopeID(deps)
		if scopeErr != nil {
			writeError(w, r, scopeErr.status, scopeErr.code, scopeErr.message)
			return
		}

		delta, err := deps.TranscriptionSessions.AppendAudio(r.Context(), transcriptionsessions.AppendRequest{
			ScopeID:      scopeID,
			SessionID:    sessionID,
			AudioPCM16:   audioPCM16,
			SampleRateHz: sampleRateHz,
			Channels:     channels,
		})
		if err != nil {
			if writeTranscriptionServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, delta)
	}
}

func stopTranscriptionSessionHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[stopTranscriptionSessionPayload](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if deps.TranscriptionSessions == nil || deps.Sessions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if !ensureTranscriptionRoutesAllowed(w, r, deps) {
			return
		}

		sessionID, ok := requireTranscriptionStringField(w, payload.SessionID, "sessionId")
		if !ok {
			return
		}
		scopeID, scopeErr := currentTranscriptionScopeID(deps)
		if scopeErr != nil {
			writeError(w, r, scopeErr.status, scopeErr.code, scopeErr.message)
			return
		}

		delta, err := deps.TranscriptionSessions.StopSession(r.Context(), transcriptionsessions.StopRequest{
			ScopeID:   scopeID,
			SessionID: sessionID,
		})
		if err != nil {
			if writeTranscriptionServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, delta)
	}
}

func cancelTranscriptionSessionHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[cancelTranscriptionSessionPayload](r)
		if err != nil {
			writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if deps.TranscriptionSessions == nil || deps.Sessions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if !ensureTranscriptionRoutesAllowed(w, r, deps) {
			return
		}

		sessionID, ok := requireTranscriptionStringField(w, payload.SessionID, "sessionId")
		if !ok {
			return
		}
		scopeID, scopeErr := currentTranscriptionScopeID(deps)
		if scopeErr != nil {
			writeError(w, r, scopeErr.status, scopeErr.code, scopeErr.message)
			return
		}

		err = deps.TranscriptionSessions.CancelSession(r.Context(), transcriptionsessions.StopRequest{
			ScopeID:   scopeID,
			SessionID: sessionID,
		})
		if err != nil && !errors.Is(err, transcriptionsessions.ErrSessionNotFound) {
			if writeTranscriptionServiceError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, CancelTranscriptionSessionResponse{OK: true})
	}
}

func ensureTranscriptionRoutesAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps AIRouteDependencies,
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

func requireTranscriptionStringField(w http.ResponseWriter, value *string, field string) (string, bool) {
	if value == nil {
		writeValidationError(w, http.StatusUnprocessableEntity, field+": Field required")
		return "", false
	}
	return *value, true
}

func requireTranscriptionIntField(w http.ResponseWriter, value *int, field string) (int, bool) {
	if value == nil {
		writeValidationError(w, http.StatusUnprocessableEntity, field+": Field required")
		return 0, false
	}
	return *value, true
}

func currentTranscriptionScopeID(deps AIRouteDependencies) (string, *transcriptionRouteError) {
	if deps.Sessions == nil {
		return "", &transcriptionRouteError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "Internal Server Error",
		}
	}
	session, ok := deps.Sessions.CurrentSession()
	if !ok {
		return "", &transcriptionRouteError{
			status:  http.StatusUnauthorized,
			code:    "missing_session",
			message: "Missing session.",
		}
	}
	scopeID := strings.TrimSpace(session.Metadata.ID)
	if scopeID == "" {
		return "", &transcriptionRouteError{
			status:  http.StatusUnauthorized,
			code:    "missing_session",
			message: "Missing session.",
		}
	}
	return scopeID, nil
}

func decodePCM16Payload(audioPCM16Base64 string) ([]byte, *transcriptionRouteError) {
	strippedPayload := strings.TrimSpace(audioPCM16Base64)
	if strippedPayload == "" {
		return nil, &transcriptionRouteError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "Audio payload is empty.",
		}
	}
	estimatedDecodedBytes := (len(strippedPayload) * 3) / 4
	if strings.HasSuffix(strippedPayload, "==") {
		estimatedDecodedBytes -= 2
	} else if strings.HasSuffix(strippedPayload, "=") {
		estimatedDecodedBytes--
	}
	if estimatedDecodedBytes > transcriptionsessions.DefaultAppendPCMMaxBytes {
		return nil, &transcriptionRouteError{
			status:  http.StatusRequestEntityTooLarge,
			code:    "audio_payload_too_large",
			message: buildAudioPayloadTooLargeDetail(transcriptionsessions.DefaultAppendPCMMaxBytes),
		}
	}
	decoded, err := base64.StdEncoding.Strict().DecodeString(strippedPayload)
	if err != nil {
		return nil, &transcriptionRouteError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "Audio payload is not valid base64.",
		}
	}
	if len(decoded) == 0 {
		return nil, &transcriptionRouteError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "Audio payload is empty.",
		}
	}
	if len(decoded) > transcriptionsessions.DefaultAppendPCMMaxBytes {
		return nil, &transcriptionRouteError{
			status:  http.StatusRequestEntityTooLarge,
			code:    "audio_payload_too_large",
			message: buildAudioPayloadTooLargeDetail(transcriptionsessions.DefaultAppendPCMMaxBytes),
		}
	}
	if len(decoded)%2 != 0 {
		return nil, &transcriptionRouteError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "Audio payload must be PCM16 with an even byte length.",
		}
	}
	return decoded, nil
}

func writeTranscriptionServiceError(w http.ResponseWriter, r *http.Request, err error) bool {
	var audioLimitErr *transcriptionsessions.AudioLimitExceededError
	switch {
	case errors.Is(err, transcriptionprofiles.ErrProfileNotFound):
		writeError(w, r, http.StatusNotFound, "profile_not_found", err.Error())
	case errors.Is(err, transcriptionsessions.ErrSessionNotFound):
		writeError(w, r, http.StatusNotFound, "session_not_found", err.Error())
	case errors.As(err, &audioLimitErr):
		writeError(w, r, http.StatusRequestEntityTooLarge, "audio_payload_too_large", buildAudioPayloadTooLargeDetail(audioLimitErr.MaxBytes))
	case errors.Is(err, transcriptionsessions.ErrAudioPayloadLarge):
		writeError(w, r, http.StatusRequestEntityTooLarge, "audio_payload_too_large", buildAudioPayloadTooLargeDetail(transcriptionsessions.DefaultMaxPendingPCMBytes))
	case errors.Is(err, transcriptionsessions.ErrMissingAPIKey):
		writeError(w, r, http.StatusBadRequest, "missing_api_key", err.Error())
	case errors.Is(err, transcriptionsessions.ErrUnsupportedModel):
		writeError(w, r, http.StatusBadRequest, "unsupported_model", err.Error())
	case errors.Is(err, transcriptionsessions.ErrInvalidRequest):
		writeError(w, r, http.StatusBadRequest, "invalid_request", err.Error())
	case errors.Is(err, transcriptionsessions.ErrRuntimeUnavailable):
		writeError(w, r, http.StatusServiceUnavailable, "transcription_runtime_unavailable", err.Error())
	case errors.Is(err, transcriptionsessions.ErrProviderFailure):
		writeError(w, r, http.StatusBadGateway, "provider_failure", err.Error())
	default:
		return false
	}
	return true
}

func buildAudioPayloadTooLargeDetail(maxBytes int) string {
	return fmt.Sprintf("Audio payload is too large. Maximum size is %d bytes.", maxBytes)
}
