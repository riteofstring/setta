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
	seen := map[string]struct{}{}
	origins := make([]string, 0, 4)
	addOrigin := func(rawOrigin string) {
		normalizedOrigin := NormalizeOrigin(rawOrigin)
		if normalizedOrigin == "" {
			return
		}
		if _, ok := seen[normalizedOrigin]; ok {
			return
		}
		seen[normalizedOrigin] = struct{}{}
		origins = append(origins, normalizedOrigin)
	}

	if devFrontendPort := strings.TrimSpace(os.Getenv(devFrontendPortEnv)); devFrontendPort != "" {
		scheme := strings.TrimSpace(strings.ToLower(os.Getenv(devFrontendSchemeEnv)))
		if scheme == "" {
			scheme = defaultDevFrontendScheme
		}
		if scheme != "http" && scheme != "https" {
			scheme = defaultDevFrontendScheme
		}

		requestOrigin := ResolveRequestOrigin(r, false)
		host := "127.0.0.1"
		if requestOrigin != "" {
			if parsedRequestOrigin, err := url.Parse(requestOrigin); err == nil && parsedRequestOrigin.Hostname() != "" {
				host = parsedRequestOrigin.Hostname()
			}
		}

		addOrigin(scheme + "://" + formatOriginHost(host) + ":" + devFrontendPort)
		if host == "127.0.0.1" {
			addOrigin(scheme + "://localhost:" + devFrontendPort)
		}
	} else {
		addOrigin(ResolveRequestOrigin(r, false))
	}

	for _, rawOrigin := range strings.Split(os.Getenv(extraFrontendOriginsEnv), ",") {
		addOrigin(rawOrigin)
	}
	return origins
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
