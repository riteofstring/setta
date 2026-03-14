package transcriptionsessions

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"setta/internal/llmconfig"
	"setta/internal/transcriptionprofiles"
)

const (
	DefaultSessionTTL            = 10 * time.Minute
	DefaultMaxPendingPCMBytes    = 25 * 1024 * 1024
	DefaultAppendPCMMaxBytes     = 10 * 1024 * 1024
	defaultOpenAIBaseURL         = "https://api.openai.com/v1"
	defaultProviderErrorMessage  = "Provider transcription failed."
	maxProviderResponseBodyBytes = 1 << 20
	maxProviderErrorBodyBytes    = 4096
)

const (
	ResolvedTransportModeFile     = "file"
	ResolvedTransportModeRealtime = "realtime"
)

var (
	ErrInvalidRequest     = errors.New("invalid transcription request")
	ErrSessionNotFound    = errors.New("transcription session not found")
	ErrAudioPayloadLarge  = errors.New("transcription audio payload too large")
	ErrMissingAPIKey      = errors.New("transcription api key is required")
	ErrRuntimeUnavailable = errors.New("transcription runtime is unavailable")
	ErrUnsupportedModel   = errors.New("transcription model does not support requested transport")
	ErrProviderFailure    = errors.New("transcription provider failure")
)

type ServiceOptions struct {
	LLM                *llmconfig.Runtime
	HTTPClient         *http.Client
	SessionTTL         time.Duration
	MaxPendingPCMBytes int
	TimeNow            func() time.Time
	NewID              func() string
}

type Service struct {
	llm                *llmconfig.Runtime
	httpClient         *http.Client
	sessionTTL         time.Duration
	maxPendingPCMBytes int
	timeNow            func() time.Time
	newID              func() string

	mu       sync.Mutex
	sessions map[string]*activeSession
}

type StartRequest struct {
	ScopeID         string
	ResolvedProfile transcriptionprofiles.ResolvedProfile
	Language        *string
}

type StartResult struct {
	SessionID             string
	ResolvedTransportMode string
	ChunkMs               int
}

type AppendRequest struct {
	ScopeID      string
	SessionID    string
	AudioPCM16   []byte
	SampleRateHz int
	Channels     int
}

type StopRequest struct {
	ScopeID   string
	SessionID string
}

type Delta struct {
	AppendText string `json:"appendText"`
	FullText   string `json:"fullText"`
	IsFinal    bool   `json:"isFinal"`
}

type activeSession struct {
	scopeID       string
	engine        engine
	lastActivity  time.Time
	inFlightCount int
}

type engine interface {
	AppendAudio(context.Context, []byte, int, int) (Delta, error)
	Stop(context.Context) (Delta, error)
	Close() error
}

type fileEngine struct {
	uploader           fileUploader
	maxPendingPCMBytes int
	language           *string

	mu           sync.Mutex
	pendingPCM   []byte
	fullText     string
	sampleRateHz int
	channels     int
	started      bool
}

type fileUploader struct {
	httpClient *http.Client
	endpoint   string
	apiKey     string
	model      string
	language   *string
	fields     map[string]string
}

type serviceError struct {
	cause   error
	message string
}

type AudioLimitExceededError struct {
	MaxBytes int
}

type SessionNotFoundError struct {
	SessionID string
}

func NewService(opts ServiceOptions) (*Service, error) {
	if opts.LLM == nil {
		return nil, fmt.Errorf("llm runtime is required")
	}
	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	sessionTTL := opts.SessionTTL
	if sessionTTL <= 0 {
		sessionTTL = DefaultSessionTTL
	}
	maxPendingPCMBytes := opts.MaxPendingPCMBytes
	if maxPendingPCMBytes <= 0 {
		maxPendingPCMBytes = DefaultMaxPendingPCMBytes
	}
	timeNow := opts.TimeNow
	if timeNow == nil {
		timeNow = time.Now
	}
	newID := opts.NewID
	if newID == nil {
		newID = newSessionID
	}
	return &Service{
		llm:                opts.LLM,
		httpClient:         httpClient,
		sessionTTL:         sessionTTL,
		maxPendingPCMBytes: maxPendingPCMBytes,
		timeNow:            timeNow,
		newID:              newID,
		sessions:           map[string]*activeSession{},
	}, nil
}

