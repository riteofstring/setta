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

type httpSpeechEndpointFixture struct {
	handler  http.Handler
	token    string
	deviceID string
	service  *fakeHTTPSpeechService
}

func newHTTPSpeechEndpointFixture(t *testing.T) httpSpeechEndpointFixture {
	t.Helper()
	authStore, token := newTestRuntimeAuthStore(t)
	device, ok, err := authStore.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve test device ok=%v err=%v", ok, err)
	}
	service := &fakeHTTPSpeechService{
		capabilities:         validHTTPSpeechCapabilities(),
		masterVoiceSelection: speech.DefaultMasterVoiceSelection("2026-07-12T18:00:00Z"),
		narratorVoiceDefault: speech.DefaultNarratorVoiceSelection("2026-07-12T18:00:00Z"),
		credentialValidationResult: speech.SpeechCredentialValidationResult{
			Provider: speech.SpeechProviderOpenAI,
			Valid:    true,
		},
		credentialStatus: speech.SpeechCredentialStatus{
			Provider:       speech.SpeechProviderOpenAI,
			ProviderStatus: speech.SpeechProviderStatusConfigured,
		},
		clearCredentialStatus: speech.SpeechCredentialStatus{
			Provider:       speech.SpeechProviderOpenAI,
			ProviderStatus: speech.SpeechProviderStatusNotConfigured,
		},
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
	service.synthesisInput = speech.SpeechSynthesisInput{
		Provider:        speech.SpeechProviderLocalMacOS,
		Source:          service.synthesisAudio.Source,
		Text:            "The local helper can synthesize this narration.",
		ResolvedVoiceID: speech.SpeechVoiceCedar,
		Rate:            speech.AssistantSynthesisRate,
	}
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: authStore,
		SpeechService:      service,
	})
	return httpSpeechEndpointFixture{
		handler:  handler,
		token:    token,
		deviceID: device.ID,
		service:  service,
	}
}

func TestSpeechVoiceEndpointsExposeTypedOperations(t *testing.T) {
	fixture := newHTTPSpeechEndpointFixture(t)

	capabilities := getSpeechJSONWithToken[speech.SpeechCapabilities](t, fixture.handler, "/speech/capabilities", fixture.token, http.StatusOK)
	if !reflect.DeepEqual(capabilities, fixture.service.capabilities) {
		t.Fatalf("capabilities = %+v, want %+v", capabilities, fixture.service.capabilities)
	}
	selection := getSpeechJSONWithToken[speech.MasterVoiceSelection](t, fixture.handler, "/speech/voices/master", fixture.token, http.StatusOK)
	if !reflect.DeepEqual(selection, fixture.service.masterVoiceSelection) {
		t.Fatalf("master voice selection = %+v, want %+v", selection, fixture.service.masterVoiceSelection)
	}
	cedar := speech.SpeechVoiceCedar
	updated := postJSONWithToken[speech.MasterVoiceSelection](
		t,
		fixture.handler,
		"/speech/voices/master/update",
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionExact, RequestedVoiceID: &cedar},
		fixture.token,
		http.StatusOK,
	)
	if updated.ResolvedVoiceID == nil || *updated.ResolvedVoiceID != cedar ||
		fixture.service.masterVoiceUpdate.RequestedVoiceID == nil || *fixture.service.masterVoiceUpdate.RequestedVoiceID != cedar {
		t.Fatalf("updated master voice=%+v request=%+v", updated, fixture.service.masterVoiceUpdate)
	}
	narratorDefault := getSpeechJSONWithToken[speech.NarratorVoiceDefault](
		t,
		fixture.handler,
		"/speech/voices/narrator-default",
		fixture.token,
		http.StatusOK,
	)
	if !reflect.DeepEqual(narratorDefault, fixture.service.narratorVoiceDefault) {
		t.Fatalf("narrator voice default = %+v, want %+v", narratorDefault, fixture.service.narratorVoiceDefault)
	}
	updatedDefault := postJSONWithToken[speech.NarratorVoiceDefault](
		t,
		fixture.handler,
		"/speech/voices/narrator-default/update",
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionExact, RequestedVoiceID: &cedar},
		fixture.token,
		http.StatusOK,
	)
	if updatedDefault.RequestedVoiceID == nil || *updatedDefault.RequestedVoiceID != cedar ||
		fixture.service.narratorVoiceDefaultUpdate.RequestedVoiceID == nil ||
		*fixture.service.narratorVoiceDefaultUpdate.RequestedVoiceID != cedar {
		t.Fatalf("updated narrator default=%+v request=%+v", updatedDefault, fixture.service.narratorVoiceDefaultUpdate)
	}
}

