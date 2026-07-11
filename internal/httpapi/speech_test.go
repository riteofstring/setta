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
		summaryAudio: speech.SpeechAudio{
			AudioBase64: "summary-audio",
			MediaType:   speech.SynthesisMediaType,
			Format:      speech.SynthesisFormat,
			SourceID:    "easy_run_latest",
		},
		highlightAudio: speech.SpeechAudio{
			AudioBase64: "highlight-audio",
			MediaType:   speech.SynthesisMediaType,
			Format:      speech.SynthesisFormat,
			SourceID:    "highlight_latest",
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
	created := postJSONWithToken[speech.SpeechTranscriptionSession](t, handler, "/speech/transcription/sessions", CreateSpeechTranscriptionSessionRequest{
		WorkspaceID: "workspace_api",
	}, token, http.StatusOK)
	if created != service.session || service.transcriptionWorkspaceID != "workspace_api" || service.transcriptionDeviceID != device.ID {
		t.Fatalf("created=%+v workspace=%q device=%q", created, service.transcriptionWorkspaceID, service.transcriptionDeviceID)
	}
	summaryAudio := postJSONWithToken[speech.SpeechAudio](t, handler, "/speech/easy-runs/summary", SynthesizeEasyRunSummaryRequest{
		WorkspaceID: "workspace_api",
		EasyRunID:   "easy_run_latest",
	}, token, http.StatusOK)
	if summaryAudio != service.summaryAudio || service.summaryWorkspaceID != "workspace_api" || service.summaryEasyRunID != "easy_run_latest" {
		t.Fatalf("summary audio=%+v workspace=%q run=%q", summaryAudio, service.summaryWorkspaceID, service.summaryEasyRunID)
	}
	highlightAudio := postJSONWithToken[speech.SpeechAudio](t, handler, "/speech/easy-runs/highlight", SynthesizeEasyRunHighlightRequest{
		WorkspaceID: "workspace_api",
		EasyRunID:   "easy_run_latest",
		HighlightID: "highlight_latest",
	}, token, http.StatusOK)
	if highlightAudio != service.highlightAudio ||
		service.highlightWorkspaceID != "workspace_api" ||
		service.highlightEasyRunID != "easy_run_latest" ||
		service.highlightID != "highlight_latest" {
		t.Fatalf(
			"highlight audio=%+v workspace=%q run=%q highlight=%q",
			highlightAudio,
			service.highlightWorkspaceID,
			service.highlightEasyRunID,
			service.highlightID,
		)
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
		{method: http.MethodPost, path: "/speech/easy-runs/summary", body: `{}`},
		{method: http.MethodPost, path: "/speech/easy-runs/highlight", body: `{}`},
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
				summaryErr: &speech.Error{Code: test.code, Message: "safe classified speech failure"},
			}
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
				SpeechService: service,
			})
			response := postJSON[ErrorResponse](t, handler, "/speech/easy-runs/summary", SynthesizeEasyRunSummaryRequest{
				WorkspaceID: "workspace_api",
				EasyRunID:   "easy_run_latest",
			}, test.wantStatus)
			if response.Error.Code != string(test.code) || response.Error.Message != "safe classified speech failure" || response.Error.OperationApplied {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestSpeechEndpointMapsUnclassifiedFailureWithoutChangingOperationState(t *testing.T) {
	service := &fakeHTTPSpeechService{summaryErr: errors.New("workspace is not open")}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
		SpeechService: service,
	})
	response := postJSON[ErrorResponse](t, handler, "/speech/easy-runs/summary", SynthesizeEasyRunSummaryRequest{
		WorkspaceID: "workspace_missing",
		EasyRunID:   "easy_run_latest",
	}, http.StatusBadRequest)
	if response.Error.Code != "synthesize_easy_run_summary_failed" || response.Error.OperationApplied {
		t.Fatalf("error = %+v", response.Error)
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
	capabilities             speech.SpeechCapabilities
	capabilitiesErr          error
	session                  speech.SpeechTranscriptionSession
	transcriptionErr         error
	summaryAudio             speech.SpeechAudio
	summaryErr               error
	highlightAudio           speech.SpeechAudio
	highlightErr             error
	transcriptionWorkspaceID string
	transcriptionDeviceID    string
	summaryWorkspaceID       string
	summaryEasyRunID         string
	highlightWorkspaceID     string
	highlightEasyRunID       string
	highlightID              string
	calls                    int
}

func (service *fakeHTTPSpeechService) ReadCapabilities(context.Context) (speech.SpeechCapabilities, error) {
	service.calls++
	return service.capabilities, service.capabilitiesErr
}

func (service *fakeHTTPSpeechService) CreateTranscriptionSession(_ context.Context, workspaceID string, deviceID string) (speech.SpeechTranscriptionSession, error) {
	service.calls++
	service.transcriptionWorkspaceID = workspaceID
	service.transcriptionDeviceID = deviceID
	return service.session, service.transcriptionErr
}

func (service *fakeHTTPSpeechService) SynthesizeEasyRunSummary(_ context.Context, workspaceID string, easyRunID string) (speech.SpeechAudio, error) {
	service.calls++
	service.summaryWorkspaceID = workspaceID
	service.summaryEasyRunID = easyRunID
	return service.summaryAudio, service.summaryErr
}

func (service *fakeHTTPSpeechService) SynthesizeEasyRunHighlight(
	_ context.Context,
	workspaceID string,
	easyRunID string,
	highlightID string,
) (speech.SpeechAudio, error) {
	service.calls++
	service.highlightWorkspaceID = workspaceID
	service.highlightEasyRunID = easyRunID
	service.highlightID = highlightID
	return service.highlightAudio, service.highlightErr
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