func (s *Service) StartSession(ctx context.Context, request StartRequest) (StartResult, error) {
	if err := s.requireConfigured(); err != nil {
		return StartResult{}, err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	scopeID := strings.TrimSpace(request.ScopeID)
	if scopeID == "" {
		return StartResult{}, newServiceError(ErrInvalidRequest, "Transcription session scope is required.")
	}

	profile := request.ResolvedProfile.Profile
	if profile.ID == "" {
		return StartResult{}, newServiceError(ErrInvalidRequest, "Transcription profile is required.")
	}
	if request.ResolvedProfile.LLMConfig == nil {
		return StartResult{}, newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}

	language := resolveLanguage(request.Language, profile.Language)
	sessionEngine, resolvedTransportMode, chunkMs, err := s.buildSessionEngine(ctx, request.ResolvedProfile, language)
	if err != nil {
		return StartResult{}, err
	}
	if profile.TransportMode != transcriptionprofiles.TransportModeAuto &&
		profile.TransportMode != transcriptionprofiles.TransportModeFile &&
		profile.TransportMode != transcriptionprofiles.TransportModeRealtime {
		return StartResult{}, newServiceError(ErrInvalidRequest, "Transcription transport mode is invalid.")
	}

	if err := s.PruneExpiredSessions(ctx); err != nil {
		return StartResult{}, err
	}
	now := s.timeNow()
	sessionID := strings.TrimSpace(s.newID())
	if sessionID == "" {
		return StartResult{}, newServiceError(ErrInvalidRequest, "Transcription session id generation failed.")
	}

	s.mu.Lock()
	s.sessions[sessionID] = &activeSession{
		scopeID:      scopeID,
		engine:       sessionEngine,
		lastActivity: now,
	}
	s.mu.Unlock()

	return StartResult{
		SessionID:             sessionID,
		ResolvedTransportMode: resolvedTransportMode,
		ChunkMs:               chunkMs,
	}, nil
}

func (s *Service) AppendAudio(ctx context.Context, request AppendRequest) (Delta, error) {
	if err := s.requireConfigured(); err != nil {
		return Delta{}, err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	session, sessionID, scopeID, err := s.markInFlight(request.ScopeID, request.SessionID)
	if err != nil {
		return Delta{}, err
	}
	defer s.markComplete(scopeID, sessionID, session)

	return session.engine.AppendAudio(ctx, request.AudioPCM16, request.SampleRateHz, request.Channels)
}

func (s *Service) StopSession(ctx context.Context, request StopRequest) (Delta, error) {
	if err := s.requireConfigured(); err != nil {
		return Delta{}, err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	session, err := s.popSession(request.ScopeID, request.SessionID)
	if err != nil {
		return Delta{}, err
	}
	defer func() {
		_ = session.engine.Close()
	}()

	return session.engine.Stop(ctx)
}

func (s *Service) CancelSession(_ context.Context, request StopRequest) error {
	if err := s.requireConfigured(); err != nil {
		return err
	}

	session, err := s.popSession(request.ScopeID, request.SessionID)
	if err != nil {
		return err
	}
	return session.engine.Close()
}

func (s *Service) PruneExpiredSessions(ctx context.Context) error {
	if err := s.requireConfigured(); err != nil {
		return err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	now := s.timeNow()
	expired := []*activeSession{}
	s.mu.Lock()
	for sessionID, session := range s.sessions {
		if session.inFlightCount > 0 {
			continue
		}
		if now.Sub(session.lastActivity) <= s.sessionTTL {
			continue
		}
		expired = append(expired, session)
		delete(s.sessions, sessionID)
	}
	s.mu.Unlock()

	var err error
	for _, session := range expired {
		select {
		case <-ctx.Done():
			return errors.Join(err, ctx.Err())
		default:
		}
		err = errors.Join(err, session.engine.Close())
	}
	return err
}

func (s *Service) requireConfigured() error {
	if s == nil || s.llm == nil {
		return fmt.Errorf("transcription session service is not configured")
	}
	return nil
}

func (s *Service) markInFlight(scopeID, sessionID string) (*activeSession, string, string, error) {
	trimmedScopeID := strings.TrimSpace(scopeID)
	if trimmedScopeID == "" {
		return nil, "", "", newServiceError(ErrInvalidRequest, "Transcription session scope is required.")
	}
	trimmedSessionID := strings.TrimSpace(sessionID)
	if trimmedSessionID == "" {
		return nil, "", "", newServiceError(ErrInvalidRequest, "Transcription session id is required.")
	}
	if err := s.PruneExpiredSessions(context.Background()); err != nil {
		return nil, "", "", err
	}

	now := s.timeNow()
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[trimmedSessionID]
	if session == nil || session.scopeID != trimmedScopeID {
		return nil, "", "", newSessionNotFoundError(trimmedSessionID)
	}
	session.lastActivity = now
	session.inFlightCount++
	return session, trimmedSessionID, trimmedScopeID, nil
}

func (s *Service) markComplete(scopeID, sessionID string, session *activeSession) {
	if session == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	active := s.sessions[sessionID]
	if active == nil || active != session || active.scopeID != scopeID {
		return
	}
	active.lastActivity = s.timeNow()
	if active.inFlightCount > 0 {
		active.inFlightCount--
	}
}

func (s *Service) popSession(scopeID, sessionID string) (*activeSession, error) {
	trimmedScopeID := strings.TrimSpace(scopeID)
	if trimmedScopeID == "" {
		return nil, newServiceError(ErrInvalidRequest, "Transcription session scope is required.")
	}
	trimmedSessionID := strings.TrimSpace(sessionID)
	if trimmedSessionID == "" {
		return nil, newServiceError(ErrInvalidRequest, "Transcription session id is required.")
	}
	if err := s.PruneExpiredSessions(context.Background()); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[trimmedSessionID]
	if session == nil || session.scopeID != trimmedScopeID {
		return nil, newSessionNotFoundError(trimmedSessionID)
	}
	delete(s.sessions, trimmedSessionID)
	return session, nil
}

type fileEngineOptions struct {
	HTTPClient         *http.Client
	LLMConfig          llmconfig.Config
	APIKeys            map[string]string
	Language           *string
	MaxPendingPCMBytes int
}

func (s *Service) buildSessionEngine(
	ctx context.Context,
	resolved transcriptionprofiles.ResolvedProfile,
	language *string,
) (engine, string, int, error) {
	profile := resolved.Profile
	if resolved.LLMConfig == nil {
		return nil, "", 0, newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}

	switch profile.TransportMode {
	case transcriptionprofiles.TransportModeFile:
		fileRuntime, err := newFileEngine(fileEngineOptions{
			HTTPClient:         s.httpClient,
			LLMConfig:          *resolved.LLMConfig,
			APIKeys:            s.llm.APIKeys(),
			Language:           language,
			MaxPendingPCMBytes: s.maxPendingPCMBytes,
		})
		if err != nil {
			return nil, "", 0, err
		}
		return fileRuntime, ResolvedTransportModeFile, 0, nil
	case transcriptionprofiles.TransportModeRealtime:
		if !profile.SupportsRealtimeTranscription {
			return nil, "", 0, newServiceError(
				ErrUnsupportedModel,
				"Realtime transcription is unavailable for this provider/model.",
			)
		}
		realtimeRuntime, err := newRealtimeEngine(ctx, realtimeEngineOptions{
			HTTPClient: s.httpClient,
			LLMConfig:  *resolved.LLMConfig,
			APIKeys:    s.llm.APIKeys(),
			Language:   language,
		})
		if err != nil {
			return nil, "", 0, err
		}
		return realtimeRuntime, ResolvedTransportModeRealtime, profile.ChunkMs, nil
	case transcriptionprofiles.TransportModeAuto:
		if profile.SupportsRealtimeTranscription {
			realtimeRuntime, err := newRealtimeEngine(ctx, realtimeEngineOptions{
				HTTPClient: s.httpClient,
				LLMConfig:  *resolved.LLMConfig,
				APIKeys:    s.llm.APIKeys(),
				Language:   language,
			})
			if err != nil {
				return nil, "", 0, err
			}
			return realtimeRuntime, ResolvedTransportModeRealtime, profile.ChunkMs, nil
		}
		fileRuntime, err := newFileEngine(fileEngineOptions{
			HTTPClient:         s.httpClient,
			LLMConfig:          *resolved.LLMConfig,
			APIKeys:            s.llm.APIKeys(),
			Language:           language,
			MaxPendingPCMBytes: s.maxPendingPCMBytes,
		})
		if err != nil {
			return nil, "", 0, err
		}
		return fileRuntime, ResolvedTransportModeFile, 0, nil
	default:
		return nil, "", 0, newServiceError(ErrInvalidRequest, "Transcription transport mode is invalid.")
	}
}

func newFileEngine(opts fileEngineOptions) (*fileEngine, error) {
	uploader, err := buildFileUploader(opts.HTTPClient, opts.LLMConfig, opts.APIKeys, opts.Language)
	if err != nil {
		return nil, err
	}
	return &fileEngine{
		uploader:           uploader,
		maxPendingPCMBytes: opts.MaxPendingPCMBytes,
		language:           cloneStringPointer(opts.Language),
	}, nil
}

func (e *fileEngine) AppendAudio(_ context.Context, audioPCM16 []byte, sampleRateHz int, channels int) (Delta, error) {
	if sampleRateHz <= 0 {
		return Delta{}, newServiceError(ErrInvalidRequest, "sampleRateHz must be greater than 0.")
	}
	if channels <= 0 {
		return Delta{}, newServiceError(ErrInvalidRequest, "channels must be greater than 0.")
	}
	if len(audioPCM16) == 0 {
		return Delta{}, newServiceError(ErrInvalidRequest, "Audio payload is empty.")
	}
	if len(audioPCM16)%2 != 0 {
		return Delta{}, newServiceError(ErrInvalidRequest, "PCM16 payload must have an even byte length.")
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.started {
		e.sampleRateHz = sampleRateHz
		e.channels = channels
		e.started = true
	}
	if e.sampleRateHz != sampleRateHz {
		return Delta{}, newServiceError(ErrInvalidRequest, "sampleRateHz cannot change within a transcription session.")
	}
	if e.channels != channels {
		return Delta{}, newServiceError(ErrInvalidRequest, "channels cannot change within a transcription session.")
	}

	nextPendingSize := len(e.pendingPCM) + len(audioPCM16)
	if nextPendingSize > e.maxPendingPCMBytes {
		return Delta{}, &AudioLimitExceededError{MaxBytes: e.maxPendingPCMBytes}
	}
	e.pendingPCM = append(e.pendingPCM, audioPCM16...)

	return Delta{
		AppendText: "",
		FullText:   e.fullText,
		IsFinal:    false,
	}, nil
}

func (e *fileEngine) Stop(ctx context.Context) (Delta, error) {
	e.mu.Lock()
	if !e.started {
		e.mu.Unlock()
		return Delta{
			AppendText: "",
			FullText:   "",
			IsFinal:    true,
		}, nil
	}
	pending := append([]byte(nil), e.pendingPCM...)
	sampleRateHz := e.sampleRateHz
	channels := e.channels
	existingText := e.fullText
	e.pendingPCM = nil
	e.mu.Unlock()

	appendText := ""
	fullText := existingText
	if len(pending) > 0 {
		wavBytes, err := pcm16ToWAV(pending, sampleRateHz, channels)
		if err != nil {
			return Delta{}, err
		}
		text, err := e.uploader.Upload(ctx, wavBytes)
		if err != nil {
			return Delta{}, err
		}
		appendText, fullText = appendTranscriptSegment(existingText, text)
	}

	e.mu.Lock()
	e.fullText = fullText
	e.mu.Unlock()

	return Delta{
		AppendText: appendText,
		FullText:   fullText,
		IsFinal:    true,
	}, nil
}

func (e *fileEngine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.pendingPCM = nil
	return nil
}

func buildFileUploader(httpClient *http.Client, config llmconfig.Config, apiKeys map[string]string, language *string) (fileUploader, error) {
	provider := strings.ToLower(strings.TrimSpace(config.Provider))
	if provider != "openai" {
		return fileUploader{}, newServiceError(
			ErrRuntimeUnavailable,
			"Transcription provider is not supported by the Go runtime yet.",
		)
	}
	model := strings.TrimSpace(config.Model)
	if model == "" {
		return fileUploader{}, newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	apiKey, err := resolveAPIKey(apiKeys, config.APIKeyEnv)
	if err != nil {
		return fileUploader{}, err
	}
	endpoint, err := resolveTranscriptionEndpoint(config)
	if err != nil {
		return fileUploader{}, err
	}
	fields, err := encodeAdditionalFields(config.OtherParams)
	if err != nil {
		return fileUploader{}, err
	}
	return fileUploader{
		httpClient: httpClient,
		endpoint:   endpoint,
		apiKey:     apiKey,
		model:      model,
		language:   cloneStringPointer(language),
		fields:     fields,
	}, nil
}

func (u fileUploader) Upload(ctx context.Context, wavBytes []byte) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("model", u.model); err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	for key, value := range u.fields {
		if err := writer.WriteField(key, value); err != nil {
			return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
		}
	}
	if u.language != nil && strings.TrimSpace(*u.language) != "" {
		if err := writer.WriteField("language", strings.TrimSpace(*u.language)); err != nil {
			return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
		}
	}
	fileWriter, err := writer.CreateFormFile("file", "dictation-window.wav")
	if err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	if _, err := fileWriter.Write(wavBytes); err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	if err := writer.Close(); err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, u.endpoint, body)
	if err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Accept", "application/json")
	if strings.TrimSpace(u.apiKey) != "" {
		request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(u.apiKey))
	}

	response, err := u.httpClient.Do(request)
	if err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message := readProviderErrorMessage(response.Body)
		return "", newServiceError(ErrProviderFailure, message)
	}

	content, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponseBodyBytes))
	if err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	text, err := extractTranscribedText(content)
	if err != nil {
		return "", err
	}
	return text, nil
}

