package scheduler

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestLatestRetainsOnlyNewestPendingTask(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"draw": {Mode: "latest", ConcurrencyGroup: "image", ConcurrencyLimit: 1},
	})
	defer scheduler.Close()
	started := make(chan string, 3)
	release := make(chan struct{})
	dropped := make(chan string, 1)
	if _, err := scheduler.Submit(task("one", "draw", started, release)); err != nil {
		t.Fatalf("Submit(one) error = %v", err)
	}
	if received := receive(t, started); received != "one" {
		t.Fatalf("started = %q", received)
	}
	second := task("two", "draw", started, release)
	second.Drop = func() { dropped <- "two" }
	if _, err := scheduler.Submit(second); err != nil {
		t.Fatalf("Submit(two) error = %v", err)
	}
	submission, err := scheduler.Submit(task("three", "draw", started, release))
	if err != nil {
		t.Fatalf("Submit(three) error = %v", err)
	}
	if len(submission.ReplacedInvocationIDs) != 1 || submission.ReplacedInvocationIDs[0] != "two" {
		t.Fatalf("Submit(three) replacement = %#v, want two", submission.ReplacedInvocationIDs)
	}
	if received := receive(t, dropped); received != "two" {
		t.Fatalf("dropped = %q, want replaced task", received)
	}
	if pending := scheduler.Pending(); pending != 2 {
		t.Fatalf("Pending() = %d, want active plus newest", pending)
	}
	release <- struct{}{}
	if received := receive(t, started); received != "three" {
		t.Fatalf("started = %q, want newest", received)
	}
	release <- struct{}{}
}

func TestLatestRunsOneInvocationPerBindingWhenGroupHasCapacity(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"draw": {Mode: "latest", ConcurrencyGroup: "image", ConcurrencyLimit: 2},
	})
	defer scheduler.Close()
	started := make(chan string, 3)
	release := make(chan struct{})
	if _, err := scheduler.Submit(task("one", "draw", started, release)); err != nil {
		t.Fatalf("Submit(one) error = %v", err)
	}
	if received := receive(t, started); received != "one" {
		t.Fatalf("started = %q", received)
	}
	if _, err := scheduler.Submit(task("two", "draw", started, release)); err != nil {
		t.Fatalf("Submit(two) error = %v", err)
	}
	select {
	case value := <-started:
		t.Fatalf("second latest task started early: %s", value)
	case <-time.After(30 * time.Millisecond):
	}
	submission, err := scheduler.Submit(task("three", "draw", started, release))
	if err != nil {
		t.Fatalf("Submit(three) error = %v", err)
	}
	if len(submission.ReplacedInvocationIDs) != 1 || submission.ReplacedInvocationIDs[0] != "two" {
		t.Fatalf("Submit(three) replacement = %#v, want two", submission.ReplacedInvocationIDs)
	}
	if pending := scheduler.Pending(); pending != 2 {
		t.Fatalf("Pending() = %d, want one active plus one pending", pending)
	}
	release <- struct{}{}
	if received := receive(t, started); received != "three" {
		t.Fatalf("started = %q, want newest", received)
	}
	release <- struct{}{}
}

func TestDebouncedLatestUsesOnePendingQueuePosition(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"draw": {Mode: "latest", DebounceMilliseconds: 20, ConcurrencyGroup: "image", ConcurrencyLimit: 2},
	})
	defer scheduler.Close()
	started := make(chan string, 3)
	release := make(chan struct{})
	if _, err := scheduler.Submit(task("one", "draw", started, release)); err != nil {
		t.Fatalf("Submit(one) error = %v", err)
	}
	if received := receive(t, started); received != "one" {
		t.Fatalf("started = %q", received)
	}
	if _, err := scheduler.Submit(task("two", "draw", started, release)); err != nil {
		t.Fatalf("Submit(two) error = %v", err)
	}
	time.Sleep(30 * time.Millisecond)
	submission, err := scheduler.Submit(task("three", "draw", started, release))
	if err != nil {
		t.Fatalf("Submit(three) error = %v", err)
	}
	if len(submission.ReplacedInvocationIDs) != 1 || submission.ReplacedInvocationIDs[0] != "two" {
		t.Fatalf("Submit(three) replacement = %#v, want two", submission.ReplacedInvocationIDs)
	}
	if pending := scheduler.Pending(); pending != 2 {
		t.Fatalf("Pending() = %d, want one active plus one delayed", pending)
	}
	release <- struct{}{}
	select {
	case value := <-started:
		t.Fatalf("replacement ignored debounce: %s", value)
	case <-time.After(5 * time.Millisecond):
	}
	if received := receive(t, started); received != "three" {
		t.Fatalf("started = %q, want newest", received)
	}
	release <- struct{}{}
}

