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
	Ready        bool
	Run          func(context.Context)
	Drop         func()
}

type Submission struct {
	ReplacedInvocationIDs []string
}

type bindingState struct {
	config              Config
	running             int
	queued              int
	delayedInvocationID string
	timer               *time.Timer
}

type queuedTask struct {
	task            Task
	binding         *bindingState
	dependencyReady bool
	debounceReady   bool
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

func (scheduler *Scheduler) Submit(task Task) (Submission, error) {
	if task.InvocationID == "" || task.BindingID == "" || task.Run == nil {
		return Submission{}, errors.New("scheduler: task is invalid")
	}
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	if scheduler.closed {
		return Submission{}, ErrClosed
	}
	if _, exists := scheduler.active[task.InvocationID]; exists || scheduler.hasQueuedInvocationLocked(task.InvocationID) {
		return Submission{}, errors.New("scheduler: invocation identity is duplicated")
	}
	binding := scheduler.bindings[task.BindingID]
	if binding == nil {
		return Submission{}, ErrBindingUnknown
	}
	if binding.config.DebounceMilliseconds > 0 {
		return scheduler.debounceLocked(binding, task)
	}
	return scheduler.enqueueLocked(binding, task)
}

func (scheduler *Scheduler) debounceLocked(binding *bindingState, task Task) (Submission, error) {
	group := scheduler.groups[binding.config.ConcurrencyGroup]
	if group == nil {
		return Submission{}, ErrBindingUnknown
	}
	if binding.config.Mode == "once" && (binding.running > 0 || binding.queued > 0) {
		return Submission{}, ErrBusy
	}
	index := scheduler.debouncedReplacementIndexLocked(group, binding)
	result := Submission{}
	if index >= 0 {
		result = scheduler.replaceQueuedLocked(group, index, task, false)
	} else {
		if len(group.queue) >= maximumGroupQueue {
			return Submission{}, ErrQueueFull
		}
		group.queue = append(group.queue, queuedTask{task: task, binding: binding, dependencyReady: task.Ready})
		binding.queued++
	}
	binding.delayedInvocationID = task.InvocationID
	if binding.timer != nil {
		binding.timer.Stop()
	}
	delay := time.Duration(binding.config.DebounceMilliseconds) * time.Millisecond
	binding.timer = time.AfterFunc(delay, func() {
		scheduler.releaseDebounced(task.BindingID, task.InvocationID)
	})
	scheduler.dispatchLocked(group)
	return result, nil
}

func (scheduler *Scheduler) releaseDebounced(bindingID string, invocationID string) {
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	if scheduler.closed {
		return
	}
	binding := scheduler.bindings[bindingID]
	if binding == nil || binding.delayedInvocationID != invocationID {
		return
	}
	group := scheduler.groups[binding.config.ConcurrencyGroup]
	if group == nil {
		return
	}
	index := scheduler.queuedInvocationIndexLocked(group, invocationID)
	if index < 0 {
		return
	}
	group.queue[index].debounceReady = true
	binding.delayedInvocationID = ""
	binding.timer = nil
	scheduler.dispatchLocked(group)
}

func (scheduler *Scheduler) enqueueLocked(binding *bindingState, task Task) (Submission, error) {
	group := scheduler.groups[binding.config.ConcurrencyGroup]
	if group == nil {
		return Submission{}, ErrBindingUnknown
	}
	switch binding.config.Mode {
	case "once":
		if binding.running > 0 || binding.queued > 0 {
			return Submission{}, ErrBusy
		}
	case "latest":
		if index := scheduler.queuedBindingIndexLocked(group, binding); index >= 0 {
			result := scheduler.replaceQueuedLocked(group, index, task, true)
			scheduler.clearDelayedLocked(binding)
			scheduler.dispatchLocked(group)
			return result, nil
		}
	}
	if len(group.queue) >= maximumGroupQueue {
		return Submission{}, ErrQueueFull
	}
	group.queue = append(group.queue, queuedTask{task: task, binding: binding, dependencyReady: task.Ready, debounceReady: true})
	binding.queued++
	scheduler.dispatchLocked(group)
	return Submission{}, nil
}

func (scheduler *Scheduler) debouncedReplacementIndexLocked(group *groupState, binding *bindingState) int {
	if binding.config.Mode == "latest" {
		return scheduler.queuedBindingIndexLocked(group, binding)
	}
	if binding.delayedInvocationID == "" {
		return -1
	}
	return scheduler.queuedInvocationIndexLocked(group, binding.delayedInvocationID)

}

func (scheduler *Scheduler) queuedBindingIndexLocked(group *groupState, binding *bindingState) int {
	for index := range group.queue {
		if group.queue[index].binding == binding {
			return index
		}
	}
	return -1
}

func (scheduler *Scheduler) queuedInvocationIndexLocked(group *groupState, invocationID string) int {
	for index := range group.queue {
		if group.queue[index].task.InvocationID == invocationID {
			return index
		}
	}
	return -1
}

func (scheduler *Scheduler) replaceQueuedLocked(group *groupState, index int, task Task, debounceReady bool) Submission {
	replaced := group.queue[index].task
	dropTask(replaced)
	group.queue[index].task = task
	group.queue[index].dependencyReady = task.Ready
	group.queue[index].debounceReady = debounceReady
	return Submission{ReplacedInvocationIDs: []string{replaced.InvocationID}}

}

func (scheduler *Scheduler) clearDelayedLocked(binding *bindingState) {
	binding.delayedInvocationID = ""
	if binding.timer != nil {
		binding.timer.Stop()
		binding.timer = nil
	}
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
		if queued.dependencyReady && queued.debounceReady && queued.binding.running < bindingConcurrencyLimit(queued.binding) {
			return index
		}
	}
	return -1
}

func (scheduler *Scheduler) Ready(invocationID string) bool {
	scheduler.mu.Lock()
	defer scheduler.mu.Unlock()
	if scheduler.closed {
		return false
	}
	for _, group := range scheduler.groups {
		index := scheduler.queuedInvocationIndexLocked(group, invocationID)
		if index < 0 {
			continue
		}
		group.queue[index].dependencyReady = true
		scheduler.dispatchLocked(group)
		return true
	}
	return false
}

func bindingConcurrencyLimit(binding *bindingState) int {
	if binding.config.Mode == "parallel" {
		return binding.config.ConcurrencyLimit
	}
	return 1
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
	for _, group := range scheduler.groups {
		for index, queued := range group.queue {
			if queued.task.InvocationID == invocationID {
				dropTask(queued.task)
				queued.binding.queued--
				if queued.binding.delayedInvocationID == invocationID {
					scheduler.clearDelayedLocked(queued.binding)
				}
				group.queue = append(group.queue[:index], group.queue[index+1:]...)
				scheduler.dispatchLocked(group)
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
	for _, group := range scheduler.groups {
		total += len(group.queue)
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
		binding.delayedInvocationID = ""
		binding.timer = nil
	}
	for _, group := range scheduler.groups {
		for _, queued := range group.queue {
			dropTask(queued.task)
		}
		group.queue = nil
	}
	scheduler.mu.Unlock()
	scheduler.wait.Wait()
}

func dropTask(task Task) {
	if task.Drop != nil {
		task.Drop()
	}
}

func (scheduler *Scheduler) hasQueuedInvocationLocked(invocationID string) bool {
	for _, group := range scheduler.groups {
		for _, queued := range group.queue {
			if queued.task.InvocationID == invocationID {
				return true
			}
		}
	}
	return false
}