func resolveAPIKey(apiKeys map[string]string, apiKeyEnv string) (string, error) {
	trimmedKeyEnv := strings.TrimSpace(apiKeyEnv)
	if trimmedKeyEnv == "" {
		return "", nil
	}
	apiKey := strings.TrimSpace(apiKeys[trimmedKeyEnv])
	if apiKey == "" {
		return "", newServiceError(
			ErrMissingAPIKey,
			fmt.Sprintf("Missing API key for '%s'. Configure it in LLM API Keys.", trimmedKeyEnv),
		)
	}
	return apiKey, nil
}

func resolveTranscriptionEndpoint(config llmconfig.Config) (string, error) {
	baseURL := strings.TrimSpace(config.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	endpoint, err := url.JoinPath(baseURL, "audio/transcriptions")
	if err != nil {
		return "", newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}
	return endpoint, nil
}

func encodeAdditionalFields(params map[string]any) (map[string]string, error) {
	if len(params) == 0 {
		return map[string]string{}, nil
	}
	fields := make(map[string]string, len(params))
	for key, value := range params {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" || value == nil {
			continue
		}
		switch typed := value.(type) {
		case string:
			fields[trimmedKey] = typed
		case bool:
			fields[trimmedKey] = fmt.Sprintf("%t", typed)
		case float64:
			fields[trimmedKey] = fmt.Sprintf("%v", typed)
		case float32:
			fields[trimmedKey] = fmt.Sprintf("%v", typed)
		case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
			fields[trimmedKey] = fmt.Sprintf("%v", typed)
		case json.Number:
			fields[trimmedKey] = typed.String()
		default:
			return nil, newServiceError(
				ErrInvalidRequest,
				fmt.Sprintf("Transcription config parameter %q is not supported by the Go runtime.", trimmedKey),
			)
		}
	}
	return fields, nil
}

