package runtimeaccess

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestGatewayAuthorizesBeforeRoutingAndSeparatesCredentials(t *testing.T) {
	runtimeName := testRuntimeName(t)
	var gotClientCredential string
	var gotRequest *http.Request
	transport := roundTripperFunc(func(request *http.Request) (*http.Response, error) {
		gotRequest = request
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatalf("read upstream body: %v", err)
		}
		if string(body) != `{"input":"hello"}` {
			t.Fatalf("upstream body = %q", body)
		}
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Header: http.Header{
				"Content-Type":      []string{"application/json"},
				"Connection":        []string{"X-Upstream-Secret"},
				"X-Upstream-Secret": []string{"remove-me"},
			},
			Body: io.NopCloser(strings.NewReader(`{"accepted":true}`)),
		}, nil
	})
	gateway := newTestGateway(t,
		clientAuthorizerFunc(func(_ context.Context, credential string) (ClientAuthorization, error) {
			gotClientCredential = credential
			return ClientAuthorization{Outcome: AuthorizationAllowed, RuntimeName: runtimeName}, nil
		}),
		runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			return RuntimeRoute{
				RuntimeName:       runtimeName,
				UpstreamAuthority: "127.0.0.1:8080",
				RuntimeCredential: "runtime-secret",
				Transport:         transport,
			}, nil
		}),
	)

	request := httptest.NewRequest(http.MethodPost, "https://gateway.example/v1/conversations?source=desktop", strings.NewReader(`{"input":"hello"}`))
	request.Header.Set("Authorization", "Bearer client-secret")
	request.Header.Set("Proxy-Authorization", "Bearer provider-secret")
	request.Header.Set("Forwarded", "for=spoofed")
	request.Header.Set("X-Forwarded-For", "spoofed")
	request.Header.Set("X-Setta-Device", "spoofed")
	request.Header.Set("Connection", "X-Drop-Me")
	request.Header.Set("X-Drop-Me", "spoofed")
	response := httptest.NewRecorder()

	gateway.serveHTTP(response, request)

	if response.Code != http.StatusAccepted || response.Body.String() != `{"accepted":true}` {
		t.Fatalf("response = %d %q", response.Code, response.Body.String())
	}
	if gotClientCredential != "client-secret" {
		t.Fatalf("client credential = %q", gotClientCredential)
	}
	if gotRequest == nil {
		t.Fatal("upstream request was not sent")
	}
	if gotRequest.URL.Scheme != "http" || gotRequest.URL.Host != "127.0.0.1:8080" ||
		gotRequest.URL.RequestURI() != "/v1/conversations?source=desktop" || gotRequest.Host != "127.0.0.1:8080" {
		t.Fatalf("upstream target = %s host %q", gotRequest.URL, gotRequest.Host)
	}
	if gotRequest.Header.Get("Authorization") != "Bearer runtime-secret" {
		t.Fatalf("upstream authorization = %q", gotRequest.Header.Get("Authorization"))
	}
	for _, name := range []string{"Proxy-Authorization", "Forwarded", "X-Forwarded-For", "X-Setta-Device", "X-Drop-Me", "Connection"} {
		if gotRequest.Header.Get(name) != "" {
			t.Fatalf("untrusted upstream header %s = %q", name, gotRequest.Header.Get(name))
		}
	}
	if response.Header().Get("Connection") != "" || response.Header().Get("X-Upstream-Secret") != "" {
		t.Fatalf("hop-by-hop response headers = %#v", response.Header())
	}
	if request.Header.Get("Authorization") != "Bearer client-secret" {
		t.Fatal("gateway mutated the caller's request headers")
	}
}

