package frontendorigins

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

const extraFrontendOriginsEnv = "SETTA_FRONTEND_ORIGINS"
const devFrontendPortEnv = "SETTA_DEV_FRONTEND_PORT"
const devFrontendSchemeEnv = "SETTA_DEV_FRONTEND_SCHEME"
const defaultDevFrontendScheme = "http"

func HasTrustedFrontendOrigin(r *http.Request, trustedOrigins *Service, sessionID string) bool {
	if r == nil {
		return false
	}
	if isTrustedFrontendOriginForRequest(r, r.Header.Get("Origin"), trustedOrigins, sessionID) {
		return true
	}
	return isTrustedFrontendOriginForRequest(r, refererOrigin(r.Header.Get("Referer")), trustedOrigins, sessionID)
}

func IsAllowedOriginForRequest(r *http.Request, rawOrigin string, trustedOrigins *Service, sessionID string) bool {
	normalizedOrigin := NormalizeOrigin(rawOrigin)
	if normalizedOrigin == "" {
		return false
	}
	if ResolveRequestOrigin(r, false) == normalizedOrigin {
		return true
	}
	for _, configuredOrigin := range configuredFrontendOriginsForRequest(r) {
		if configuredOrigin == normalizedOrigin {
			return true
		}
	}
	normalizedSessionID := normalizeSessionID(sessionID)
	if trustedOrigins == nil || normalizedSessionID == "" {
		return false
	}
	return trustedOrigins.IsTrustedOrigin(normalizedOrigin, normalizedSessionID)
}

func AllowedWebsocketOriginPatternsForRequest(r *http.Request, trustedOrigins *Service, sessionID string) []string {
	normalizedOrigin := NormalizeOrigin(r.Header.Get("Origin"))
	if normalizedOrigin == "" || !IsAllowedOriginForRequest(r, normalizedOrigin, trustedOrigins, sessionID) {
		return nil
	}
	parsedOrigin, err := url.Parse(normalizedOrigin)
	if err != nil || parsedOrigin.Host == "" {
		return nil
	}
	return []string{
		parsedOrigin.Host,
		parsedOrigin.Scheme + "://" + parsedOrigin.Host,
	}
}

func configuredFrontendOriginsForRequest(r *http.Request) []string {
	collector := newOriginCollector(4)
	if devFrontendPort := strings.TrimSpace(os.Getenv(devFrontendPortEnv)); devFrontendPort != "" {
		for _, rawOrigin := range configuredDevFrontendOrigins(r, devFrontendPort) {
			collector.add(rawOrigin)
		}
	} else {
		collector.add(ResolveRequestOrigin(r, false))
	}

	for _, rawOrigin := range strings.Split(os.Getenv(extraFrontendOriginsEnv), ",") {
		collector.add(rawOrigin)
	}
	return collector.origins
}

func isTrustedFrontendOriginForRequest(r *http.Request, rawOrigin string, trustedOrigins *Service, sessionID string) bool {
	normalizedOrigin := NormalizeOrigin(rawOrigin)
	if normalizedOrigin == "" {
		return false
	}
	for _, configuredOrigin := range configuredFrontendOriginsForRequest(r) {
		if configuredOrigin == normalizedOrigin {
			return true
		}
	}
	normalizedSessionID := normalizeSessionID(sessionID)
	if trustedOrigins == nil || normalizedSessionID == "" {
		return false
	}
	return trustedOrigins.IsTrustedOrigin(normalizedOrigin, normalizedSessionID)
}

func refererOrigin(rawReferer string) string {
	parsedReferer, err := url.Parse(strings.TrimSpace(rawReferer))
	if err != nil || parsedReferer.Scheme == "" || parsedReferer.Host == "" {
		return ""
	}
	return NormalizeOrigin(parsedReferer.Scheme + "://" + parsedReferer.Host)
}

type originCollector struct {
	seen    map[string]struct{}
	origins []string
}

func newOriginCollector(capacity int) *originCollector {
	return &originCollector{
		seen:    map[string]struct{}{},
		origins: make([]string, 0, capacity),
	}
}

func (c *originCollector) add(rawOrigin string) {
	normalizedOrigin := NormalizeOrigin(rawOrigin)
	if normalizedOrigin == "" {
		return
	}
	if _, ok := c.seen[normalizedOrigin]; ok {
		return
	}
	c.seen[normalizedOrigin] = struct{}{}
	c.origins = append(c.origins, normalizedOrigin)
}

func configuredDevFrontendOrigins(r *http.Request, port string) []string {
	scheme := configuredDevFrontendScheme()
	host := configuredDevFrontendHost(r)
	origins := []string{scheme + "://" + formatOriginHost(host) + ":" + port}
	if host == "127.0.0.1" {
		origins = append(origins, scheme+"://localhost:"+port)
	}
	return origins
}

func configuredDevFrontendScheme() string {
	scheme := strings.TrimSpace(strings.ToLower(os.Getenv(devFrontendSchemeEnv)))
	if scheme == "http" || scheme == "https" {
		return scheme
	}
	return defaultDevFrontendScheme
}

func configuredDevFrontendHost(r *http.Request) string {
	requestOrigin := ResolveRequestOrigin(r, false)
	if requestOrigin == "" {
		return "127.0.0.1"
	}
	parsedRequestOrigin, err := url.Parse(requestOrigin)
	if err != nil || parsedRequestOrigin.Hostname() == "" {
		return "127.0.0.1"
	}
	return parsedRequestOrigin.Hostname()
}
