package latestvalue

import (
	"context"
	"errors"
	"sync"
)

var ErrClosed = errors.New("latestvalue: publisher is closed")

type Clone[T any] func(T) (T, error)

type Publisher[T any] struct {
	mu          sync.Mutex
	clone       Clone[T]
	current     T
	subscribers map[chan T]struct{}
	done        chan struct{}
	closed      bool
}

func New[T any](initial T, clone Clone[T]) (*Publisher[T], error) {
	if clone == nil {
		return nil, errors.New("latestvalue: clone operation is required")
	}
	current, err := clone(initial)
	if err != nil {
		return nil, err
	}
	return &Publisher[T]{
		clone:       clone,
		current:     current,
		subscribers: make(map[chan T]struct{}),
		done:        make(chan struct{}),
	}, nil
}

func (publisher *Publisher[T]) Subscribe(ctx context.Context) (<-chan T, error) {
	if publisher == nil {
		return nil, ErrClosed
	}
	if ctx == nil {
		return nil, errors.New("latestvalue: subscription context is required")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	publisher.mu.Lock()
	if publisher.closed {
		publisher.mu.Unlock()
		return nil, ErrClosed
	}
	current, err := publisher.clone(publisher.current)
	if err != nil {
		publisher.mu.Unlock()
		return nil, err
	}
	stream := make(chan T, 1)
	stream <- current
	publisher.subscribers[stream] = struct{}{}
	publisher.mu.Unlock()
	go publisher.awaitCancellation(ctx, stream)
	return stream, nil
}

func (publisher *Publisher[T]) Publish(value T) error {
	if publisher == nil {
		return ErrClosed
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed {
		return ErrClosed
	}
	current, updates, err := publisher.prepare(value)
	if err != nil {
		return err
	}
	publisher.current = current
	for stream, update := range updates {
		select {
		case stream <- update:
			continue
		default:
		}
		select {
		case <-stream:
		default:
		}
		stream <- update
	}
	return nil
}

func (publisher *Publisher[T]) Close() error {
	if publisher == nil {
		return nil
	}
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if publisher.closed {
		return nil
	}
	publisher.closed = true
	close(publisher.done)
	for stream := range publisher.subscribers {
		close(stream)
		delete(publisher.subscribers, stream)
	}
	return nil
}

func (publisher *Publisher[T]) prepare(value T) (T, map[chan T]T, error) {
	current, err := publisher.clone(value)
	if err != nil {
		var zero T
		return zero, nil, err
	}
	updates := make(map[chan T]T, len(publisher.subscribers))
	for stream := range publisher.subscribers {
		update, err := publisher.clone(value)
		if err != nil {
			var zero T
			return zero, nil, err
		}
		updates[stream] = update
	}
	return current, updates, nil
}

func (publisher *Publisher[T]) awaitCancellation(ctx context.Context, stream chan T) {
	select {
	case <-ctx.Done():
		publisher.unsubscribe(stream)
	case <-publisher.done:
	}
}

func (publisher *Publisher[T]) unsubscribe(stream chan T) {
	publisher.mu.Lock()
	defer publisher.mu.Unlock()
	if _, exists := publisher.subscribers[stream]; !exists {
		return
	}
	delete(publisher.subscribers, stream)
	close(stream)
}