func TestGatewayDenialsNeverResolveOrOpenProviderTransport(t *testing.T) {
	runtimeName := testRuntimeName(t)
	tests := []struct {
		name          string
		authorization string
		outcome       AuthorizationOutcome
		wantStatus    int
		wantCode      string
		wantAuthCalls int
	}{
		{name: "missing", wantStatus: http.StatusUnauthorized, wantCode: "unauthorized"},
		{name: "malformed", authorization: "Bearer two words", wantStatus: http.StatusUnauthorized, wantCode: "unauthorized"},
		{name: "unauthorized", authorization: "Bearer client", outcome: AuthorizationUnauthorized, wantStatus: http.StatusUnauthorized, wantCode: "unauthorized", wantAuthCalls: 1},
		{name: "revoked", authorization: "Bearer client", outcome: AuthorizationRevoked, wantStatus: http.StatusUnauthorized, wantCode: "revoked", wantAuthCalls: 1},
		{name: "suspended", authorization: "Bearer client", outcome: AuthorizationSuspended, wantStatus: http.StatusForbidden, wantCode: "suspended", wantAuthCalls: 1},
		{name: "rate limited", authorization: "Bearer client", outcome: AuthorizationRateLimited, wantStatus: http.StatusTooManyRequests, wantCode: "rate_limited", wantAuthCalls: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			authCalls := 0
			resolveCalls := 0
			transportCalls := 0
			gateway := newTestGateway(t,
				clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
					authCalls++
					return ClientAuthorization{Outcome: test.outcome}, nil
				}),
				runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
					resolveCalls++
					return RuntimeRoute{
						RuntimeName:       runtimeName,
						UpstreamAuthority: "localhost:8080",
						RuntimeCredential: "runtime-secret",
						Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
							transportCalls++
							return nil, errors.New("unexpected transport call")
						}),
					}, nil
				}),
			)
			request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/health", nil)
			if test.authorization != "" {
				request.Header.Set("Authorization", test.authorization)
			}
			response := httptest.NewRecorder()

			gateway.serveHTTP(response, request)

			if response.Code != test.wantStatus || !strings.Contains(response.Body.String(), `"error":"`+test.wantCode+`"`) {
				t.Fatalf("response = %d %q", response.Code, response.Body.String())
			}
			if authCalls != test.wantAuthCalls || resolveCalls != 0 || transportCalls != 0 {
				t.Fatalf("calls = auth %d, resolve %d, transport %d", authCalls, resolveCalls, transportCalls)
			}
		})
	}
}

func TestGatewayResolvesRotatedRuntimeCredentialForEveryRequest(t *testing.T) {
	runtimeName := testRuntimeName(t)
	credentials := []string{"runtime-secret-1", "runtime-secret-2"}
	var forwarded []string
	resolveCalls := 0
	gateway := newTestGateway(t,
		clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			return ClientAuthorization{Outcome: AuthorizationAllowed, RuntimeName: runtimeName}, nil
		}),
		runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			credential := credentials[resolveCalls]
			resolveCalls++
			return RuntimeRoute{
				RuntimeName:       runtimeName,
				UpstreamAuthority: "localhost:8080",
				RuntimeCredential: credential,
				Transport: roundTripperFunc(func(request *http.Request) (*http.Response, error) {
					forwarded = append(forwarded, request.Header.Get("Authorization"))
					return &http.Response{StatusCode: http.StatusNoContent, Header: make(http.Header), Body: http.NoBody}, nil
				}),
			}, nil
		}),
	)

	for range 2 {
		request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/health", nil)
		request.Header.Set("Authorization", "Bearer client")
		response := httptest.NewRecorder()
		gateway.serveHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("response status = %d", response.Code)
		}
	}

	if !slices.Equal(forwarded, []string{"Bearer runtime-secret-1", "Bearer runtime-secret-2"}) {
		t.Fatalf("forwarded credentials = %v", forwarded)
	}
}

func TestGatewayFailsLoudlyOnUnimplementedProtocolUpgradeBeforeRouting(t *testing.T) {
	runtimeName := testRuntimeName(t)
	resolveCalls := 0
	gateway := newTestGateway(t,
		clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			return ClientAuthorization{Outcome: AuthorizationAllowed, RuntimeName: runtimeName}, nil
		}),
		runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			resolveCalls++
			return RuntimeRoute{}, errors.New("unexpected route resolution")
		}),
	)
	request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/socket", nil)
	request.Header.Set("Authorization", "Bearer client")
	request.Header.Set("Connection", "upgrade")
	request.Header.Set("Upgrade", "websocket")
	response := httptest.NewRecorder()

	gateway.serveHTTP(response, request)

	if response.Code != http.StatusNotImplemented || resolveCalls != 0 ||
		!strings.Contains(response.Body.String(), `"error":"protocol_upgrade_not_implemented"`) {
		t.Fatalf("response = %d %q, resolve calls = %d", response.Code, response.Body.String(), resolveCalls)
	}
}

