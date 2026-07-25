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

func (handler handler) createSpeechTranscriptionSession(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload CreateSpeechTranscriptionSessionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	deviceID, ok := authenticatedDeviceID(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_device_session_missing", "authenticated device session is missing")
		return
	}
	session, err := service.CreateTranscriptionSession(request.Context(), deviceID)
	if err != nil {
		writeSpeechError(response, "create_speech_transcription_session_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
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