func TestSpeechCredentialEndpointsExposeTypedOperationsAndAuthenticatedDeviceScope(t *testing.T) {
	fixture := newHTTPSpeechEndpointFixture(t)

	credential := "sk-setta-http-speech-credential"
	validated := postJSONWithToken[speech.SpeechCredentialValidationResult](
		t,
		fixture.handler,
		"/speech/credentials/desktop/validate",
		SpeechCredentialRequest{Provider: speech.SpeechProviderOpenAI, APIKey: credential},
		fixture.token,
		http.StatusOK,
	)
	if validated != fixture.service.credentialValidationResult ||
		fixture.service.credentialValidationProvider != speech.SpeechProviderOpenAI ||
		fixture.service.credentialValidationAPIKey != credential ||
		fixture.service.credentialValidationDeviceID != fixture.deviceID {
		t.Fatalf("validated=%+v provider=%q credential=%q device=%q", validated, fixture.service.credentialValidationProvider, fixture.service.credentialValidationAPIKey, fixture.service.credentialValidationDeviceID)
	}
	loaded := postJSONWithToken[speech.SpeechCredentialStatus](
		t,
		fixture.handler,
		"/speech/credentials/desktop/load",
		SpeechCredentialRequest{Provider: speech.SpeechProviderOpenAI, APIKey: credential},
		fixture.token,
		http.StatusOK,
	)
	if loaded != fixture.service.credentialStatus ||
		fixture.service.loadedCredentialProvider != speech.SpeechProviderOpenAI ||
		fixture.service.loadedCredentialAPIKey != credential {
		t.Fatalf("loaded=%+v provider=%q credential=%q", loaded, fixture.service.loadedCredentialProvider, fixture.service.loadedCredentialAPIKey)
	}
	cleared := postJSONWithToken[speech.SpeechCredentialStatus](
		t,
		fixture.handler,
		"/speech/credentials/desktop/clear",
		ClearDesktopSpeechCredentialRequest{Provider: speech.SpeechProviderOpenAI},
		fixture.token,
		http.StatusOK,
	)
	if cleared != fixture.service.clearCredentialStatus ||
		fixture.service.clearedCredentialProvider != speech.SpeechProviderOpenAI ||
		!fixture.service.credentialCleared {
		t.Fatalf("cleared=%+v provider=%q credentialCleared=%v", cleared, fixture.service.clearedCredentialProvider, fixture.service.credentialCleared)
	}
}

