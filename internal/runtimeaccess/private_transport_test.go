package runtimeaccess

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"setta/internal/runtimeprovider"
)

func TestPrivateHTTPTransportAlwaysUsesFixedProviderTunnelTarget(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/phase-3" {
			t.Errorf("request path = %q", request.URL.Path)
		}
		response.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)
	serverURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server URL: %v", err)
	}

	runtimeName := testRuntimeName(t)
	var gotRuntime string
	var gotNetwork string
	var gotAddress string
	dialer := privateAccessDialerFunc(func(ctx context.Context, runtime string, network string, address string) (net.Conn, error) {
		gotRuntime = runtime
		gotNetwork = network
		gotAddress = address
		var networkDialer net.Dialer
		return networkDialer.DialContext(ctx, "tcp", serverURL.Host)
	})
	transport, err := NewPrivateHTTPTransport(dialer, runtimeName, "localhost:8080")
	if err != nil {
		t.Fatalf("NewPrivateHTTPTransport: %v", err)
	}
	t.Cleanup(transport.CloseIdleConnections)

	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://unresolvable.invalid/phase-3", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext: %v", err)
	}
	response, err := transport.RoundTrip(request)
	if err != nil {
		t.Fatalf("RoundTrip: %v", err)
	}
	defer response.Body.Close()
	if _, err := io.Copy(io.Discard, response.Body); err != nil {
		t.Fatalf("read response: %v", err)
	}
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", response.StatusCode)
	}
	if gotRuntime != runtimeName || gotNetwork != "tcp" || gotAddress != "localhost:8080" {
		t.Fatalf("private dial = (%q, %q, %q)", gotRuntime, gotNetwork, gotAddress)
	}
}

func TestPrivateHTTPTransportRejectsInvalidConfiguration(t *testing.T) {
	runtimeName := testRuntimeName(t)
	dialer := privateAccessDialerFunc(func(context.Context, string, string, string) (net.Conn, error) {
		return nil, nil
	})
	foreignName := "foreign-runtime"

	for _, test := range []struct {
		name        string
		dialer      runtimeprovider.PrivateAccessDialer
		runtimeName string
		address     string
	}{
		{name: "missing dialer", runtimeName: runtimeName, address: "localhost:8080"},
		{name: "foreign runtime", dialer: dialer, runtimeName: foreignName, address: "localhost:8080"},
		{name: "public target", dialer: dialer, runtimeName: runtimeName, address: "example.com:8080"},
		{name: "missing port", dialer: dialer, runtimeName: runtimeName, address: "localhost"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewPrivateHTTPTransport(test.dialer, test.runtimeName, test.address); err == nil {
				t.Fatal("NewPrivateHTTPTransport succeeded")
			}
		})
	}
}

type privateAccessDialerFunc func(context.Context, string, string, string) (net.Conn, error)

func (function privateAccessDialerFunc) DialPrivateRuntime(
	ctx context.Context,
	runtimeName string,
	network string,
	address string,
) (net.Conn, error) {
	return function(ctx, runtimeName, network, address)
}
