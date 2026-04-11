package transcriptionsessions

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	openai "github.com/openai/openai-go/v3"
	openairealtime "github.com/openai/openai-go/v3/realtime"
	openaiconstant "github.com/openai/openai-go/v3/shared/constant"

	"setta/internal/llmconfig"
	"setta/internal/transcriptionprofiles"
)

const (
	openAIRealtimeSampleRateHz          = 24_000
	openAIRealtimeRequiredChannels      = 1
	openAIRealtimeStartupDrainTimeout   = 250 * time.Millisecond
	openAIRealtimeAppendDrainTimeout    = 450 * time.Millisecond
	openAIRealtimeStopDrainTimeout      = 1200 * time.Millisecond
	defaultRealtimeProviderErrorMessage = "Realtime transcription failed."
	openAIRealtimePCM16Format           = "pcm16"
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

	closeMu sync.Mutex
	closed  bool

	mu                sync.Mutex
	fullText          string
	deltaMode         openAIRealtimeDeltaMode
	itemOrder         []string
	itemTexts         map[string]string
	itemCommitOrder   []string
	itemPreviousIDs   map[string]*string
	processedEventIDs map[string]struct{}
}

type realtimeReadResult struct {
	payload []byte
	err     error
	closed  bool
}

type openAIRealtimeDeltaMode int

const (
	openAIRealtimeDeltaModeDisabled openAIRealtimeDeltaMode = iota
	openAIRealtimeDeltaModeIncremental
	openAIRealtimeDeltaModeSnapshot
)

type openAIRealtimeTranscriptionSessionUpdate struct {
	Type                     string                                                                   `json:"type"`
	InputAudioFormat         string                                                                   `json:"input_audio_format"`
	InputAudioTranscription  openairealtime.AudioTranscriptionParam                                   `json:"input_audio_transcription,omitzero"`
	InputAudioNoiseReduction openairealtime.RealtimeTranscriptionSessionAudioInputNoiseReductionParam `json:"input_audio_noise_reduction,omitzero"`
	TurnDetection            json.RawMessage                                                          `json:"turn_detection"`
}

type openAIRealtimeAppendMessage struct {
	Type  string `json:"type"`
	Audio string `json:"audio"`
}

type openAIRealtimeCommitMessage struct {
	Type string `json:"type"`
}

type openAIRealtimeEvent struct {
	Type           string                    `json:"type"`
	EventID        string                    `json:"event_id,omitempty"`
	ItemID         string                    `json:"item_id,omitempty"`
	PreviousItemID *string                   `json:"previous_item_id,omitempty"`
	Delta          string                    `json:"delta,omitempty"`
	Text           string                    `json:"text,omitempty"`
	Transcript     string                    `json:"transcript,omitempty"`
	Error          *openAIRealtimeErrorValue `json:"error,omitempty"`
}

type openAIRealtimeErrorValue struct {
	Message string `json:"message,omitempty"`
}

