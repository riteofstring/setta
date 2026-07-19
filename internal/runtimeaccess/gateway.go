package runtimeaccess

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"setta/internal/runtimeprovider"
)

// AuthorizationOutcome is the exhaustive result of authenticating a client
// before a private provider connection is opened.
type AuthorizationOutcome string

const (
	AuthorizationAllowed      AuthorizationOutcome = "allowed"
	AuthorizationUnauthorized AuthorizationOutcome = "unauthorized"
	AuthorizationRevoked      AuthorizationOutcome = "revoked"
	AuthorizationSuspended    AuthorizationOutcome = "suspended"
	AuthorizationRateLimited  AuthorizationOutcome = "rate_limited"
)

// ClientAuthorization binds an allowed client to exactly one managed runtime.
// RuntimeName must be empty for denied outcomes.
type ClientAuthorization struct {
	Outcome     AuthorizationOutcome
	RuntimeName string
	// Invalidated is closed by the authorization authority when this grant is
	// revoked or suspended. Gateways use it to cancel established streaming
	// requests without polling. It may be nil for non-streaming or immutable
	// proof-of-concept grants.
	Invalidated <-chan struct{}
}

// ClientAuthorizer validates a Setta client credential without contacting the
// runtime provider.
type ClientAuthorizer interface {
	AuthorizeClient(context.Context, string) (ClientAuthorization, error)
}

// RuntimeRoute contains the inner HTTP credential and provider-confined
// transport for one managed runtime. Provider credentials belong inside
// Transport and must never be returned in this structure as header values.
type RuntimeRoute struct {
	RuntimeName       string
	UpstreamAuthority string
	RuntimeCredential string
	Transport         http.RoundTripper
}

// RuntimeRouteResolver obtains current routing material after the client has
// been authorized. Implementations should resolve runtime credentials on each
// request so rotation does not require a gateway restart.
type RuntimeRouteResolver interface {
	ResolveRuntimeRoute(context.Context, string) (RuntimeRoute, error)
}

// Gateway is the non-deployable Phase 3 routing core. A production server must
// still provide TLS, trusted client authorization, rate limiting, credential
// storage, observability, and active-stream revocation.
type Gateway struct {
	authorizer ClientAuthorizer
	routes     RuntimeRouteResolver
}

// NewGateway constructs the private-access routing core.
func NewGateway(authorizer ClientAuthorizer, routes RuntimeRouteResolver) (*Gateway, error) {
	if authorizer == nil {
		return nil, fmt.Errorf("client authorizer is required")
	}
	if routes == nil {
		return nil, fmt.Errorf("runtime route resolver is required")
	}
	return &Gateway{authorizer: authorizer, routes: routes}, nil
}

func (gateway *Gateway) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	credential, ok := bearerCredential(request.Header.Values("Authorization"))
	if !ok {
		writeGatewayError(response, http.StatusUnauthorized, "unauthorized")
		return
	}

	authorization, err := gateway.authorizer.AuthorizeClient(request.Context(), credential)
	if err != nil {
		writeGatewayError(response, http.StatusServiceUnavailable, "access_check_unavailable")
		return
	}
	status, code, allowed := authorizationResult(authorization)
	if !allowed {
		writeGatewayError(response, status, code)
		return
	}
	requestContext, cancel, valid := authorizationContext(request.Context(), authorization.Invalidated)
	if !valid {
		writeGatewayError(response, http.StatusUnauthorized, "revoked")
		return
	}
	defer cancel()
	if request.Method == http.MethodConnect || isProtocolUpgrade(request.Header) {
		writeGatewayError(response, http.StatusNotImplemented, "protocol_upgrade_not_implemented")
		return
	}

	route, err := gateway.routes.ResolveRuntimeRoute(requestContext, authorization.RuntimeName)
	if err != nil {
		writeGatewayError(response, http.StatusBadGateway, "runtime_route_unavailable")
		return
	}
	if err := validateRuntimeRoute(route, authorization.RuntimeName); err != nil {
		writeGatewayError(response, http.StatusInternalServerError, "invalid_runtime_route")
		return
	}

	upstreamRequest := request.Clone(requestContext)
	upstreamRequest.RequestURI = ""
	upstreamRequest.URL = cloneURL(request.URL)
	upstreamRequest.URL.Scheme = "http"
	upstreamRequest.URL.Host = route.UpstreamAuthority
	upstreamRequest.Host = route.UpstreamAuthority
	upstreamRequest.Header = request.Header.Clone()
	stripUntrustedRequestHeaders(upstreamRequest.Header)
	upstreamRequest.Header.Set("Authorization", "Bearer "+route.RuntimeCredential)

	upstreamResponse, err := route.Transport.RoundTrip(upstreamRequest)
	if err != nil {
		writeGatewayError(response, http.StatusBadGateway, "runtime_unavailable")
		return
	}
	defer upstreamResponse.Body.Close()

	copyResponseHeaders(response.Header(), upstreamResponse.Header)
	response.WriteHeader(upstreamResponse.StatusCode)
	streamResponse(response, upstreamResponse)
}

