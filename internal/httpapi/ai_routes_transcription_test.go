package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

func TestRegisterAIRoutesRunsFileModeTranscriptionSession(t *testing.T) {
	t.Parallel()

	type providerRequest struct {
		Path          string
		Authorization string
		Model         string
		Language      string
		FileSize      int
	}
	providerRequests := make(chan providerRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()
		fileBytes, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Model:         r.FormValue("model"),
			Language:      r.FormValue("language"),
			FileSize:      len(fileBytes),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "hello from route"})
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file","language":"en"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile || started.ChunkMs != 0 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.AppendText != "" || appendPayload.IsFinal {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopPayload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.FullText != "hello from route" || stopPayload.AppendText != "hello from route" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/audio/transcriptions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.Model != "whisper-1" {
			t.Fatalf("unexpected model %q", captured.Model)
		}
		if captured.Language != "en" {
			t.Fatalf("unexpected language %q", captured.Language)
		}
		if captured.FileSize <= 44 {
			t.Fatalf("expected wav payload larger than header, got %d bytes", captured.FileSize)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestRegisterAIRoutesReturnsTypedInvalidRequestForFileSampleRateChange(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	firstAppendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	firstAppendRequest.Header.Set("Content-Type", "application/json")
	firstAppendResponse := httptest.NewRecorder()

	handler.ServeHTTP(firstAppendResponse, firstAppendRequest)

	if firstAppendResponse.Code != http.StatusOK {
		t.Fatalf("expected first append 200, got %d with body %q", firstAppendResponse.Code, firstAppendResponse.Body.String())
	}

	// The route must preserve the file-session sample-rate lock once the first chunk establishes it.
	secondAppendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x01, 0x00})+`","sampleRateHz":16000,"channels":1}`),
	)
	secondAppendRequest.Header.Set("Content-Type", "application/json")
	secondAppendResponse := httptest.NewRecorder()

	handler.ServeHTTP(secondAppendResponse, secondAppendRequest)

	if secondAppendResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", secondAppendResponse.Code, secondAppendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(secondAppendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %#v", payload)
	}
	if payload.Error.Message != "sampleRateHz cannot change within a transcription session." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesRunsRealtimeTranscriptionSession(t *testing.T) {
	t.Parallel()

	type providerHandshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan providerHandshake, 1)
	updates := make(chan map[string]any, 1)
	appends := make(chan map[string]any, 1)
	commits := make(chan map[string]any, 1)
	closed := make(chan error, 1)
	emitFinal := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handshakes <- providerHandshake{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			Authorization: r.Header.Get("Authorization"),
			OpenAIBeta:    r.Header.Get("OpenAI-Beta"),
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		update, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		updates <- update
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}

		appendPayload, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		appends <- appendPayload

		commitPayload, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		commits <- commitPayload

		// The route-level caller should see additive delta output during append and final completion on stop.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hel"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"lo"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime","language":"en"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected provider query %q", captured.Query)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime provider handshake")
	}

	select {
	case payload := <-updates:
		if payload["type"] != "transcription_session.update" {
			t.Fatalf("unexpected session update payload %#v", payload)
		}
		if payload["input_audio_format"] != "pcm16" {
			t.Fatalf("unexpected audio input format %#v", payload)
		}
		transcriptionPayload, ok := payload["input_audio_transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected transcription payload, got %#v", payload)
		}
		if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
			t.Fatalf("unexpected transcription payload %#v", transcriptionPayload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime session update")
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "hello" || appendPayload.FullText != "hello" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	select {
	case payload := <-appends:
		if payload["type"] != "input_audio_buffer.append" {
			t.Fatalf("unexpected append payload %#v", payload)
		}
		audio, _ := payload["audio"].(string)
		decoded, err := base64.StdEncoding.DecodeString(audio)
		if err != nil {
			t.Fatalf("decode appended audio: %v", err)
		}
		if string(decoded) != string([]byte{0x00, 0x00, 0x01, 0x00}) {
			t.Fatalf("unexpected appended audio %#v", decoded)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime append payload")
	}

	select {
	case payload := <-commits:
		if payload["type"] != "input_audio_buffer.commit" {
			t.Fatalf("unexpected commit payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime commit payload")
	}

	close(emitFinal)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopPayload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != " world" || stopPayload.FullText != "hello world" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime websocket close")
	}
}

func TestRegisterAIRoutesReturnsTypedInvalidRequestForRealtimeStereoAudio(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	// The route should surface the runtime's mono-only realtime constraint as a typed invalid request.
	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":2}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription requires mono PCM16 audio." {
		t.Fatalf("unexpected error payload %#v", payload)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

func TestRegisterAIRoutesAcceptsTranscriptionSessionUpdatedAck(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestRegisterAIRoutesUsesCommittedOrderingForOutOfOrderRealtimeTurns(t *testing.T) {
	t.Parallel()

	emitFinal := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-1","item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-2","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "world" || appendPayload.FullText != "world" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	close(emitFinal)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopPayload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != "" || stopPayload.FullText != "hello world" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}
}

func TestRegisterAIRoutesRecomputesAppendDeltaWhenCommitOrderingArrivesAfterTranscript(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-3","item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-4","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "hello world" || appendPayload.FullText != "hello world" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestRegisterAIRoutesUsesKnownPreviousItemOrderingWithoutParentCommit(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-3","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "hello world" || appendPayload.FullText != "hello world" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromAppend(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.failed","event_id":"evt-failed","error":{"message":"Realtime transcription chunk failed."}}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected append 502, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription chunk failed." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStop(t *testing.T) {
	t.Parallel()

	emitStopFailure := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitStopFailure
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.failed","event_id":"evt-failed","error":{"message":"Realtime transcription finalization failed."}}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}

	close(emitStopFailure)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected stop 502, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription finalization failed." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromAppendCloseReason(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusPolicyViolation, "Realtime append rejected by websocket close.")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected append 502, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime append rejected by websocket close." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromAppendMalformedEvent(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected append 502, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription failed." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStopCloseReason(t *testing.T) {
	t.Parallel()

	emitStopFailure := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitStopFailure
		_ = conn.Close(websocket.StatusPolicyViolation, "Realtime finalization rejected by websocket close.")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}

	close(emitStopFailure)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected stop 502, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime finalization rejected by websocket close." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStopMalformedEvent(t *testing.T) {
	t.Parallel()

	emitStopFailure := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitStopFailure
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}

	close(emitStopFailure)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected stop 502, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription failed." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesCancelsRealtimeTranscriptionSession(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestRegisterAIRoutesCancelTranscriptionSessionReturnsOKWhenSessionMissing(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"missing-session"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}
}

func TestRegisterAIRoutesAllowDeploymentTranscriptionWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile {
		t.Fatalf("expected file-mode start payload, got %#v", started)
	}
}

func TestRegisterAIRoutesBlockDeploymentTranscriptionWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": false},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "llm_access_forbidden" {
		t.Fatalf("expected llm_access_forbidden, got %#v", payload)
	}
}

func TestRegisterAIRoutesAllowLauncherTranscriptionWhenLLMAccessImplicitlyAllowed(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeLauncher,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile {
		t.Fatalf("expected file-mode start payload, got %#v", started)
	}
}

func TestRegisterAIRoutesTranscriptionRoutesRejectInvalidJSONWithValidationEnvelope(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	testCases := []struct {
		name string
		path string
	}{
		{name: "start", path: RouteStartTranscriptionSession},
		{name: "append", path: RouteAppendTranscriptionAudio},
		{name: "stop", path: RouteStopTranscriptionSession},
		{name: "cancel", path: RouteCancelTranscriptionSession},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(`{"`))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message == "" {
				t.Fatalf("expected validation message, got %#v", payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func TestRegisterAIRoutesTranscriptionRoutesRejectMissingRequiredFieldsWithValidationEnvelope(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	testCases := []struct {
		name            string
		path            string
		body            string
		expectedMessage string
	}{
		{
			name:            "start missing transcriptionProfileId",
			path:            RouteStartTranscriptionSession,
			body:            `{}`,
			expectedMessage: "transcriptionProfileId: Field required",
		},
		{
			name:            "append missing sessionId",
			path:            RouteAppendTranscriptionAudio,
			body:            `{"audioPcm16Base64":"AA==","sampleRateHz":24000}`,
			expectedMessage: "sessionId: Field required",
		},
		{
			name:            "append missing audioPcm16Base64",
			path:            RouteAppendTranscriptionAudio,
			body:            `{"sessionId":"session-1","sampleRateHz":24000}`,
			expectedMessage: "audioPcm16Base64: Field required",
		},
		{
			name:            "append missing sampleRateHz",
			path:            RouteAppendTranscriptionAudio,
			body:            `{"sessionId":"session-1","audioPcm16Base64":"AA=="}`,
			expectedMessage: "sampleRateHz: Field required",
		},
		{
			name:            "stop missing sessionId",
			path:            RouteStopTranscriptionSession,
			body:            `{}`,
			expectedMessage: "sessionId: Field required",
		},
		{
			name:            "cancel missing sessionId",
			path:            RouteCancelTranscriptionSession,
			body:            `{}`,
			expectedMessage: "sessionId: Field required",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message != tc.expectedMessage {
				t.Fatalf("expected validation message %q, got %#v", tc.expectedMessage, payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func TestRegisterAIRoutesReturnsTypedUnsupportedRealtimeTranscriptionModel(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-undocumented": {
				ID:        "openai-undocumented",
				Model:     "gpt-realtime",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-realtime",
			Name:                     "Realtime",
			TranscriptionLLMConfigID: "openai-undocumented",
			TransportMode:            transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "unsupported_model" {
		t.Fatalf("expected unsupported_model, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription is unavailable for this provider/model." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesValidatesDependenciesByMode(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name    string
		router  chi.Router
		deps    AIRouteDependencies
		wantErr string
	}{
		{
			name:    "nil_router",
			deps:    AIRouteDependencies{},
			wantErr: "router is required",
		},
		{
			name:   "ide_missing_managed_chat_service",
			router: chi.NewRouter(),
			deps: AIRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
			},
			wantErr: "managed chat service is required in ide mode",
		},
		{
			name:   "deployment_missing_runtime",
			router: chi.NewRouter(),
			deps: AIRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeShare),
			},
			wantErr: "deployment runtime is required in deployment mode",
		},
		{
			name:   "document_only_router_skips_runtime_requirements",
			router: wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), newOpenAPIDocument()),
			deps: AIRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
			},
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			err := RegisterAIRoutes(testCase.router, testCase.deps)
			if testCase.wantErr == "" {
				if err != nil {
					t.Fatalf("RegisterAIRoutes returned error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error %q, got nil", testCase.wantErr)
			}
			if err.Error() != testCase.wantErr {
				t.Fatalf("expected error %q, got %q", testCase.wantErr, err.Error())
			}
		})
	}
}

func TestRegisterAIRoutesReturnsTypedMissingTranscriptionProfile(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"missing-profile"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "profile_not_found" {
		t.Fatalf("expected profile_not_found, got %#v", payload)
	}
	if payload.Error.Message != "Transcription profile missing-profile not found." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedMissingAPIKeyForRealtimeTranscriptionStart(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "missing_api_key" {
		t.Fatalf("expected missing_api_key, got %#v", payload)
	}
	if payload.Error.Message != "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesAutoTranscriptionResolvesToRealtime(t *testing.T) {
	t.Parallel()

	type providerHandshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan providerHandshake, 1)
	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handshakes <- providerHandshake{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			Authorization: r.Header.Get("Authorization"),
			OpenAIBeta:    r.Header.Get("OpenAI-Beta"),
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-auto",
			Name:                          "Auto",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeAuto,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-auto"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected auto start payload %#v", started)
	}

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected provider query %q", captured.Query)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for auto realtime handshake")
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for auto realtime cancel close")
	}
}

func TestRegisterAIRoutesAutoTranscriptionReturnsTypedMissingAPIKeyWithoutFallback(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-auto",
			Name:                          "Auto",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeAuto,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-auto"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "missing_api_key" {
		t.Fatalf("expected missing_api_key, got %#v", payload)
	}
	if payload.Error.Message != "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}