func TestGatewayInvalidRouteAndUpstreamErrorsFailClosedWithoutSecrets(t *testing.T) {
	runtimeName := testRuntimeName(t)
	foreignRuntime, err := runtimeprovider.NewManagedIdentity("foreign-owner")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}

	t.Run("route mismatch", func(t *testing.T) {
		transportCalls := 0
		gateway := newAllowedTestGateway(t, runtimeName, RuntimeRoute{
			RuntimeName:       foreignRuntime.Name,
			UpstreamAuthority: "localhost:8080",
			RuntimeCredential: "runtime-secret",
			Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
				transportCalls++
				return nil, errors.New("unexpected call")
			}),
		})
		response := serveAuthorizedRequest(gateway)
		if response.Code != http.StatusInternalServerError || transportCalls != 0 {
			t.Fatalf("response = %d, transport calls = %d", response.Code, transportCalls)
		}
	})

	t.Run("upstream secret is redacted", func(t *testing.T) {
		gateway := newAllowedTestGateway(t, runtimeName, RuntimeRoute{
			RuntimeName:       runtimeName,
			UpstreamAuthority: "localhost:8080",
			RuntimeCredential: "runtime-secret",
			Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
				return nil, errors.New("provider-secret runtime-secret")
			}),
		})
		response := serveAuthorizedRequest(gateway)
		if response.Code != http.StatusBadGateway || strings.Contains(response.Body.String(), "secret") {
			t.Fatalf("response = %d %q", response.Code, response.Body.String())
		}
	})
}

func TestGatewayFlushesEventStreams(t *testing.T) {
	runtimeName := testRuntimeName(t)
	gateway := newAllowedTestGateway(t, runtimeName, RuntimeRoute{
		RuntimeName:       runtimeName,
		UpstreamAuthority: "localhost:8080",
		RuntimeCredential: "runtime-secret",
		Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/event-stream; charset=utf-8"}},
				Body:       io.NopCloser(strings.NewReader("data: ready\n\n")),
			}, nil
		}),
	})
	writer := &flushingRecorder{ResponseRecorder: httptest.NewRecorder()}
	request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/conversations/events", nil)
	request.Header.Set("Authorization", "Bearer client")

	gateway.serveHTTP(writer, request)

	if writer.Code != http.StatusOK || writer.flushes == 0 || writer.Body.String() != "data: ready\n\n" {
		t.Fatalf("response = %d, flushes = %d, body = %q", writer.Code, writer.flushes, writer.Body.String())
	}
}

func TestGatewayPushCancellationStopsEstablishedStream(t *testing.T) {
	runtimeName := testRuntimeName(t)
	invalidated := make(chan struct{})
	upstreamStarted := make(chan struct{})
	upstreamCanceled := make(chan struct{})
	gateway := newTestGateway(t,
		clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			return ClientAuthorization{
				Outcome:     AuthorizationAllowed,
				RuntimeName: runtimeName,
				Invalidated: invalidated,
			}, nil
		}),
		runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			return RuntimeRoute{
				RuntimeName:       runtimeName,
				UpstreamAuthority: "localhost:8080",
				RuntimeCredential: "runtime-secret",
				Transport: roundTripperFunc(func(request *http.Request) (*http.Response, error) {
					close(upstreamStarted)
					<-request.Context().Done()
					close(upstreamCanceled)
					return nil, request.Context().Err()
				}),
			}, nil
		}),
	)
	request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/conversations/events", nil)
	request.Header.Set("Authorization", "Bearer client")
	response := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		gateway.serveHTTP(response, request)
		close(done)
	}()

	select {
	case <-upstreamStarted:
	case <-time.After(time.Second):
		t.Fatal("upstream request did not start")
	}
	close(invalidated)

	select {
	case <-upstreamCanceled:
	case <-time.After(time.Second):
		t.Fatal("upstream request was not canceled")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("gateway request did not return")
	}
}

