package speech

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestOpenAIProviderControllerValidatesCandidateWithoutSwapping(t *testing.T) {
	provider := newProviderControllerTestServer(t)
	defer provider.Close()
	controller := newProviderControllerForTest(t, provider.URL+"/v1", "")

	if err := controller.ValidateCredential(
		context.Background(),
		"sk-setta-candidate",
		"setta-device-candidate",
	); err != nil {
		t.Fatalf("validate candidate: %v", err)
	}
	if controller.Configured() || controller.Snapshot() != nil {
		t.Fatal("validation unexpectedly configured the provider")
	}
	if got := provider.authorizationHeaders(); len(got) != 1 || got[0] != "Bearer sk-setta-candidate" {
		t.Fatalf("provider authorization headers = %v", got)
	}
}

func TestOpenAIProviderControllerLoadsClearsAndShutsDownCredential(t *testing.T) {
	provider := newProviderControllerTestServer(t)
	defer provider.Close()
	controller := newProviderControllerForTest(t, provider.URL+"/v1", "")

	if controller.Status() != SpeechProviderStatusNotConfigured {
		t.Fatalf("initial status = %q, want not_configured", controller.Status())
	}
	if err := controller.LoadCredential("sk-setta-active"); err != nil {
		t.Fatalf("load credential: %v", err)
	}
	if controller.Status() != SpeechProviderStatusConfigured {
		t.Fatalf("loaded status = %q, want configured", controller.Status())
	}
	snapshot := controller.Snapshot()
	if snapshot == nil {
		t.Fatal("snapshot is nil after loading credential")
	}
	if _, err := snapshot.CreateTranscriptionClientSecret(context.Background(), "setta-device-active"); err != nil {
		t.Fatalf("create transcription secret through loaded snapshot: %v", err)
	}
	controller.ClearCredential()
	if controller.Configured() || controller.Snapshot() != nil {
		t.Fatal("credential remained configured after clear")
	}
	if err := controller.LoadCredential("sk-setta-reloaded"); err != nil {
		t.Fatalf("reload credential: %v", err)
	}
	controller.Shutdown()
	if controller.Configured() || controller.Snapshot() != nil {
		t.Fatal("credential remained configured after shutdown")
	}
}

func TestOpenAIProviderControllerClosesIdleConnectionsForReplacedAndClearedCredentials(t *testing.T) {
	transports := map[string]*idleCloseTrackingTransport{}
	controller := &OpenAIProviderController{
		newClient: func(apiKey string, _ OpenAIProviderConfig) (*OpenAIClient, error) {
			transport := &idleCloseTrackingTransport{}
			transports[apiKey] = transport
			return &OpenAIClient{
				apiKey:     apiKey,
				httpClient: &http.Client{Transport: transport},
			}, nil
		},
	}

	if err := controller.LoadCredential("sk-setta-old"); err != nil {
		t.Fatalf("load old credential: %v", err)
	}
	oldTransport := transports["sk-setta-old"]
	if oldTransport.closeCalls != 0 {
		t.Fatalf("old credential idle close calls = %d, want 0", oldTransport.closeCalls)
	}
	if err := controller.LoadCredential("sk-setta-new"); err != nil {
		t.Fatalf("load new credential: %v", err)
	}
	if oldTransport.closeCalls != 1 {
		t.Fatalf("old credential idle close calls = %d, want 1", oldTransport.closeCalls)
	}
	newTransport := transports["sk-setta-new"]
	if newTransport.closeCalls != 0 {
		t.Fatalf("new credential idle close calls = %d, want 0", newTransport.closeCalls)
	}

	controller.ClearCredential()
	if newTransport.closeCalls != 1 {
		t.Fatalf("new credential idle close calls = %d, want 1", newTransport.closeCalls)
	}
	controller.ClearCredential()
	if newTransport.closeCalls != 1 {
		t.Fatalf("new credential idle close calls after duplicate clear = %d, want 1", newTransport.closeCalls)
	}
}

func TestOpenAIProviderControllerClosesValidatedCandidateIdleConnections(t *testing.T) {
	transport := &credentialValidationCloseTrackingTransport{t: t}
	controller := &OpenAIProviderController{
		newClient: func(apiKey string, _ OpenAIProviderConfig) (*OpenAIClient, error) {
			return &OpenAIClient{
				apiKey:         apiKey,
				baseURL:        openAIBaseURL,
				httpClient:     &http.Client{Transport: transport},
				requestTimeout: time.Second,
			}, nil
		},
	}

	if err := controller.ValidateCredential(
		context.Background(),
		"sk-setta-candidate",
		"setta-device-candidate",
	); err != nil {
		t.Fatalf("validate candidate: %v", err)
	}
	if controller.Configured() || controller.Snapshot() != nil {
		t.Fatal("validation unexpectedly configured the provider")
	}
	if transport.roundTrips != 1 || transport.closeCalls != 1 {
		t.Fatalf(
			"validation transport roundTrips=%d closeCalls=%d, want 1 and 1",
			transport.roundTrips,
			transport.closeCalls,
		)
	}
}

