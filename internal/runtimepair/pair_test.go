package runtimepair

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/httpapi"
	"setta/internal/runtimeprovider"
)

func TestPairerMintsTypedTokenAndCompletesOverPrivateDialer(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("runtime-pair-test")
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/pairing/complete" {
			t.Fatalf("pairing request = %s %s", request.Method, request.URL.Path)
		}
		var payload httpapi.CompletePairingRequest
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.PairingToken != "one-time-pairing-token" || payload.ClientDisplayName != "Hosted measurement gateway" {
			t.Fatalf("pairing payload = %+v", payload)
		}
		_ = json.NewEncoder(writer).Encode(httpapi.CompletePairingResponse{
			DeviceID: "device_123", DeviceToken: "inner-runtime-credential", RuntimeID: "runtime_123",
			ProtocolVersion: httpapi.ProtocolVersion,
		})
	}))
	defer server.Close()
	provider := &pairingProvider{
		execResult:  runtimeprovider.ExecResult{Stdout: []byte(`{"schema_version":1,"event":"runtime_pairing_ready","runtime_id":"runtime_123","pairing_token":"one-time-pairing-token"}`)},
		dialAddress: strings.TrimPrefix(server.URL, "http://"),
	}
	result, err := (Pairer{Provider: provider}).Pair(context.Background(), Request{
		RuntimeName: identity.Name, RuntimeBinaryPath: "/var/lib/setta/releases/v1/setta",
		RuntimeStateDir: "/var/lib/setta/runtime", ClientDisplayName: "Hosted measurement gateway",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.DeviceToken != "inner-runtime-credential" || result.RuntimeID != "runtime_123" ||
		provider.execRequest.Path != "/var/lib/setta/releases/v1/setta" ||
		strings.Join(provider.execRequest.Arguments, " ") != "pair --json --app-data-dir /var/lib/setta/runtime" {
		t.Fatalf("pair result = %+v, exec = %+v", result, provider.execRequest)
	}
	if provider.dialRuntime != identity.Name || provider.dialNetwork != "tcp" || provider.dialTarget != "127.0.0.1:7345" {
		t.Fatalf("private dial = %q %q %q", provider.dialRuntime, provider.dialNetwork, provider.dialTarget)
	}
}

func TestPairerRejectsMalformedOrContentfulFailures(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("runtime-pair-failure")
	if err != nil {
		t.Fatal(err)
	}
	request := Request{
		RuntimeName: identity.Name, RuntimeBinaryPath: "/runtime/setta",
		RuntimeStateDir: "/runtime/state", ClientDisplayName: "Gateway",
	}
	t.Run("malformed event", func(t *testing.T) {
		provider := &pairingProvider{execResult: runtimeprovider.ExecResult{Stdout: []byte(`{"event":"wrong","pairing_token":"secret-sentinel"}`)}}
		_, err := (Pairer{Provider: provider}).Pair(context.Background(), request)
		if err == nil || strings.Contains(err.Error(), "secret-sentinel") {
			t.Fatalf("contentful malformed event error = %v", err)
		}
	})
	t.Run("HTTP failure", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(writer, `{"error":"secret-sentinel"}`)
		}))
		defer server.Close()
		provider := &pairingProvider{
			execResult:  runtimeprovider.ExecResult{Stdout: []byte(`{"schema_version":1,"event":"runtime_pairing_ready","runtime_id":"runtime_123","pairing_token":"one-time-token"}`)},
			dialAddress: strings.TrimPrefix(server.URL, "http://"),
		}
		_, err := (Pairer{Provider: provider}).Pair(context.Background(), request)
		if err == nil || strings.Contains(err.Error(), "secret-sentinel") || strings.Contains(err.Error(), "one-time-token") {
			t.Fatalf("contentful HTTP error = %v", err)
		}
	})
}

type pairingProvider struct {
	execRequest runtimeprovider.ExecRequest
	execResult  runtimeprovider.ExecResult
	dialAddress string
	dialRuntime string
	dialNetwork string
	dialTarget  string
}

func (provider *pairingProvider) Exec(_ context.Context, request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error) {
	provider.execRequest = request
	return provider.execResult, nil
}

func (provider *pairingProvider) DialPrivateRuntime(
	ctx context.Context,
	runtimeName string,
	network string,
	address string,
) (net.Conn, error) {
	provider.dialRuntime = runtimeName
	provider.dialNetwork = network
	provider.dialTarget = address
	return (&net.Dialer{}).DialContext(ctx, "tcp", provider.dialAddress)
}
