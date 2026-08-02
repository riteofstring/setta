package main

import (
	"bytes"
	"errors"
	"io"
	"net"
	"strings"
	"testing"

	"setta/internal/evalharness/providerbridge"
)

func TestBridgeConfigurationRequiresContainerHostAndOpaqueToken(t *testing.T) {
	token := strings.Repeat("a", 64)
	getenv := func(name string) string {
		switch name {
		case providerbridge.AddressEnvironment:
			return "host.docker.internal:43123"
		case providerbridge.TokenEnvironment:
			return token
		default:
			return ""
		}
	}
	address, actualToken, err := bridgeConfiguration(getenv)
	if err != nil {
		t.Fatalf("bridge configuration: %v", err)
	}
	if address != "host.docker.internal:43123" || actualToken != token {
		t.Fatalf("bridge configuration = %q/%q", address, actualToken)
	}

	for _, invalid := range []string{"127.0.0.1:43123", "host.docker.internal", "example.com:43123"} {
		t.Run(invalid, func(t *testing.T) {
			_, _, err := bridgeConfiguration(func(name string) string {
				if name == providerbridge.AddressEnvironment {
					return invalid
				}
				return token
			})
			if err == nil {
				t.Fatal("unsafe bridge address was accepted")
			}
		})
	}
}

func TestAuthenticateBridgeDoesNotSendRequestsBeforeAcceptance(t *testing.T) {
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()
	token := strings.Repeat("b", 64)
	serverDone := make(chan error, 1)
	go func() {
		line := make([]byte, len(providerbridge.Handshake(token)))
		_, err := io.ReadFull(server, line)
		if err == nil && string(line) != providerbridge.Handshake(token) {
			err = errors.New("unexpected handshake")
		}
		if err == nil {
			_, err = io.WriteString(server, providerbridge.Acknowledgement+"next")
		}
		serverDone <- err
	}()
	if err := authenticateBridge(client, token); err != nil {
		t.Fatalf("authenticate bridge: %v", err)
	}
	buffered := make([]byte, len("next"))
	if _, err := io.ReadFull(client, buffered); err != nil {
		t.Fatalf("read post-handshake data: %v", err)
	}
	if string(buffered) != "next" {
		t.Fatalf("post-handshake data = %q", buffered)
	}
	if err := <-serverDone; err != nil {
		t.Fatalf("bridge server: %v", err)
	}
}

func TestProxyStdioStopsBlockedInputWhenHostCloses(t *testing.T) {
	client, server := net.Pipe()
	input, inputWriter := io.Pipe()
	defer inputWriter.Close()
	if err := server.Close(); err != nil {
		t.Fatalf("close server: %v", err)
	}
	err := proxyStdio(client, input, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "host provider closed") {
		t.Fatalf("proxy stdio error = %v", err)
	}
}

func TestProxyStdioForwardsBothDirections(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()
	output := &bytes.Buffer{}
	serverDone := make(chan error, 1)
	go func() {
		server, acceptErr := listener.Accept()
		if acceptErr != nil {
			serverDone <- acceptErr
			return
		}
		defer server.Close()
		request, readErr := io.ReadAll(server)
		if readErr == nil && string(request) != "request\n" {
			readErr = errors.New("unexpected request")
		}
		if readErr == nil {
			_, readErr = server.Write([]byte("response\n"))
		}
		serverDone <- readErr
	}()
	client, err := net.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer client.Close()
	if err := proxyStdio(client, io.NopCloser(strings.NewReader("request\n")), output); err != nil {
		t.Fatalf("proxy stdio: %v", err)
	}
	if err := <-serverDone; err != nil {
		t.Fatalf("bridge server: %v", err)
	}
	if output.String() != "response\n" {
		t.Fatalf("bridge output = %q", output.String())
	}
}
