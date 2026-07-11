package httpapi

import (
	"testing"
	"time"

	"setta/internal/terminal"
)

func TestTerminalStreamTicketExpiresAndIsRuntimeBound(t *testing.T) {
	now := time.Date(2026, time.July, 11, 12, 0, 0, 0, time.UTC)
	store := newTerminalStreamTicketStore(func() time.Time { return now })

	runtimeTicket, _, err := store.issue("device_one", "runtime_one", "client_one")
	if err != nil {
		t.Fatalf("issue runtime-bound ticket: %v", err)
	}
	if _, err := store.consume(runtimeTicket, "runtime_two"); err == nil {
		t.Fatal("ticket was accepted by another runtime")
	}
	if _, err := store.consume(runtimeTicket, "runtime_one"); err == nil {
		t.Fatal("runtime mismatch did not consume one-time ticket")
	}

	expiringTicket, _, err := store.issue("device_one", "runtime_one", "client_two")
	if err != nil {
		t.Fatalf("issue expiring ticket: %v", err)
	}
	now = now.Add(time.Duration(terminal.TerminalStreamTicketTTLSeconds)*time.Second + time.Nanosecond)
	if _, err := store.consume(expiringTicket, "runtime_one"); err == nil {
		t.Fatal("expired ticket was accepted")
	}
}

func TestTerminalStreamIDRequiresVisibleNonWhitespaceCharacters(t *testing.T) {
	for _, value := range []string{"", "has space", "has\nnewline", "control\x00"} {
		if validTerminalStreamID(value) {
			t.Fatalf("validTerminalStreamID(%q) = true", value)
		}
	}
	for _, value := range []string{"terminal_stream_123", "terminal-é"} {
		if !validTerminalStreamID(value) {
			t.Fatalf("validTerminalStreamID(%q) = false", value)
		}
	}
}
