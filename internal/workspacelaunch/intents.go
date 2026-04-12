package workspacelaunch

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofrs/flock"
	"setta/internal/auth"
	"setta/internal/frontendorigins"
)

const (
	DefaultIntentTTL            = 10 * time.Minute
	defaultIntentTTLSeconds     = DefaultIntentTTL
	defaultMaxIntentsPerSession = 64
	defaultMaxIntentsTotal      = 2048
	launchIntentStoreFileName   = "workspace_launch_intents.json"
)

type IntentError struct {
	Code    string
	Message string
}

func (e *IntentError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type CreateIntentInput struct {
	Request        Request
	ReturnURL      string
	RequestOrigin  string
	CurrentSession *auth.CurrentSession
}

type CreateIntentResult struct {
	LaunchIntentToken string
	RequestedAt       int64
}

type StoredIntent struct {
	SessionID            string         `json:"sessionId"`
	LaunchRequestPayload map[string]any `json:"launchRequestPayload"`
	ReturnURL            string         `json:"returnUrl"`
	Exp                  int64          `json:"exp"`
}

type IntentStoreUnavailableError struct {
	Message string
}

func (e *IntentStoreUnavailableError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type IntentStoreStateError struct {
	Message string
}

func (e *IntentStoreStateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type IntentStoreCapacityError struct {
	Message string
}

func (e *IntentStoreCapacityError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type IntentServiceOptions struct {
	RuntimeRoot    string
	TrustedOrigins *frontendorigins.Service
	Now            func() time.Time
	MaxPerSession  int
	MaxTotal       int
}

type IntentService struct {
	store          *intentStore
	trustedOrigins *frontendorigins.Service
	now            func() time.Time
	tokenManager   *auth.LaunchIntentTokenManager
}

type intentStore struct {
	path          string
	maxPerSession int
	maxTotal      int
	mu            sync.Mutex
}

func NewIntentService(options IntentServiceOptions) (*IntentService, error) {
	runtimeRoot := strings.TrimSpace(options.RuntimeRoot)
	if runtimeRoot == "" {
		return nil, fmt.Errorf("runtime root is required")
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	maxPerSession := options.MaxPerSession
	if maxPerSession <= 0 {
		maxPerSession = defaultMaxIntentsPerSession
	}
	maxTotal := options.MaxTotal
	if maxTotal <= 0 {
		maxTotal = defaultMaxIntentsTotal
	}
	if maxTotal < maxPerSession {
		return nil, fmt.Errorf("max total launch intents must be >= max per session")
	}
	return &IntentService{
		store: &intentStore{
			path:          filepath.Join(runtimeRoot, launchIntentStoreFileName),
			maxPerSession: maxPerSession,
			maxTotal:      maxTotal,
		},
		trustedOrigins: options.TrustedOrigins,
		now:            now,
		tokenManager:   auth.NewLaunchIntentTokenManager(defaultIntentTTLSeconds),
	}, nil
}

func (s *IntentService) CreateIntent(input CreateIntentInput) (CreateIntentResult, error) {
	if input.CurrentSession == nil {
		return CreateIntentResult{}, &IntentError{
			Code:    "Unauthorized",
			Message: "Missing session.",
		}
	}
	if err := input.Request.ValidateForIntent(); err != nil {
		return CreateIntentResult{}, &IntentError{
			Code:    "BadRequest",
			Message: err.Error(),
		}
	}
	returnURL, err := s.validateAndNormalizeReturnURL(
		input.ReturnURL,
		input.RequestOrigin,
		input.CurrentSession.Metadata.ID,
	)
	if err != nil {
		return CreateIntentResult{}, &IntentError{
			Code:    "BadRequest",
			Message: err.Error(),
		}
	}
	requestedAt := s.now().UTC()
	token, exp, err := s.tokenManager.Mint(input.CurrentSession.Metadata.ID, input.CurrentSession.Secret, requestedAt)
	if err != nil {
		return CreateIntentResult{}, &IntentError{
			Code:    "InternalError",
			Message: "Internal Server Error",
		}
	}
	if err := s.store.create(
		token,
		input.CurrentSession.Metadata.ID,
		input.Request.StoredPayload(),
		returnURL,
		exp,
		requestedAt.Unix(),
	); err != nil {
		switch typed := err.(type) {
		case *IntentStoreUnavailableError:
			return CreateIntentResult{}, &IntentError{Code: "LaunchIntentStoreUnavailable", Message: typed.Message}
		case *IntentStoreCapacityError:
			return CreateIntentResult{}, &IntentError{Code: "LaunchIntentStoreCapacityExceeded", Message: typed.Message}
		case *IntentStoreStateError:
			return CreateIntentResult{}, &IntentError{Code: "LaunchIntentStoreInvalid", Message: typed.Message}
		default:
			return CreateIntentResult{}, &IntentError{Code: "InternalError", Message: "Internal Server Error"}
		}
	}
	return CreateIntentResult{
		LaunchIntentToken: token,
		RequestedAt:       requestedAt.UnixMilli(),
	}, nil
}

func (s *IntentService) ConsumeIntent(currentSession *auth.CurrentSession, token string) (Request, string, error) {
	if currentSession == nil {
		return Request{}, "", &IntentError{
			Code:    "Unauthorized",
			Message: "Missing session.",
		}
	}
	validatedToken, err := s.tokenManager.Validate(strings.TrimSpace(token), currentSession.Secret, s.now().UTC())
	if err != nil {
		return Request{}, "", &IntentError{
			Code:    "InvalidLaunchIntent",
			Message: "Launch intent token is invalid.",
		}
	}
	if validatedToken.SessionID != currentSession.Metadata.ID {
		return Request{}, "", &IntentError{
			Code:    "InvalidLaunchIntent",
			Message: "Launch intent token is bound to a different session.",
		}
	}
	stored, err := s.store.consumeOnce(token, currentSession.Metadata.ID, s.now().Unix())
	if err != nil {
		switch typed := err.(type) {
		case *IntentStoreUnavailableError:
			return Request{}, "", &IntentError{Code: "LaunchIntentStoreUnavailable", Message: typed.Message}
		case *IntentStoreStateError:
			return Request{}, "", &IntentError{Code: "InvalidLaunchIntent", Message: typed.Message}
		default:
			return Request{}, "", &IntentError{Code: "InvalidLaunchIntent", Message: err.Error()}
		}
	}
	request, err := RequestFromStoredPayload(stored.LaunchRequestPayload)
	if err != nil {
		return Request{}, "", &IntentError{
			Code:    "InvalidLaunchIntent",
			Message: "Stored launch intent payload is invalid.",
		}
	}
	if err := request.ValidateForIntent(); err != nil {
		return Request{}, "", &IntentError{
			Code:    "InvalidLaunchIntent",
			Message: err.Error(),
		}
	}
	return request, stored.ReturnURL, nil
}

func (s *IntentService) validateAndNormalizeReturnURL(returnURL string, requestOrigin string, sessionID string) (string, error) {
	parsedReturnURL, err := parseAbsoluteHTTPReturnURL(returnURL)
	if err != nil {
		return "", err
	}
	normalizedReturnOrigin, err := normalizeReturnOrigin(parsedReturnURL)
	if err != nil {
		return "", err
	}
	if !s.returnOriginAllowed(normalizedReturnOrigin, requestOrigin, sessionID) {
		return "", errors.New("returnUrl origin is not allowed.")
	}
	return buildNormalizedReturnURL(parsedReturnURL, normalizedReturnOrigin), nil
}

func parseAbsoluteHTTPReturnURL(rawReturnURL string) (*url.URL, error) {
	trimmedReturnURL := strings.TrimSpace(rawReturnURL)
	if trimmedReturnURL == "" {
		return nil, errors.New("returnUrl must not be blank.")
	}
	parsedReturnURL, err := urlParse(trimmedReturnURL)
	if err != nil || !isReturnURLSchemeAllowed(parsedReturnURL.Scheme) {
		return nil, errors.New("returnUrl must use http or https.")
	}
	if parsedReturnURL.User != nil {
		return nil, errors.New("returnUrl must not include credentials.")
	}
	if parsedReturnURL.Hostname() == "" {
		return nil, errors.New("returnUrl must include an origin.")
	}
	return parsedReturnURL, nil
}

func isReturnURLSchemeAllowed(scheme string) bool {
	return scheme == "http" || scheme == "https"
}

func normalizeReturnOrigin(parsedReturnURL *url.URL) (string, error) {
	normalizedReturnOrigin := frontendorigins.NormalizeOrigin(parsedReturnURL.Scheme + "://" + parsedReturnURL.Host)
	if normalizedReturnOrigin == "" {
		return "", errors.New("returnUrl origin is invalid.")
	}
	return normalizedReturnOrigin, nil
}

func (s *IntentService) returnOriginAllowed(normalizedReturnOrigin string, requestOrigin string, sessionID string) bool {
	if s.trustedOrigins != nil {
		return s.trustedOrigins.IsReturnOriginAllowed(normalizedReturnOrigin, requestOrigin, sessionID)
	}
	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(requestOrigin)
	return normalizedRequestOrigin == "" || normalizedReturnOrigin == normalizedRequestOrigin
}

func buildNormalizedReturnURL(parsedReturnURL *url.URL, normalizedReturnOrigin string) string {
	normalizedOriginURL, _ := urlParse(normalizedReturnOrigin)
	normalizedOriginURL.Path = normalizedReturnURLPath(parsedReturnURL)
	normalizedOriginURL.RawPath = parsedReturnURL.RawPath
	normalizedOriginURL.RawQuery = parsedReturnURL.RawQuery
	normalizedOriginURL.Fragment = parsedReturnURL.Fragment
	return normalizedOriginURL.String()
}

func normalizedReturnURLPath(parsedReturnURL *url.URL) string {
	normalizedPath := parsedReturnURL.EscapedPath()
	if normalizedPath == "" {
		return "/"
	}
	return normalizedPath
}

func urlParse(raw string) (*url.URL, error) {
	return url.Parse(raw)
}

func tokenHash(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
}

func (s *intentStore) create(token string, sessionID string, launchRequestPayload map[string]any, returnURL string, exp int64, now int64) error {
	return s.update(func(record map[string]StoredIntent) (map[string]StoredIntent, error) {
		pruneIntents(record, now)
		tokenDigest := tokenHash(token)
		if _, exists := record[tokenDigest]; !exists {
			sessionCount := 0
			for _, stored := range record {
				if stored.SessionID == sessionID {
					sessionCount++
				}
			}
			if sessionCount >= s.maxPerSession {
				return nil, &IntentStoreCapacityError{Message: "Launch intent session capacity exceeded."}
			}
			if len(record) >= s.maxTotal {
				return nil, &IntentStoreCapacityError{Message: "Launch intent global capacity exceeded."}
			}
		}
		record[tokenDigest] = StoredIntent{
			SessionID:            sessionID,
			LaunchRequestPayload: launchRequestPayload,
			ReturnURL:            returnURL,
			Exp:                  exp,
		}
		return record, nil
	})
}

func (s *intentStore) consumeOnce(token string, sessionID string, now int64) (StoredIntent, error) {
	var storedIntent StoredIntent
	err := s.update(func(record map[string]StoredIntent) (map[string]StoredIntent, error) {
		pruneIntents(record, now)
		tokenDigest := tokenHash(token)
		stored, ok := record[tokenDigest]
		if !ok {
			return nil, errors.New("Launch intent token is missing or already consumed.")
		}
		if stored.Exp <= now {
			delete(record, tokenDigest)
			return record, errors.New("Launch intent token has expired.")
		}
		if stored.SessionID != sessionID {
			return nil, errors.New("Launch intent token is bound to a different session.")
		}
		delete(record, tokenDigest)
		storedIntent = stored
		return record, nil
	})
	return storedIntent, err
}

func (s *intentStore) update(apply func(map[string]StoredIntent) (map[string]StoredIntent, error)) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lockPath := s.path + ".lock"
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		return &IntentStoreUnavailableError{
			Message: fmt.Sprintf("Failed creating launch-intent store directory: %v", err),
		}
	}
	fileLock := flock.New(lockPath)
	if err := fileLock.Lock(); err != nil {
		return &IntentStoreUnavailableError{
			Message: fmt.Sprintf("Failed acquiring launch-intent store lock: %s", lockPath),
		}
	}
	defer fileLock.Close()

	record, err := s.read()
	if err != nil {
		return err
	}
	record, err = apply(record)
	if err != nil {
		if record != nil {
			if writeErr := s.write(record); writeErr != nil {
				return writeErr
			}
		}
		return err
	}
	return s.write(record)
}

func (s *intentStore) read() (map[string]StoredIntent, error) {
	content, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]StoredIntent{}, nil
		}
		return nil, &IntentStoreUnavailableError{
			Message: fmt.Sprintf("Failed reading launch-intent store: %s", s.path),
		}
	}
	return decodeStoredIntentRecord(content)
}

