package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/conversation"
	"setta/internal/speech"
)

func TestSpeechEndpointsExposeTypedOperationsAndAuthenticatedDeviceScope(t *testing.T) {
	authStore, token := newTestRuntimeAuthStore(t)
	device, ok, err := authStore.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve test device ok=%v err=%v", ok, err)
	}
	service := &fakeHTTPSpeechService{
		capabilities:         validHTTPSpeechCapabilities(),
		masterVoiceSelection: speech.DefaultMasterVoiceSelection("2026-07-12T18:00:00Z"),
		narratorVoiceDefault: speech.DefaultNarratorVoiceSelection("2026-07-12T18:00:00Z"),
		session: speech.SpeechTranscriptionSession{
			ClientSecret:                "ek_test_http",
			ExpiresAt:                   "2099-07-10T12:00:00Z",
			WebRTCURL:                   speech.OpenAIWebRTCURL,
			TranscriptionModel:          speech.TranscriptionModel,
			TranscriptionDelay:          speech.TranscriptionDelay,
			MaximumRecordingSeconds:     speech.MaximumRecordingSeconds,
			MaximumTranscriptCharacters: speech.MaximumTranscriptCharacters,
		},
	}
	conversationID := "conversation-speech"
	service.synthesisAudio = speech.SpeechAudio{
		AudioBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=",
		MediaType:   speech.SynthesisMediaType,
		Format:      speech.SynthesisFormat,
		Source: speech.SpeechSource{
			Speaker:        speech.SpeechSpeakerNarrator,
			EventID:        "status-reply-speech",
			ConversationID: &conversationID,
		},
		ResolvedVoiceID: speech.SpeechVoiceCedar,
	}
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: authStore,
		SpeechService:      service,
	})

	capabilities := getSpeechJSONWithToken[speech.SpeechCapabilities](t, handler, "/speech/capabilities", token, http.StatusOK)
	if !reflect.DeepEqual(capabilities, service.capabilities) {
		t.Fatalf("capabilities = %+v, want %+v", capabilities, service.capabilities)
	}
	selection := getSpeechJSONWithToken[speech.MasterVoiceSelection](t, handler, "/speech/voices/master", token, http.StatusOK)
	if !reflect.DeepEqual(selection, service.masterVoiceSelection) {
		t.Fatalf("master voice selection = %+v, want %+v", selection, service.masterVoiceSelection)
	}
	cedar := speech.SpeechVoiceCedar
	updated := postJSONWithToken[speech.MasterVoiceSelection](
		t,
		handler,
		"/speech/voices/master/update",
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionExact, RequestedVoiceID: &cedar},
		token,
		http.StatusOK,
	)
	if updated.ResolvedVoiceID == nil || *updated.ResolvedVoiceID != cedar ||
		service.masterVoiceUpdate.RequestedVoiceID == nil || *service.masterVoiceUpdate.RequestedVoiceID != cedar {
		t.Fatalf("updated master voice=%+v request=%+v", updated, service.masterVoiceUpdate)
	}
	narratorDefault := getSpeechJSONWithToken[speech.NarratorVoiceDefault](
		t,
		handler,
		"/speech/voices/narrator-default",
		token,
		http.StatusOK,
	)
	if !reflect.DeepEqual(narratorDefault, service.narratorVoiceDefault) {
		t.Fatalf("narrator voice default = %+v, want %+v", narratorDefault, service.narratorVoiceDefault)
	}
	updatedDefault := postJSONWithToken[speech.NarratorVoiceDefault](
		t,
		handler,
		"/speech/voices/narrator-default/update",
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionExact, RequestedVoiceID: &cedar},
		token,
		http.StatusOK,
	)
	if updatedDefault.RequestedVoiceID == nil || *updatedDefault.RequestedVoiceID != cedar ||
		service.narratorVoiceDefaultUpdate.RequestedVoiceID == nil ||
		*service.narratorVoiceDefaultUpdate.RequestedVoiceID != cedar {
		t.Fatalf("updated narrator default=%+v request=%+v", updatedDefault, service.narratorVoiceDefaultUpdate)
	}
	created := postJSONWithToken[speech.SpeechTranscriptionSession](t, handler, "/speech/transcription/sessions", CreateSpeechTranscriptionSessionRequest{}, token, http.StatusOK)
	if created != service.session || service.transcriptionDeviceID != device.ID {
		t.Fatalf("created=%+v device=%q", created, service.transcriptionDeviceID)
	}
	synthesized := postJSONWithToken[speech.SpeechAudio](
		t,
		handler,
		"/speech/synthesis",
		speech.SpeechSynthesisRequest{
			Source:          service.synthesisAudio.Source,
			ResolvedVoiceID: service.synthesisAudio.ResolvedVoiceID,
		},
		token,
		http.StatusOK,
	)
	if !reflect.DeepEqual(synthesized, service.synthesisAudio) ||
		!reflect.DeepEqual(service.synthesisRequest.Source, service.synthesisAudio.Source) ||
		service.synthesisRequest.ResolvedVoiceID != service.synthesisAudio.ResolvedVoiceID {
		t.Fatalf("synthesized=%+v request=%+v", synthesized, service.synthesisRequest)
	}
}

