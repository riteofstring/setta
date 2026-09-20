package latestvalue

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type testValue struct {
	Revision int
	Items    []string
}

func TestSubscriptionStartsDetachedAndCoalescesToLatest(t *testing.T) {
	initial := testValue{Revision: 1, Items: []string{"initial"}}
	publisher, err := New(initial, cloneTestValue)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	first, err := publisher.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe(first) error = %v", err)
	}
	second, err := publisher.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe(second) error = %v", err)
	}
	firstInitial := <-first
	secondInitial := <-second
	firstInitial.Items[0] = "mutated"
	if secondInitial.Items[0] != "initial" {
		t.Fatalf("second initial value = %#v", secondInitial)
	}
	for revision := 2; revision <= 4; revision++ {
		if err := publisher.Publish(testValue{Revision: revision, Items: []string{"current"}}); err != nil {
			t.Fatalf("Publish(%d) error = %v", revision, err)
		}
	}
	if latest := <-first; latest.Revision != 4 {
		t.Fatalf("first latest revision = %d", latest.Revision)
	}
	if latest := <-second; latest.Revision != 4 {
		t.Fatalf("second latest revision = %d", latest.Revision)
	}
}

func TestSubscriptionCancellationAndPublisherCloseAreIdempotent(t *testing.T) {
	publisher, err := New(testValue{}, cloneTestValue)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	stream, err := publisher.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	<-stream
	cancel()
	cancel()
	select {
	case _, open := <-stream:
		if open {
			t.Fatal("subscription remained open after cancellation")
		}
	case <-time.After(time.Second):
		t.Fatal("subscription cancellation did not close the stream")
	}
	remaining, err := publisher.Subscribe(context.Background())
	if err != nil {
		t.Fatalf("Subscribe(remaining) error = %v", err)
	}
	if err := publisher.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := publisher.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
	if _, open := <-remaining; !open {
		t.Fatal("remaining stream closed before its initial value was read")
	}
	if _, open := <-remaining; open {
		t.Fatal("remaining stream remained open after publisher close")
	}
	if _, err := publisher.Subscribe(context.Background()); !errors.Is(err, ErrClosed) {
		t.Fatalf("Subscribe(closed) error = %v", err)
	}
	if err := publisher.Publish(testValue{}); !errors.Is(err, ErrClosed) {
		t.Fatalf("Publish(closed) error = %v", err)
	}
}

func TestCloneFailureLeavesCurrentAndPendingValuesUnchanged(t *testing.T) {
	injected := errors.New("clone failed")
	fail := false
	clone := func(value testValue) (testValue, error) {
		if fail {
			return testValue{}, injected
		}
		return cloneTestValue(value)
	}
	publisher, err := New(testValue{Revision: 1}, clone)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer publisher.Close()
	stream, err := publisher.Subscribe(context.Background())
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	fail = true
	if err := publisher.Publish(testValue{Revision: 2}); !errors.Is(err, injected) {
		t.Fatalf("Publish(clone failure) error = %v", err)
	}
	fail = false
	if current := <-stream; current.Revision != 1 {
		t.Fatalf("pending revision = %d", current.Revision)
	}
	current, err := publisher.Subscribe(context.Background())
	if err != nil {
		t.Fatalf("Subscribe(current) error = %v", err)
	}
	if value := <-current; value.Revision != 1 {
		t.Fatalf("current revision = %d", value.Revision)
	}
}

func TestConcurrentCancellationAndCloseCloseEachStreamOnce(t *testing.T) {
	publisher, err := New(testValue{}, cloneTestValue)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	const total = 32
	streams := make([]<-chan testValue, 0, total)
	cancellations := make([]context.CancelFunc, 0, total)
	for index := 0; index < total; index++ {
		ctx, cancel := context.WithCancel(context.Background())
		stream, subscribeErr := publisher.Subscribe(ctx)
		if subscribeErr != nil {
			t.Fatalf("Subscribe(%d) error = %v", index, subscribeErr)
		}
		<-stream
		streams = append(streams, stream)
		cancellations = append(cancellations, cancel)
	}
	var wait sync.WaitGroup
	for _, cancel := range cancellations {
		wait.Add(1)
		go func(cancel context.CancelFunc) {
			defer wait.Done()
			cancel()
		}(cancel)
	}
	wait.Add(1)
	go func() {
		defer wait.Done()
		_ = publisher.Close()
	}()
	wait.Wait()
	for index, stream := range streams {
		if _, open := <-stream; open {
			t.Fatalf("stream %d remained open", index)
		}
	}
}

func TestInvalidConstructionAndContextFailClosed(t *testing.T) {
	if _, err := New[testValue](testValue{}, nil); err == nil {
		t.Fatal("New(nil clone) error = nil")
	}
	publisher, err := New(testValue{}, cloneTestValue)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := publisher.Subscribe(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Subscribe(canceled context) error = %v", err)
	}
}

func cloneTestValue(value testValue) (testValue, error) {
	return testValue{Revision: value.Revision, Items: append([]string(nil), value.Items...)}, nil
}
