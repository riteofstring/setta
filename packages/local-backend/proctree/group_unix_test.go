//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package proctree

import (
	"os/exec"
	"syscall"
	"testing"
	"time"
)

func TestConfigureGroupPreservesExistingProcessAttributes(t *testing.T) {
	command := exec.Command("ignored")
	command.SysProcAttr = &syscall.SysProcAttr{}
	attributes := command.SysProcAttr
	if err := ConfigureGroup(command); err != nil {
		t.Fatalf("ConfigureGroup() error = %v", err)
	}
	if command.SysProcAttr != attributes || !command.SysProcAttr.Setpgid {
		t.Fatalf("process attributes = %#v", command.SysProcAttr)
	}
}

func TestGroupRequestsAndCompletesBoundedTerminationOnce(t *testing.T) {
	type signalCall struct {
		processID int
		delivery  syscall.Signal
	}
	var calls []signalCall
	var sleeps []time.Duration
	group, err := newGroup(4242, groupOperations{
		kill: func(processID int, delivery syscall.Signal) error {
			calls = append(calls, signalCall{processID: processID, delivery: delivery})
			return nil
		},
		group:          func(int) (int, error) { return 4242, nil },
		currentProcess: func() int { return 1 },
		currentGroup:   func() int { return 2 },
		sleep:          func(duration time.Duration) { sleeps = append(sleeps, duration) },
	})
	if err != nil {
		t.Fatalf("newGroup() error = %v", err)
	}
	if err := group.RequestTermination(); err != nil {
		t.Fatalf("RequestTermination() error = %v", err)
	}
	if err := group.RequestTermination(); err != nil {
		t.Fatalf("RequestTermination(repeated) error = %v", err)
	}
	if err := group.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := group.Close(); err != nil {
		t.Fatalf("Close(repeated) error = %v", err)
	}
	want := []signalCall{
		{processID: -4242, delivery: syscall.SIGTERM},
		{processID: -4242, delivery: syscall.SIGTERM},
		{processID: -4242, delivery: syscall.SIGKILL},
	}
	if len(calls) != len(want) {
		t.Fatalf("signal calls = %#v", calls)
	}
	for index := range want {
		if calls[index] != want[index] {
			t.Fatalf("signal calls = %#v", calls)
		}
	}
	if len(sleeps) != 1 || sleeps[0] != TerminationGrace {
		t.Fatalf("sleeps = %#v", sleeps)
	}
}

func TestGroupRefusesReusedLeaderIdentity(t *testing.T) {
	killed := false
	group, err := newGroup(4242, groupOperations{
		kill: func(int, syscall.Signal) error {
			killed = true
			return nil
		},
		group:          func(int) (int, error) { return 99, nil },
		currentProcess: func() int { return 1 },
		currentGroup:   func() int { return 2 },
		sleep:          func(time.Duration) {},
	})
	if err != nil {
		t.Fatalf("newGroup() error = %v", err)
	}
	if err := group.Close(); err == nil || killed {
		t.Fatalf("Close() error = %v, killed = %t", err, killed)
	}
}

func TestGroupSignalsLeaderlessOwnedGroup(t *testing.T) {
	called := false
	group, err := newGroup(4242, groupOperations{
		kill: func(processID int, delivery syscall.Signal) error {
			called = processID == -4242 && delivery == syscall.SIGTERM
			return syscall.ESRCH
		},
		group:          func(int) (int, error) { return 0, syscall.ESRCH },
		currentProcess: func() int { return 1 },
		currentGroup:   func() int { return 2 },
		sleep:          func(time.Duration) {},
	})
	if err != nil {
		t.Fatalf("newGroup() error = %v", err)
	}
	if err := group.RequestTermination(); err != nil || !called {
		t.Fatalf("RequestTermination() = %v, called = %t", err, called)
	}
}

func TestGroupRejectsUnsafeIdentityAndMissingOperations(t *testing.T) {
	operations := groupOperations{
		kill:           syscall.Kill,
		group:          syscall.Getpgid,
		currentProcess: func() int { return 7 },
		currentGroup:   func() int { return 8 },
		sleep:          time.Sleep,
	}
	for _, processID := range []int{0, 7, 8} {
		if _, err := newGroup(processID, operations); err == nil {
			t.Fatalf("newGroup(%d) error = nil", processID)
		}
	}
	operations.kill = nil
	if _, err := newGroup(9, operations); err == nil {
		t.Fatal("newGroup(missing operation) error = nil")
	}
	if err := ConfigureGroup(nil); err == nil {
		t.Fatal("ConfigureGroup(nil) error = nil")
	}
}
