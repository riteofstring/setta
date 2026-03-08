package auth

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"setta/internal/config"
)

const (
	defaultAuthCookieName    = "setta_auth"
	defaultBootstrapTokenTTL = 10 * time.Minute
	defaultAuthCookieTTL     = 12 * time.Hour
	defaultAuthRefreshWindow = time.Hour

	DefaultAuthCookieName    = defaultAuthCookieName
	DefaultBootstrapTokenTTL = defaultBootstrapTokenTTL
	DefaultAuthCookieTTL     = defaultAuthCookieTTL
)

var (
	ErrMissingToken          = errors.New("missing token")
	ErrMissingCurrentSession = errors.New("missing current session")
	ErrInvalidBootstrapToken = errors.New("invalid bootstrap token")
	ErrInvalidAuthCookie     = errors.New("invalid auth cookie")
)

type Settings struct {
	CookieBaseName      string
	CookieTTL           time.Duration
	CookieRefreshWindow time.Duration
	CookieSameSite      http.SameSite
	CookieSecure        bool
	BootstrapTokenTTL   time.Duration
}

type Options struct {
	Mode              config.Mode
	RuntimeRoot       string
	ProfileCookieName string
	EnvLookup         func(string) (string, bool)
}

type Service struct {
	mode            config.Mode
	settings        Settings
	currentSession  *CurrentSession
	bootstrapTokens *BootstrapTokenManager
	authCookies     *AuthCookieManager
}

func NewService(opts Options) (*Service, error) {
	settings := defaultSettings(opts.ProfileCookieName, opts.EnvLookup)

	var currentSession *CurrentSession
	var err error
	if modeSupportsSessionAuth(opts.Mode) {
		currentSession, err = LoadCurrentSession(LoadCurrentSessionOptions{
			RuntimeRoot: opts.RuntimeRoot,
			EnvLookup:   opts.EnvLookup,
		})
		if err != nil {
			return nil, err
		}
	}

	return &Service{
		mode:            opts.Mode,
		settings:        settings,
		currentSession:  currentSession,
		bootstrapTokens: NewBootstrapTokenManager(settings.BootstrapTokenTTL, NewNonceTracker()),
		authCookies:     NewAuthCookieManager(settings.CookieTTL),
	}, nil
}

func (s *Service) Enabled() bool {
	return s != nil && s.mode == config.ModeIDE
}

func (s *Service) SupportsSessionAuth() bool {
	if s == nil {
		return false
	}
	return modeSupportsSessionAuth(s.mode)
}

func (s *Service) AuthCookieBaseName() string {
	if s == nil {
		return defaultAuthCookieName
	}
	return s.settings.CookieBaseName
}

func (s *Service) CurrentSession() (*CurrentSession, bool) {
	if s == nil || s.currentSession == nil {
		return nil, false
	}
	return s.currentSession, true
}

func (s *Service) CookieName(sessionID string) (string, error) {
	return authCookieName(s.AuthCookieBaseName(), sessionID)
}

func (s *Service) ReadAuthCookie(r *http.Request) (string, bool) {
	currentSession, ok := s.CurrentSession()
	if !ok {
		return "", false
	}

	cookieName, err := s.CookieName(currentSession.Metadata.ID)
	if err != nil {
		return "", false
	}
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return "", false
	}
	return cookie.Value, true
}

func (s *Service) MintBootstrapToken(now time.Time) (string, error) {
	currentSession, err := s.requireCurrentSession()
	if err != nil {
		return "", err
	}
	return s.bootstrapTokens.Mint(currentSession.Metadata.ID, currentSession.Secret, now)
}

func (s *Service) ConsumeBootstrapToken(token string, now time.Time) (RequestInfo, error) {
	if strings.TrimSpace(token) == "" {
		return RequestInfo{}, ErrMissingToken
	}

	currentSession, err := s.requireCurrentSession()
	if err != nil {
		return RequestInfo{}, err
	}

	payload, err := s.bootstrapTokens.Consume(token, currentSession.Secret, now)
	if err != nil || payload.SessionID != currentSession.Metadata.ID {
		return RequestInfo{}, ErrInvalidBootstrapToken
	}
	return requestInfoFromSession(currentSession, AuthSourceBootstrap, payload.Exp), nil
}

func (s *Service) MintAuthCookie(now time.Time) (string, AuthCookiePayload, error) {
	currentSession, err := s.requireCurrentSession()
	if err != nil {
		return "", AuthCookiePayload{}, err
	}

	token, err := s.authCookies.Mint(currentSession.Metadata.ID, currentSession.Secret, now)
	if err != nil {
		return "", AuthCookiePayload{}, err
	}
	payload, err := s.authCookies.Validate(token, currentSession.Secret, now)
	if err != nil {
		return "", AuthCookiePayload{}, err
	}
	return token, payload, nil
}

func (s *Service) ValidateAuthCookie(token string, now time.Time) (RequestInfo, error) {
	if strings.TrimSpace(token) == "" {
		return RequestInfo{}, ErrMissingToken
	}

	currentSession, err := s.requireCurrentSession()
	if err != nil {
		return RequestInfo{}, err
	}

	payload, err := s.authCookies.Validate(token, currentSession.Secret, now)
	if err != nil || payload.SessionID != currentSession.Metadata.ID {
		return RequestInfo{}, ErrInvalidAuthCookie
	}
	return requestInfoFromSession(currentSession, AuthSourceCookie, payload.Exp), nil
}

