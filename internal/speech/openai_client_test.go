package speech

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const testSpeechAPIKey = "sk-setta-speech-test"

type fakeRoundTripper func(*http.Request) (*http.Response, error)

func (roundTrip fakeRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

type trackingBody struct {
	reader io.Reader
	closed *atomic.Bool
}

func (body trackingBody) Read(destination []byte) (int, error) {
	return body.reader.Read(destination)
}

func (body trackingBody) Close() error {
	body.closed.Store(true)
	return nil
}

func newFakeOpenAIClient(t *testing.T, roundTrip http.RoundTripper) *OpenAIClient {
	t.Helper()
	client, err := NewOpenAIClient(testSpeechAPIKey, OpenAIProviderConfig{
		HTTPClient:     &http.Client{Transport: roundTrip},
		RequestTimeout: time.Second,
	})
	if err != nil {
		t.Fatalf("create OpenAI speech client: %v", err)
	}
	return client
}

func fakeResponse(status int, contentType string, body []byte) *http.Response {
	header := make(http.Header)
	if contentType != "" {
		header.Set("Content-Type", contentType)
	}
	return &http.Response{
		StatusCode:    status,
		Header:        header,
		Body:          io.NopCloser(bytes.NewReader(body)),
		ContentLength: int64(len(body)),
	}
}

func validTestWAV() []byte {
	return validTestWAVWithDataLength(2)
}

func validTestWAVWithDataLength(dataLength int) []byte {
	audioLength := 44 + dataLength
	if dataLength%2 != 0 {
		audioLength++
	}
	audio := make([]byte, audioLength)
	copy(audio[0:4], "RIFF")
	binary.LittleEndian.PutUint32(audio[4:8], uint32(len(audio)-8))
	copy(audio[8:12], "WAVE")
	copy(audio[12:16], "fmt ")
	binary.LittleEndian.PutUint32(audio[16:20], 16)
	binary.LittleEndian.PutUint16(audio[20:22], 1)
	binary.LittleEndian.PutUint16(audio[22:24], 1)
	binary.LittleEndian.PutUint32(audio[24:28], 24_000)
	binary.LittleEndian.PutUint32(audio[28:32], 48_000)
	binary.LittleEndian.PutUint16(audio[32:34], 2)
	binary.LittleEndian.PutUint16(audio[34:36], 16)
	copy(audio[36:40], "data")
	binary.LittleEndian.PutUint32(audio[40:44], uint32(dataLength))
	return audio
}

func requireSpeechErrorCode(t *testing.T, err error, code ErrorCode) *Error {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want %s", code)
	}
	speechError, ok := AsError(err)
	if !ok {
		t.Fatalf("error type = %T, want *speech.Error: %v", err, err)
	}
	if speechError.Code != code {
		t.Fatalf("error code = %s, want %s: %v", speechError.Code, code, err)
	}
	return speechError
}

func TestNewOpenAIClientValidatesConfiguration(t *testing.T) {
	tests := []struct {
		name   string
		apiKey string
		config OpenAIProviderConfig
		want   string
	}{
		{name: "api key whitespace", apiKey: " secret", want: "API key must not contain"},
		{name: "api key embedded whitespace", apiKey: "secret value", want: "only visible ASCII"},
		{name: "negative timeout", config: OpenAIProviderConfig{RequestTimeout: -time.Second}, want: "request timeout must be positive"},
		{name: "unapproved base URL", config: OpenAIProviderConfig{BaseURL: "http://127.0.0.1:1234/v1"}, want: "requires explicit test authorization"},
		{name: "base URL query", config: OpenAIProviderConfig{BaseURL: "http://127.0.0.1:1234/v1?secret=value", AllowTestBaseURL: true}, want: "must not contain user info"},
		{name: "base URL without host", config: OpenAIProviderConfig{BaseURL: "http:///v1", AllowTestBaseURL: true}, want: "requires a scheme and host"},
		{name: "base URL unsupported scheme", config: OpenAIProviderConfig{BaseURL: "ftp://example.test/v1", AllowTestBaseURL: true}, want: "must use HTTP or HTTPS"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := NewOpenAIClient(test.apiKey, test.config)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}

	client, err := NewOpenAIClient("", OpenAIProviderConfig{
		BaseURL:          "http://127.0.0.1:1234/v1/",
		AllowTestBaseURL: true,
	})
	if err != nil {
		t.Fatalf("create test-base-URL client: %v", err)
	}
	if client.baseURL != "http://127.0.0.1:1234/v1" {
		t.Fatalf("base URL = %q", client.baseURL)
	}
}

func TestOpenAIClientWithoutAPIKeyFailsWithoutProviderRequest(t *testing.T) {
	var calls atomic.Int32
	client, err := NewOpenAIClient("", OpenAIProviderConfig{
		HTTPClient: &http.Client{Transport: fakeRoundTripper(func(*http.Request) (*http.Response, error) {
			calls.Add(1)
			return nil, errors.New("unexpected request")
		})},
	})
	if err != nil {
		t.Fatalf("create unconfigured OpenAI speech client: %v", err)
	}

	_, err = client.CreateTranscriptionClientSecret(context.Background(), "setta-device-hash")
	requireSpeechErrorCode(t, err, ErrorNotConfigured)
	_, err = client.SynthesizeSpeech(context.Background(), "Visible persisted summary.", SynthesisVoice)
	requireSpeechErrorCode(t, err, ErrorNotConfigured)
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}

func TestOpenAIClientClassifiesProviderStatusesWithoutLeakingBodies(t *testing.T) {
	tests := []struct {
		status int
		code   ErrorCode
	}{
		{status: http.StatusUnauthorized, code: ErrorProviderRejected},
		{status: http.StatusForbidden, code: ErrorProviderRejected},
		{status: http.StatusTooManyRequests, code: ErrorRateLimited},
		{status: http.StatusRequestTimeout, code: ErrorProviderUnavailable},
		{status: http.StatusInternalServerError, code: ErrorProviderUnavailable},
		{status: http.StatusBadRequest, code: ErrorProviderResponseMalformed},
		{status: http.StatusTemporaryRedirect, code: ErrorProviderResponseMalformed},
	}
	for _, test := range tests {
		t.Run(http.StatusText(test.status), func(t *testing.T) {
			var calls atomic.Int32
			client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
				calls.Add(1)
				return fakeResponse(test.status, "application/json", []byte(`{"error":"provider-body-secret"}`)), nil
			}))
			_, err := client.SynthesizeSpeech(context.Background(), "Persisted summary.", SynthesisVoice)
			requireSpeechErrorCode(t, err, test.code)
			if calls.Load() != 1 {
				t.Fatalf("provider calls = %d, want 1", calls.Load())
			}
			if strings.Contains(err.Error(), "provider-body-secret") || strings.Contains(err.Error(), testSpeechAPIKey) {
				t.Fatalf("error leaked provider data: %v", err)
			}
		})
	}
}

