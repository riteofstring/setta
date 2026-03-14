package transcriptionsessions

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"setta/internal/llmconfig"
)

const (
	openAIRealtimeSampleRateHz          = 24_000
	openAIRealtimeRequiredChannels      = 1
	openAIRealtimeAppendDrainTimeout    = 450 * time.Millisecond
	openAIRealtimeStopDrainTimeout      = 1200 * time.Millisecond
	defaultRealtimeProviderErrorMessage = "Realtime transcription failed."
)

type realtimeEngineOptions struct {
	HTTPClient *http.Client
	LLMConfig  llmconfig.Config
	APIKeys    map[string]string
	Language   *string
}

type realtimeEngine struct {
	conn   *websocket.Conn
	events chan realtimeReadResult

	mu               sync.Mutex
	closed           bool
	fullText         string
	completedItemIDs map[string]struct{}
}

type realtimeReadResult struct {
	payload []byte
	err     error
}

type openAIRealtimeSessionUpdate struct {
	Type    string                              `json:"type"`
	Session openAIRealtimeSessionUpdateSettings `json:"session"`
}

type openAIRealtimeSessionUpdateSettings struct {
	InputAudioFormat        string                                     `json:"input_audio_format"`
	InputAudioTranscription openAIRealtimeInputAudioTranscriptionState `json:"input_audio_transcription"`
}

type openAIRealtimeInputAudioTranscriptionState struct {
	Model    string `json:"model"`
	Language string `json:"language,omitempty"`
}

type openAIRealtimeAppendMessage struct {
	Type  string `json:"type"`
	Audio string `json:"audio"`
}

type openAIRealtimeCommitMessage struct {
	Type string `json:"type"`
}

type openAIRealtimeEvent struct {
	Type       string                    `json:"type"`
	ItemID     string                    `json:"item_id,omitempty"`
	Transcript string                    `json:"transcript,omitempty"`
	Error      *openAIRealtimeErrorValue `json:"error,omitempty"`
}

type openAIRealtimeErrorValue struct {
	Message string `json:"message,omitempty"`
}

