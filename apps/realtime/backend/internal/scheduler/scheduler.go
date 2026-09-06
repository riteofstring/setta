package scheduler

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

const maximumGroupQueue = 64

var (
	ErrClosed         = errors.New("scheduler: closed")
	ErrBindingUnknown = errors.New("scheduler: binding is not configured")
	ErrBusy           = errors.New("scheduler: binding is busy")
	ErrQueueFull      = errors.New("scheduler: queue is full")
)

type Config struct {
	Mode                 string
	DebounceMilliseconds uint64
	ConcurrencyGroup     string
	ConcurrencyLimit     int
}

type Task struct {
	InvocationID string
	BindingID    string
	Run          func(context.Context)
}

type bindingState struct {
	config    Config
	running   int
	queued    int
	debounced *Task
	timer     *time.Timer
}

type queuedTask struct {
	task      Task
	binding   *bindingState
	groupName string
}

type groupState struct {
	limit  int
	active int
	queue  []queuedTask
}

type activeTask struct {
	cancel  context.CancelFunc
	binding *bindingState
	group   *groupState
}

type Scheduler struct {
	mu       sync.Mutex
	root     context.Context
	cancel   context.CancelFunc
	bindings map[string]*bindingState
	groups   map[string]*groupState
	active   map[string]activeTask
	closed   bool
	wait     sync.WaitGroup
}

func New(configurations map[string]Config) (*Scheduler, error) {
	if configurations == nil {
		return nil, errors.New("scheduler: configurations are required")
	}
	root, cancel := context.WithCancel(context.Background())
	scheduler := &Scheduler{
		root: root, cancel: cancel, bindings: make(map[string]*bindingState, len(configurations)),
		groups: make(map[string]*groupState), active: make(map[string]activeTask),
	}
	for bindingID, configuration := range configurations {
		if bindingID == "" || configuration.ConcurrencyGroup == "" || configuration.ConcurrencyLimit < 1 || configuration.ConcurrencyLimit > 64 {
			cancel()
			return nil, fmt.Errorf("scheduler: invalid configuration for %q", bindingID)
		}
		if configuration.Mode != "once" && configuration.Mode != "latest" && configuration.Mode != "parallel" {
			cancel()
			return nil, fmt.Errorf("scheduler: invalid mode for %q", bindingID)
		}
		state := &bindingState{config: configuration}
		scheduler.bindings[bindingID] = state
		group := scheduler.groups[configuration.ConcurrencyGroup]
		if group == nil {
			group = &groupState{limit: configuration.ConcurrencyLimit}
			scheduler.groups[configuration.ConcurrencyGroup] = group
		} else {
			group.limit = min(group.limit, configuration.ConcurrencyLimit)
		}
	}
	return scheduler, nil
}

func (scheduler *Scheduler) Submit(task Task) error {
	if task.InvocationID == "" || task.BindingID == "" || task.Run == nil {
		return errors.New("scheduler: task is invalid")
	}
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	if scheduler.closed {
		return ErrClosed
	}
	if _, exists := scheduler.active[task.InvocationID]; exists || scheduler.hasQueuedInvocationLocked(task.InvocationID) {
		return errors.New("scheduler: invocation identity is duplicated")
	}
	binding := scheduler.bindings[task.BindingID]
	if binding == nil {
		return ErrBindingUnknown
	}
	if binding.config.DebounceMilliseconds > 0 {
		return scheduler.debounceLocked(binding, task)
	}
	return scheduler.enqueueLocked(binding, task)
}

func (scheduler *Scheduler) debounceLocked(binding *bindingState, task Task) error {
	if binding.config.Mode == "once" && (binding.running > 0 || binding.queued > 0 || binding.debounced != nil) {
		return ErrBusy
	}
	if binding.config.Mode == "parallel" && binding.running+binding.queued >= maximumGroupQueue {
		return ErrQueueFull
	}
	binding.debounced = &task
	if binding.timer != nil {
		binding.timer.Stop()
	}
	delay := time.Duration(binding.config.DebounceMilliseconds) * time.Millisecond
	binding.timer = time.AfterFunc(delay, func() {
		scheduler.releaseDebounced(task.BindingID, task.InvocationID)
	})
	return nil
}

func (scheduler *Scheduler) releaseDebounced(bindingID string, invocationID string) {
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	if scheduler.closed {
		return
	}
	binding := scheduler.bindings[bindingID]
	if binding == nil || binding.debounced == nil || binding.debounced.InvocationID != invocationID {
		return
	}
	task := *binding.debounced
	binding.debounced = nil
	binding.timer = nil
	_ = scheduler.enqueueLocked(binding, task)
}