func (s *intentStore) write(record map[string]StoredIntent) error {
	if len(record) == 0 {
		if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return &IntentStoreUnavailableError{
				Message: fmt.Sprintf("Failed clearing launch-intent store: %s", s.path),
			}
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return &IntentStoreUnavailableError{
			Message: fmt.Sprintf("Failed creating launch-intent store directory: %s", filepath.Dir(s.path)),
		}
	}
	content, err := json.Marshal(record)
	if err != nil {
		return &IntentStoreStateError{Message: fmt.Sprintf("Encode launch-intent store: %v", err)}
	}
	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, content, 0o600); err != nil {
		return &IntentStoreUnavailableError{
			Message: fmt.Sprintf("Failed writing launch-intent store: %s", s.path),
		}
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		_ = os.Remove(tempPath)
		return &IntentStoreUnavailableError{
			Message: fmt.Sprintf("Failed writing launch-intent store: %s", s.path),
		}
	}
	return nil
}

func pruneIntents(record map[string]StoredIntent, now int64) {
	for tokenDigest, stored := range record {
		if stored.Exp <= now {
			delete(record, tokenDigest)
		}
	}
}

func decodeStoredIntentRecord(content []byte) (map[string]StoredIntent, error) {
	if len(strings.TrimSpace(string(content))) == 0 {
		return map[string]StoredIntent{}, nil
	}
	topLevel, err := decodeStoredIntentTopLevel(content)
	if err != nil {
		return nil, err
	}
	record := make(map[string]StoredIntent, len(topLevel))
	for tokenDigest, rawStored := range topLevel {
		stored, err := decodeStoredIntentEntry(rawStored)
		if err != nil {
			return nil, err
		}
		record[tokenDigest] = stored
	}
	return record, nil
}