func TestGatewayObservesContentFreeBandwidthAndTransportState(t *testing.T) {
	runtimeName := testRuntimeName(t)
	times := []time.Time{
		time.Date(2026, time.July, 19, 19, 0, 0, 0, time.UTC),
		time.Date(2026, time.July, 19, 19, 0, 0, int((25 * time.Millisecond).Nanoseconds()), time.UTC),
	}
	clockCall := 0
	var observations []GatewayRequestObservation
	gateway, err := NewGateway(GatewayConfig{
		Authorizer: clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			return ClientAuthorization{Outcome: AuthorizationAllowed, RuntimeName: runtimeName}, nil
		}),
		Clock: func() time.Time {
			current := times[clockCall]
			clockCall++
			return current
		},
		Observer: GatewayObserverFunc(func(observation GatewayRequestObservation) {
			observations = append(observations, observation)
		}),
		Routes: runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			return RuntimeRoute{
				RuntimeName:       runtimeName,
				UpstreamAuthority: "127.0.0.1:7345",
				RuntimeCredential: "runtime-secret-must-not-be-observed",
				Transport: roundTripperFunc(func(request *http.Request) (*http.Response, error) {
					body, readErr := io.ReadAll(request.Body)
					if readErr != nil || string(body) != "request-body" {
						t.Fatalf("upstream body = %q err=%v", body, readErr)
					}
					return &http.Response{
						StatusCode: http.StatusAccepted,
						Header:     make(http.Header),
						Body:       io.NopCloser(strings.NewReader("response-body")),
					}, nil
				}),
			}, nil
		}),
	})
	if err != nil {
		t.Fatalf("NewGateway: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "https://gateway.example/private?secret=query", strings.NewReader("request-body"))
	request.Header.Set("Authorization", "Bearer client-secret-must-not-be-observed")
	response := httptest.NewRecorder()

	gateway.serveHTTP(response, request)

	if response.Code != http.StatusAccepted || response.Body.String() != "response-body" {
		t.Fatalf("response = %d %q", response.Code, response.Body.String())
	}
	if len(observations) != 1 {
		t.Fatalf("observations = %d, want 1", len(observations))
	}
	want := GatewayRequestObservation{
		CompletedAt:             times[1],
		Duration:                25 * time.Millisecond,
		Method:                  GatewayMethodPost,
		ProviderTransportOpened: true,
		RequestBytes:            int64(len("request-body")),
		ResponseBytes:           int64(len("response-body")),
		Result:                  GatewayResultForwarded,
		RouteResolved:           true,
		Status:                  http.StatusAccepted,
	}
	if observations[0] != want {
		t.Fatalf("observation = %+v, want %+v", observations[0], want)
	}
}

func TestGatewayObservesDenialBeforeRouteOrProviderTransport(t *testing.T) {
	var observation GatewayRequestObservation
	gateway, err := NewGateway(GatewayConfig{
		Authorizer: clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			t.Fatal("authorizer called without a credential")
			return ClientAuthorization{}, nil
		}),
		Observer: GatewayObserverFunc(func(current GatewayRequestObservation) {
			observation = current
		}),
		Routes: runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			t.Fatal("route resolved for denied request")
			return RuntimeRoute{}, nil
		}),
	})
	if err != nil {
		t.Fatalf("NewGateway: %v", err)
	}
	request := httptest.NewRequest("SECRET-METHOD", "https://gateway.example/private?secret=query", nil)
	response := httptest.NewRecorder()

	gateway.serveHTTP(response, request)

	if response.Code != http.StatusUnauthorized || observation.Result != GatewayResultUnauthorized ||
		observation.Method != GatewayMethodOther || observation.RouteResolved || observation.ProviderTransportOpened {
		t.Fatalf("response = %d observation = %+v", response.Code, observation)
	}
}

