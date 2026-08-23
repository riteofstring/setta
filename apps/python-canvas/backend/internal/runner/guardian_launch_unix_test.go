//go:build darwin || linux

package runner

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestPrivateGuardianLaunchAcceptsDelayedStartupStatus(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("create guardian status pipe: %v", err)
	}
	t.Cleanup(func() {
		_ = reader.Close()
		_ = writer.Close()
	})
	launch := &privateGuardianLaunch{statusReader: reader}
	delay := 1100 * time.Millisecond
	go func() {
		time.Sleep(delay)
		_ = writePrivateGuardianStatus(writer, privateGuardianReady)
	}()

	started := time.Now()
	if err := launch.expectStatus(privateGuardianReady); err != nil {
		t.Fatalf("accept delayed startup status: %v", err)
	}
	if elapsed := time.Since(started); elapsed < delay {
		t.Fatalf("startup status returned after %s, want at least %s", elapsed, delay)
	}
	if privateGuardianStartupTimeout <= delay {
		t.Fatalf("startup timeout = %s, want more than delayed handshake %s", privateGuardianStartupTimeout, delay)
	}
}

func TestPrivateGuardianOwnedProcessBoundsStalledTerminationStatus(t *testing.T) {
	statusReader, statusWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("create guardian status pipe: %v", err)
	}
	ready := filepath.Join(t.TempDir(), "guardian-ready")
	command := exec.Command("/bin/sh", "-c", `trap '' TERM; : > "$1"; exec /bin/sleep 30`, "sh", ready)
	if err := command.Start(); err != nil {
		t.Fatalf("start stalled guardian: %v", err)
	}
	t.Cleanup(func() {
		_ = statusReader.Close()
		_ = statusWriter.Close()
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		_ = command.Wait()
	})
	waitForTestFile(t, ready)
	owner := &privateGuardianOwnedProcess{
		command: command,
		launch:  &privateGuardianLaunch{statusReader: statusReader},
	}

	started := time.Now()
	err = owner.terminate()
	if err == nil {
		t.Fatal("terminate() error = nil, want stalled guardian status failure")
	}
	if elapsed := time.Since(started); elapsed > privateGuardianTerminationTimeout+time.Second {
		t.Fatalf("terminate() took %s, want bounded by guardian termination timeout", elapsed)
	}
	if owner.ownsCommandTermination() {
		t.Fatal("stalled guardian retained direct-command ownership after forced stop")
	}
	if waitErr := command.Wait(); waitErr == nil {
		t.Fatal("stalled guardian Wait() error = nil, want forced termination")
	} else if errors.Is(waitErr, os.ErrProcessDone) {
		t.Fatalf("stalled guardian Wait() error = %v, want process reaped by this test", waitErr)
	}
}

func TestPrivateGuardianExitRejectsUnexpectedWaitFailure(t *testing.T) {
	waitErr := errors.New("wait failed")
	result, err := privateGuardianExitFromTarget(waitErr)
	if !errors.Is(err, waitErr) {
		t.Fatalf("privateGuardianExitFromTarget() error = %v, want wait failure", err)
	}
	if result != (privateGuardianExit{}) {
		t.Fatalf("privateGuardianExitFromTarget() result = %#v, want no synthetic exit", result)
	}
}
