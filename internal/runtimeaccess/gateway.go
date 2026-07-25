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
	"time"

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

type GatewayRequestResult string
type GatewayRequestMethod string

const (
	GatewayMethodDelete  GatewayRequestMethod = "DELETE"
	GatewayMethodGet     GatewayRequestMethod = "GET"
	GatewayMethodHead    GatewayRequestMethod = "HEAD"
	GatewayMethodOptions GatewayRequestMethod = "OPTIONS"
	GatewayMethodPatch   GatewayRequestMethod = "PATCH"
	GatewayMethodPost    GatewayRequestMethod = "POST"
	GatewayMethodPut     GatewayRequestMethod = "PUT"
	GatewayMethodOther   GatewayRequestMethod = "OTHER"

	GatewayResultForwarded                  GatewayRequestResult = "forwarded"
	GatewayResultUnauthorized               GatewayRequestResult = "unauthorized"
	GatewayResultRevoked                    GatewayRequestResult = "revoked"
	GatewayResultSuspended                  GatewayRequestResult = "suspended"
	GatewayResultRateLimited                GatewayRequestResult = "rate_limited"
	GatewayResultAccessCheckUnavailable     GatewayRequestResult = "access_check_unavailable"
	GatewayResultInvalidAuthorization       GatewayRequestResult = "invalid_client_authorization"
	GatewayResultProtocolUpgradeUnsupported GatewayRequestResult = "protocol_upgrade_not_implemented"
	GatewayResultRouteUnavailable           GatewayRequestResult = "runtime_route_unavailable"
	GatewayResultInvalidRoute               GatewayRequestResult = "invalid_runtime_route"
	GatewayResultRuntimeUnavailable         GatewayRequestResult = "runtime_unavailable"
	GatewayResultRuntimeStreamFailed        GatewayRequestResult = "runtime_stream_failed"
)

// GatewayRequestObservation is deliberately content-free. It contains enough
// information to measure latency, relayed bandwidth, denials before provider
// access, and upstream failures without retaining URLs, runtime names, client
// addresses, headers, credentials, queries, or bodies.
type GatewayRequestObservation struct {
	CompletedAt             time.Time
	Duration                time.Duration
	FirstResponseDuration   time.Duration
	FirstResponseObserved   bool
	Method                  GatewayRequestMethod
	Operation               string
	ProviderTransportOpened bool
	RequestBytes            int64
	ResumeRequested         bool
	ResponseBytes           int64
	Result                  GatewayRequestResult
	RouteResolved           bool
	Status                  int
}

type GatewayObserver interface {
	ObserveGatewayRequest(GatewayRequestObservation)
}

type GatewayAttachment struct {
	ID          string
	RuntimeName string
}

type GatewayAttachmentRecorder interface {
	BeginGatewayAttachment(context.Context, string) (GatewayAttachment, error)
	EndGatewayAttachment(context.Context, GatewayAttachment) error
}

type GatewayObserverFunc func(GatewayRequestObservation)

func (function GatewayObserverFunc) ObserveGatewayRequest(observation GatewayRequestObservation) {
	function(observation)
}

type GatewayRequestClassifier interface {
	ClassifyGatewayRequest(method string, path string) string
}

type GatewayRequestClassifierFunc func(method string, path string) string

func (function GatewayRequestClassifierFunc) ClassifyGatewayRequest(method string, path string) string {
	return function(method, path)
}

type GatewayConfig struct {
	Attachments GatewayAttachmentRecorder
	Authorizer  ClientAuthorizer
	Classifier  GatewayRequestClassifier
	Clock       func() time.Time
	Observer    GatewayObserver
	Routes      RuntimeRouteResolver
}

// Gateway is the Phase 3 HTTP/SSE routing boundary. The hosting deployable must
// terminate TLS and provide durable implementations of the authorization and
// route contracts; provider credentials remain confined to each route's
// transport.
type Gateway struct {
	attachments GatewayAttachmentRecorder
	authorizer  ClientAuthorizer
	classifier  GatewayRequestClassifier
	clock       func() time.Time
	observer    GatewayObserver
	routes      RuntimeRouteResolver
}

// NewGateway constructs the private-access routing core.
func NewGateway(config GatewayConfig) (*Gateway, error) {
	if config.Authorizer == nil {
		return nil, fmt.Errorf("client authorizer is required")
	}
	if config.Attachments == nil {
		return nil, fmt.Errorf("gateway attachment recorder is required")
	}
	if config.Routes == nil {
		return nil, fmt.Errorf("runtime route resolver is required")
	}
	if config.Observer == nil {
		return nil, fmt.Errorf("gateway observer is required")
	}
	if config.Clock == nil {
		config.Clock = time.Now
	}
	return &Gateway{
		attachments: config.Attachments,
		authorizer:  config.Authorizer,
		classifier:  config.Classifier,
		clock:       config.Clock,
		observer:    config.Observer,
		routes:      config.Routes,
	}, nil
}