func decodeStoredIntentTopLevel(content []byte) (map[string]any, error) {
	var raw any
	if err := json.Unmarshal(content, &raw); err != nil {
		return nil, &IntentStoreStateError{Message: "Launch intent store contains invalid JSON."}
	}
	return expectStoredIntentObject(raw, "Launch intent store payload must be an object.")
}

func decodeStoredIntentEntry(rawStored any) (StoredIntent, error) {
	entry, err := expectStoredIntentObject(rawStored, "Launch intent store entries must be objects.")
	if err != nil {
		return StoredIntent{}, err
	}
	sessionID, err := expectStoredIntentString(entry, "sessionId", "Launch intent store session ids must be strings.")
	if err != nil {
		return StoredIntent{}, err
	}
	returnURL, err := expectStoredIntentString(entry, "returnUrl", "Launch intent store return URLs must be strings.")
	if err != nil {
		return StoredIntent{}, err
	}
	exp, err := expectStoredIntentInteger(entry, "exp", "Launch intent store expiry values must be integers.")
	if err != nil {
		return StoredIntent{}, err
	}
	requestPayload, err := expectStoredIntentObjectField(entry, "launchRequestPayload", "Launch intent store launchRequestPayload must be an object.")
	if err != nil {
		return StoredIntent{}, err
	}
	return StoredIntent{
		SessionID:            sessionID,
		LaunchRequestPayload: requestPayload,
		ReturnURL:            returnURL,
		Exp:                  exp,
	}, nil
}

func expectStoredIntentObject(raw any, message string) (map[string]any, error) {
	entry, ok := raw.(map[string]any)
	if !ok {
		return nil, &IntentStoreStateError{Message: message}
	}
	return entry, nil
}

func expectStoredIntentObjectField(entry map[string]any, fieldName string, message string) (map[string]any, error) {
	return expectStoredIntentObject(entry[fieldName], message)
}

func expectStoredIntentString(entry map[string]any, fieldName string, message string) (string, error) {
	value, ok := entry[fieldName].(string)
	if !ok {
		return "", &IntentStoreStateError{Message: message}
	}
	return value, nil
}

func expectStoredIntentInteger(entry map[string]any, fieldName string, message string) (int64, error) {
	value, ok := normalizeJSONInteger(entry[fieldName])
	if !ok {
		return 0, &IntentStoreStateError{Message: message}
	}
	return value, nil
}

func normalizeJSONInteger(value any) (int64, bool) {
	switch typed := value.(type) {
	case float64:
		if typed != float64(int64(typed)) {
			return 0, false
		}
		return int64(typed), true
	case int64:
		return typed, true
	case int:
		return int64(typed), true
	default:
		return 0, false
	}
}
