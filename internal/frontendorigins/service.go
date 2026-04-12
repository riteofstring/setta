package frontendorigins

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofrs/flock"
)

const trustedOriginsStoreName = "trusted_frontend_origins.json"

type Options struct {
	RuntimeRoot string
	Now         func() time.Time
}

type Service struct {
	store *store
	now   func() time.Time
}

type store struct {
	path string
	mu   sync.Mutex
}

type storeRecord struct {
	SessionIDToOrigins map[string]map[string]int64
}

type StoreUnavailableError struct {
	Message string
}

func (e *StoreUnavailableError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type StoreStateError struct {
	Message string
}

func (e *StoreStateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func NewService(options Options) (*Service, error) {
	runtimeRoot := strings.TrimSpace(options.RuntimeRoot)
	if runtimeRoot == "" {
		return nil, fmt.Errorf("runtime root is required")
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	return &Service{
		store: &store{
			path: filepath.Join(runtimeRoot, trustedOriginsStoreName),
		},
		now: now,
	}, nil
}

func NormalizeOrigin(rawOrigin string) string {
	trimmedOrigin := strings.TrimSpace(rawOrigin)
	if trimmedOrigin == "" {
		return ""
	}
	parsedOrigin, err := url.Parse(trimmedOrigin)
	if err != nil {
		return ""
	}
	if parsedOrigin.Scheme != "http" && parsedOrigin.Scheme != "https" {
		return ""
	}
	if parsedOrigin.Hostname() == "" {
		return ""
	}
	if parsedOrigin.User != nil {
		return ""
	}
	port := parsedOrigin.Port()
	if port == "" {
		return parsedOrigin.Scheme + "://" + formatOriginHost(parsedOrigin.Hostname())
	}
	return parsedOrigin.Scheme + "://" + formatOriginHost(parsedOrigin.Hostname()) + ":" + port
}

func ResolveRequestOrigin(r *http.Request, allowClientOriginHeader bool) string {
	if normalized := requestClientOrigin(r, allowClientOriginHeader); normalized != "" {
		return normalized
	}
	host := requestOriginHost(r)
	if host == "" {
		return ""
	}
	return requestOriginScheme(r) + "://" + requestOriginHostForURL(host)
}

func (s *Service) TrustOrigin(origin string, sessionID string, exp int64) (string, error) {
	if s == nil {
		return "", fmt.Errorf("trusted frontend origin service is required")
	}
	normalizedOrigin := NormalizeOrigin(origin)
	if normalizedOrigin == "" {
		return "", errors.New("trusted frontend origin must be an absolute http(s) origin")
	}
	normalizedSessionID := normalizeSessionID(sessionID)
	if normalizedSessionID == "" {
		return "", errors.New("trusted frontend origin session id must not be blank")
	}
	if err := s.store.trust(normalizedSessionID, normalizedOrigin, exp, s.now().Unix()); err != nil {
		return "", err
	}
	return normalizedOrigin, nil
}

func (s *Service) RefreshSessionExpiry(sessionID string, exp int64) error {
	if s == nil {
		return nil
	}
	normalizedSessionID := normalizeSessionID(sessionID)
	if normalizedSessionID == "" {
		return errors.New("trusted frontend origin session id must not be blank")
	}
	return s.store.refreshSessionExpiry(normalizedSessionID, exp, s.now().Unix())
}

func (s *Service) IsTrustedOrigin(origin string, sessionID string) bool {
	if s == nil {
		return false
	}
	normalizedOrigin := NormalizeOrigin(origin)
	normalizedSessionID := normalizeSessionID(sessionID)
	if normalizedOrigin == "" || normalizedSessionID == "" {
		return false
	}
	trusted, err := s.store.isTrusted(normalizedSessionID, normalizedOrigin, s.now().Unix())
	if err != nil {
		return false
	}
	return trusted
}

func (s *Service) IsReturnOriginAllowed(returnOrigin string, requestOrigin string, sessionID string) bool {
	normalizedReturnOrigin := NormalizeOrigin(returnOrigin)
	if normalizedReturnOrigin == "" {
		return false
	}
	normalizedRequestOrigin := NormalizeOrigin(requestOrigin)
	if normalizedRequestOrigin == "" {
		return true
	}
	if normalizedReturnOrigin == normalizedRequestOrigin {
		return true
	}
	return s.IsTrustedOrigin(normalizedReturnOrigin, sessionID)
}

func MintLauncherOriginHandoffProof(sessionID string, launcherOrigin string, secret []byte) string {
	if strings.TrimSpace(sessionID) == "" || len(secret) == 0 {
		return ""
	}
	normalizedOrigin := NormalizeOrigin(launcherOrigin)
	if normalizedOrigin == "" {
		return ""
	}
	payload := []byte(strings.TrimSpace(sessionID) + "\n" + normalizedOrigin)
	digest := hmac.New(sha256.New, secret)
	_, _ = digest.Write(payload)
	return base64.RawURLEncoding.EncodeToString(digest.Sum(nil))
}

func ValidateLauncherOriginHandoffProof(sessionID string, launcherOrigin string, proof string, secret []byte) bool {
	trimmedProof := strings.TrimSpace(proof)
	if trimmedProof == "" {
		return false
	}
	expectedProof := MintLauncherOriginHandoffProof(sessionID, launcherOrigin, secret)
	if expectedProof == "" {
		return false
	}
	return hmac.Equal([]byte(trimmedProof), []byte(expectedProof))
}

func AppendLauncherOriginHandoffToBootstrapURL(bootstrapURLFragment string, launcherOrigin string, proof string) (string, error) {
	normalizedOrigin := NormalizeOrigin(launcherOrigin)
	if normalizedOrigin == "" {
		return "", fmt.Errorf("launcher origin must be an absolute http(s) origin")
	}
	trimmedProof := strings.TrimSpace(proof)
	if trimmedProof == "" {
		return "", fmt.Errorf("launcher origin proof is required")
	}
	parsedURL, err := url.Parse(strings.TrimSpace(bootstrapURLFragment))
	if err != nil {
		return "", err
	}
	hash := strings.TrimPrefix(parsedURL.Fragment, "#")
	params, err := url.ParseQuery(hash)
	if err != nil {
		return "", err
	}
	params.Set("lo", normalizedOrigin)
	params.Set("lop", trimmedProof)
	parsedURL.Fragment = params.Encode()
	return parsedURL.String(), nil
}

func formatOriginHost(hostname string) string {
	if strings.Contains(hostname, ":") && !strings.HasPrefix(hostname, "[") {
		return "[" + hostname + "]"
	}
	return hostname
}

func normalizeSessionID(sessionID string) string {
	return strings.TrimSpace(sessionID)
}

func requestClientOrigin(r *http.Request, allowClientOriginHeader bool) string {
	if r == nil || !allowClientOriginHeader {
		return ""
	}
	return NormalizeOrigin(r.Header.Get("Origin"))
}

func requestOriginHost(r *http.Request) string {
	if r == nil {
		return ""
	}
	if host := strings.TrimSpace(r.Host); host != "" {
		return host
	}
	if r.URL == nil {
		return ""
	}
	return strings.TrimSpace(r.URL.Host)
}

func requestOriginScheme(r *http.Request) string {
	if r != nil && r.URL != nil {
		if scheme := strings.TrimSpace(r.URL.Scheme); scheme != "" {
			return scheme
		}
	}
	if r != nil && r.TLS != nil {
		return "https"
	}
	return "http"
}

func requestOriginHostForURL(host string) string {
	parsedHost, parsedPort, err := net.SplitHostPort(host)
	if err != nil {
		return host
	}
	originHost := formatOriginHost(parsedHost)
	if parsedPort == "" {
		return originHost
	}
	return originHost + ":" + parsedPort
}

func (s *store) trust(sessionID string, origin string, exp int64, now int64) error {
	return s.update(func(record storeRecord) (storeRecord, error) {
		pruneStore(record.SessionIDToOrigins, now)
		if record.SessionIDToOrigins[sessionID] == nil {
			record.SessionIDToOrigins[sessionID] = map[string]int64{}
		}
		record.SessionIDToOrigins[sessionID][origin] = exp
		return record, nil
	})
}

func (s *store) refreshSessionExpiry(sessionID string, exp int64, now int64) error {
	return s.update(func(record storeRecord) (storeRecord, error) {
		pruneStore(record.SessionIDToOrigins, now)
		sessionOrigins := record.SessionIDToOrigins[sessionID]
		if len(sessionOrigins) == 0 {
			return record, nil
		}
		for origin, currentExp := range sessionOrigins {
			if currentExp >= exp {
				continue
			}
			sessionOrigins[origin] = exp
		}
		return record, nil
	})
}

func (s *store) isTrusted(sessionID string, origin string, now int64) (bool, error) {
	var trusted bool
	err := s.update(func(record storeRecord) (storeRecord, error) {
		pruneStore(record.SessionIDToOrigins, now)
		sessionOrigins := record.SessionIDToOrigins[sessionID]
		if len(sessionOrigins) > 0 {
			_, trusted = sessionOrigins[origin]
		}
		return record, nil
	})
	return trusted, err
}

func (s *store) update(apply func(storeRecord) (storeRecord, error)) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lockPath := s.path + ".lock"
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		return &StoreUnavailableError{
			Message: fmt.Sprintf("Failed creating trusted frontend origins store directory: %v", err),
		}
	}

	fileLock := flock.New(lockPath)
	if err := fileLock.Lock(); err != nil {
		return &StoreUnavailableError{
			Message: fmt.Sprintf("Failed acquiring trusted frontend origins store lock: %s", lockPath),
		}
	}
	defer fileLock.Close()

	record, err := s.read()
	if err != nil {
		return err
	}
	record, err = apply(record)
	if err != nil {
		return err
	}
	return s.write(record)
}

func (s *store) read() (storeRecord, error) {
	content, err := os.ReadFile(s.path)
	if err != nil {
		return readMissingStoreRecord(err, s.path)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return emptyStoreRecord(), nil
	}
	return decodeStoreRecord(content)
}

func readMissingStoreRecord(err error, path string) (storeRecord, error) {
	if errors.Is(err, os.ErrNotExist) {
		return emptyStoreRecord(), nil
	}
	return storeRecord{}, &StoreUnavailableError{
		Message: fmt.Sprintf("Failed reading trusted frontend origins store: %s", path),
	}
}

func emptyStoreRecord() storeRecord {
	return storeRecord{SessionIDToOrigins: map[string]map[string]int64{}}
}

func decodeStoreRecord(content []byte) (storeRecord, error) {
	var raw any
	if err := json.Unmarshal(content, &raw); err != nil {
		return storeRecord{}, &StoreStateError{Message: "Trusted frontend origins store contains invalid JSON."}
	}
	topLevel, ok := raw.(map[string]any)
	if !ok {
		return storeRecord{}, &StoreStateError{Message: "Trusted frontend origins store must be an object."}
	}

	record := emptyStoreRecord()
	for rawSessionID, rawOrigins := range topLevel {
		sessionID, originMap, err := decodeStoreSessionOrigins(rawSessionID, rawOrigins)
		if err != nil {
			return storeRecord{}, err
		}
		record.SessionIDToOrigins[sessionID] = originMap
	}
	return record, nil
}

func decodeStoreSessionOrigins(rawSessionID string, rawOrigins any) (string, map[string]int64, error) {
	sessionID := normalizeSessionID(rawSessionID)
	if sessionID == "" {
		return "", nil, &StoreStateError{Message: "Trusted frontend origin session keys must be strings."}
	}
	originMapRaw, ok := rawOrigins.(map[string]any)
	if !ok {
		return "", nil, &StoreStateError{Message: "Trusted frontend origin session entries must be objects."}
	}
	originMap, err := decodeStoreOriginMap(originMapRaw)
	if err != nil {
		return "", nil, err
	}
	return sessionID, originMap, nil
}

func decodeStoreOriginMap(originMapRaw map[string]any) (map[string]int64, error) {
	originMap := map[string]int64{}
	for rawOrigin, rawExp := range originMapRaw {
		normalizedOrigin := NormalizeOrigin(rawOrigin)
		if normalizedOrigin == "" {
			return nil, &StoreStateError{Message: "Trusted frontend origin keys must be strings."}
		}
		exp, ok := normalizeJSONInteger(rawExp)
		if !ok {
			return nil, &StoreStateError{Message: "Trusted frontend origin expiry values must be integers."}
		}
		originMap[normalizedOrigin] = exp
	}
	return originMap, nil
}

func (s *store) write(record storeRecord) error {
	if len(record.SessionIDToOrigins) == 0 {
		if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return &StoreUnavailableError{
				Message: fmt.Sprintf("Failed clearing trusted frontend origins store: %s", s.path),
			}
		}
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return &StoreUnavailableError{
			Message: "Failed creating trusted frontend origins store directory.",
		}
	}

	payload := make(map[string]map[string]int64, len(record.SessionIDToOrigins))
	for sessionID, origins := range record.SessionIDToOrigins {
		payload[sessionID] = origins
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return &StoreStateError{Message: fmt.Sprintf("Encode trusted frontend origins store: %v", err)}
	}
	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, content, 0o600); err != nil {
		return &StoreUnavailableError{
			Message: fmt.Sprintf("Failed writing trusted frontend origins store: %s", s.path),
		}
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		_ = os.Remove(tempPath)
		return &StoreUnavailableError{
			Message: fmt.Sprintf("Failed writing trusted frontend origins store: %s", s.path),
		}
	}
	return nil
}

func pruneStore(sessionIDToOrigins map[string]map[string]int64, now int64) {
	for sessionID, origins := range sessionIDToOrigins {
		for origin, exp := range origins {
			if exp <= now {
				delete(origins, origin)
			}
		}
		if len(origins) == 0 {
			delete(sessionIDToOrigins, sessionID)
		}
	}
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
