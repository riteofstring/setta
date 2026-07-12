package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/speech"
)

func TestSpeechEndpointsExposeTypedOperationsAndAuthenticatedDeviceScope(t *testing.T) {
	authStore, token := newTestRuntimeAuthStore(t)
	device, ok, err := authStore.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve test device ok=%v err=%v", ok, err)
	}
	service := &fakeHTTPSpeechService{
		capabilities: validHTTPSpeechCapabilities(),
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
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: authStore,
		SpeechService:      service,
	})

	capabilities := getSpeechJSONWithToken[speech.SpeechCapabilities](t, handler, "/speech/capabilities", token, http.StatusOK)
	if capabilities != service.capabilities {
		t.Fatalf("capabilities = %+v, want %+v", capabilities, service.capabilities)
	}
	created := postJSONWithToken[speech.SpeechTranscriptionSession](t, handler, "/speech/transcription/sessions", CreateSpeechTranscriptionSessionRequest{}, token, http.StatusOK)
	if created != service.session || service.transcriptionDeviceID != device.ID {
		t.Fatalf("created=%+v device=%q", created, service.transcriptionDeviceID)
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
		{method: http.MethodPost, path: "/speech/transcription/sessions", body: `{}`},
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
			if response.Error.Code != string(test.code) || response.Error.Message != "safe classified speech failure" || response.Error.OperationApplied {
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
	if response.Error.Code != "create_speech_transcription_session_failed" || response.Error.OperationApplied {
		t.Fatalf("error = %+v", response.Error)
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
	capabilities          speech.SpeechCapabilities
	capabilitiesErr       error
	session               speech.SpeechTranscriptionSession
	transcriptionErr      error
	transcriptionDeviceID string
	calls                 int
}

func (service *fakeHTTPSpeechService) ReadCapabilities(context.Context) (speech.SpeechCapabilities, error) {
	service.calls++
	return service.capabilities, service.capabilitiesErr
}

func (service *fakeHTTPSpeechService) CreateTranscriptionSession(_ context.Context, deviceID string) (speech.SpeechTranscriptionSession, error) {
	service.calls++
	service.transcriptionDeviceID = deviceID
	return service.session, service.transcriptionErr
}

func validHTTPSpeechCapabilities() speech.SpeechCapabilities {
	return speech.SpeechCapabilities{
		ProviderStatus:              speech.SpeechProviderStatusConfigured,
		TranscriptionModel:          speech.TranscriptionModel,
		SynthesisModel:              speech.SynthesisModel,
		SynthesisVoice:              speech.SynthesisVoice,
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