func (gateway *Gateway) serveHTTP(response http.ResponseWriter, request *http.Request) {
	startedAt := gateway.clock()
	observation := GatewayRequestObservation{
		Method:          gatewayRequestMethod(request.Method),
		Operation:       gateway.classifyRequest(request.Method, request.URL.Path),
		Result:          GatewayResultInvalidAuthorization,
		ResumeRequested: request.Header.Get("Last-Event-ID") != "",
		Status:          http.StatusInternalServerError,
	}
	var firstResponseAt time.Time
	observedResponse := &gatewayResponseWriter{
		ResponseWriter: response,
		firstWrite: func() {
			firstResponseAt = gateway.clock()
		},
	}
	var observedRequest *gatewayRequestBody
	defer func() {
		gateway.completeObservation(
			startedAt,
			firstResponseAt,
			&observation,
			observedRequest,
			observedResponse,
		)
	}()

	credential, ok := bearerCredential(request.Header.Values("Authorization"))
	if !ok {
		observation.Result = GatewayResultUnauthorized
		observation.Status = http.StatusUnauthorized
		writeGatewayError(observedResponse, observation.Status, string(observation.Result))
		return
	}

	authorization, err := gateway.authorizer.AuthorizeClient(request.Context(), credential)
	if err != nil {
		observation.Result = GatewayResultAccessCheckUnavailable
		observation.Status = http.StatusServiceUnavailable
		writeGatewayError(observedResponse, observation.Status, string(observation.Result))
		return
	}
	status, result, allowed := authorizationResult(authorization)
	if !allowed {
		observation.Result = result
		observation.Status = status
		writeGatewayError(observedResponse, status, string(result))
		return
	}
	requestContext, cancel, valid := authorizationContext(request.Context(), authorization.Invalidated)
	if !valid {
		observation.Result = GatewayResultRevoked
		observation.Status = http.StatusUnauthorized
		writeGatewayError(observedResponse, observation.Status, string(observation.Result))
		return
	}
	defer cancel()
	if request.Method == http.MethodConnect || isProtocolUpgrade(request.Header) {
		observation.Result = GatewayResultProtocolUpgradeUnsupported
		observation.Status = http.StatusNotImplemented
		writeGatewayError(observedResponse, observation.Status, string(observation.Result))
		return
	}

	route, err := gateway.routes.ResolveRuntimeRoute(requestContext, authorization.RuntimeName)
	if err != nil {
		observation.Result = GatewayResultRouteUnavailable
		observation.Status = http.StatusBadGateway
		writeGatewayError(observedResponse, observation.Status, string(observation.Result))
		return
	}
	observation.RouteResolved = true
	if err := validateRuntimeRoute(route, authorization.RuntimeName); err != nil {
		observation.Result = GatewayResultInvalidRoute
		observation.Status = http.StatusInternalServerError
		writeGatewayError(observedResponse, observation.Status, string(observation.Result))
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
	observedRequest = observeGatewayRequestBody(upstreamRequest)

	observation.ProviderTransportOpened = true
	upstreamResponse, err := route.Transport.RoundTrip(upstreamRequest)
	if err != nil {
		observation.Result = GatewayResultRuntimeUnavailable
		observation.Status = http.StatusBadGateway
		writeGatewayError(response, observation.Status, string(observation.Result))
		return
	}
	defer upstreamResponse.Body.Close()
	gateway.forwardAttachedResponse(
		requestContext,
		authorization.RuntimeName,
		observedResponse,
		upstreamResponse,
		&observation,
	)
}

func (gateway *Gateway) forwardAttachedResponse(
	ctx context.Context,
	runtimeName string,
	response *gatewayResponseWriter,
	upstreamResponse *http.Response,
	observation *GatewayRequestObservation,
) {
	attachment, err := gateway.attachments.BeginGatewayAttachment(
		ctx,
		runtimeName,
	)
	if err != nil {
		observation.Result = GatewayResultRuntimeUnavailable
		observation.Status = http.StatusBadGateway
		writeGatewayError(response, observation.Status, string(observation.Result))
		return
	}
	defer func() {
		if err := gateway.attachments.EndGatewayAttachment(context.Background(), attachment); err != nil {
			observation.Result = GatewayResultRuntimeStreamFailed
		}
	}()
	forwardGatewayResponse(response, upstreamResponse, observation)
}

func (gateway *Gateway) completeObservation(
	startedAt time.Time,
	firstResponseAt time.Time,
	observation *GatewayRequestObservation,
	requestBody *gatewayRequestBody,
	response *gatewayResponseWriter,
) {
	observation.CompletedAt = gateway.clock()
	observation.Duration = observation.CompletedAt.Sub(startedAt)
	if !firstResponseAt.IsZero() {
		observation.FirstResponseDuration = firstResponseAt.Sub(startedAt)
		observation.FirstResponseObserved = true
	}
	if requestBody != nil {
		observation.RequestBytes = requestBody.bytes
	}
	observation.ResponseBytes = response.bytes
	gateway.observer.ObserveGatewayRequest(*observation)
}

func (gateway *Gateway) classifyRequest(method string, path string) string {
	if gateway.classifier == nil {
		return ""
	}
	return gateway.classifier.ClassifyGatewayRequest(method, path)
}

func observeGatewayRequestBody(request *http.Request) *gatewayRequestBody {
	if request.Body == nil {
		return nil
	}
	body := &gatewayRequestBody{ReadCloser: request.Body}
	request.Body = body
	return body
}

func forwardGatewayResponse(
	response *gatewayResponseWriter,
	upstream *http.Response,
	observation *GatewayRequestObservation,
) {
	observation.Result = GatewayResultForwarded
	observation.Status = upstream.StatusCode
	copyResponseHeaders(response.Header(), upstream.Header)
	response.WriteHeader(upstream.StatusCode)
	if err := streamResponse(response, upstream); err != nil {
		observation.Result = GatewayResultRuntimeStreamFailed
	}
}

func gatewayRequestMethod(method string) GatewayRequestMethod {
	switch method {
	case http.MethodDelete:
		return GatewayMethodDelete
	case http.MethodGet:
		return GatewayMethodGet
	case http.MethodHead:
		return GatewayMethodHead
	case http.MethodOptions:
		return GatewayMethodOptions
	case http.MethodPatch:
		return GatewayMethodPatch
	case http.MethodPost:
		return GatewayMethodPost
	case http.MethodPut:
		return GatewayMethodPut
	default:
		return GatewayMethodOther
	}
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

func authorizationResult(authorization ClientAuthorization) (int, GatewayRequestResult, bool) {
	switch authorization.Outcome {
	case AuthorizationAllowed:
		if runtimeprovider.ValidateManagedName(authorization.RuntimeName) != nil {
			return http.StatusInternalServerError, GatewayResultInvalidAuthorization, false
		}
		return 0, "", true
	case AuthorizationUnauthorized:
		return http.StatusUnauthorized, GatewayResultUnauthorized, false
	case AuthorizationRevoked:
		return http.StatusUnauthorized, GatewayResultRevoked, false
	case AuthorizationSuspended:
		return http.StatusForbidden, GatewayResultSuspended, false
	case AuthorizationRateLimited:
		return http.StatusTooManyRequests, GatewayResultRateLimited, false
	default:
		return http.StatusInternalServerError, GatewayResultInvalidAuthorization, false
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

func streamResponse(writer http.ResponseWriter, response *http.Response) error {
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	flushStream := err == nil && mediaType == "text/event-stream"
	buffer := make([]byte, 32*1024)
	for {
		read, readErr := response.Body.Read(buffer)
		if read > 0 {
			written, writeErr := writer.Write(buffer[:read])
			if writeErr != nil {
				return writeErr
			}
			if written != read {
				return io.ErrShortWrite
			}
			if flushStream {
				if flusher, ok := writer.(http.Flusher); ok {
					flusher.Flush()
				}
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				return readErr
			}
			return nil
		}
	}
}

type gatewayRequestBody struct {
	io.ReadCloser
	bytes int64
}

func (body *gatewayRequestBody) Read(buffer []byte) (int, error) {
	read, err := body.ReadCloser.Read(buffer)
	body.bytes += int64(read)
	return read, err
}

type gatewayResponseWriter struct {
	http.ResponseWriter
	bytes      int64
	firstWrite func()
	wrote      bool
}

func (writer *gatewayResponseWriter) Write(buffer []byte) (int, error) {
	if !writer.wrote {
		writer.wrote = true
		if writer.firstWrite != nil {
			writer.firstWrite()
		}
	}
	written, err := writer.ResponseWriter.Write(buffer)
	writer.bytes += int64(written)
	return written, err
}

func (writer *gatewayResponseWriter) Flush() {
	if flusher, ok := writer.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
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