func newRealtimeEngine(ctx context.Context, opts realtimeEngineOptions) (*realtimeEngine, error) {
	model := strings.TrimSpace(opts.LLMConfig.Model)
	if model == "" {
		return nil, newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	// Keep runtime admission aligned with the profile capability helper so
	// empty-provider default OpenAI configs do not get advertised as supported
	// and then rejected by the session runtime.
	if !transcriptionprofiles.SupportsRealtimeTranscriptionConfig(opts.LLMConfig) {
		return nil, newServiceError(
			ErrRuntimeUnavailable,
			"Transcription provider is not supported by the Go runtime yet.",
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
			return nil, newServiceErrorWithStatus(
				ErrProviderFailure,
				readProviderErrorMessage(response.Body),
				response.StatusCode,
			)
		}
		return nil, newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}

	engine := &realtimeEngine{
		conn:              conn,
		events:            make(chan realtimeReadResult, 32),
		deltaMode:         resolveOpenAIRealtimeDeltaMode(model),
		itemTexts:         map[string]string{},
		itemPreviousIDs:   map[string]*string{},
		processedEventIDs: map[string]struct{}{},
	}
	go engine.readLoop()
	if err := engine.writeMessage(ctx, buildOpenAIRealtimeSessionUpdate(model, opts.Language)); err != nil {
		_ = engine.Close()
		return nil, err
	}
	if err := engine.drainStartupEvents(ctx, openAIRealtimeStartupDrainTimeout); err != nil {
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
		Type:  string(openaiconstant.ValueOf[openaiconstant.InputAudioBufferAppend]()),
		Audio: base64.StdEncoding.EncodeToString(audioPCM16),
	}); err != nil {
		return Delta{}, err
	}
	if err := e.writeMessage(ctx, openAIRealtimeCommitMessage{
		Type: string(openaiconstant.ValueOf[openaiconstant.InputAudioBufferCommit]()),
	}); err != nil {
		return Delta{}, err
	}
	appendText, err := e.drainEvents(ctx, openAIRealtimeAppendDrainTimeout, false)
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

	appendText, err := e.drainEvents(ctx, openAIRealtimeStopDrainTimeout, true)
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
	e.closeMu.Lock()
	defer e.closeMu.Unlock()
	if e.closed {
		return nil
	}
	e.closed = true
	err := e.conn.Close(websocket.StatusNormalClosure, "")
	if errors.Is(err, net.ErrClosed) {
		return nil
	}
	return err
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

func (e *realtimeEngine) drainStartupEvents(ctx context.Context, timeout time.Duration) error {
	readySeen := false
	deadline := time.Now().Add(timeout)
	for {
		waitResult, err := waitForRealtimeEventBefore(ctx, e.events, deadline)
		if err != nil {
			return err
		}
		if waitResult.timedOut {
			if readySeen {
				return nil
			}
			return realtimeProviderFailureError()
		}
		ready, err := e.handleStartupReadResult(ctx, waitResult.result)
		if err != nil {
			return err
		}
		if ready && !readySeen {
			// Keep draining a fixed post-ack startup window so immediate
			// provider rejections do not escape into the first append while
			// unrelated provider noise cannot extend startup indefinitely.
			readySeen = true
			deadline = time.Now().Add(timeout)
		}
	}
}

func (e *realtimeEngine) drainEvents(ctx context.Context, timeout time.Duration, allowCleanClose bool) (string, error) {
	startFullText := e.fullText
	deadline := time.Now().Add(timeout)
	for {
		waitResult, err := waitForRealtimeEventBefore(ctx, e.events, deadline)
		if err != nil {
			return "", err
		}
		if waitResult.timedOut {
			return appendOpenAIRealtimeTranscriptDelta(startFullText, e.fullText), nil
		}
		done, err := e.handleDrainReadResult(ctx, waitResult.result, allowCleanClose)
		if err != nil {
			return "", err
		}
		if done {
			return appendOpenAIRealtimeTranscriptDelta(startFullText, e.fullText), nil
		}
	}
}

type realtimeEventWaitResult struct {
	result   realtimeReadResult
	timedOut bool
}

func waitForRealtimeEventBefore(ctx context.Context, events <-chan realtimeReadResult, deadline time.Time) (realtimeEventWaitResult, error) {
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return realtimeEventWaitResult{timedOut: true}, nil
	}
	timer := time.NewTimer(remaining)
	defer stopRealtimeTimer(timer)
	select {
	case <-timer.C:
		return realtimeEventWaitResult{timedOut: true}, nil
	case <-ctx.Done():
		return realtimeEventWaitResult{}, ctx.Err()
	case result, ok := <-events:
		if !ok {
			return realtimeEventWaitResult{}, realtimeProviderFailureError()
		}
		return realtimeEventWaitResult{result: result}, nil
	}
}

func stopRealtimeTimer(timer *time.Timer) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
}

func realtimeProviderFailureError() error {
	return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
}