func TestOpenAIClientDoesNotFollowProviderRedirects(t *testing.T) {
	var calls atomic.Int32
	client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		response := fakeResponse(http.StatusTemporaryRedirect, "text/plain", nil)
		response.Header.Set("Location", "https://example.test/credential-sink")
		return response, nil
	}))
	_, err := client.SynthesizeSpeech(context.Background(), "Persisted summary.", SynthesisVoice)
	requireSpeechErrorCode(t, err, ErrorProviderResponseMalformed)
	if calls.Load() != 1 {
		t.Fatalf("provider calls = %d, want 1", calls.Load())
	}
}

func TestOpenAIClientClosesProviderResponseBodies(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   []byte
	}{
		{name: "success", status: http.StatusOK, body: []byte{0, 0}},
		{name: "failure", status: http.StatusInternalServerError, body: []byte("provider failure")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var closed atomic.Bool
			client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
				response := fakeResponse(test.status, "application/octet-stream", nil)
				response.Body = trackingBody{reader: bytes.NewReader(test.body), closed: &closed}
				response.ContentLength = int64(len(test.body))
				return response, nil
			}))
			_, _ = client.SynthesizeSpeech(context.Background(), "Persisted summary.", SynthesisVoice)
			if !closed.Load() {
				t.Fatal("provider response body was not closed")
			}
		})
	}
}

func TestOpenAIClientPropagatesCancellationAndDeadlineClassification(t *testing.T) {
	t.Run("caller cancellation", func(t *testing.T) {
		client := newFakeOpenAIClient(t, fakeRoundTripper(func(request *http.Request) (*http.Response, error) {
			<-request.Context().Done()
			return nil, request.Context().Err()
		}))
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := client.SynthesizeSpeech(ctx, "Persisted summary.", SynthesisVoice)
		requireSpeechErrorCode(t, err, ErrorProviderUnavailable)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error does not wrap context cancellation: %v", err)
		}
	})

	t.Run("request deadline", func(t *testing.T) {
		client := newFakeOpenAIClient(t, fakeRoundTripper(func(request *http.Request) (*http.Response, error) {
			<-request.Context().Done()
			return nil, request.Context().Err()
		}))
		client.requestTimeout = time.Millisecond
		_, err := client.SynthesizeSpeech(context.Background(), "Persisted summary.", SynthesisVoice)
		requireSpeechErrorCode(t, err, ErrorProviderUnavailable)
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("error does not wrap deadline: %v", err)
		}
	})

	t.Run("transport failure", func(t *testing.T) {
		transportError := errors.New("dial failed")
		client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
			return nil, transportError
		}))
		_, err := client.SynthesizeSpeech(context.Background(), "Persisted summary.", SynthesisVoice)
		requireSpeechErrorCode(t, err, ErrorProviderUnavailable)
		if !errors.Is(err, transportError) {
			t.Fatalf("error does not wrap transport failure: %v", err)
		}
	})
}