func (s *Service) ShouldRefreshAuthCookie(requestInfo RequestInfo, now time.Time) bool {
	if s == nil || requestInfo.Source != AuthSourceCookie || requestInfo.ExpiresAt.IsZero() {
		return false
	}

	remaining := requestInfo.ExpiresAt.Sub(effectiveNow(now))
	return remaining <= s.settings.CookieRefreshWindow
}

func (s *Service) RefreshAuthCookie(w http.ResponseWriter, r *http.Request, now time.Time) (RequestInfo, error) {
	currentSession, err := s.requireCurrentSession()
	if err != nil {
		return RequestInfo{}, err
	}

	token, payload, err := s.MintAuthCookie(now)
	if err != nil {
		return RequestInfo{}, err
	}
	if err := s.SetAuthCookie(w, r, token); err != nil {
		return RequestInfo{}, err
	}
	return requestInfoFromSession(currentSession, AuthSourceCookie, payload.Exp), nil
}

func (s *Service) SetAuthCookie(w http.ResponseWriter, r *http.Request, token string) error {
	currentSession, err := s.requireCurrentSession()
	if err != nil {
		return err
	}

	cookieName, err := s.CookieName(currentSession.Metadata.ID)
	if err != nil {
		return err
	}

	secure := s.settings.CookieSecure
	if !secure && isRequestSecure(r) {
		secure = true
	}

	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(s.settings.CookieTTL / time.Second),
		HttpOnly: true,
		SameSite: s.settings.CookieSameSite,
		Secure:   secure,
	})
	return nil
}

func ExtractBearerToken(headers http.Header) string {
	rawAuthorization := strings.TrimSpace(headers.Get("Authorization"))
	if rawAuthorization == "" {
		return ""
	}

	scheme, token, found := strings.Cut(rawAuthorization, " ")
	if !found || !strings.EqualFold(strings.TrimSpace(scheme), "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

func defaultSettings(profileCookieName string, envLookup func(string) (string, bool)) Settings {
	cookieName := profileCookieName
	if envLookup == nil {
		envLookup = func(string) (string, bool) { return "", false }
	}
	if envValue := lookupTrimmed(envLookup, "SETTA_AUTH_COOKIE_NAME"); envValue != "" {
		cookieName = envValue
	}

	return Settings{
		CookieBaseName:      normalizeCookieName(cookieName, defaultAuthCookieName),
		CookieTTL:           defaultAuthCookieTTL,
		CookieRefreshWindow: defaultAuthRefreshWindow,
		CookieSameSite:      http.SameSiteLaxMode,
		CookieSecure:        false,
		BootstrapTokenTTL:   defaultBootstrapTokenTTL,
	}
}

func normalizeCookieName(raw string, fallback string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return fallback
	}

	var builder strings.Builder
	for _, ch := range trimmed {
		if isHTTPTokenChar(ch) {
			builder.WriteRune(ch)
			continue
		}
		builder.WriteByte('_')
	}
	if builder.Len() == 0 {
		return fallback
	}
	return builder.String()
}

func NormalizeCookieBaseName(raw string) string {
	return normalizeCookieName(raw, defaultAuthCookieName)
}

func CookieName(baseName string, sessionID string) (string, error) {
	return authCookieName(NormalizeCookieBaseName(baseName), sessionID)
}

func isHTTPTokenChar(ch rune) bool {
	if ch < 0x21 || ch > 0x7e {
		return false
	}
	switch ch {
	case '(', ')', '<', '>', '@', ',', ';', ':', '\\', '"', '/', '[', ']', '?', '=', '{', '}', ' ', '\t':
		return false
	default:
		return true
	}
}

func authCookieName(baseName string, sessionID string) (string, error) {
	trimmedSessionID := strings.TrimSpace(sessionID)
	if trimmedSessionID == "" {
		return "", errors.New("session id is required")
	}
	return baseName + "_" + trimmedSessionID, nil
}

func isRequestSecure(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(r.URL.Scheme), "https") {
		return true
	}
	forwardedProto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if forwardedProto == "" {
		return false
	}
	firstValue, _, _ := strings.Cut(forwardedProto, ",")
	return strings.EqualFold(strings.TrimSpace(firstValue), "https")
}

func requestInfoFromSession(currentSession *CurrentSession, source AuthSource, exp int64) RequestInfo {
	requestInfo := RequestInfo{
		SessionID: currentSession.Metadata.ID,
		Session:   currentSession.Metadata,
		Source:    source,
	}
	if exp > 0 {
		requestInfo.ExpiresAt = time.Unix(exp, 0).UTC()
	}
	return requestInfo
}

func (s *Service) requireCurrentSession() (*CurrentSession, error) {
	if s == nil || s.currentSession == nil {
		return nil, ErrMissingCurrentSession
	}
	return s.currentSession, nil
}

func modeSupportsSessionAuth(mode config.Mode) bool {
	switch mode {
	case config.ModeShare, config.ModeApp:
		return false
	default:
		return true
	}
}
