package terminal

import (
	"bytes"
	"errors"
	"testing"
	"time"
)

func TestAttachHandoffPreservesHistoryAndOneActiveStream(t *testing.T) {
	session := &session{
		columns:   80,
		rows:      24,
		done:      make(chan struct{}),
		history:   historyBuffer{limit: defaultHistoryLimit},
		artifacts: make(map[string]struct{}),
	}
	service := &Service{
		session: session,
		tickets: map[string]ticket{
			"first":  {session: session, expiresAt: time.Now().Add(time.Minute)},
			"second": {session: session, expiresAt: time.Now().Add(time.Minute)},
			"third":  {session: session, expiresAt: time.Now().Add(time.Minute)},
		},
	}

	service.appendOutput(session, []byte("before-attach\n"))
	first, err := service.Attach("first")
	if err != nil {
		t.Fatalf("attach first stream: %v", err)
	}
	if got := string(first.History); got != "before-attach\n" {
		t.Fatalf("first attachment history = %q", got)
	}

	service.appendOutput(session, []byte("after-attach\n"))
	select {
	case output := <-first.Output:
		if got := string(output); got != "after-attach\n" {
			t.Fatalf("first attachment live output = %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("first attachment missed live output")
	}
	if got := string(first.History); got != "before-attach\n" {
		t.Fatalf("history copy changed after live output: %q", got)
	}

	if _, err := service.Attach("second"); !errors.Is(err, ErrAttachmentActive) {
		t.Fatalf("second active attachment error = %v, want %v", err, ErrAttachmentActive)
	}
	first.Close()
	third, err := service.Attach("third")
	if err != nil {
		t.Fatalf("reattach stream: %v", err)
	}
	t.Cleanup(third.Close)
	if got := string(third.History); got != "before-attach\nafter-attach\n" {
		t.Fatalf("reattached history = %q", got)
	}
}

func TestHistoryBufferKeepsExact64KiBTail(t *testing.T) {
	history := historyBuffer{limit: defaultHistoryLimit}
	prefix := bytes.Repeat([]byte("x"), defaultHistoryLimit)
	history.append(prefix)
	history.append([]byte("tail"))

	if got := len(history.bytes); got != defaultHistoryLimit {
		t.Fatalf("history size = %d, want %d", got, defaultHistoryLimit)
	}
	want := append(append([]byte(nil), prefix[4:]...), []byte("tail")...)
	if !bytes.Equal(history.copy(), want) {
		t.Fatal("history did not retain the exact bounded tail")
	}
}
