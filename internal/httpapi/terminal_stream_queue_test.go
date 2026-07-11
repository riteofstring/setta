package httpapi

import (
	"context"
	"testing"
)

func TestTerminalStreamByteQueueBoundsBytesAndItems(t *testing.T) {
	queue := newTerminalStreamByteQueue[string](3, 1)
	if !queue.push("one", 3) {
		t.Fatal("first bounded queue push failed")
	}
	if queue.push("bytes", 1) {
		t.Fatal("queue accepted bytes beyond its byte bound")
	}
	if queue.push("items", 0) {
		t.Fatal("queue accepted items beyond its item bound")
	}
	if value, ok := queue.pop(context.Background()); !ok || value != "one" {
		t.Fatalf("queue pop = %q, %t", value, ok)
	}
	if !queue.push("reused", 3) {
		t.Fatal("queue did not release its byte budget after pop")
	}
}

func TestTerminalStreamByteQueuePopStopsOnCancellation(t *testing.T) {
	queue := newTerminalStreamByteQueue[string](1, 1)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if value, ok := queue.pop(ctx); ok || value != "" {
		t.Fatalf("canceled queue pop = %q, %t", value, ok)
	}
}
