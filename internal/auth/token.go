package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

type BootstrapTokenPayload struct {
	SessionID string
	Exp       int64
	Nonce     string
}

type LaunchIntentTokenPayload struct {
	SessionID string
	Exp       int64
	Nonce     string
	Purpose   string
}

type AuthCookiePayload struct {
	SessionID string
	Exp       int64
}

type NonceTracker struct {
	mu       sync.Mutex
	consumed map[string]map[string]int64
}

func NewNonceTracker() *NonceTracker {
	return &NonceTracker{
		consumed: make(map[string]map[string]int64),
	}
}

func (t *NonceTracker) IsConsumed(sessionID string, nonce string, now int64) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.pruneLocked(sessionID, now)
	if len(t.consumed[sessionID]) == 0 {
		return false
	}
	_, ok := t.consumed[sessionID][nonce]
	return ok
}

func (t *NonceTracker) Consume(sessionID string, nonce string, exp int64, now int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.pruneLocked(sessionID, now)
	if _, ok := t.consumed[sessionID]; !ok {
		t.consumed[sessionID] = make(map[string]int64)
	}
	t.consumed[sessionID][nonce] = exp
}

func (t *NonceTracker) pruneLocked(sessionID string, now int64) {
	sessionNonces, ok := t.consumed[sessionID]
	if !ok {
		return
	}
	for nonce, exp := range sessionNonces {
		if exp <= now {
			delete(sessionNonces, nonce)
		}
	}
	if len(sessionNonces) == 0 {
		delete(t.consumed, sessionID)
	}
}

type BootstrapTokenManager struct {
	ttlSeconds   int64
	nonceTracker *NonceTracker
}

type LaunchIntentTokenManager struct {
	ttlSeconds int64
}

func NewBootstrapTokenManager(ttl time.Duration, nonceTracker *NonceTracker) *BootstrapTokenManager {
	if nonceTracker == nil {
		nonceTracker = NewNonceTracker()
	}
	return &BootstrapTokenManager{
		ttlSeconds:   int64(ttl / time.Second),
		nonceTracker: nonceTracker,
	}
}

func NewLaunchIntentTokenManager(ttl time.Duration) *LaunchIntentTokenManager {
	return &LaunchIntentTokenManager{
		ttlSeconds: int64(ttl / time.Second),
	}
}

func (m *BootstrapTokenManager) Mint(sessionID string, secret []byte, now time.Time) (string, error) {
	if strings.TrimSpace(sessionID) == "" {
		return "", errors.New("session id is required")
	}
	if len(secret) == 0 {
		return "", errors.New("secret is required")
	}

	issuedAt := effectiveNow(now)
	nonce, err := randomToken(16)
	if err != nil {
		return "", fmt.Errorf("generate bootstrap nonce: %w", err)
	}

	payload := BootstrapTokenPayload{
		SessionID: strings.TrimSpace(sessionID),
		Exp:       issuedAt.Unix() + m.ttlSeconds,
		Nonce:     nonce,
	}
	return encodeSignedToken(payload.bootstrapMap(), secret)
}

func (m *LaunchIntentTokenManager) Mint(sessionID string, secret []byte, now time.Time) (string, int64, error) {
	if strings.TrimSpace(sessionID) == "" {
		return "", 0, errors.New("session id is required")
	}
	if len(secret) == 0 {
		return "", 0, errors.New("secret is required")
	}

	issuedAt := effectiveNow(now)
	nonce, err := randomToken(16)
	if err != nil {
		return "", 0, fmt.Errorf("generate launch intent nonce: %w", err)
	}

	payload := LaunchIntentTokenPayload{
		SessionID: strings.TrimSpace(sessionID),
		Exp:       issuedAt.Unix() + m.ttlSeconds,
		Nonce:     nonce,
		Purpose:   "launch_intent",
	}
	token, err := encodeSignedToken(payload.launchIntentMap(), secret)
	if err != nil {
		return "", 0, err
	}
	return token, payload.Exp, nil
}

func (m *BootstrapTokenManager) Consume(token string, secret []byte, now time.Time) (BootstrapTokenPayload, error) {
	payload, err := m.Validate(token, secret, now)
	if err != nil {
		return BootstrapTokenPayload{}, err
	}

	timestamp := effectiveNow(now).Unix()
	if m.nonceTracker.IsConsumed(payload.SessionID, payload.Nonce, timestamp) {
		return BootstrapTokenPayload{}, errors.New("bootstrap token has already been consumed")
	}
	m.nonceTracker.Consume(payload.SessionID, payload.Nonce, payload.Exp, timestamp)
	return payload, nil
}

func (m *BootstrapTokenManager) Validate(token string, secret []byte, now time.Time) (BootstrapTokenPayload, error) {
	payloadBytes, signature, err := decodeTokenParts(token)
	if err != nil {
		return BootstrapTokenPayload{}, err
	}

	var payload struct {
		SessionID string `json:"sessionId"`
		Exp       int64  `json:"exp"`
		Nonce     string `json:"nonce"`
		Purpose   string `json:"purpose"`
	}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return BootstrapTokenPayload{}, errors.New("invalid bootstrap token payload")
	}
	if strings.TrimSpace(payload.SessionID) == "" ||
		payload.Exp <= 0 ||
		strings.TrimSpace(payload.Nonce) == "" ||
		strings.TrimSpace(payload.Purpose) != "" {
		return BootstrapTokenPayload{}, errors.New("invalid bootstrap token payload")
	}

	expected, err := signPayload(payloadBytes, secret)
	if err != nil {
		return BootstrapTokenPayload{}, err
	}
	if !hmac.Equal(signature, expected) {
		return BootstrapTokenPayload{}, errors.New("invalid bootstrap token signature")
	}
	if effectiveNow(now).Unix() >= payload.Exp {
		return BootstrapTokenPayload{}, errors.New("bootstrap token has expired")
	}

	return BootstrapTokenPayload{
		SessionID: payload.SessionID,
		Exp:       payload.Exp,
		Nonce:     payload.Nonce,
	}, nil
}