func TestSpeechEndpointsRequireAuthentication(t *testing.T) {
	authStore, _ := newTestRuntimeAuthStore(t)
	service := &fakeHTTPSpeechService{capabilities: validHTTPSpeechCapabilities()}
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: authStore,
		SpeechService:      service,
	})
	tests := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodGet, path: "/speech/capabilities"},
		{method: http.MethodGet, path: "/speech/voices/master"},
		{method: http.MethodPost, path: "/speech/voices/master/update", body: `{"selection":"auto_distinct","requestedVoiceId":null}`},
		{method: http.MethodGet, path: "/speech/voices/narrator-default"},
		{method: http.MethodPost, path: "/speech/voices/narrator-default/update", body: `{"selection":"auto_distinct","requestedVoiceId":null}`},
		{method: http.MethodPost, path: "/speech/transcription/sessions", body: `{}`},
		{method: http.MethodPost, path: "/speech/synthesis", body: `{"source":{"speaker":"master","eventId":"answer","conversationId":null},"resolvedVoiceId":"marin"}`},
	}
	for _, test := range tests {
		request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s status = %d, want 401", test.method, test.path, response.Code)
		}
	}
	if service.calls != 0 {
		t.Fatalf("speech service calls = %d, want 0", service.calls)
	}
}