func newRealtimeEngine(ctx context.Context, opts realtimeEngineOptions) (*realtimeEngine, error) {
	provider := strings.ToLower(strings.TrimSpace(opts.LLMConfig.Provider))
	if provider != "openai" {
		return nil, newServiceError(
			ErrRuntimeUnavailable,
			"Transcription provider is not supported by the Go runtime yet.",
		)
	}
	model := strings.TrimSpace(opts.LLMConfig.Model)
	if model == "" {
		return nil, newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	apiKey, err := resolveAPIKey(opts.APIKeys, opts.LLMConfig.APIKeyEnv)
	if err != nil {
		return nil, err
	}
	endpoint, err := resolveRealtimeEndpoint(opts.LLMConfig)
	if err != nil {
		return nil, err
	}
	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	headers := http.Header{}
	headers.Set("OpenAI-Beta", "realtime=v1")
	if apiKey != "" {
		headers.Set("Authorization", "Bearer "+apiKey)
	}

	conn, response, err := websocket.Dial(ctx, endpoint, &websocket.DialOptions{
		HTTPClient: httpClient,
		HTTPHeader: headers,
	})
	if err != nil {
		if response != nil && response.Body != nil {
			defer response.Body.Close()
			return nil, newServiceError(ErrProviderFailure, readProviderErrorMessage(response.Body))
		}
		return nil, newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}

	engine := &realtimeEngine{
		conn:             conn,
		events:           make(chan realtimeReadResult, 32),
		completedItemIDs: map[string]struct{}{},
	}
	go engine.readLoop()
	if err := engine.writeMessage(ctx, openAIRealtimeSessionUpdate{
		Type: "transcription_session.update",
		Session: openAIRealtimeSessionUpdateSettings{
			InputAudioFormat: "pcm16",
			InputAudioTranscription: openAIRealtimeInputAudioTranscriptionState{
				Model:    model,
				Language: derefTrimmedString(opts.Language),
			},
		},
	}); err != nil {
		_ = engine.Close()
		return nil, err
	}
	return engine, nil
}

func (e *realtimeEngine) AppendAudio(ctx context.Context, audioPCM16 []byte, sampleRateHz int, channels int) (Delta, error) {
	if len(audioPCM16) == 0 {
		return Delta{}, newServiceError(ErrInvalidRequest, "Audio payload is empty.")
	}
	if channels != openAIRealtimeRequiredChannels {
		return Delta{}, newServiceError(ErrInvalidRequest, "Realtime transcription requires mono PCM16 audio.")
	}
	if sampleRateHz != openAIRealtimeSampleRateHz {
		return Delta{}, newServiceError(ErrInvalidRequest, "Realtime transcription requires 24kHz PCM16 audio.")
	}
	if len(audioPCM16)%2 != 0 {
		return Delta{}, newServiceError(ErrInvalidRequest, "PCM16 payload must have an even byte length.")
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	if err := e.writeMessage(ctx, openAIRealtimeAppendMessage{
		Type:  "input_audio_buffer.append",
		Audio: base64.StdEncoding.EncodeToString(audioPCM16),
	}); err != nil {
		return Delta{}, err
	}
	if err := e.writeMessage(ctx, openAIRealtimeCommitMessage{
		Type: "input_audio_buffer.commit",
	}); err != nil {
		return Delta{}, err
	}
	appendText, err := e.drainEvents(ctx, openAIRealtimeAppendDrainTimeout)
	if err != nil {
		return Delta{}, err
	}
	return Delta{
		AppendText: appendText,
		FullText:   e.fullText,
		IsFinal:    false,
	}, nil
}

func (e *realtimeEngine) Stop(ctx context.Context) (Delta, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	appendText, err := e.drainEvents(ctx, openAIRealtimeStopDrainTimeout)
	if err != nil {
		return Delta{}, err
	}
	return Delta{
		AppendText: appendText,
		FullText:   e.fullText,
		IsFinal:    true,
	}, nil
}

func (e *realtimeEngine) Close() error {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.closed {
		return nil
	}
	e.closed = true
	return e.conn.Close(websocket.StatusNormalClosure, "")
}

func (e *realtimeEngine) writeMessage(ctx context.Context, payload any) error {
	content, err := json.Marshal(payload)
	if err != nil {
		return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	if err := e.conn.Write(ctx, websocket.MessageText, content); err != nil {
		return realtimeProviderErrorFromReadWriteError(err)
	}
	return nil
}

func (e *realtimeEngine) drainEvents(ctx context.Context, timeout time.Duration) (string, error) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	appendAccumulator := ""
	for {
		select {
		case <-timer.C:
			return appendAccumulator, nil
		case <-ctx.Done():
			return "", ctx.Err()
		case result, ok := <-e.events:
			if !ok {
				return "", newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
			}
			if result.err != nil {
				if errors.Is(result.err, context.Canceled) && ctx.Err() != nil {
					return "", ctx.Err()
				}
				return "", result.err
			}
			appendText, err := e.handleEvent(result.payload)
			if err != nil {
				return "", err
			}
			appendAccumulator += appendText
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(timeout)
		}
	}
}

func (e *realtimeEngine) readLoop() {
	defer close(e.events)
	for {
		_, payload, err := e.conn.Read(context.Background())
		if err != nil {
			if closeStatus := websocket.CloseStatus(err); closeStatus != -1 {
				e.mu.Lock()
				closed := e.closed
				e.mu.Unlock()
				if !closed {
					e.events <- realtimeReadResult{
						err: newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage),
					}
				}
				return
			}
			e.events <- realtimeReadResult{err: realtimeProviderErrorFromReadWriteError(err)}
			return
		}
		e.events <- realtimeReadResult{payload: append([]byte(nil), payload...)}
	}
}

func (e *realtimeEngine) handleEvent(payload []byte) (string, error) {
	event := openAIRealtimeEvent{}
	if err := json.Unmarshal(payload, &event); err != nil {
		return "", newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	switch event.Type {
	case "conversation.item.input_audio_transcription.completed":
		itemID := strings.TrimSpace(event.ItemID)
		if itemID != "" {
			if _, ok := e.completedItemIDs[itemID]; ok {
				return "", nil
			}
			e.completedItemIDs[itemID] = struct{}{}
		}
		appendText, fullText := appendTranscriptSegment(e.fullText, event.Transcript)
		e.fullText = fullText
		return appendText, nil
	case "conversation.item.input_audio_transcription.failed", "error":
		message := defaultRealtimeProviderErrorMessage
		if event.Error != nil && strings.TrimSpace(event.Error.Message) != "" {
			message = strings.TrimSpace(event.Error.Message)
		}
		return "", newServiceError(ErrProviderFailure, message)
	default:
		return "", nil
	}
}

func resolveRealtimeEndpoint(config llmconfig.Config) (string, error) {
	baseURL := strings.TrimSpace(config.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	endpoint, err := url.JoinPath(baseURL, "realtime")
	if err != nil {
		return "", newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	case "wss", "ws":
	default:
		return "", newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	query := parsed.Query()
	query.Set("model", strings.TrimSpace(config.Model))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func realtimeProviderErrorFromReadWriteError(err error) error {
	if err == nil {
		return nil
	}
	if closeStatus := websocket.CloseStatus(err); closeStatus != -1 {
		return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	if errors.Is(err, context.Canceled) {
		return err
	}
	return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
}

func derefTrimmedString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