func (scheduler *Scheduler) enqueueLocked(binding *bindingState, task Task) error {
	group := scheduler.groups[binding.config.ConcurrencyGroup]
	if group == nil {
		return ErrBindingUnknown
	}
	switch binding.config.Mode {
	case "once":
		if binding.running > 0 || binding.queued > 0 {
			return ErrBusy
		}
	case "latest":
		if scheduler.replaceLatestQueuedLocked(group, binding, task) {
			return nil
		}
	case "parallel":
		if len(group.queue) >= maximumGroupQueue {
			return ErrQueueFull
		}
	}
	group.queue = append(group.queue, queuedTask{task: task, binding: binding, groupName: binding.config.ConcurrencyGroup})
	binding.queued++
	scheduler.dispatchLocked(group)
	return nil
}

func (scheduler *Scheduler) replaceLatestQueuedLocked(group *groupState, binding *bindingState, task Task) bool {
	for index := len(group.queue) - 1; index >= 0; index-- {
		if group.queue[index].binding == binding {
			group.queue[index].task = task
			return true
		}
	}
	return false
}

func (scheduler *Scheduler) dispatchLocked(group *groupState) {
	for group.active < group.limit {
		index := scheduler.nextRunnableLocked(group)
		if index < 0 {
			return
		}
		queued := group.queue[index]
		group.queue = append(group.queue[:index], group.queue[index+1:]...)
		queued.binding.queued--
		queued.binding.running++
		group.active++
		ctx, cancel := context.WithCancel(scheduler.root)
		scheduler.active[queued.task.InvocationID] = activeTask{cancel: cancel, binding: queued.binding, group: group}
		scheduler.wait.Add(1)
		go scheduler.run(ctx, queued.task)
	}
}

func (scheduler *Scheduler) nextRunnableLocked(group *groupState) int {
	for index, queued := range group.queue {
		if queued.binding.running < queued.binding.config.ConcurrencyLimit {
			return index
		}
	}
	return -1
}

func (scheduler *Scheduler) run(ctx context.Context, task Task) {
	defer scheduler.wait.Done()
	task.Run(ctx)
	scheduler.mu.Lock()
	active, exists := scheduler.active[task.InvocationID]
	if exists {
		delete(scheduler.active, task.InvocationID)
		active.cancel()
		active.binding.running--
		active.group.active--
		scheduler.dispatchLocked(active.group)
	}
	scheduler.mu.Unlock()
}

func (scheduler *Scheduler) Cancel(invocationID string) bool {
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	if scheduler.closed {
		return false
	}
	if active, exists := scheduler.active[invocationID]; exists {
		active.cancel()
		return true
	}
	for _, binding := range scheduler.bindings {
		if binding.debounced != nil && binding.debounced.InvocationID == invocationID {
			binding.debounced = nil
			if binding.timer != nil {
				binding.timer.Stop()
				binding.timer = nil
			}
			return true
		}
	}
	for _, group := range scheduler.groups {
		for index, queued := range group.queue {
			if queued.task.InvocationID == invocationID {
				queued.binding.queued--
				group.queue = append(group.queue[:index], group.queue[index+1:]...)
				return true
			}
		}
	}
	return false
}

func (scheduler *Scheduler) Pending() int {
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	total := len(scheduler.active)
	for _, binding := range scheduler.bindings {
		if binding.debounced != nil {
			total++
		}
		total += binding.queued
	}
	return total
}

func (scheduler *Scheduler) Close() {
	scheduler.mu.Lock()
	if scheduler.closed {
		scheduler.mu.Unlock()
		return
	}
	scheduler.closed = true
	scheduler.cancel()
	for _, binding := range scheduler.bindings {
		if binding.timer != nil {
			binding.timer.Stop()
		}
		binding.debounced = nil
	}
	for _, group := range scheduler.groups {
		group.queue = nil
	}
	scheduler.mu.Unlock()
	scheduler.wait.Wait()
}

func (scheduler *Scheduler) hasQueuedInvocationLocked(invocationID string) bool {
	for _, binding := range scheduler.bindings {
		if binding.debounced != nil && binding.debounced.InvocationID == invocationID {
			return true
		}
	}
	for _, group := range scheduler.groups {
		for _, queued := range group.queue {
			if queued.task.InvocationID == invocationID {
				return true
			}
		}
	}
	return false
}