func TestOpenAIProviderControllerSnapshotSurvivesReplacement(t *testing.T) {
	provider := newProviderControllerTestServer(t)
	defer provider.Close()
	controller := newProviderControllerForTest(t, provider.URL+"/v1", "sk-setta-old")

	oldSnapshot := controller.Snapshot()
	if oldSnapshot == nil {
		t.Fatal("old snapshot is nil")
	}
	if err := controller.LoadCredential("sk-setta-new"); err != nil {
		t.Fatalf("replace credential: %v", err)
	}
	newSnapshot := controller.Snapshot()
	if newSnapshot == nil {
		t.Fatal("new snapshot is nil")
	}
	if _, err := oldSnapshot.CreateTranscriptionClientSecret(context.Background(), "setta-device-old"); err != nil {
		t.Fatalf("old snapshot transcription secret: %v", err)
	}
	if _, err := newSnapshot.CreateTranscriptionClientSecret(context.Background(), "setta-device-new"); err != nil {
		t.Fatalf("new snapshot transcription secret: %v", err)
	}
	got := provider.authorizationHeaders()
	if len(got) != 2 || got[0] != "Bearer sk-setta-old" || got[1] != "Bearer sk-setta-new" {
		t.Fatalf("provider authorization headers = %v", got)
	}
}

func TestOpenAIProviderControllerRejectsInvalidCredentialWithoutLeakingOrReplacing(t *testing.T) {
	controller := newProviderControllerForTest(t, "", "sk-setta-active")
	before := controller.Snapshot()
	invalidCredential := " sk-setta-invalid"
	err := controller.LoadCredential(invalidCredential)
	if err == nil {
		t.Fatal("invalid credential unexpectedly loaded")
	}
	if strings.Contains(err.Error(), invalidCredential) {
		t.Fatalf("error leaked credential: %v", err)
	}
	if after := controller.Snapshot(); after == nil || after != before {
		t.Fatal("active provider changed after rejected load")
	}
}

func TestOpenAIProviderControllerSynchronizesConcurrentAccess(t *testing.T) {
	controller := newProviderControllerForTest(t, "", "")
	var waitGroup sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		waitGroup.Add(1)
		go func(worker int) {
			defer waitGroup.Done()
			for iteration := 0; iteration < 100; iteration++ {
				if err := controller.LoadCredential(
					fmt.Sprintf("sk-setta-worker-%d-iteration-%d", worker, iteration),
				); err != nil {
					t.Errorf("load credential: %v", err)
					return
				}
				_ = controller.Configured()
				_ = controller.Snapshot()
				if iteration%3 == 0 {
					controller.ClearCredential()
				}
			}
		}(worker)
	}
	waitGroup.Wait()
	controller.Shutdown()
}

type providerControllerTestServer struct {
	*httptest.Server

	mu            sync.Mutex
	authorization []string
}

func newProviderControllerTestServer(t *testing.T) *providerControllerTestServer {
	t.Helper()
	provider := &providerControllerTestServer{}
	provider.Server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		provider.handle(t, response, request)
	}))
	return provider
}

func (provider *providerControllerTestServer) handle(
	t *testing.T,
	response http.ResponseWriter,
	request *http.Request,
) {
	t.Helper()
	if request.Method != http.MethodPost || request.URL.Path != "/v1/realtime/client_secrets" {
		t.Errorf("provider request = %s %s, want POST /v1/realtime/client_secrets", request.Method, request.URL.Path)
		http.Error(response, "invalid request", http.StatusBadRequest)
		return
	}
	if request.Header.Get(openAISafetyIdentifierHeader) == "" {
		t.Error("provider request is missing safety identifier")
		http.Error(response, "invalid request", http.StatusBadRequest)
		return
	}
	provider.mu.Lock()
	provider.authorization = append(provider.authorization, request.Header.Get("Authorization"))
	provider.mu.Unlock()
	response.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(response).Encode(validClientSecretPayload(time.Now().Add(5 * time.Minute))); err != nil {
		t.Errorf("encode provider response: %v", err)
	}
}

func (provider *providerControllerTestServer) authorizationHeaders() []string {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	return append([]string(nil), provider.authorization...)
}

type idleCloseTrackingTransport struct {
	closeCalls int
}

func (transport *idleCloseTrackingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, fmt.Errorf("unexpected provider request")
}

func (transport *idleCloseTrackingTransport) CloseIdleConnections() {
	transport.closeCalls++
}

type credentialValidationCloseTrackingTransport struct {
	t          *testing.T
	roundTrips int
	closeCalls int
}

func (transport *credentialValidationCloseTrackingTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	transport.roundTrips++
	if request.Header.Get("Authorization") != "Bearer sk-setta-candidate" {
		transport.t.Fatalf("authorization header = %q", request.Header.Get("Authorization"))
	}
	return jsonFakeResponse(transport.t, validClientSecretPayload(time.Now().Add(5*time.Minute))), nil
}

func (transport *credentialValidationCloseTrackingTransport) CloseIdleConnections() {
	transport.closeCalls++
}

func newProviderControllerForTest(
	t *testing.T,
	baseURL string,
	startupAPIKey string,
) *OpenAIProviderController {
	t.Helper()
	controller, err := NewOpenAIProviderController(OpenAIProviderConfig{
		BaseURL:          baseURL,
		AllowTestBaseURL: baseURL != "",
		RequestTimeout:   time.Second,
	}, startupAPIKey)
	if err != nil {
		t.Fatalf("create OpenAI provider controller: %v", err)
	}
	return controller
}
