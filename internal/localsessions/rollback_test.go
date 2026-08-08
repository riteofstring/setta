package localsessions

import (
	"errors"
	"strings"
	"testing"

	"setta/internal/auth"
)

type rollbackTestRegistry struct {
	deleteSession func(sessionID string) error
}

func (r rollbackTestRegistry) DeleteSession(sessionID string) error {
	if r.deleteSession == nil {
		return nil
	}
	return r.deleteSession(sessionID)
}

func TestRollbackStartedLocalSessionStopsThenDeletes(t *testing.T) {
	t.Parallel()

	steps := make([]string, 0, 2)
	pidCreateTime := 1.0
	err := rollbackStartedLocalSession(
		auth.SessionMetadata{
			ID:            "session-1",
			PID:           12345,
			PIDCreateTime: &pidCreateTime,
		},
		t.TempDir(),
		func(sessionID string, pid int, createTime float64) error {
			steps = append(steps, "stop:"+sessionID)
			if pid != 12345 || createTime != pidCreateTime {
				t.Fatalf("unexpected stop inputs pid=%d createTime=%v", pid, createTime)
			}
			return nil
		},
		func(string) (sessionRegistryDeleter, error) {
			return rollbackTestRegistry{
				deleteSession: func(sessionID string) error {
					steps = append(steps, "delete:"+sessionID)
					return nil
				},
			}, nil
		},
	)
	if err != nil {
		t.Fatalf("rollbackStartedLocalSession returned error: %v", err)
	}
	if len(steps) != 2 || steps[0] != "stop:session-1" || steps[1] != "delete:session-1" {
		t.Fatalf("expected stop then delete, got %#v", steps)
	}
}

func TestRollbackStartedLocalSessionRaisesWhenDeleteFails(t *testing.T) {
	t.Parallel()

	pidCreateTime := 1.0
	err := rollbackStartedLocalSession(
		auth.SessionMetadata{
			ID:            "session-1",
			PID:           12345,
			PIDCreateTime: &pidCreateTime,
		},
		t.TempDir(),
		func(string, int, float64) error {
			return nil
		},
		func(string) (sessionRegistryDeleter, error) {
			return rollbackTestRegistry{
				deleteSession: func(string) error {
					return errors.New("disk full")
				},
			}, nil
		},
	)
	if err == nil {
		t.Fatal("expected rollbackStartedLocalSession delete failure")
	}
	if !strings.Contains(err.Error(), "Failed deleting session metadata for session-1") {
		t.Fatalf("expected delete failure detail, got %q", err.Error())
	}
}

func TestRollbackStartedLocalSessionFailsClosedOnPIDIdentityMismatch(t *testing.T) {
	t.Parallel()

	session := startRegistryHelperProcess(t, "rollback-session-helper")
	if session.PIDCreateTime == nil {
		t.Fatal("expected helper process pid create time")
	}
	deleteCalls := make([]string, 0, 1)

	err := rollbackStartedLocalSession(
		auth.SessionMetadata{
			ID:            "session-1",
			PID:           session.PID,
			PIDCreateTime: floatPtr(*session.PIDCreateTime + 10.0),
		},
		t.TempDir(),
		stopLocalSessionProcess,
		func(string) (sessionRegistryDeleter, error) {
			return rollbackTestRegistry{
				deleteSession: func(sessionID string) error {
					deleteCalls = append(deleteCalls, sessionID)
					return nil
				},
			}, nil
		},
	)
	if err == nil {
		t.Fatal("expected rollbackStartedLocalSession pid mismatch failure")
	}
	if !strings.Contains(err.Error(), "Process identity mismatch") {
		t.Fatalf("expected process identity mismatch, got %q", err.Error())
	}
	if len(deleteCalls) != 0 {
		t.Fatalf("expected no delete calls after pid mismatch, got %#v", deleteCalls)
	}
	if !isPIDRunning(session.PID) {
		t.Fatal("expected helper process to remain running after pid mismatch")
	}
}

func floatPtr(value float64) *float64 {
	return &value
}
