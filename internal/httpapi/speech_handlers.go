package httpapi

import (
	"net/http"

	"setta/internal/runtimeauth"
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

func (handler handler) readMasterVoiceSelection(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	selection, err := service.ReadMasterVoiceSelection(request.Context())
	if err != nil {
		writeSpeechVoiceConfigurationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, selection)
}

func (handler handler) updateMasterVoiceSelection(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload speech.VoiceSelectionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	selection, err := service.UpdateMasterVoiceSelection(request.Context(), payload)
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
	device, ok := authenticatedSpeechDeviceSession(response, request)
	if !ok {
		return
	}
	result, err := service.ValidateCredential(
		request.Context(),
		payload.Provider,
		payload.APIKey,
		device.ID,
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
	device, ok := authenticatedSpeechDeviceSession(response, request)
	if !ok {
		return
	}
	session, err := service.CreateTranscriptionSession(
		request.Context(),
		payload.Provider,
		device.ID,
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

func authenticatedSpeechDeviceSession(
	response http.ResponseWriter,
	request *http.Request,
) (runtimeauth.DeviceSession, bool) {
	device, ok := authenticatedDeviceSession(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_device_session_missing", "authenticated device session is missing")
		return runtimeauth.DeviceSession{}, false
	}
	return device, true
}
