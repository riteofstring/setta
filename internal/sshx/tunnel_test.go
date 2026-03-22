package sshx

import (
	"net"
	"testing"
	"time"
)

func TestWaitForLocalPortReturnsTrueWhenListening(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen on loopback: %v", err)
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	if !waitForLocalPort("127.0.0.1", port, 500*time.Millisecond) {
		t.Fatalf("expected waitForLocalPort to observe listener on %d", port)
	}
}

func TestWaitForLocalPortReturnsFalseWhenNotListening(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen on loopback: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatalf("close loopback listener: %v", err)
	}

	if waitForLocalPort("127.0.0.1", port, 200*time.Millisecond) {
		t.Fatalf("did not expect waitForLocalPort to observe closed port %d", port)
	}
}
