package httpapi

import (
	"net/http"

	"setta/internal/speech"
)

const speechRequestBodyLimitBytes int64 = 16 * 1024

func (handler handler) readSpeechCapabilities(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	capabilities, err := service.ReadCapabilities(request.Context())
	if err != nil {
		writeSpeechError(response, "read_speech_capabilities_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, capabilities)
}

func (handler handler) readDirectorVoiceSelection(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	selection, err := service.ReadDirectorVoiceSelection(request.Context())
	if err != nil {
		writeSpeechVoiceConfigurationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, selection)
}

func (handler handler) updateDirectorVoiceSelection(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload speech.VoiceSelectionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	selection, err := service.UpdateDirectorVoiceSelection(request.Context(), payload)
	if err != nil {
		writeSpeechVoiceConfigurationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, selection)
}

func (handler handler) readNarratorVoiceDefault(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	value, err := service.ReadNarratorVoiceDefault(request.Context())
	if err != nil {
		writeSpeechVoiceConfigurationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, value)
}

func (handler handler) updateNarratorVoiceDefault(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload speech.VoiceSelectionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	value, err := service.UpdateNarratorVoiceDefault(request.Context(), payload)
	if err != nil {
		writeSpeechVoiceConfigurationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, value)
}

func (handler handler) validateDesktopSpeechCredential(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload SpeechCredentialRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	deviceID, ok := authenticatedSpeechDeviceID(response, request)
	if !ok {
		return
	}
	result, err := service.ValidateCredential(
		request.Context(),
		payload.Provider,
		payload.APIKey,
		deviceID,
	)
	if err != nil {
		writeSpeechError(response, "validate_desktop_speech_credential_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) loadDesktopSpeechCredential(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload SpeechCredentialRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	status, err := service.LoadCredential(request.Context(), payload.Provider, payload.APIKey)
	if err != nil {
		writeSpeechError(response, "load_desktop_speech_credential_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, status)
}

func (handler handler) clearDesktopSpeechCredential(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload ClearDesktopSpeechCredentialRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	status, err := service.ClearCredential(request.Context(), payload.Provider)
	if err != nil {
		writeSpeechError(response, "clear_desktop_speech_credential_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, status)
}

func (handler handler) createSpeechTranscriptionSession(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload CreateSpeechTranscriptionSessionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	deviceID, ok := authenticatedSpeechDeviceID(response, request)
	if !ok {
		return
	}
	session, err := service.CreateTranscriptionSession(
		request.Context(),
		payload.Provider,
		deviceID,
	)
	if err != nil {
		writeSpeechError(response, "create_speech_transcription_session_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) resolveSpeechSynthesisInput(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload speech.SpeechSynthesisRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	input, err := service.ResolveSynthesisInput(request.Context(), payload)
	if err != nil {
		writeSpeechError(response, "resolve_speech_synthesis_input_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, input)
}

func (handler handler) synthesizeSpeech(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload speech.SpeechSynthesisRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	audio, err := service.SynthesizeSpeech(request.Context(), payload)
	if err != nil {
		writeSpeechError(response, "synthesize_speech_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, audio)
}

func authenticatedSpeechDeviceID(
	response http.ResponseWriter,
	request *http.Request,
) (string, bool) {
	deviceID, ok := authenticatedDeviceID(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_device_session_missing", "authenticated device session is missing")
		return "", false
	}
	return deviceID, true
}
