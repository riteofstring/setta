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

func startTranscriptionSessionHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		startRequest, ok := buildStartTranscriptionSessionRequest(w, r, deps)
		if !ok {
			return
		}
		started, err := deps.TranscriptionSessions.StartSession(r.Context(), startRequest)
		if writeTranscriptionServiceOrInternalError(w, r, err) {
			return
		}
		writeJSON(w, http.StatusOK, StartTranscriptionSessionResponse{
			SessionID:             started.SessionID,
			ResolvedTransportMode: started.ResolvedTransportMode,
			ChunkMs:               started.ChunkMs,
		})
	}
}

func buildStartTranscriptionSessionRequest(
	w http.ResponseWriter,
	r *http.Request,
	deps AIRouteDependencies,
) (transcriptionsessions.StartRequest, bool) {
	payload, ok := decodeStartTranscriptionSessionPayload(w, r)
	if !ok {
		return transcriptionsessions.StartRequest{}, false
	}
	if !ensureStartTranscriptionSessionAllowed(w, r, deps) {
		return transcriptionsessions.StartRequest{}, false
	}

	profileID, ok := requireTranscriptionStringField(w, payload.TranscriptionProfileID, "transcriptionProfileId")
	if !ok {
		return transcriptionsessions.StartRequest{}, false
	}
	scopeID, routeErr := currentTranscriptionScopeID(deps)
	if routeErr != nil {
		writeError(w, r, routeErr.status, routeErr.code, routeErr.message)
		return transcriptionsessions.StartRequest{}, false
	}

	resolved, err := deps.TranscriptionProfiles.Resolve(profileID)
	if writeTranscriptionServiceOrInternalError(w, r, err) {
		return transcriptionsessions.StartRequest{}, false
	}
	return transcriptionsessions.StartRequest{
		ScopeID:         scopeID,
		ResolvedProfile: resolved,
		Language:        payload.Language,
	}, true
}

func decodeStartTranscriptionSessionPayload(
	w http.ResponseWriter,
	r *http.Request,
) (startTranscriptionSessionPayload, bool) {
	payload, err := decodeStrictJSONBody[startTranscriptionSessionPayload](r)
	if err != nil {
		writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
		return startTranscriptionSessionPayload{}, false
	}
	return payload, true
}

func ensureStartTranscriptionSessionAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps AIRouteDependencies,
) bool {
	if deps.TranscriptionProfiles == nil || deps.TranscriptionSessions == nil || deps.Sessions == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	return ensureTranscriptionRoutesAllowed(w, r, deps)
}

func appendTranscriptionAudioHandler(deps AIRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, ok := decodeAppendTranscriptionAudioPayload(w, r)
		if !ok {
			return
		}
		if !ensureAppendTranscriptionAudioAllowed(w, r, deps) {
			return
		}
		appendRequest, ok := buildAppendTranscriptionAudioRequest(w, r, deps, payload)
		if !ok {
			return
		}
		delta, err := deps.TranscriptionSessions.AppendAudio(r.Context(), appendRequest)
		if writeTranscriptionServiceOrInternalError(w, r, err) {
			return
		}
		writeJSON(w, http.StatusOK, delta)
	}
}

func decodeAppendTranscriptionAudioPayload(w http.ResponseWriter, r *http.Request) (appendTranscriptionAudioPayload, bool) {
	payload, err := decodeStrictJSONBody[appendTranscriptionAudioPayload](r)
	if err != nil {
		writeValidationError(w, http.StatusUnprocessableEntity, err.Error())
		return appendTranscriptionAudioPayload{}, false
	}
	return payload, true
}

func ensureAppendTranscriptionAudioAllowed(w http.ResponseWriter, r *http.Request, deps AIRouteDependencies) bool {
	if deps.TranscriptionSessions == nil || deps.Sessions == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	return ensureTranscriptionRoutesAllowed(w, r, deps)
}

func buildAppendTranscriptionAudioRequest(
	w http.ResponseWriter,
	r *http.Request,
	deps AIRouteDependencies,
	payload appendTranscriptionAudioPayload,
) (transcriptionsessions.AppendRequest, bool) {
	sessionID, ok := requireTranscriptionStringField(w, payload.SessionID, "sessionId")
	if !ok {
		return transcriptionsessions.AppendRequest{}, false
	}
	audioPcm16Base64, ok := requireTranscriptionStringField(w, payload.AudioPcm16Base64, "audioPcm16Base64")
	if !ok {
		return transcriptionsessions.AppendRequest{}, false
	}
	sampleRateHz, ok := requireTranscriptionIntField(w, payload.SampleRateHz, "sampleRateHz")
	if !ok {
		return transcriptionsessions.AppendRequest{}, false
	}
	channels := transcriptionAppendChannels(payload.Channels)
	if routeErr := validateAppendTranscriptionAudioSettings(sampleRateHz, channels); routeErr != nil {
		writeError(w, r, routeErr.status, routeErr.code, routeErr.message)
		return transcriptionsessions.AppendRequest{}, false
	}
	audioPCM16, routeErr := decodePCM16Payload(audioPcm16Base64)
	if routeErr != nil {
		writeError(w, r, routeErr.status, routeErr.code, routeErr.message)
		return transcriptionsessions.AppendRequest{}, false
	}
	scopeID, scopeErr := currentTranscriptionScopeID(deps)
	if scopeErr != nil {
		writeError(w, r, scopeErr.status, scopeErr.code, scopeErr.message)
		return transcriptionsessions.AppendRequest{}, false
	}
	return transcriptionsessions.AppendRequest{
		ScopeID:      scopeID,
		SessionID:    sessionID,
		AudioPCM16:   audioPCM16,
		SampleRateHz: sampleRateHz,
		Channels:     channels,
	}, true
}

func transcriptionAppendChannels(channels *int) int {
	if channels == nil {
		return 1
	}
	return *channels
}

func validateAppendTranscriptionAudioSettings(sampleRateHz int, channels int) *transcriptionRouteError {
	if sampleRateHz <= 0 {
		return &transcriptionRouteError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "sampleRateHz must be greater than 0.",
		}
	}
	if channels <= 0 {
		return &transcriptionRouteError{
			status:  http.StatusBadRequest,
			code:    "invalid_request",
			message: "channels must be greater than 0.",
		}
	}
	return nil
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
		if writeTranscriptionServiceOrInternalError(w, r, err) {
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

func writeTranscriptionServiceOrInternalError(w http.ResponseWriter, r *http.Request, err error) bool {
	if err == nil {
		return false
	}
	if writeTranscriptionServiceError(w, r, err) {
		return true
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	return true
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
