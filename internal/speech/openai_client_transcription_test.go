package speech

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestOpenAIClientCreatesStrictTranscriptionClientSecret(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	expiresAt := now.Add(5 * time.Minute)
	var calls atomic.Int32
	client := newFakeOpenAIClient(t, fakeRoundTripper(func(request *http.Request) (*http.Response, error) {
		calls.Add(1)
		assertTranscriptionClientSecretRequest(t, request)
		return jsonFakeResponse(t, validClientSecretPayload(expiresAt)), nil
	}))

	secret, err := client.CreateTranscriptionClientSecret(context.Background(), "setta-device-sha256")
	if err != nil {
		t.Fatalf("create transcription client secret: %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("provider calls = %d, want 1", calls.Load())
	}
	if secret.Value != "ek_test_ephemeral" || !secret.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("client secret = %+v", secret)
	}
}

func assertTranscriptionClientSecretRequest(t *testing.T, request *http.Request) {
	t.Helper()
	if request.Method != http.MethodPost || request.URL.String() != openAIBaseURL+"/realtime/client_secrets" {
		t.Fatalf("request = %s %s", request.Method, request.URL)
	}
	if request.Header.Get("Authorization") != "Bearer "+testSpeechAPIKey {
		t.Fatalf("authorization header is missing")
	}
	if request.Header.Get(openAISafetyIdentifierHeader) != "setta-device-sha256" {
		t.Fatalf("safety identifier = %q", request.Header.Get(openAISafetyIdentifierHeader))
	}
	if request.Header.Get("Content-Type") != "application/json" || request.Header.Get("Accept") != "application/json" {
		t.Fatalf("content negotiation headers = %v", request.Header)
	}
	var payload realtimeClientSecretRequest
	decoder := json.NewDecoder(request.Body)
	if err := decoder.Decode(&payload); err != nil {
		t.Fatalf("decode provider request: %v", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		t.Fatalf("provider request has trailing JSON: %v", err)
	}
	if payload.ExpiresAfter.Anchor != "created_at" || payload.ExpiresAfter.Seconds != realtimeClientSecretTTLSeconds {
		t.Fatalf("expiry = %+v", payload.ExpiresAfter)
	}
	if payload.Session.Type != "transcription" {
		t.Fatalf("session type = %q", payload.Session.Type)
	}
	input := payload.Session.Audio.Input
	if input.Transcription.Model != TranscriptionModel || input.Transcription.Delay != TranscriptionDelay {
		t.Fatalf("transcription = %+v", input.Transcription)
	}
	if input.TurnDetection != nil {
		t.Fatalf("turn detection = %#v, want null", input.TurnDetection)
	}
}

func validClientSecretPayload(expiresAt time.Time) map[string]any {
	return map[string]any{
		"value":      "ek_test_ephemeral",
		"expires_at": expiresAt.Unix(),
		"session": map[string]any{
			"type": "transcription",
			"audio": map[string]any{
				"input": map[string]any{
					"transcription": map[string]any{
						"model": TranscriptionModel,
					},
					"turn_detection": nil,
				},
			},
		},
	}
}

func jsonFakeResponse(t *testing.T, payload any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal fake provider response: %v", err)
	}
	return fakeResponse(http.StatusOK, "application/json; charset=utf-8", body)
}

func TestOpenAIClientRejectsMalformedTranscriptionResponses(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name     string
		response func(*testing.T) *http.Response
		want     string
	}{
		{name: "wrong content type", response: func(*testing.T) *http.Response {
			return fakeResponse(http.StatusOK, "text/plain", []byte("not json"))
		}, want: "content type"},
		{name: "invalid JSON", response: func(*testing.T) *http.Response {
			return fakeResponse(http.StatusOK, "application/json", []byte("{"))
		}, want: "malformed JSON"},
		{name: "missing secret", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			delete(payload, "value")
			return jsonFakeResponse(t, payload)
		}, want: "client secret is required"},
		{name: "missing expiry", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			delete(payload, "expires_at")
			return jsonFakeResponse(t, payload)
		}, want: "expiry is missing or expired"},
		{name: "expired", response: func(t *testing.T) *http.Response {
			return jsonFakeResponse(t, validClientSecretPayload(now.Add(-time.Minute)))
		}, want: "expiry is missing or expired"},
		{name: "expiry exceeds requested lifetime", response: func(t *testing.T) *http.Response {
			return jsonFakeResponse(t, validClientSecretPayload(now.Add(20*time.Minute)))
		}, want: "expiry exceeds the requested lifetime"},
		{name: "missing session", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			delete(payload, "session")
			return jsonFakeResponse(t, payload)
		}, want: "session is missing"},
		{name: "wrong session type", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			payload["session"].(map[string]any)["type"] = "realtime"
			return jsonFakeResponse(t, payload)
		}, want: "session type"},
		{name: "missing audio", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			delete(payload["session"].(map[string]any), "audio")
			return jsonFakeResponse(t, payload)
		}, want: "audio configuration is missing"},
		{name: "wrong model", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			transcriptionPayload(payload)["model"] = "wrong-model"
			return jsonFakeResponse(t, payload)
		}, want: "transcription model"},
		{name: "wrong delay", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			transcriptionPayload(payload)["delay"] = "low"
			return jsonFakeResponse(t, payload)
		}, want: "transcription delay"},
		{name: "missing manual turn boundary", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			delete(transcriptionInputPayload(payload), "turn_detection")
			return jsonFakeResponse(t, payload)
		}, want: "turn detection must be null"},
		{name: "provider turn detection", response: func(t *testing.T) *http.Response {
			payload := validClientSecretPayload(now.Add(time.Minute))
			transcriptionInputPayload(payload)["turn_detection"] = map[string]any{"type": "server_vad"}
			return jsonFakeResponse(t, payload)
		}, want: "turn detection must be null"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
				return test.response(t), nil
			}))
			_, err := client.CreateTranscriptionClientSecret(context.Background(), "setta-device-hash")
			requireSpeechErrorCode(t, err, ErrorProviderResponseMalformed)
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func transcriptionInputPayload(payload map[string]any) map[string]any {
	return payload["session"].(map[string]any)["audio"].(map[string]any)["input"].(map[string]any)
}

func transcriptionPayload(payload map[string]any) map[string]any {
	return transcriptionInputPayload(payload)["transcription"].(map[string]any)
}

func TestOpenAIClientRejectsInvalidSafetyIdentifierBeforeRequest(t *testing.T) {
	var calls atomic.Int32
	client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return nil, nil
	}))
	identifiers := []string{"", " hash", "hash value", "håsh", strings.Repeat("a", 65)}
	for _, identifier := range identifiers {
		if _, err := client.CreateTranscriptionClientSecret(context.Background(), identifier); err == nil {
			t.Fatalf("identifier %q unexpectedly passed validation", identifier)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}
