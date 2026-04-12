package localsessions

import (
	"fmt"
	"math"
	"path/filepath"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/auth"
)

const (
	localRollbackTerminateTimeout = 2 * time.Second
	localRollbackKillTimeout      = 2 * time.Second
	localRollbackPollInterval     = 50 * time.Millisecond
	pidCreateTimeToleranceSeconds = 0.01
)

type sessionRegistryDeleter interface {
	DeleteSession(sessionID string) error
}

type sessionRegistryFactory func(runtimeRoot string) (sessionRegistryDeleter, error)

func RollbackStartedLocalSession(session auth.SessionMetadata, runtimeRoot string) error {
	return rollbackStartedLocalSession(session, runtimeRoot, stopLocalSessionProcess, defaultSessionRegistryFactory)
}

func rollbackStartedLocalSession(
	session auth.SessionMetadata,
	runtimeRoot string,
	stopProcess func(sessionID string, pid int, pidCreateTime float64) error,
	registryFactory sessionRegistryFactory,
) error {
	if session.PIDCreateTime == nil {
		return fmt.Errorf("Missing pidCreateTime for newly started local session %s.", session.ID)
	}
	if stopProcess == nil {
		stopProcess = stopLocalSessionProcess
	}
	if registryFactory == nil {
		registryFactory = defaultSessionRegistryFactory
	}
	if err := stopProcess(session.ID, session.PID, *session.PIDCreateTime); err != nil {
		return err
	}
	registry, err := registryFactory(runtimeRoot)
	if err != nil {
		return fmt.Errorf("Session registry cannot delete session %s during rollback: %w", session.ID, err)
	}
	if err := registry.DeleteSession(session.ID); err != nil {
		return fmt.Errorf("Failed deleting session metadata for %s during rollback.", session.ID)
	}
	return nil
}

func defaultSessionRegistryFactory(runtimeRoot string) (sessionRegistryDeleter, error) {
	return NewRegistry(RegistryOptions{
		SessionsRoot: filepath.Join(runtimeRoot, "sessions"),
	})
}

func stopLocalSessionProcess(sessionID string, pid int, pidCreateTime float64) error {
	if !isPIDRunning(pid) {
		return nil
	}
	if err := requireRollbackPIDCreateTime(
		pid,
		pidCreateTime,
		sessionID,
		"Process identity mismatch for session process %d during rollback of %s.",
	); err != nil {
		return err
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return nil
	}
	exited, err := sendRollbackProcessSignal(proc.Terminate, pid, localRollbackTerminateTimeout)
	if err != nil {
		return fmt.Errorf("Failed terminating session process %d for %s during rollback.", pid, sessionID)
	}
	if exited {
		return nil
	}
	if err := requireRollbackPIDCreateTime(
		pid,
		pidCreateTime,
		sessionID,
		"Process identity changed for session process %d during rollback of %s.",
	); err != nil {
		return err
	}
	exited, err = sendRollbackProcessSignal(proc.Kill, pid, localRollbackKillTimeout)
	if err != nil {
		return fmt.Errorf("Failed killing session process %d for %s during rollback.", pid, sessionID)
	}
	if exited {
		return nil
	}
	return fmt.Errorf("Session process %d for %s did not exit during rollback.", pid, sessionID)
}

func requireRollbackPIDCreateTime(pid int, expectedCreateTime float64, sessionID string, message string) error {
	if pidMatchesCreateTime(pid, expectedCreateTime) {
		return nil
	}
	return fmt.Errorf(message, pid, sessionID)
}

func sendRollbackProcessSignal(signal func() error, pid int, timeout time.Duration) (bool, error) {
	if err := signal(); err != nil && isPIDRunning(pid) {
		return false, err
	}
	return waitForPIDExit(pid, timeout), nil
}

func waitForPIDExit(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isPIDRunning(pid) {
			return true
		}
		time.Sleep(localRollbackPollInterval)
	}
	return !isPIDRunning(pid)
}

func isPIDRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return false
	}
	running, err := proc.IsRunning()
	if err != nil {
		return false
	}
	return running
}

func pidMatchesCreateTime(pid int, expectedCreateTime float64) bool {
	if pid <= 0 || !isPIDRunning(pid) {
		return false
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return false
	}
	createTimeMillis, err := proc.CreateTime()
	if err != nil {
		return false
	}
	actualCreateTime := float64(createTimeMillis) / 1000.0
	return math.Abs(actualCreateTime-expectedCreateTime) <= pidCreateTimeToleranceSeconds
}
