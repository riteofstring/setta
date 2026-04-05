package httpapi

import (
	"net/http"
	"strings"

	"setta/internal/auth"
	"setta/internal/frontendorigins"
)

const corsAllowMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const corsDefaultAllowHeaders = "Authorization, Content-Type, X-Share-Session-Id"

func corsMiddleware(authService *auth.Service, trustedOrigins *frontendorigins.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := frontendorigins.NormalizeOrigin(r.Header.Get("Origin"))
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}

			if !frontendorigins.IsAllowedOriginForRequest(r, origin, trustedOrigins, currentSessionID(authService)) {
				next.ServeHTTP(w, r)
				return
			}

			headers := w.Header()
			appendVaryHeader(headers, "Origin")
			headers.Set("Access-Control-Allow-Origin", origin)
			headers.Set("Access-Control-Allow-Credentials", "true")

			if r.Method == http.MethodOptions && strings.TrimSpace(r.Header.Get("Access-Control-Request-Method")) != "" {
				appendVaryHeader(headers, "Access-Control-Request-Method")
				appendVaryHeader(headers, "Access-Control-Request-Headers")
				headers.Set("Access-Control-Allow-Methods", corsAllowMethods)
				requestHeaders := strings.TrimSpace(r.Header.Get("Access-Control-Request-Headers"))
				if requestHeaders == "" {
					requestHeaders = corsDefaultAllowHeaders
				}
				headers.Set("Access-Control-Allow-Headers", requestHeaders)
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func currentSessionID(authService *auth.Service) string {
	if authService == nil {
		return ""
	}
	currentSession, ok := authService.CurrentSession()
	if !ok {
		return ""
	}
	return currentSession.Metadata.ID
}

func appendVaryHeader(headers http.Header, value string) {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return
	}
	existing := headers.Values("Vary")
	for _, headerValue := range existing {
		for _, part := range strings.Split(headerValue, ",") {
			if strings.EqualFold(strings.TrimSpace(part), trimmedValue) {
				return
			}
		}
	}
	headers.Add("Vary", trimmedValue)
}