func TestGatewayHTTPServerUsesStreamingSafeBounds(t *testing.T) {
	gateway := newTestGateway(t,
		clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			return ClientAuthorization{Outcome: AuthorizationUnauthorized}, nil
		}),
		runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			return RuntimeRoute{}, errors.New("not reached")
		}),
	)
	server, err := NewGatewayHTTPServer(gateway)
	if err != nil {
		t.Fatalf("NewGatewayHTTPServer: %v", err)
	}
	if server.Handler == nil || server.ReadHeaderTimeout != gatewayHTTPReadHeaderTimeout ||
		server.ReadTimeout != gatewayHTTPReadTimeout || server.IdleTimeout != gatewayHTTPIdleTimeout ||
		server.MaxHeaderBytes != gatewayHTTPMaxHeaderBytes || server.WriteTimeout != 0 {
		t.Fatalf("gateway HTTP server = %+v", server)
	}
}

func TestGatewayRequiresProductionBoundaryDependencies(t *testing.T) {
	runtimeName := testRuntimeName(t)
	authorizer := clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
		return ClientAuthorization{Outcome: AuthorizationAllowed, RuntimeName: runtimeName}, nil
	})
	observer := GatewayObserverFunc(func(GatewayRequestObservation) {})
	routes := runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
		return RuntimeRoute{}, nil
	})
	tests := []struct {
		name   string
		config GatewayConfig
	}{
		{name: "authorizer", config: GatewayConfig{Observer: observer, Routes: routes}},
		{name: "observer", config: GatewayConfig{Authorizer: authorizer, Routes: routes}},
		{name: "routes", config: GatewayConfig{Authorizer: authorizer, Observer: observer}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewGateway(test.config); err == nil {
				t.Fatalf("NewGateway without %s succeeded", test.name)
			}
		})
	}
	if _, err := NewGatewayHTTPServer(nil); err == nil {
		t.Fatal("NewGatewayHTTPServer without gateway succeeded")
	}
}

type clientAuthorizerFunc func(context.Context, string) (ClientAuthorization, error)

func (function clientAuthorizerFunc) AuthorizeClient(ctx context.Context, credential string) (ClientAuthorization, error) {
	return function(ctx, credential)
}

type runtimeRouteResolverFunc func(context.Context, string) (RuntimeRoute, error)

func (function runtimeRouteResolverFunc) ResolveRuntimeRoute(ctx context.Context, runtimeName string) (RuntimeRoute, error) {
	return function(ctx, runtimeName)
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (function roundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

type flushingRecorder struct {
	*httptest.ResponseRecorder
	flushes int
}

func (recorder *flushingRecorder) Flush() {
	recorder.flushes++
	recorder.ResponseRecorder.Flush()
}

func newTestGateway(t *testing.T, authorizer ClientAuthorizer, routes RuntimeRouteResolver) *Gateway {
	t.Helper()
	gateway, err := NewGateway(GatewayConfig{
		Authorizer: authorizer,
		Observer:   GatewayObserverFunc(func(GatewayRequestObservation) {}),
		Routes:     routes,
	})
	if err != nil {
		t.Fatalf("NewGateway: %v", err)
	}
	return gateway
}

func newAllowedTestGateway(t *testing.T, runtimeName string, route RuntimeRoute) *Gateway {
	t.Helper()
	return newTestGateway(t,
		clientAuthorizerFunc(func(context.Context, string) (ClientAuthorization, error) {
			return ClientAuthorization{Outcome: AuthorizationAllowed, RuntimeName: runtimeName}, nil
		}),
		runtimeRouteResolverFunc(func(context.Context, string) (RuntimeRoute, error) {
			return route, nil
		}),
	)
}

func serveAuthorizedRequest(gateway *Gateway) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/health", nil)
	request.Header.Set("Authorization", "Bearer client")
	response := httptest.NewRecorder()
	gateway.serveHTTP(response, request)
	return response
}

func testRuntimeName(t *testing.T) string {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("phase-3-test-owner")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	return identity.Name
}