func extractTranscribedText(content []byte) (string, error) {
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	text, _ := payload["text"].(string)
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "", newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
	}
	return trimmed, nil
}

func readProviderErrorMessage(body io.Reader) string {
	content, err := io.ReadAll(io.LimitReader(body, maxProviderErrorBodyBytes))
	if err != nil {
		return defaultProviderErrorMessage
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		return defaultProviderErrorMessage
	}
	if errorPayload, ok := payload["error"].(map[string]any); ok {
		message, _ := errorPayload["message"].(string)
		if strings.TrimSpace(message) != "" {
			return strings.TrimSpace(message)
		}
	}
	message, _ := payload["message"].(string)
	if strings.TrimSpace(message) != "" {
		return strings.TrimSpace(message)
	}
	return defaultProviderErrorMessage
}

func appendTranscriptSegment(existing, rawSegment string) (string, string) {
	segment := strings.TrimSpace(rawSegment)
	if segment == "" {
		return "", existing
	}
	needsSpace := existing != "" &&
		!strings.HasSuffix(existing, " ") &&
		!strings.HasSuffix(existing, "\n") &&
		!strings.HasPrefix(segment, ".") &&
		!strings.HasPrefix(segment, ",") &&
		!strings.HasPrefix(segment, "!") &&
		!strings.HasPrefix(segment, "?") &&
		!strings.HasPrefix(segment, ";") &&
		!strings.HasPrefix(segment, ":") &&
		!strings.HasPrefix(segment, ")") &&
		!strings.HasPrefix(segment, "]") &&
		!strings.HasPrefix(segment, "}")
	appendText := segment
	if needsSpace {
		appendText = " " + segment
	}
	return appendText, existing + appendText
}