func TestLatestReplacementPreservesSharedGroupPosition(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"blocker": {Mode: "once", ConcurrencyGroup: "image", ConcurrencyLimit: 1},
		"draw":    {Mode: "latest", ConcurrencyGroup: "image", ConcurrencyLimit: 1},
		"other":   {Mode: "once", ConcurrencyGroup: "image", ConcurrencyLimit: 1},
	})
	defer scheduler.Close()
	started := make(chan string, 4)
	release := make(chan struct{})
	for _, candidate := range []Task{
		task("blocker", "blocker", started, release),
		task("draw-old", "draw", started, release),
		task("other", "other", started, release),
	} {
		if _, err := scheduler.Submit(candidate); err != nil {
			t.Fatalf("Submit(%s) error = %v", candidate.InvocationID, err)
		}
	}
	if received := receive(t, started); received != "blocker" {
		t.Fatalf("started = %q, want blocker", received)
	}
	submission, err := scheduler.Submit(task("draw-new", "draw", started, release))
	if err != nil {
		t.Fatalf("Submit(draw-new) error = %v", err)
	}
	if len(submission.ReplacedInvocationIDs) != 1 || submission.ReplacedInvocationIDs[0] != "draw-old" {
		t.Fatalf("Submit(draw-new) replacement = %#v", submission.ReplacedInvocationIDs)
	}
	release <- struct{}{}
	if received := receive(t, started); received != "draw-new" {
		t.Fatalf("started = %q, want replacement in original position", received)
	}
	release <- struct{}{}
	if received := receive(t, started); received != "other" {
		t.Fatalf("started = %q, want other", received)
	}
	release <- struct{}{}
}

func TestSharedGroupRejectsWorkBeyondQueueBound(t *testing.T) {
	configurations := make(map[string]Config, maximumGroupQueue+2)
	for index := 0; index < maximumGroupQueue+2; index++ {
		bindingID := fmt.Sprintf("binding-%d", index)
		configurations[bindingID] = Config{Mode: "latest", ConcurrencyGroup: "image", ConcurrencyLimit: 1}
	}
	scheduler := newTestScheduler(t, configurations)
	started := make(chan string, maximumGroupQueue+2)
	release := make(chan struct{})
	defer func() {
		close(release)
		scheduler.Close()
	}()
	for index := 0; index < maximumGroupQueue+1; index++ {
		bindingID := fmt.Sprintf("binding-%d", index)
		if _, err := scheduler.Submit(task(bindingID, bindingID, started, release)); err != nil {
			t.Fatalf("Submit(%s) error = %v", bindingID, err)
		}
	}
	if pending := scheduler.Pending(); pending != maximumGroupQueue+1 {
		t.Fatalf("Pending() = %d, want active plus bounded queue", pending)
	}
	bindingID := fmt.Sprintf("binding-%d", maximumGroupQueue+1)
	if _, err := scheduler.Submit(task(bindingID, bindingID, started, release)); !errors.Is(err, ErrQueueFull) {
		t.Fatalf("Submit(%s) error = %v, want queue full", bindingID, err)
	}
}

func TestOnceRejectsAnotherInvocationWhileActive(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"submit": {Mode: "once", ConcurrencyGroup: "submit", ConcurrencyLimit: 1},
	})
	defer scheduler.Close()
	started := make(chan string, 1)
	release := make(chan struct{})
	if _, err := scheduler.Submit(task("one", "submit", started, release)); err != nil {
		t.Fatalf("Submit(one) error = %v", err)
	}
	receive(t, started)
	if _, err := scheduler.Submit(task("two", "submit", started, release)); !errors.Is(err, ErrBusy) {
		t.Fatalf("Submit(two) error = %v, want busy", err)
	}
	release <- struct{}{}
}