func TestSpeechRealtimeEndpointsExposeTypedOperationsAndAuthenticatedDeviceScope(t *testing.T) {
	fixture := newHTTPSpeechEndpointFixture(t)

	created := postJSONWithToken[speech.SpeechTranscriptionSession](
		t,
		fixture.handler,
		"/speech/transcription/sessions",
		CreateSpeechTranscriptionSessionRequest{Provider: speech.SpeechProviderOpenAI},
		fixture.token,
		http.StatusOK,
	)
	if created != fixture.service.session ||
		fixture.service.transcriptionProvider != speech.SpeechProviderOpenAI ||
		fixture.service.transcriptionDeviceID != fixture.deviceID {
		t.Fatalf("created=%+v provider=%q device=%q", created, fixture.service.transcriptionProvider, fixture.service.transcriptionDeviceID)
	}
	resolved := postJSONWithToken[speech.SpeechSynthesisInput](
		t,
		fixture.handler,
		"/speech/synthesis/resolve",
		speech.SpeechSynthesisRequest{
			Provider:        speech.SpeechProviderLocalMacOS,
			Source:          fixture.service.synthesisInput.Source,
			ResolvedVoiceID: fixture.service.synthesisInput.ResolvedVoiceID,
		},
		fixture.token,
		http.StatusOK,
	)
	if !reflect.DeepEqual(resolved, fixture.service.synthesisInput) ||
		!reflect.DeepEqual(fixture.service.synthesisInputRequest.Source, fixture.service.synthesisInput.Source) ||
		fixture.service.synthesisInputRequest.Provider != speech.SpeechProviderLocalMacOS ||
		fixture.service.synthesisInputRequest.ResolvedVoiceID != fixture.service.synthesisInput.ResolvedVoiceID {
		t.Fatalf("resolved=%+v request=%+v", resolved, fixture.service.synthesisInputRequest)
	}
	synthesized := postJSONWithToken[speech.SpeechAudio](
		t,
		fixture.handler,
		"/speech/synthesis",
		speech.SpeechSynthesisRequest{
			Provider:        speech.SpeechProviderOpenAI,
			Source:          fixture.service.synthesisAudio.Source,
			ResolvedVoiceID: fixture.service.synthesisAudio.ResolvedVoiceID,
		},
		fixture.token,
		http.StatusOK,
	)
	if !reflect.DeepEqual(synthesized, fixture.service.synthesisAudio) ||
		!reflect.DeepEqual(fixture.service.synthesisRequest.Source, fixture.service.synthesisAudio.Source) ||
		fixture.service.synthesisRequest.ResolvedVoiceID != fixture.service.synthesisAudio.ResolvedVoiceID {
		t.Fatalf("synthesized=%+v request=%+v", synthesized, fixture.service.synthesisRequest)
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
		{method: http.MethodPost, path: "/speech/credentials/desktop/validate", body: `{"provider":"openai","apiKey":"sk-setta-http-speech-credential"}`},
		{method: http.MethodPost, path: "/speech/credentials/desktop/load", body: `{"provider":"openai","apiKey":"sk-setta-http-speech-credential"}`},
		{method: http.MethodPost, path: "/speech/credentials/desktop/clear", body: `{"provider":"openai"}`},
		{method: http.MethodPost, path: "/speech/transcription/sessions", body: `{"provider":"openai"}`},
		{method: http.MethodPost, path: "/speech/synthesis/resolve", body: `{"provider":"local_macos","source":{"speaker":"master","eventId":"answer","conversationId":null},"resolvedVoiceId":"marin"}`},
		{method: http.MethodPost, path: "/speech/synthesis", body: `{"provider":"openai","source":{"speaker":"master","eventId":"answer","conversationId":null},"resolvedVoiceId":"marin"}`},
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
		{code: speech.ErrorCredentialInvalid, wantStatus: http.StatusBadRequest},
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
			response := postJSON[ErrorResponse](
				t,
				handler,
				"/speech/transcription/sessions",
				CreateSpeechTranscriptionSessionRequest{Provider: speech.SpeechProviderOpenAI},
				test.wantStatus,
			)
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
	response := postJSON[ErrorResponse](
		t,
		handler,
		"/speech/transcription/sessions",
		CreateSpeechTranscriptionSessionRequest{Provider: speech.SpeechProviderOpenAI},
		http.StatusBadRequest,
	)
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
			for _, path := range []string{"/speech/synthesis", "/speech/synthesis/resolve"} {
				t.Run(path, func(t *testing.T) {
					handler := newAuthenticatedTestHandler(t, HandlerConfig{
						Metadata: BackendMetadata{Name: BackendName, Version: "test"},
						SpeechService: &fakeHTTPSpeechService{
							synthesisErr:      test.err,
							synthesisInputErr: test.err,
						},
					})
					response := postJSON[ErrorResponse](
						t,
						handler,
						path,
						speech.SpeechSynthesisRequest{
							Provider: speech.SpeechProviderOpenAI,
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
		})
	}
}

func TestSpeechEndpointRejectsRemovedWorkspaceScope(t *testing.T) {
	for _, path := range []string{"/speech/transcription/sessions", "/speech/synthesis/resolve"} {
		t.Run(path, func(t *testing.T) {
			service := &fakeHTTPSpeechService{}
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
				SpeechService: service,
			})
			response := postRaw[ErrorResponse](
				t,
				handler,
				path,
				`{"provider":"openai","workspaceId":"workspace_old"}`,
				http.StatusBadRequest,
			)
			if response.Error.Code != "invalid_json" || service.calls != 0 {
				t.Fatalf("error=%+v serviceCalls=%d", response.Error, service.calls)
			}
		})
	}
}

func TestSpeechCredentialEndpointRejectsUnknownFields(t *testing.T) {
	service := &fakeHTTPSpeechService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:      BackendMetadata{Name: BackendName, Version: "test"},
		SpeechService: service,
	})
	response := postRaw[ErrorResponse](
		t,
		handler,
		"/speech/credentials/desktop/validate",
		`{"provider":"openai","apiKey":"sk-setta-http-speech-credential","extra":true}`,
		http.StatusBadRequest,
	)
	if response.Error.Code != "invalid_json" || service.calls != 0 {
		t.Fatalf("error=%+v serviceCalls=%d", response.Error, service.calls)
	}
}