func pcm16ToWAV(audioPCM16 []byte, sampleRateHz, channels int) ([]byte, error) {
	if sampleRateHz <= 0 {
		return nil, newServiceError(ErrInvalidRequest, "sampleRateHz must be greater than 0.")
	}
	if channels <= 0 {
		return nil, newServiceError(ErrInvalidRequest, "channels must be greater than 0.")
	}
	if len(audioPCM16)%2 != 0 {
		return nil, newServiceError(ErrInvalidRequest, "PCM16 payload must have an even byte length.")
	}

	dataSize := uint32(len(audioPCM16))
	byteRate := uint32(sampleRateHz * channels * 2)
	blockAlign := uint16(channels * 2)
	riffSize := uint32(36) + dataSize

	buffer := &bytes.Buffer{}
	buffer.Grow(44 + len(audioPCM16))
	_, _ = buffer.WriteString("RIFF")
	_ = binary.Write(buffer, binary.LittleEndian, riffSize)
	_, _ = buffer.WriteString("WAVE")
	_, _ = buffer.WriteString("fmt ")
	_ = binary.Write(buffer, binary.LittleEndian, uint32(16))
	_ = binary.Write(buffer, binary.LittleEndian, uint16(1))
	_ = binary.Write(buffer, binary.LittleEndian, uint16(channels))
	_ = binary.Write(buffer, binary.LittleEndian, uint32(sampleRateHz))
	_ = binary.Write(buffer, binary.LittleEndian, byteRate)
	_ = binary.Write(buffer, binary.LittleEndian, blockAlign)
	_ = binary.Write(buffer, binary.LittleEndian, uint16(16))
	_, _ = buffer.WriteString("data")
	_ = binary.Write(buffer, binary.LittleEndian, dataSize)
	_, _ = buffer.Write(audioPCM16)
	return buffer.Bytes(), nil
}

