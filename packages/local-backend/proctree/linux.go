//go:build linux

package proctree

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const linuxSetChildSubreaper = 36

type linuxOwnerOperations struct {
	children func() ([]int, error)
	kill     func(int, syscall.Signal) error
	wait     func() (int, error)
	now      func() time.Time
	sleep    func(time.Duration)
}

type LinuxOwner struct {
	timeout time.Duration
	mutex   sync.Mutex
	closed  bool
	err     error
}

func EnableLinuxChildSubreaper() error {
	if _, _, errno := syscall.RawSyscall6(syscall.SYS_PRCTL, linuxSetChildSubreaper, 1, 0, 0, 0, 0); errno != 0 {
		return fmt.Errorf("proctree: establish Linux child subreaper: %w", errno)
	}
	return nil
}

func NewLinuxOwner(cleanupTimeout time.Duration) (*LinuxOwner, error) {
	if cleanupTimeout <= 0 {
		return nil, errors.New("proctree: Linux cleanup timeout is invalid")
	}
	if err := EnableLinuxChildSubreaper(); err != nil {
		return nil, err
	}
	return &LinuxOwner{timeout: cleanupTimeout}, nil
}

func (owner *LinuxOwner) Close() error {
	if owner == nil || owner.timeout <= 0 {
		return errors.New("proctree: Linux owner is unavailable")
	}
	owner.mutex.Lock()
	defer owner.mutex.Unlock()
	if owner.closed {
		return owner.err
	}
	owner.closed = true
	owner.err = terminateAndReapLinuxChildren(owner.timeout, defaultLinuxOwnerOperations())
	return owner.err
}

func defaultLinuxOwnerOperations() linuxOwnerOperations {
	return linuxOwnerOperations{
		children: linuxDirectChildren,
		kill:     syscall.Kill,
		wait: func() (int, error) {
			var status syscall.WaitStatus
			return syscall.Wait4(-1, &status, syscall.WNOHANG, nil)
		},
		now:   time.Now,
		sleep: time.Sleep,
	}
}

func terminateAndReapLinuxChildren(timeout time.Duration, operations linuxOwnerOperations) error {
	if err := validateLinuxOwnerOperations(timeout, operations); err != nil {
		return err
	}
	deadline := operations.now().Add(timeout)
	var result error
	for {
		children, err := operations.children()
		if err != nil {
			return errors.Join(result, fmt.Errorf("proctree: list Linux children: %w", err))
		}
		result = errors.Join(result, killLinuxChildren(children, operations.kill))
		complete, err := reapLinuxChildSnapshot(deadline, operations)
		result = errors.Join(result, err)
		if complete || err != nil {
			return result
		}
	}
}

func validateLinuxOwnerOperations(timeout time.Duration, operations linuxOwnerOperations) error {
	if timeout <= 0 || operations.children == nil || operations.kill == nil || operations.wait == nil || operations.now == nil || operations.sleep == nil {
		return errors.New("proctree: Linux child cleanup operations are unavailable")
	}
	return nil
}

func killLinuxChildren(children []int, kill func(int, syscall.Signal) error) error {
	var result error
	for _, processID := range children {
		if err := kill(processID, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			result = errors.Join(result, fmt.Errorf("proctree: kill Linux child %d: %w", processID, err))
		}
	}
	return result
}

func reapLinuxChildSnapshot(deadline time.Time, operations linuxOwnerOperations) (bool, error) {
	for {
		processID, err := operations.wait()
		switch {
		case errors.Is(err, syscall.ECHILD):
			return true, nil
		case errors.Is(err, syscall.EINTR):
			continue
		case err != nil:
			return false, fmt.Errorf("proctree: reap Linux child: %w", err)
		case processID > 0:
			continue
		case processID < 0:
			return false, fmt.Errorf("proctree: reap Linux child returned invalid PID %d", processID)
		case !operations.now().Before(deadline):
			return false, errors.New("proctree: timed out reaping Linux children")
		default:
			operations.sleep(10 * time.Millisecond)
			return false, nil
		}
	}
}

func linuxDirectChildren() ([]int, error) {
	threads, err := os.ReadDir("/proc/self/task")
	if err != nil {
		return nil, err
	}
	seen := make(map[int]struct{})
	for _, thread := range threads {
		contents, err := os.ReadFile(filepath.Join("/proc/self/task", thread.Name(), "children"))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, value := range strings.Fields(string(contents)) {
			processID, err := strconv.Atoi(value)
			if err != nil || processID < 1 {
				return nil, fmt.Errorf("invalid child PID %q", value)
			}
			seen[processID] = struct{}{}
		}
	}
	children := make([]int, 0, len(seen))
	for processID := range seen {
		children = append(children, processID)
	}
	sort.Ints(children)
	return children, nil
}
