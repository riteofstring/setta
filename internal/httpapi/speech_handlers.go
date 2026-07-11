package httpapi

import "net/http"

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

func (handler handler) createSpeechTranscriptionSession(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload CreateSpeechTranscriptionSessionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	device, ok := authenticatedDeviceSession(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_device_session_missing", "authenticated device session is missing")
		return
	}
	session, err := service.CreateTranscriptionSession(request.Context(), payload.WorkspaceID, device.ID)
	if err != nil {
		writeSpeechError(response, "create_speech_transcription_session_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) synthesizeEasyRunSummary(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload SynthesizeEasyRunSummaryRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	audio, err := service.SynthesizeEasyRunSummary(request.Context(), payload.WorkspaceID, payload.EasyRunID)
	if err != nil {
		writeSpeechError(response, "synthesize_easy_run_summary_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, audio)
}

func (handler handler) synthesizeEasyRunHighlight(response http.ResponseWriter, request *http.Request) {
	service := requireSpeechService(response, handler.speechService)
	if service == nil {
		return
	}
	var payload SynthesizeEasyRunHighlightRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	audio, err := service.SynthesizeEasyRunHighlight(
		request.Context(),
		payload.WorkspaceID,
		payload.EasyRunID,
		payload.HighlightID,
	)
	if err != nil {
		writeSpeechError(response, "synthesize_easy_run_highlight_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, audio)
}
