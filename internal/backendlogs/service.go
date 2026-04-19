package backendlogs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"setta/internal/realtime"
)

const uiLogLevelEnv = "SETTA_UI_LOG_LEVEL"

const criticalLevel = slog.LevelError + 4

type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityError    Severity = "error"
	SeverityCritical Severity = "critical"
)

var (
	ErrLoggerRequired       = fmt.Errorf("backendlogs: logger is required")
	ErrWebsocketHubRequired = fmt.Errorf("backendlogs: websocket hub is required")
	ErrMessageRequired      = fmt.Errorf("backendlogs: message is required")
)

type Event struct {
	ID        string   `json:"id"`
	ProjectID *string  `json:"projectConfigId"`
	Severity  Severity `json:"severity"`
	Message   string   `json:"message"`
	Timestamp string   `json:"timestamp"`
}

type WebsocketMessage struct {
	ID          *string                       `json:"id"`
	MessageType realtime.WebsocketMessageType `json:"messageType"`
	Content     Event                         `json:"content"`
}

type LogRequest struct {
	Message        string
	Severity       Severity
	ProjectID      string
	ShareSessionID string
}

type ServiceOptions struct {
	Logger       *slog.Logger
	WebsocketHub *realtime.WebsocketHub
	EnvLookup    func(string) (string, bool)
	IDGenerator  func() string
	TimeNow      func() time.Time
}

type Service struct {
	logger       *slog.Logger
	websocketHub *realtime.WebsocketHub
	envLookup    func(string) (string, bool)
	idGenerator  func() string
	timeNow      func() time.Time
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Logger == nil {
		return nil, ErrLoggerRequired
	}
	if options.WebsocketHub == nil {
		return nil, ErrWebsocketHubRequired
	}

	envLookup := options.EnvLookup
	if envLookup == nil {
		envLookup = func(string) (string, bool) { return "", false }
	}

	idGenerator := options.IDGenerator
	if idGenerator == nil {
		idGenerator = newRandomID
	}

	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = time.Now
	}

	return &Service{
		logger:       options.Logger,
		websocketHub: options.WebsocketHub,
		envLookup:    envLookup,
		idGenerator:  idGenerator,
		timeNow:      timeNow,
	}, nil
}

func (s *Service) LogAndBroadcast(ctx context.Context, request LogRequest) error {
	message := strings.TrimSpace(request.Message)
	if message == "" {
		return ErrMessageRequired
	}

	severity := normalizeSeverity(request.Severity)
	level := severityLevel(severity)
	projectID := strings.TrimSpace(request.ProjectID)
	shareSessionID := strings.TrimSpace(request.ShareSessionID)

	attrs := make([]any, 0, 4)
	if projectID != "" {
		attrs = append(attrs, "project_config_id", projectID)
	}
	if shareSessionID != "" {
		attrs = append(attrs, "share_session_id", shareSessionID)
	}
	s.logger.Log(ctx, level, message, attrs...)

	if level < s.resolveUILogLevel(ctx) {
		return nil
	}

	event := Event{
		ID:        s.idGenerator(),
		Severity:  severity,
		Message:   message,
		Timestamp: s.timeNow().UTC().Format(time.RFC3339Nano),
	}
	if projectID != "" {
		event.ProjectID = &projectID
	}

	selection := realtime.Selection{Type: realtime.ConnectionTypeFrontend}
	if shareSessionID != "" {
		selection.ShareSessionID = shareSessionID
	}

	_, err := s.websocketHub.BroadcastJSON(ctx, WebsocketMessage{
		MessageType: realtime.WebsocketMessageTypeBackendLogEvent,
		Content:     event,
	}, selection)
	return err
}

func (s *Service) resolveUILogLevel(ctx context.Context) slog.Level {
	if raw, ok := s.envLookup(uiLogLevelEnv); ok {
		if level, ok := parseLogLevel(raw); ok {
			return level
		}
	}

	for _, level := range []slog.Level{slog.LevelDebug, slog.LevelInfo, slog.LevelWarn, slog.LevelError, criticalLevel} {
		if s.logger.Enabled(ctx, level) {
			return level
		}
	}
	return criticalLevel + 4
}

func normalizeSeverity(severity Severity) Severity {
	switch severity {
	case SeverityWarning:
		return SeverityWarning
	case SeverityError:
		return SeverityError
	case SeverityCritical:
		return SeverityCritical
	default:
		return SeverityInfo
	}
}

func severityLevel(severity Severity) slog.Level {
	switch severity {
	case SeverityWarning:
		return slog.LevelWarn
	case SeverityError:
		return slog.LevelError
	case SeverityCritical:
		return criticalLevel
	default:
		return slog.LevelInfo
	}
}

func parseLogLevel(raw string) (slog.Level, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug, true
	case "info":
		return slog.LevelInfo, true
	case "warn", "warning":
		return slog.LevelWarn, true
	case "error":
		return slog.LevelError, true
	case "critical":
		return criticalLevel, true
	default:
		return 0, false
	}
}

func newRandomID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Sprintf("backendlogs: generate random id: %v", err))
	}
	return hex.EncodeToString(buffer)
}
