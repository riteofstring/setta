package speech

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

func TestOpenAIClientSynthesizesExactPersistedTextAsBoundedWAV(t *testing.T) {
	pcm := []byte{0, 0}
	wav := validTestWAV()
	text := "The persisted narrator summary is spoken exactly."
	var calls atomic.Int32
	client := newFakeOpenAIClient(t, fakeRoundTripper(func(request *http.Request) (*http.Response, error) {
		calls.Add(1)
		assertSynthesisRequest(t, request, text)
		return fakeResponse(http.StatusOK, "application/octet-stream", pcm), nil
	}))

	audio, err := client.SynthesizeSpeech(context.Background(), text)
	if err != nil {
		t.Fatalf("synthesize speech: %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("provider calls = %d, want 1", calls.Load())
	}
	if !bytes.Equal(audio.Bytes, wav) || audio.MediaType != SynthesisMediaType || audio.Format != SynthesisFormat {
		t.Fatalf("audio = %+v", audio)
	}
}

func assertSynthesisRequest(t *testing.T, request *http.Request, text string) {
	t.Helper()
	if request.Method != http.MethodPost || request.URL.String() != openAIBaseURL+"/audio/speech" {
		t.Fatalf("request = %s %s", request.Method, request.URL)
	}
	if request.Header.Get("Authorization") != "Bearer "+testSpeechAPIKey {
		t.Fatalf("authorization header is missing")
	}
	if request.Header.Get(openAISafetyIdentifierHeader) != "" {
		t.Fatalf("synthesis request unexpectedly has a safety identifier")
	}
	if request.Header.Get("Content-Type") != "application/json" || request.Header.Get("Accept") != "application/octet-stream" {
		t.Fatalf("content negotiation headers = %v", request.Header)
	}
	var payload speechSynthesisRequest
	decoder := json.NewDecoder(request.Body)
	if err := decoder.Decode(&payload); err != nil {
		t.Fatalf("decode synthesis request: %v", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		t.Fatalf("synthesis request has trailing JSON: %v", err)
	}
	want := speechSynthesisRequest{
		Model:          SynthesisModel,
		Input:          text,
		Voice:          SynthesisVoice,
		ResponseFormat: OpenAISynthesisResponseFormat,
	}
	if payload != want {
		t.Fatalf("synthesis payload = %+v, want %+v", payload, want)
	}
}

func TestOpenAIClientAcceptsDocumentedPCMContentType(t *testing.T) {
	for _, contentType := range []string{"application/octet-stream", "audio/pcm"} {
		t.Run(contentType, func(t *testing.T) {
			client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
				return fakeResponse(http.StatusOK, contentType, []byte{0, 0}), nil
			}))
			if _, err := client.SynthesizeSpeech(context.Background(), "Persisted summary."); err != nil {
				t.Fatalf("synthesize speech: %v", err)
			}
		})
	}
}

func TestOpenAIClientRejectsInvalidSynthesisTextBeforeRequest(t *testing.T) {
	var calls atomic.Int32
	client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return nil, nil
	}))
	texts := []string{"", "  ", " leading", "trailing ", strings.Repeat("界", MaximumSynthesisCharacters+1)}
	for _, text := range texts {
		if _, err := client.SynthesizeSpeech(context.Background(), text); err == nil {
			t.Fatalf("text with %d runes unexpectedly passed validation", len([]rune(text)))
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("provider calls = %d, want 0", calls.Load())
	}
}

func TestOpenAIClientRejectsMalformedOrOversizedSynthesisAudio(t *testing.T) {
	tests := []struct {
		name     string
		response func() *http.Response
		code     ErrorCode
		want     string
	}{
		{name: "wrong content type", response: func() *http.Response {
			return fakeResponse(http.StatusOK, "application/json", []byte(`{"not":"audio"}`))
		}, code: ErrorProviderResponseMalformed, want: "content type"},
		{name: "unaligned PCM", response: func() *http.Response {
			return fakeResponse(http.StatusOK, "application/octet-stream", []byte{0})
		}, code: ErrorProviderResponseMalformed, want: "malformed PCM"},
		{name: "declared response too large", response: func() *http.Response {
			response := fakeResponse(http.StatusOK, "application/octet-stream", nil)
			response.ContentLength = MaximumSynthesisAudioBytes + 1
			return response
		}, code: ErrorAudioTooLarge, want: "exceeded"},
		{name: "chunked response too large", response: func() *http.Response {
			response := fakeResponse(http.StatusOK, "application/octet-stream", bytes.Repeat([]byte{1}, MaximumSynthesisAudioBytes+1))
			response.ContentLength = -1
			return response
		}, code: ErrorAudioTooLarge, want: "exceeded"},
		{name: "content length mismatch", response: func() *http.Response {
			response := fakeResponse(http.StatusOK, "application/octet-stream", []byte{0, 0})
			response.ContentLength++
			return response
		}, code: ErrorProviderResponseMalformed, want: "truncated"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
				return test.response(), nil
			}))
			_, err := client.SynthesizeSpeech(context.Background(), "Persisted summary.")
			requireSpeechErrorCode(t, err, test.code)
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}
}

type errorReader struct {
	err error
}

func (reader errorReader) Read([]byte) (int, error) {
	return 0, reader.err
}

func (errorReader) Close() error {
	return nil
}

func TestOpenAIClientClassifiesTruncatedAndFailedAudioReads(t *testing.T) {
	tests := []struct {
		name string
		err  error
		code ErrorCode
	}{
		{name: "unexpected EOF", err: io.ErrUnexpectedEOF, code: ErrorProviderResponseMalformed},
		{name: "network read", err: errors.New("connection reset"), code: ErrorProviderUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client := newFakeOpenAIClient(t, fakeRoundTripper(func(*http.Request) (*http.Response, error) {
				response := fakeResponse(http.StatusOK, "application/octet-stream", nil)
				response.Body = errorReader{err: test.err}
				response.ContentLength = -1
				return response, nil
			}))
			_, err := client.SynthesizeSpeech(context.Background(), "Persisted summary.")
			requireSpeechErrorCode(t, err, test.code)
		})
	}
}