func resolveLanguage(override, fallback *string) *string {
	if override != nil {
		trimmed := strings.TrimSpace(*override)
		if trimmed == "" {
			return nil
		}
		return &trimmed
	}
	return cloneStringPointer(fallback)
}

func newSessionNotFoundError(sessionID string) error {
	return &SessionNotFoundError{SessionID: sessionID}
}

func newServiceError(cause error, message string) error {
	return &serviceError{
		cause:   cause,
		message: message,
	}
}

func (e *serviceError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func (e *serviceError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func (e *AudioLimitExceededError) Error() string {
	if e == nil {
		return "File-mode transcription session exceeded buffered audio size limit."
	}
	return "File-mode transcription session exceeded buffered audio size limit."
}

func (e *AudioLimitExceededError) Is(target error) bool {
	return target == ErrAudioPayloadLarge
}

func (e *SessionNotFoundError) Error() string {
	if e == nil {
		return "Transcription session not found."
	}
	return fmt.Sprintf("Transcription session %s not found.", e.SessionID)
}

func (e *SessionNotFoundError) Is(target error) bool {
	return target == ErrSessionNotFound
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func newSessionID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return hex.EncodeToString(raw[:])
	}
	return fmt.Sprintf("transcription-session-%d", time.Now().UnixNano())
}