func TestSpeechEndpointsRequireService(t *testing.T) {
	handler := newAuthenticatedTestHandler(t, HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	response := getJSON[ErrorResponse](t, handler, "/speech/capabilities", http.StatusServiceUnavailable)
	if response.Error.Code != "speech_service_unavailable" {
		t.Fatalf("error code = %q, want speech_service_unavailable", response.Error.Code)
	}
}

func TestSpeechMasterVoiceEndpointMapsPersistentConfigurationFailures(t *testing.T) {
	tests := []struct {
		err        error
		wantCode   string
		wantStatus int
	}{
		{
			err:        &conversation.CorruptStateError{Path: "state", Err: errors.New("corrupt")},
			wantCode:   "corrupt_speech_voice_configuration",
			wantStatus: http.StatusInternalServerError,
		},
		{
			err:        &conversation.PersistenceError{Operation: "read", Path: "state", Err: errors.New("unavailable")},
			wantCode:   "read_speech_voice_configuration_failed",
			wantStatus: http.StatusInternalServerError,
		},
	}
	for _, test := range tests {
		t.Run(test.wantCode, func(t *testing.T) {
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				Metadata: BackendMetadata{Name: BackendName, Version: "test"},
				SpeechService: &fakeHTTPSpeechService{
					masterVoiceSelectionErr: test.err,
				},
			})
			response := getJSON[ErrorResponse](t, handler, "/speech/voices/master", test.wantStatus)
			if response.Error.Code != test.wantCode {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestSpeechEndpointMapsTypedFailures(t *testing.T) {
	tests := []struct {
		code       speech.ErrorCode
		wantStatus int
	}{
		{code: speech.ErrorNotConfigured, wantStatus: http.StatusServiceUnavailable},
		{code: speech.ErrorProviderRejected, wantStatus: http.StatusBadGateway},
		{code: speech.ErrorRateLimited, wantStatus: http.StatusTooManyRequests},
		{code: speech.ErrorProviderUnavailable, wantStatus: http.StatusServiceUnavailable},
		{code: speech.ErrorProviderResponseMalformed, wantStatus: http.StatusBadGateway},
		{code: speech.ErrorAudioTooLarge, wantStatus: http.StatusBadGateway},
		{code: speech.ErrorSourceUnavailable, wantStatus: http.StatusConflict},
	}
	for _, test := range tests {
		t.Run(string(test.code), func(t *testing.T) {
			service := &fakeHTTPSpeechService{
				transcriptionErr: &speech.Error{Code: test.code, Message: "safe classified speech failure"},
			}
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
				SpeechService: service,
			})
			response := postJSON[ErrorResponse](t, handler, "/speech/transcription/sessions", CreateSpeechTranscriptionSessionRequest{}, test.wantStatus)
			if response.Error.Code != string(test.code) || response.Error.Message != "safe classified speech failure" {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestSpeechEndpointMapsUnclassifiedFailureWithoutChangingOperationState(t *testing.T) {
	service := &fakeHTTPSpeechService{transcriptionErr: errors.New("speech provider failed")}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
		SpeechService: service,
	})
	response := postJSON[ErrorResponse](t, handler, "/speech/transcription/sessions", CreateSpeechTranscriptionSessionRequest{}, http.StatusBadRequest)
	if response.Error.Code != "create_speech_transcription_session_failed" {
		t.Fatalf("error = %+v", response.Error)
	}
}

func TestSpeechSynthesisEndpointMapsSourceStateFailures(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantCode   string
		wantStatus int
	}{
		{
			name:       "corrupt source",
			err:        &conversation.CorruptStateError{Path: "state", Err: errors.New("corrupt")},
			wantCode:   "corrupt_speech_source_state",
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "source read failed",
			err:        &conversation.PersistenceError{Operation: "read", Path: "state", Err: errors.New("unavailable")},
			wantCode:   "read_speech_source_failed",
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "source store closed",
			err:        conversation.ErrStoreClosed,
			wantCode:   "speech_source_store_unavailable",
			wantStatus: http.StatusServiceUnavailable,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				Metadata: BackendMetadata{Name: BackendName, Version: "test"},
				SpeechService: &fakeHTTPSpeechService{
					synthesisErr: test.err,
				},
			})
			response := postJSON[ErrorResponse](
				t,
				handler,
				"/speech/synthesis",
				speech.SpeechSynthesisRequest{
					Source: speech.SpeechSource{
						Speaker: speech.SpeechSpeakerMaster,
						EventID: "master-answer",
					},
					ResolvedVoiceID: speech.SpeechVoiceMarin,
				},
				test.wantStatus,
			)
			if response.Error.Code != test.wantCode {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestSpeechEndpointRejectsRemovedWorkspaceScope(t *testing.T) {
	service := &fakeHTTPSpeechService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
		SpeechService: service,
	})
	response := postRaw[ErrorResponse](t, handler, "/speech/transcription/sessions", `{"workspaceId":"workspace_old"}`, http.StatusBadRequest)
	if response.Error.Code != "invalid_json" || service.calls != 0 {
		t.Fatalf("error=%+v serviceCalls=%d", response.Error, service.calls)
	}
}

func TestSpeechEndpointRejectsOversizedRequestBeforeAuthenticationOrDecode(t *testing.T) {
	handler := NewHandler(HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	body := `{"workspaceId":"` + strings.Repeat("x", int(speechRequestBodyLimitBytes)+1) + `"}`
	response := postRaw[ErrorResponse](t, handler, "/speech/transcription/sessions", body, http.StatusRequestEntityTooLarge)
	if response.Error.Code != "request_body_too_large" || !strings.Contains(response.Error.Message, "16384 bytes") {
		t.Fatalf("error = %+v", response.Error)
	}
}

type fakeHTTPSpeechService struct {
	capabilities                  speech.SpeechCapabilities
	capabilitiesErr               error
	masterVoiceSelection          speech.MasterVoiceSelection
	masterVoiceSelectionErr       error
	masterVoiceUpdate             speech.VoiceSelectionRequest
	masterVoiceUpdateErr          error
	narratorVoiceDefault          speech.NarratorVoiceDefault
	narratorVoiceDefaultErr       error
	narratorVoiceDefaultUpdate    speech.VoiceSelectionRequest
	narratorVoiceDefaultUpdateErr error
	synthesisAudio                speech.SpeechAudio
	synthesisErr                  error
	synthesisRequest              speech.SpeechSynthesisRequest
	session                       speech.SpeechTranscriptionSession
	transcriptionErr              error
	transcriptionDeviceID         string
	calls                         int
}

func (service *fakeHTTPSpeechService) ReadCapabilities(context.Context) (speech.SpeechCapabilities, error) {
	service.calls++
	return service.capabilities, service.capabilitiesErr
}

func (service *fakeHTTPSpeechService) ReadMasterVoiceSelection(context.Context) (speech.MasterVoiceSelection, error) {
	service.calls++
	return service.masterVoiceSelection, service.masterVoiceSelectionErr
}

func (service *fakeHTTPSpeechService) ReadNarratorVoiceDefault(
	context.Context,
) (speech.NarratorVoiceDefault, error) {
	service.calls++
	return service.narratorVoiceDefault, service.narratorVoiceDefaultErr
}

func (service *fakeHTTPSpeechService) UpdateMasterVoiceSelection(
	_ context.Context,
	request speech.VoiceSelectionRequest,
) (speech.MasterVoiceSelection, error) {
	service.calls++
	service.masterVoiceUpdate = request
	if service.masterVoiceUpdateErr != nil {
		return speech.MasterVoiceSelection{}, service.masterVoiceUpdateErr
	}
	selection := service.masterVoiceSelection
	selection.Selection = request.Selection
	selection.RequestedVoiceID = request.RequestedVoiceID
	selection.ResolvedVoiceID = request.RequestedVoiceID
	return selection, nil
}

func (service *fakeHTTPSpeechService) UpdateNarratorVoiceDefault(
	_ context.Context,
	request speech.VoiceSelectionRequest,
) (speech.NarratorVoiceDefault, error) {
	service.calls++
	service.narratorVoiceDefaultUpdate = request
	if service.narratorVoiceDefaultUpdateErr != nil {
		return speech.NarratorVoiceDefault{}, service.narratorVoiceDefaultUpdateErr
	}
	value := service.narratorVoiceDefault
	value.Selection = request.Selection
	value.RequestedVoiceID = request.RequestedVoiceID
	return value, nil
}

func (service *fakeHTTPSpeechService) CreateTranscriptionSession(_ context.Context, deviceID string) (speech.SpeechTranscriptionSession, error) {
	service.calls++
	service.transcriptionDeviceID = deviceID
	return service.session, service.transcriptionErr
}

func (service *fakeHTTPSpeechService) SynthesizeSpeech(
	_ context.Context,
	request speech.SpeechSynthesisRequest,
) (speech.SpeechAudio, error) {
	service.calls++
	service.synthesisRequest = request
	return service.synthesisAudio, service.synthesisErr
}

func validHTTPSpeechCapabilities() speech.SpeechCapabilities {
	return speech.SpeechCapabilities{
		ProviderStatus:              speech.SpeechProviderStatusConfigured,
		TranscriptionModel:          speech.TranscriptionModel,
		SynthesisModel:              speech.SynthesisModel,
		VoiceCatalog:                speech.SynthesisVoiceCatalog(),
		MaximumRecordingSeconds:     speech.MaximumRecordingSeconds,
		MaximumTranscriptCharacters: speech.MaximumTranscriptCharacters,
		MaximumSynthesisCharacters:  speech.MaximumSynthesisCharacters,
		AIVoiceDisclosure:           speech.AIVoiceDisclosure,
	}
}

func getSpeechJSONWithToken[T any](t *testing.T, handler http.Handler, path string, token string, wantStatus int) T {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", path, response.Code, wantStatus, response.Body.String())
	}
	var decoded T
	if err := json.NewDecoder(bytes.NewReader(response.Body.Bytes())).Decode(&decoded); err != nil {
		t.Fatalf("decode response %s: %v", path, err)
	}
	return decoded
}