func TestSpeechEndpointRejectsOversizedRequestBeforeAuthenticationOrDecode(t *testing.T) {
	handler := NewHandler(HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	tests := []struct {
		path string
		body string
	}{
		{
			path: "/speech/transcription/sessions",
			body: `{"workspaceId":"` + strings.Repeat("x", int(speechRequestBodyLimitBytes)+1) + `"}`,
		},
		{
			path: "/speech/synthesis/resolve",
			body: `{"source":{"eventId":"` + strings.Repeat("x", int(speechRequestBodyLimitBytes)+1) + `"}}`,
		},
		{
			path: "/speech/credentials/desktop/validate",
			body: `{"apiKey":"` + strings.Repeat("x", int(speechRequestBodyLimitBytes)+1) + `"}`,
		},
	}
	for _, test := range tests {
		response := postRaw[ErrorResponse](t, handler, test.path, test.body, http.StatusRequestEntityTooLarge)
		if response.Error.Code != "request_body_too_large" || !strings.Contains(response.Error.Message, "16384 bytes") {
			t.Fatalf("%s error = %+v", test.path, response.Error)
		}
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
	credentialValidationResult    speech.SpeechCredentialValidationResult
	credentialValidationErr       error
	credentialValidationProvider  speech.SpeechProvider
	credentialValidationAPIKey    string
	credentialValidationDeviceID  string
	credentialStatus              speech.SpeechCredentialStatus
	loadCredentialErr             error
	loadedCredentialProvider      speech.SpeechProvider
	loadedCredentialAPIKey        string
	clearCredentialStatus         speech.SpeechCredentialStatus
	clearCredentialErr            error
	clearedCredentialProvider     speech.SpeechProvider
	credentialCleared             bool
	synthesisAudio                speech.SpeechAudio
	synthesisErr                  error
	synthesisRequest              speech.SpeechSynthesisRequest
	synthesisInput                speech.SpeechSynthesisInput
	synthesisInputErr             error
	synthesisInputRequest         speech.SpeechSynthesisRequest
	session                       speech.SpeechTranscriptionSession
	transcriptionErr              error
	transcriptionProvider         speech.SpeechProvider
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

func (service *fakeHTTPSpeechService) ValidateCredential(
	_ context.Context,
	provider speech.SpeechProvider,
	apiKey string,
	deviceID string,
) (speech.SpeechCredentialValidationResult, error) {
	service.calls++
	service.credentialValidationProvider = provider
	service.credentialValidationAPIKey = apiKey
	service.credentialValidationDeviceID = deviceID
	return service.credentialValidationResult, service.credentialValidationErr
}

func (service *fakeHTTPSpeechService) LoadCredential(
	_ context.Context,
	provider speech.SpeechProvider,
	apiKey string,
) (speech.SpeechCredentialStatus, error) {
	service.calls++
	service.loadedCredentialProvider = provider
	service.loadedCredentialAPIKey = apiKey
	return service.credentialStatus, service.loadCredentialErr
}

func (service *fakeHTTPSpeechService) ClearCredential(
	_ context.Context,
	provider speech.SpeechProvider,
) (speech.SpeechCredentialStatus, error) {
	service.calls++
	service.clearedCredentialProvider = provider
	service.credentialCleared = true
	return service.clearCredentialStatus, service.clearCredentialErr
}

func (service *fakeHTTPSpeechService) CreateTranscriptionSession(
	_ context.Context,
	provider speech.SpeechProvider,
	deviceID string,
) (speech.SpeechTranscriptionSession, error) {
	service.calls++
	service.transcriptionProvider = provider
	service.transcriptionDeviceID = deviceID
	return service.session, service.transcriptionErr
}

func (service *fakeHTTPSpeechService) ResolveSynthesisInput(
	_ context.Context,
	request speech.SpeechSynthesisRequest,
) (speech.SpeechSynthesisInput, error) {
	service.calls++
	service.synthesisInputRequest = request
	return service.synthesisInput, service.synthesisInputErr
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
