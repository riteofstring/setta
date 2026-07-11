package httpapi

import (
	"context"
	"sync"
)

type terminalStreamSized[T any] struct {
	size  int
	value T
}

type terminalStreamByteQueue[T any] struct {
	items     chan terminalStreamSized[T]
	maxBytes  int
	mu        sync.Mutex
	usedBytes int
}

func newTerminalStreamByteQueue[T any](maxBytes int, maxItems int) *terminalStreamByteQueue[T] {
	return &terminalStreamByteQueue[T]{items: make(chan terminalStreamSized[T], maxItems), maxBytes: maxBytes}
}

func (queue *terminalStreamByteQueue[T]) push(value T, size int) bool {
	if size < 0 {
		return false
	}
	queue.mu.Lock()
	if queue.usedBytes+size > queue.maxBytes {
		queue.mu.Unlock()
		return false
	}
	queue.usedBytes += size
	queue.mu.Unlock()
	select {
	case queue.items <- terminalStreamSized[T]{size: size, value: value}:
		return true
	default:
		queue.mu.Lock()
		queue.usedBytes -= size
		queue.mu.Unlock()
		return false
	}
}

func (queue *terminalStreamByteQueue[T]) pop(ctx context.Context) (T, bool) {
	select {
	case <-ctx.Done():
		var zero T
		return zero, false
	case item := <-queue.items:
		queue.mu.Lock()
		queue.usedBytes -= item.size
		queue.mu.Unlock()
		return item.value, true
	}
}