func TestGroupUsesLowestDeclaredConcurrencyLimit(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"fast": {Mode: "parallel", ConcurrencyGroup: "device", ConcurrencyLimit: 4},
		"slow": {Mode: "parallel", ConcurrencyGroup: "device", ConcurrencyLimit: 1},
	})
	defer scheduler.Close()
	started := make(chan string, 2)
	release := make(chan struct{})
	if _, err := scheduler.Submit(task("one", "fast", started, release)); err != nil {
		t.Fatalf("Submit(one) error = %v", err)
	}
	receive(t, started)
	if _, err := scheduler.Submit(task("two", "fast", started, release)); err != nil {
		t.Fatalf("Submit(two) error = %v", err)
	}
	select {
	case value := <-started:
		t.Fatalf("second task started early: %s", value)
	case <-time.After(30 * time.Millisecond):
	}
	release <- struct{}{}
	if received := receive(t, started); received != "two" {
		t.Fatalf("started = %q", received)
	}
	release <- struct{}{}
}

func TestDebounceRunsOnlyNewestTask(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"draw": {Mode: "latest", DebounceMilliseconds: 20, ConcurrencyGroup: "image", ConcurrencyLimit: 1},
	})
	defer scheduler.Close()
	started := make(chan string, 3)
	for _, id := range []string{"one", "two", "three"} {
		if _, err := scheduler.Submit(Task{InvocationID: id, BindingID: "draw", Run: func(context.Context) { started <- id }}); err != nil {
			t.Fatalf("Submit(%s) error = %v", id, err)
		}
	}
	if received := receive(t, started); received != "three" {
		t.Fatalf("started = %q, want newest", received)
	}
	select {
	case extra := <-started:
		t.Fatalf("unexpected task %q", extra)
	case <-time.After(30 * time.Millisecond):
	}
}

func TestCancelRemovesQueuedAndCancelsActive(t *testing.T) {
	scheduler := newTestScheduler(t, map[string]Config{
		"draw": {Mode: "latest", ConcurrencyGroup: "image", ConcurrencyLimit: 1},
	})
	defer scheduler.Close()
	started := make(chan string, 2)
	cancelled := make(chan string, 1)
	dropped := make(chan string, 1)
	if _, err := scheduler.Submit(Task{InvocationID: "one", BindingID: "draw", Run: func(ctx context.Context) {
		started <- "one"
		<-ctx.Done()
		cancelled <- "one"
	}}); err != nil {
		t.Fatalf("Submit(one) error = %v", err)
	}
	receive(t, started)
	if _, err := scheduler.Submit(Task{InvocationID: "two", BindingID: "draw", Run: func(context.Context) { started <- "two" }, Drop: func() { dropped <- "two" }}); err != nil {
		t.Fatalf("Submit(two) error = %v", err)
	}
	if !scheduler.Cancel("two") || scheduler.Pending() != 1 {
		t.Fatalf("Cancel(queued) failed, pending = %d", scheduler.Pending())
	}
	if received := receive(t, dropped); received != "two" {
		t.Fatalf("dropped = %q, want cancelled task", received)
	}
	if !scheduler.Cancel("one") {
		t.Fatal("Cancel(active) = false")
	}
	if received := receive(t, cancelled); received != "one" {
		t.Fatalf("cancelled = %q", received)
	}
}

func newTestScheduler(t *testing.T, configs map[string]Config) *Scheduler {
	t.Helper()
	scheduler, err := New(configs)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return scheduler
}

func task(id string, binding string, started chan<- string, release <-chan struct{}) Task {
	return Task{InvocationID: id, BindingID: binding, Run: func(context.Context) {
		started <- id
		<-release
	}}
}

func receive(t *testing.T, channel <-chan string) string {
	t.Helper()
	select {
	case value := <-channel:
		return value
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for task")
		return ""
	}
}
