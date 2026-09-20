//go:build windows

package proctree

import (
	"errors"
	"fmt"
	"os/exec"
	"syscall"
	"testing"
	"time"
)

func TestJobAssignsProcessAndClosesOnce(t *testing.T) {
	var calls []string
	operations := jobOperations{
		create: func() (syscall.Handle, error) {
			calls = append(calls, "create")
			return 11, nil
		},
		configure: func(syscall.Handle) error {
			calls = append(calls, "configure")
			return nil
		},
		open: func(processID uint32) (syscall.Handle, error) {
			calls = append(calls, fmt.Sprintf("open:%d", processID))
			return 12, nil
		},
		assign: func(job syscall.Handle, process syscall.Handle) error {
			calls = append(calls, fmt.Sprintf("assign:%d:%d", job, process))
			return nil
		},
		close: func(handle syscall.Handle) error {
			calls = append(calls, fmt.Sprintf("close:%d", handle))
			return nil
		},
		terminate: func(syscall.Handle, uint32) error {
			calls = append(calls, "terminate")
			return nil
		},
	}
	job, err := newJob(operations)
	if err != nil {
		t.Fatalf("newJob() error = %v", err)
	}
	if err := job.Assign(42); err != nil {
		t.Fatalf("Assign() error = %v", err)
	}
	if err := job.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := job.Close(); err != nil {
		t.Fatalf("Close(repeated) error = %v", err)
	}
	want := "[create configure open:42 assign:11:12 close:12 close:11]"
	if fmt.Sprint(calls) != want {
		t.Fatalf("calls = %s, want %s", fmt.Sprint(calls), want)
	}
}

func TestJobCloseFailureTerminatesAndRetries(t *testing.T) {
	closeErr := errors.New("close denied")
	closes := 0
	terminated := 0
	job := &Job{handle: 11, operations: jobOperations{
		close: func(syscall.Handle) error {
			closes++
			if closes == 1 {
				return closeErr
			}
			return nil
		},
		terminate: func(syscall.Handle, uint32) error {
			terminated++
			return nil
		},
	}}
	if err := job.Close(); !errors.Is(err, closeErr) {
		t.Fatalf("Close() error = %v", err)
	}
	if err := job.Close(); err != nil {
		t.Fatalf("Close(repeated) error = %v", err)
	}
	if closes != 2 || terminated != 1 {
		t.Fatalf("close calls = %d, terminate calls = %d", closes, terminated)
	}
}

func TestJobAssignmentFailureStillReleasesProcessHandle(t *testing.T) {
	assignErr := errors.New("assign denied")
	closed := false
	job := &Job{handle: 11, operations: jobOperations{
		open:   func(uint32) (syscall.Handle, error) { return 12, nil },
		assign: func(syscall.Handle, syscall.Handle) error { return assignErr },
		close: func(syscall.Handle) error {
			closed = true
			return nil
		},
	}}
	if err := job.Assign(42); !errors.Is(err, assignErr) || !closed {
		t.Fatalf("Assign() = %v, closed = %t", err, closed)
	}
}

func TestJobCloseTerminatesAssignedProcess(t *testing.T) {
	job, err := NewJob()
	if err != nil {
		t.Fatalf("NewJob() error = %v", err)
	}
	jobClosed := false
	command := exec.Command("cmd.exe", "/d", "/s", "/c", "ping -n 31 127.0.0.1 >NUL")
	if err := command.Start(); err != nil {
		_ = job.Close()
		t.Fatalf("start child process: %v", err)
	}
	waitStarted := false
	waitFinished := false
	waitDone := make(chan error, 1)
	t.Cleanup(func() {
		if !jobClosed {
			_ = job.Close()
		}
		if !waitStarted {
			_ = command.Process.Kill()
			_ = command.Wait()
			return
		}
		if !waitFinished {
			_ = command.Process.Kill()
			select {
			case <-waitDone:
			case <-time.After(time.Second):
			}
		}
	})
	if err := job.Assign(command.Process.Pid); err != nil {
		t.Fatalf("Assign() error = %v", err)
	}
	if err := job.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	jobClosed = true
	waitStarted = true
	go func() { waitDone <- command.Wait() }()
	select {
	case <-waitDone:
		waitFinished = true
	case <-time.After(5 * time.Second):
		t.Fatal("Close() did not terminate its assigned process")
	}
}