func authorizationContext(
	parent context.Context,
	invalidated <-chan struct{},
) (context.Context, context.CancelFunc, bool) {
	ctx, cancel := context.WithCancel(parent)
	if invalidated == nil {
		return ctx, cancel, true
	}
	select {
	case <-invalidated:
		cancel()
		return ctx, cancel, false
	default:
	}
	go func() {
		select {
		case <-invalidated:
			cancel()
		case <-ctx.Done():
		}
	}()
	return ctx, cancel, true
}

func authorizationResult(authorization ClientAuthorization) (int, string, bool) {
	switch authorization.Outcome {
	case AuthorizationAllowed:
		if runtimeprovider.ValidateManagedName(authorization.RuntimeName) != nil {
			return http.StatusInternalServerError, "invalid_client_authorization", false
		}
		return 0, "", true
	case AuthorizationUnauthorized:
		return http.StatusUnauthorized, "unauthorized", false
	case AuthorizationRevoked:
		return http.StatusUnauthorized, "revoked", false
	case AuthorizationSuspended:
		return http.StatusForbidden, "suspended", false
	case AuthorizationRateLimited:
		return http.StatusTooManyRequests, "rate_limited", false
	default:
		return http.StatusInternalServerError, "invalid_client_authorization", false
	}
}

func bearerCredential(values []string) (string, bool) {
	if len(values) != 1 {
		return "", false
	}
	scheme, credential, found := strings.Cut(values[0], " ")
	if !found || !strings.EqualFold(scheme, "Bearer") || credential == "" ||
		strings.ContainsAny(credential, " \t\r\n") {
		return "", false
	}
	return credential, true
}

func validateRuntimeRoute(route RuntimeRoute, authorizedRuntime string) error {
	if route.RuntimeName != authorizedRuntime {
		return fmt.Errorf("route runtime does not match authorization")
	}
	if route.Transport == nil {
		return fmt.Errorf("route transport is required")
	}
	if route.RuntimeCredential == "" || strings.ContainsAny(route.RuntimeCredential, " \t\r\n") {
		return fmt.Errorf("route runtime credential is invalid")
	}
	if err := validateLoopbackAuthority(route.UpstreamAuthority); err != nil {
		return err
	}
	return nil
}

func validateLoopbackAuthority(authority string) error {
	if strings.ContainsAny(authority, "/?#@ \t\r\n") {
		return fmt.Errorf("upstream authority is invalid")
	}
	host, port, err := net.SplitHostPort(authority)
	if err != nil {
		return fmt.Errorf("upstream authority is invalid: %w", err)
	}
	parsedPort, err := strconv.ParseUint(port, 10, 16)
	if err != nil || parsedPort == 0 {
		return fmt.Errorf("upstream port must be between 1 and 65535")
	}
	if host == "localhost" {
		return nil
	}
	parsedHost := net.ParseIP(host)
	if parsedHost == nil || !parsedHost.IsLoopback() {
		return fmt.Errorf("upstream host must be loopback")
	}
	return nil
}

func stripUntrustedRequestHeaders(header http.Header) {
	stripConnectionHeaders(header)
	for name := range header {
		canonical := http.CanonicalHeaderKey(name)
		if canonical == "Authorization" || canonical == "Proxy-Authorization" ||
			canonical == "Forwarded" || canonical == "X-Forwarded-For" ||
			canonical == "X-Forwarded-Host" || canonical == "X-Forwarded-Proto" ||
			canonical == "X-Real-Ip" || strings.HasPrefix(canonical, "X-Setta-") {
			header.Del(name)
		}
	}
}

func isProtocolUpgrade(header http.Header) bool {
	if header.Get("Upgrade") == "" {
		return false
	}
	for _, connectionValue := range header.Values("Connection") {
		for token := range strings.SplitSeq(connectionValue, ",") {
			if strings.EqualFold(strings.TrimSpace(token), "upgrade") {
				return true
			}
		}
	}
	return false
}

func stripConnectionHeaders(header http.Header) {
	for _, connectionValue := range header.Values("Connection") {
		for token := range strings.SplitSeq(connectionValue, ",") {
			header.Del(strings.TrimSpace(token))
		}
	}
	for _, name := range []string{
		"Connection",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailer",
		"Transfer-Encoding",
		"Upgrade",
	} {
		header.Del(name)
	}
}

func copyResponseHeaders(destination http.Header, source http.Header) {
	headers := source.Clone()
	stripConnectionHeaders(headers)
	for name, values := range headers {
		for _, value := range values {
			destination.Add(name, value)
		}
	}
}

func streamResponse(writer http.ResponseWriter, response *http.Response) {
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	flushStream := err == nil && mediaType == "text/event-stream"
	buffer := make([]byte, 32*1024)
	for {
		read, readErr := response.Body.Read(buffer)
		if read > 0 {
			_, _ = writer.Write(buffer[:read])
			if flushStream {
				if flusher, ok := writer.(http.Flusher); ok {
					flusher.Flush()
				}
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				return
			}
			return
		}
	}
}

func cloneURL(source *url.URL) *url.URL {
	cloned := *source
	return &cloned
}

func writeGatewayError(response http.ResponseWriter, status int, code string) {
	response.Header().Set("Content-Type", "application/json")
	response.Header().Set("Cache-Control", "no-store")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(struct {
		Error string `json:"error"`
	}{Error: code})
}
