package launcher

import (
	"fmt"
	"math"
	"path/filepath"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/auth"
	"setta/internal/localsessions"
)

const (
	localRollbackTerminateTimeout = 2 * time.Second
	localRollbackKillTimeout      = 2 * time.Second
	localRollbackPollInterval     = 50 * time.Millisecond
	pidCreateTimeToleranceSeconds = 0.01
)

func rollbackStartedLocalSession(session auth.SessionMetadata, runtimeRoot string) error {
	if session.PIDCreateTime == nil {
		return fmt.Errorf("Missing pidCreateTime for newly started local session %s.", session.ID)
	}
	if err := stopLocalSessionProcess(session.ID, session.PID, *session.PIDCreateTime); err != nil {
		return err
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(runtimeRoot, "sessions"),
	})
	if err != nil {
		return fmt.Errorf("Session registry cannot delete session %s during rollback: %w", session.ID, err)
	}
	if err := registry.DeleteSession(session.ID); err != nil {
		return fmt.Errorf("Failed deleting session metadata for %s during rollback.", session.ID)
	}
	return nil
}

func stopLocalSessionProcess(sessionID string, pid int, pidCreateTime float64) error {
	if pid <= 0 || !isPIDRunning(pid) {
		return nil
	}
	if !pidMatchesCreateTime(pid, pidCreateTime) {
		return fmt.Errorf("Process identity mismatch for session process %d during rollback of %s.", pid, sessionID)
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return nil
	}
	if err := proc.Terminate(); err != nil && isPIDRunning(pid) {
		return fmt.Errorf("Failed terminating session process %d for %s during rollback.", pid, sessionID)
	}
	if waitForPIDExit(pid, localRollbackTerminateTimeout) {
		return nil
	}
	if !pidMatchesCreateTime(pid, pidCreateTime) {
		return fmt.Errorf("Process identity changed for session process %d during rollback of %s.", pid, sessionID)
	}
	if err := proc.Kill(); err != nil && isPIDRunning(pid) {
		return fmt.Errorf("Failed killing session process %d for %s during rollback.", pid, sessionID)
	}
	if waitForPIDExit(pid, localRollbackKillTimeout) {
		return nil
	}
	return fmt.Errorf("Session process %d for %s did not exit during rollback.", pid, sessionID)
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