func normalizeRealtimeReadResult(ctx context.Context, result realtimeReadResult, allowCleanClose bool) ([]byte, bool, error) {
	if result.closed {
		if allowCleanClose {
			return nil, true, nil
		}
		return nil, false, realtimeProviderFailureError()
	}
	if result.err != nil {
		if errors.Is(result.err, context.Canceled) && ctx.Err() != nil {
			return nil, false, ctx.Err()
		}
		return nil, false, result.err
	}
	return result.payload, false, nil
}

func (e *realtimeEngine) handleStartupReadResult(ctx context.Context, result realtimeReadResult) (bool, error) {
	payload, _, err := normalizeRealtimeReadResult(ctx, result, false)
	if err != nil {
		return false, err
	}
	return e.handleStartupEvent(payload)
}

func (e *realtimeEngine) handleDrainReadResult(
	ctx context.Context,
	result realtimeReadResult,
	allowCleanClose bool,
) (bool, error) {
	payload, cleanClose, err := normalizeRealtimeReadResult(ctx, result, allowCleanClose)
	if err != nil {
		return false, err
	}
	if cleanClose {
		return true, nil
	}
	if _, err := e.handleEvent(payload); err != nil {
		return false, err
	}
	return false, nil
}

func (e *realtimeEngine) handleStartupEvent(payload []byte) (bool, error) {
	event := openAIRealtimeEvent{}
	if err := json.Unmarshal(payload, &event); err != nil {
		return false, newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	if e.isDuplicateEvent(event.EventID) {
		return false, nil
	}
	switch event.Type {
	case string(openaiconstant.ValueOf[openaiconstant.SessionUpdated]()),
		string(openaiconstant.ValueOf[openaiconstant.TranscriptionSessionUpdated]()):
		return true, nil
	case string(openaiconstant.ValueOf[openaiconstant.ConversationItemInputAudioTranscriptionFailed]()),
		string(openaiconstant.ValueOf[openaiconstant.Error]()):
		message := defaultRealtimeProviderErrorMessage
		if event.Error != nil && strings.TrimSpace(event.Error.Message) != "" {
			message = strings.TrimSpace(event.Error.Message)
		}
		return false, newServiceError(ErrProviderFailure, message)
	default:
		return false, nil
	}
}

func (e *realtimeEngine) readLoop() {
	defer close(e.events)
	for {
		_, payload, err := e.conn.Read(context.Background())
		if err != nil {
			var closeErr websocket.CloseError
			if errors.As(err, &closeErr) {
				if !e.markClosed() {
					if closeErr.Code == websocket.StatusNormalClosure {
						e.events <- realtimeReadResult{closed: true}
					} else {
						e.events <- realtimeReadResult{
							err: realtimeProviderErrorFromCloseError(closeErr),
						}
					}
				}
				return
			}
			if !e.markClosed() {
				e.events <- realtimeReadResult{err: realtimeProviderErrorFromReadWriteError(err)}
			}
			return
		}
		e.events <- realtimeReadResult{payload: append([]byte(nil), payload...)}
	}
}

func (e *realtimeEngine) markClosed() bool {
	e.closeMu.Lock()
	defer e.closeMu.Unlock()
	alreadyClosed := e.closed
	e.closed = true
	return alreadyClosed
}

func (e *realtimeEngine) handleEvent(payload []byte) (string, error) {
	event := openAIRealtimeEvent{}
	if err := json.Unmarshal(payload, &event); err != nil {
		return "", newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	if e.isDuplicateEvent(event.EventID) {
		return "", nil
	}
	switch event.Type {
	case string(openaiconstant.ValueOf[openaiconstant.InputAudioBufferCommitted]()):
		e.applyCommittedItemOrder(event.ItemID, event.PreviousItemID)
		return "", nil
	case string(openaiconstant.ValueOf[openaiconstant.TranscriptTextDelta]()):
		return e.applyTranscriptTextDelta(event.Delta), nil
	case string(openaiconstant.ValueOf[openaiconstant.TranscriptTextDone]()):
		return e.applyTranscriptTextDone(event.Text), nil
	case string(openaiconstant.ValueOf[openaiconstant.ConversationItemInputAudioTranscriptionDelta]()):
		if e.deltaMode == openAIRealtimeDeltaModeDisabled {
			return "", nil
		}
		return e.applyTranscriptUpdate(event.ItemID, event.Delta, e.deltaMode), nil
	case string(openaiconstant.ValueOf[openaiconstant.ConversationItemInputAudioTranscriptionCompleted]()):
		return e.applyTranscriptUpdate(event.ItemID, event.Transcript, openAIRealtimeDeltaModeSnapshot), nil
	case string(openaiconstant.ValueOf[openaiconstant.ConversationItemInputAudioTranscriptionFailed]()), string(openaiconstant.ValueOf[openaiconstant.Error]()):
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
	query.Del("model")
	query.Set("intent", string(openaiconstant.ValueOf[openaiconstant.Transcription]()))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func realtimeProviderErrorFromReadWriteError(err error) error {
	if err == nil {
		return nil
	}
	var closeErr websocket.CloseError
	if errors.As(err, &closeErr) {
		if closeErr.Code == websocket.StatusNormalClosure {
			return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
		}
		return realtimeProviderErrorFromCloseError(closeErr)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
	}
	if errors.Is(err, context.Canceled) {
		return err
	}
	return newServiceError(ErrProviderFailure, defaultRealtimeProviderErrorMessage)
}

func realtimeProviderErrorFromCloseError(closeErr websocket.CloseError) error {
	message := strings.TrimSpace(closeErr.Reason)
	if message == "" {
		message = defaultRealtimeProviderErrorMessage
	}
	return newServiceError(ErrProviderFailure, message)
}

func derefTrimmedString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func buildOpenAIRealtimeSessionUpdate(model string, language *string) openAIRealtimeTranscriptionSessionUpdate {
	session := openAIRealtimeTranscriptionSessionUpdate{
		Type:             string(openaiconstant.ValueOf[openaiconstant.TranscriptionSessionUpdate]()),
		InputAudioFormat: openAIRealtimePCM16Format,
		InputAudioTranscription: openairealtime.AudioTranscriptionParam{
			Model: openairealtime.AudioTranscriptionModel(strings.TrimSpace(model)),
		},
		InputAudioNoiseReduction: openairealtime.RealtimeTranscriptionSessionAudioInputNoiseReductionParam{
			Type: openairealtime.NoiseReductionTypeNearField,
		},
		// Setta owns speech-turn boundaries for this rewrite slice by sending an
		// explicit commit on each append, so provider-side VAD must stay off.
		TurnDetection: json.RawMessage("null"),
	}
	trimmedLanguage := derefTrimmedString(language)
	if trimmedLanguage != "" {
		session.InputAudioTranscription.Language = openai.String(trimmedLanguage)
	}
	return session
}

func resolveOpenAIRealtimeDeltaMode(model string) openAIRealtimeDeltaMode {
	switch transcriptionprofiles.ResolveOpenAIRealtimeTranscriptionStreamMode(model) {
	case transcriptionprofiles.OpenAIRealtimeTranscriptionStreamModeSnapshot:
		return openAIRealtimeDeltaModeSnapshot
	case transcriptionprofiles.OpenAIRealtimeTranscriptionStreamModeIncremental:
		return openAIRealtimeDeltaModeIncremental
	default:
		return openAIRealtimeDeltaModeDisabled
	}
}

func (e *realtimeEngine) isDuplicateEvent(eventID string) bool {
	trimmedEventID := strings.TrimSpace(eventID)
	if trimmedEventID == "" {
		return false
	}
	if e.processedEventIDs == nil {
		e.processedEventIDs = map[string]struct{}{}
	}
	if _, ok := e.processedEventIDs[trimmedEventID]; ok {
		return true
	}
	e.processedEventIDs[trimmedEventID] = struct{}{}
	return false
}

func (e *realtimeEngine) applyCommittedItemOrder(itemID string, previousItemID *string) {
	trimmedItemID := strings.TrimSpace(itemID)
	if trimmedItemID == "" {
		return
	}
	if e.itemPreviousIDs == nil {
		e.itemPreviousIDs = map[string]*string{}
	}
	if _, ok := e.itemPreviousIDs[trimmedItemID]; !ok {
		e.itemCommitOrder = append(e.itemCommitOrder, trimmedItemID)
	}
	if previousItemID == nil {
		e.itemPreviousIDs[trimmedItemID] = nil
	} else {
		trimmedPreviousItemID := strings.TrimSpace(*previousItemID)
		if trimmedPreviousItemID == "" {
			e.itemPreviousIDs[trimmedItemID] = nil
		} else {
			previousCopy := trimmedPreviousItemID
			e.itemPreviousIDs[trimmedItemID] = &previousCopy
		}
	}
	e.itemOrder = rebuildOpenAIRealtimeItemOrder(
		e.itemCommitOrder,
		e.itemPreviousIDs,
		e.itemOrder,
	)
	e.fullText = rebuildOpenAIRealtimeFullText(e.itemOrder, e.itemTexts)
}

func (e *realtimeEngine) applyTranscriptUpdate(itemID, rawText string, mode openAIRealtimeDeltaMode) string {
	if mode == openAIRealtimeDeltaModeDisabled {
		return ""
	}
	trimmedItemID := strings.TrimSpace(itemID)
	if trimmedItemID == "" {
		appendText, fullText := appendTranscriptSegment(e.fullText, rawText)
		e.fullText = fullText
		return appendText
	}
	if e.itemTexts == nil {
		e.itemTexts = map[string]string{}
	}

	previousFullText := e.fullText
	existingItemText, hasExistingItem := e.itemTexts[trimmedItemID]
	nextItemText := mergeOpenAIRealtimeItemText(existingItemText, rawText, mode)
	if nextItemText == existingItemText {
		return ""
	}
	if !hasExistingItem {
		e.itemOrder = appendOpenAIRealtimeFallbackItemOrder(e.itemOrder, trimmedItemID)
	}
	e.itemTexts[trimmedItemID] = nextItemText
	e.fullText = rebuildOpenAIRealtimeFullText(e.itemOrder, e.itemTexts)
	return appendOpenAIRealtimeTranscriptDelta(previousFullText, e.fullText)
}

func (e *realtimeEngine) applyTranscriptTextDelta(rawText string) string {
	appendText, fullText := appendTranscriptSegment(e.fullText, rawText)
	e.fullText = fullText
	return appendText
}

func (e *realtimeEngine) applyTranscriptTextDone(rawText string) string {
	segment := strings.TrimSpace(rawText)
	if segment == "" {
		return ""
	}
	previousFullText := e.fullText
	e.fullText = segment
	return appendOpenAIRealtimeTranscriptDelta(previousFullText, e.fullText)
}

func appendOpenAIRealtimeFallbackItemOrder(itemOrder []string, itemID string) []string {
	trimmedItemID := strings.TrimSpace(itemID)
	if trimmedItemID == "" {
		return itemOrder
	}
	for _, existingItemID := range itemOrder {
		if existingItemID == trimmedItemID {
			return itemOrder
		}
	}
	return append(itemOrder, trimmedItemID)
}

func rebuildOpenAIRealtimeItemOrder(itemCommitOrder []string, itemPreviousIDs map[string]*string, fallbackOrder []string) []string {
	builder := newRealtimeItemOrderBuilder(itemCommitOrder, fallbackOrder, itemPreviousIDs)
	builder.appendAll(itemCommitOrder)
	builder.appendAll(fallbackOrder)
	return builder.ordered
}

type realtimeItemOrderBuilder struct {
	knownItems      map[string]struct{}
	itemPreviousIDs map[string]*string
	ordered         []string
	placed          map[string]struct{}
	visiting        map[string]struct{}
}

func newRealtimeItemOrderBuilder(itemCommitOrder []string, fallbackOrder []string, itemPreviousIDs map[string]*string) *realtimeItemOrderBuilder {
	return &realtimeItemOrderBuilder{
		knownItems:      collectRealtimeKnownItems(itemCommitOrder, fallbackOrder),
		itemPreviousIDs: itemPreviousIDs,
		ordered:         make([]string, 0, len(itemCommitOrder)+len(fallbackOrder)),
		placed:          map[string]struct{}{},
		visiting:        map[string]struct{}{},
	}
}

func collectRealtimeKnownItems(itemCommitOrder []string, fallbackOrder []string) map[string]struct{} {
	knownItems := map[string]struct{}{}
	appendRealtimeKnownItems(knownItems, itemCommitOrder)
	appendRealtimeKnownItems(knownItems, fallbackOrder)
	return knownItems
}

func appendRealtimeKnownItems(knownItems map[string]struct{}, itemIDs []string) {
	for _, itemID := range itemIDs {
		trimmedItemID := strings.TrimSpace(itemID)
		if trimmedItemID == "" {
			continue
		}
		knownItems[trimmedItemID] = struct{}{}
	}
}

func (b *realtimeItemOrderBuilder) appendAll(itemIDs []string) {
	for _, itemID := range itemIDs {
		b.append(itemID)
	}
}

func (b *realtimeItemOrderBuilder) append(itemID string) {
	trimmedItemID := strings.TrimSpace(itemID)
	if trimmedItemID == "" || b.isPlaced(trimmedItemID) || b.isVisiting(trimmedItemID) {
		return
	}
	b.visiting[trimmedItemID] = struct{}{}
	defer delete(b.visiting, trimmedItemID)
	if previousItemID, ok := b.knownPreviousItemID(trimmedItemID); ok {
		b.append(previousItemID)
	}
	if b.isPlaced(trimmedItemID) {
		return
	}
	b.placed[trimmedItemID] = struct{}{}
	b.ordered = append(b.ordered, trimmedItemID)
}

func (b *realtimeItemOrderBuilder) knownPreviousItemID(itemID string) (string, bool) {
	previousItemID, ok := b.itemPreviousIDs[itemID]
	if !ok || previousItemID == nil {
		return "", false
	}
	trimmedPreviousItemID := strings.TrimSpace(*previousItemID)
	if trimmedPreviousItemID == "" {
		return "", false
	}
	if _, ok := b.knownItems[trimmedPreviousItemID]; !ok {
		return "", false
	}
	return trimmedPreviousItemID, true
}

func (b *realtimeItemOrderBuilder) isPlaced(itemID string) bool {
	_, ok := b.placed[itemID]
	return ok
}

func (b *realtimeItemOrderBuilder) isVisiting(itemID string) bool {
	_, ok := b.visiting[itemID]
	return ok
}

func mergeOpenAIRealtimeItemText(existingText, rawText string, mode openAIRealtimeDeltaMode) string {
	if rawText == "" {
		return existingText
	}
	switch mode {
	case openAIRealtimeDeltaModeSnapshot:
		segment := strings.TrimSpace(rawText)
		if segment == "" {
			return existingText
		}
		return segment
	case openAIRealtimeDeltaModeIncremental:
		if existingText == "" {
			return strings.TrimSpace(rawText)
		}
		return existingText + rawText
	default:
		return existingText
	}
}

func rebuildOpenAIRealtimeFullText(itemOrder []string, itemTexts map[string]string) string {
	fullText := ""
	for _, itemID := range itemOrder {
		itemText, ok := itemTexts[itemID]
		if !ok {
			continue
		}
		_, fullText = appendTranscriptSegment(fullText, itemText)
	}
	return fullText
}

func appendOpenAIRealtimeTranscriptDelta(previousFullText, nextFullText string) string {
	if strings.HasPrefix(nextFullText, previousFullText) {
		return nextFullText[len(previousFullText):]
	}
	return ""
}
