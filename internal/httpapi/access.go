package httpapi

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
)

type RuntimeEndpointAccessConfig struct {
	AllowedHTTPSOrigins []string
	AllowedRequestHosts []string
}

type RuntimeEndpointAccessPolicy struct {
	allowedHTTPSOrigins map[string]struct{}
	allowedRequestHosts map[string]struct{}
}

func NewRuntimeEndpointAccessPolicy(config RuntimeEndpointAccessConfig) (RuntimeEndpointAccessPolicy, error) {
	allowedHTTPSOrigins := map[string]struct{}{}
	for _, rawOrigin := range config.AllowedHTTPSOrigins {
		origin, err := normalizeHTTPSOrigin(rawOrigin)
		if err != nil {
			return RuntimeEndpointAccessPolicy{}, err
		}
		allowedHTTPSOrigins[origin] = struct{}{}
	}

	allowedRequestHosts := map[string]struct{}{}
	for _, rawHost := range config.AllowedRequestHosts {
		host, err := normalizeRequestHost(rawHost)
		if err != nil {
			return RuntimeEndpointAccessPolicy{}, err
		}
		allowedRequestHosts[host] = struct{}{}
	}

	return RuntimeEndpointAccessPolicy{
		allowedHTTPSOrigins: allowedHTTPSOrigins,
		allowedRequestHosts: allowedRequestHosts,
	}, nil
}

func ValidateRuntimeEndpointAccess(config RuntimeEndpointAccessConfig) error {
	_, err := NewRuntimeEndpointAccessPolicy(config)
	return err
}

func (policy RuntimeEndpointAccessPolicy) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if !policy.requestHostAllowed(request.Host) {
			writeError(response, http.StatusForbidden, "forbidden_host", "request host is not allowed")
			return
		}

		origin := request.Header.Get("Origin")
		if origin != "" && len(policy.allowedHTTPSOrigins) > 0 {
			allowedOrigin, ok := policy.allowedHTTPSOrigin(origin)
			if !ok {
				writeError(response, http.StatusForbidden, "forbidden_origin", "request origin is not allowed")
				return
			}
			writeRuntimeAccessHeaders(response.Header(), allowedOrigin)
			if request.Method == http.MethodOptions {
				policy.handlePreflight(response, request)
				return
			}
		}

		next.ServeHTTP(response, request)
	})
}

func (policy RuntimeEndpointAccessPolicy) requestHostAllowed(rawHost string) bool {
	if len(policy.allowedRequestHosts) == 0 {
		return true
	}
	host, err := normalizeRequestHost(rawHost)
	if err != nil {
		return false
	}
	_, ok := policy.allowedRequestHosts[host]
	return ok
}

func (policy RuntimeEndpointAccessPolicy) allowedHTTPSOrigin(rawOrigin string) (string, bool) {
	if len(policy.allowedHTTPSOrigins) == 0 {
		return "", false
	}
	origin, err := normalizeHTTPSOrigin(rawOrigin)
	if err != nil {
		return "", false
	}
	_, ok := policy.allowedHTTPSOrigins[origin]
	return origin, ok
}

func (policy RuntimeEndpointAccessPolicy) handlePreflight(response http.ResponseWriter, request *http.Request) {
	requestedMethod := request.Header.Get("Access-Control-Request-Method")
	if requestedMethod == "" {
		writeError(response, http.StatusBadRequest, "invalid_preflight_request", "preflight request method is required")
		return
	}
	if !endpointMethodAllowed(request.URL.Path, requestedMethod) {
		writeError(response, http.StatusMethodNotAllowed, "preflight_method_not_allowed", "preflight request method is not allowed")
		return
	}
	response.Header().Set("Access-Control-Allow-Methods", requestedMethod)
	response.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID")
	response.WriteHeader(http.StatusNoContent)
}

func writeRuntimeAccessHeaders(header http.Header, origin string) {
	header.Add("Vary", "Origin")
	header.Set("Access-Control-Allow-Origin", origin)
	header.Set("Access-Control-Allow-Credentials", "true")
	header.Set("Access-Control-Expose-Headers", "Content-Type")
}

func normalizeHTTPSOrigin(rawOrigin string) (string, error) {
	origin := strings.TrimSpace(rawOrigin)
	parsed, err := url.Parse(origin)
	if err != nil {
		return "", fmt.Errorf("runtime endpoint origin is invalid: %w", err)
	}
	if parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil ||
		parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("runtime endpoint origin must be an https origin without path or query: %s", rawOrigin)
	}
	host, err := normalizeAuthority(parsed.Host)
	if err != nil {
		return "", fmt.Errorf("runtime endpoint origin host is invalid: %w", err)
	}
	return "https://" + host, nil
}

func normalizeRequestHost(rawHost string) (string, error) {
	host := strings.TrimSpace(rawHost)
	if host == "" || strings.ContainsAny(host, "/ \t\r\n") {
		return "", fmt.Errorf("runtime endpoint host is invalid: %s", rawHost)
	}
	if strings.Contains(host, "://") || strings.ContainsAny(host, "?#@") {
		return "", fmt.Errorf("runtime endpoint host must be a host or host:port: %s", rawHost)
	}
	return normalizeAuthority(host)
}

func normalizeAuthority(rawHost string) (string, error) {
	if rawHost == "" {
		return "", fmt.Errorf("host is empty")
	}
	host, port, err := net.SplitHostPort(rawHost)
	if err == nil {
		return normalizeHostPort(host, port)
	}
	if strings.Contains(rawHost, ":") && !strings.HasPrefix(rawHost, "[") {
		return "", fmt.Errorf("IPv6 hosts must be bracketed")
	}
	bracketedIPv6 := strings.HasPrefix(rawHost, "[") && strings.HasSuffix(rawHost, "]")
	host = strings.TrimPrefix(strings.TrimSuffix(rawHost, "]"), "[")
	host = normalizeHostName(host)
	if host == "" {
		return "", fmt.Errorf("host is empty")
	}
	if bracketedIPv6 {
		return normalizeBracketedIPv6(host)
	}
	return host, nil
}

func normalizeHostPort(host string, port string) (string, error) {
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return "", fmt.Errorf("port is out of range")
	}
	host = normalizeHostName(host)
	if host == "" {
		return "", fmt.Errorf("host is empty")
	}
	if portNumber == 443 {
		return host, nil
	}
	return net.JoinHostPort(host, port), nil
}

func normalizeBracketedIPv6(host string) (string, error) {
	addr, err := netip.ParseAddr(host)
	if err != nil || !addr.Is6() {
		return "", fmt.Errorf("bracketed host must be IPv6")
	}
	return "[" + addr.String() + "]", nil
}

func normalizeHostName(host string) string {
	return strings.ToLower(strings.TrimSpace(host))
}