func (m *LaunchIntentTokenManager) Validate(token string, secret []byte, now time.Time) (LaunchIntentTokenPayload, error) {
	payloadBytes, signature, err := decodeTokenParts(token)
	if err != nil {
		return LaunchIntentTokenPayload{}, err
	}

	var payload struct {
		SessionID string `json:"sessionId"`
		Exp       int64  `json:"exp"`
		Nonce     string `json:"nonce"`
		Purpose   string `json:"purpose"`
	}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return LaunchIntentTokenPayload{}, errors.New("invalid launch intent token payload")
	}
	if strings.TrimSpace(payload.SessionID) == "" ||
		payload.Exp <= 0 ||
		strings.TrimSpace(payload.Nonce) == "" ||
		strings.TrimSpace(payload.Purpose) != "launch_intent" {
		return LaunchIntentTokenPayload{}, errors.New("invalid launch intent token payload")
	}

	expected, err := signPayload(payloadBytes, secret)
	if err != nil {
		return LaunchIntentTokenPayload{}, err
	}
	if !hmac.Equal(signature, expected) {
		return LaunchIntentTokenPayload{}, errors.New("invalid launch intent token signature")
	}
	if effectiveNow(now).Unix() >= payload.Exp {
		return LaunchIntentTokenPayload{}, errors.New("launch intent token has expired")
	}

	return LaunchIntentTokenPayload{
		SessionID: payload.SessionID,
		Exp:       payload.Exp,
		Nonce:     payload.Nonce,
		Purpose:   payload.Purpose,
	}, nil
}

type AuthCookieManager struct {
	ttlSeconds int64
}

func NewAuthCookieManager(ttl time.Duration) *AuthCookieManager {
	return &AuthCookieManager{
		ttlSeconds: int64(ttl / time.Second),
	}
}

func (m *AuthCookieManager) Mint(sessionID string, secret []byte, now time.Time) (string, error) {
	if strings.TrimSpace(sessionID) == "" {
		return "", errors.New("session id is required")
	}
	if len(secret) == 0 {
		return "", errors.New("secret is required")
	}

	payload := AuthCookiePayload{
		SessionID: strings.TrimSpace(sessionID),
		Exp:       effectiveNow(now).Unix() + m.ttlSeconds,
	}
	return encodeSignedToken(payload.cookieMap(), secret)
}

func (m *AuthCookieManager) Validate(token string, secret []byte, now time.Time) (AuthCookiePayload, error) {
	payloadBytes, signature, err := decodeTokenParts(token)
	if err != nil {
		return AuthCookiePayload{}, err
	}

	var payload struct {
		SessionID string `json:"sessionId"`
		Exp       int64  `json:"exp"`
	}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return AuthCookiePayload{}, errors.New("invalid auth cookie payload")
	}
	if strings.TrimSpace(payload.SessionID) == "" || payload.Exp <= 0 {
		return AuthCookiePayload{}, errors.New("invalid auth cookie payload")
	}

	expected, err := signPayload(payloadBytes, secret)
	if err != nil {
		return AuthCookiePayload{}, err
	}
	if !hmac.Equal(signature, expected) {
		return AuthCookiePayload{}, errors.New("invalid auth cookie signature")
	}
	if effectiveNow(now).Unix() >= payload.Exp {
		return AuthCookiePayload{}, errors.New("auth cookie has expired")
	}

	return AuthCookiePayload{
		SessionID: payload.SessionID,
		Exp:       payload.Exp,
	}, nil
}

func (p BootstrapTokenPayload) bootstrapMap() map[string]any {
	return map[string]any{
		"exp":       p.Exp,
		"nonce":     p.Nonce,
		"sessionId": p.SessionID,
	}
}

func (p LaunchIntentTokenPayload) launchIntentMap() map[string]any {
	return map[string]any{
		"exp":       p.Exp,
		"nonce":     p.Nonce,
		"purpose":   p.Purpose,
		"sessionId": p.SessionID,
	}
}

func (p AuthCookiePayload) cookieMap() map[string]any {
	return map[string]any{
		"exp":       p.Exp,
		"sessionId": p.SessionID,
	}
}

func encodeSignedToken(payload map[string]any, secret []byte) (string, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode token payload: %w", err)
	}

	signature, err := signPayload(payloadBytes, secret)
	if err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(payloadBytes) + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func signPayload(payload []byte, secret []byte) ([]byte, error) {
	if len(secret) == 0 {
		return nil, errors.New("secret is required")
	}
	digest := hmac.New(sha256.New, secret)
	if _, err := digest.Write(payload); err != nil {
		return nil, fmt.Errorf("sign token payload: %w", err)
	}
	return digest.Sum(nil), nil
}

func decodeTokenParts(token string) ([]byte, []byte, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, nil, errors.New("invalid token format")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, nil, errors.New("invalid token encoding")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, nil, errors.New("invalid token encoding")
	}
	return payloadBytes, signature, nil
}

func randomToken(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func effectiveNow(now time.Time) time.Time {
	if now.IsZero() {
		return time.Now().UTC()
	}
	return now.UTC()
}
