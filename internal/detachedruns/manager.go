package detachedruns

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"setta/internal/statefs"
)

var (
	ErrRuntimeRootRequired = errors.New("detached runs runtime root is required")
	ErrRunIDRequired       = errors.New("detached runs run id is required")
	ErrCommandRequired     = errors.New("detached runs command is required")
	ErrRunNotFound         = errors.New("detached run not found")
)

type Status string

const (
	StatusQueued   Status = "queued"
	StatusRunning  Status = "running"
	StatusExited   Status = "exited"
	StatusFailed   Status = "failed"
	StatusCanceled Status = "canceled"
	StatusLost     Status = "lost"
)

type Run struct {
	RunID           string            `json:"runId"`
	Status          Status            `json:"status"`
	CreatedAtMS     int64             `json:"createdAtMs"`
	StartedAtMS     *int64            `json:"startedAtMs"`
	ExitedAtMS      *int64            `json:"exitedAtMs"`
	ExitCode        *int              `json:"exitCode"`
	PID             *int              `json:"pid"`
	Command         string            `json:"command"`
	SnapshotPath    string            `json:"snapshotPath"`
	ProjectConfigID string            `json:"projectConfigId"`
	EntrySectionID  *string           `json:"entrySectionId"`
	Tags            map[string]string `json:"tags"`
}

type Spec struct {
	Command         string
	SnapshotPath    string
	ProjectConfigID string
	EntrySectionID  *string
	Tags            map[string]string
}

type ManagerOptions struct {
	RuntimeRoot string
	TimeNow     func() time.Time
	NewRunID    func() string
}

type trackedProcess struct {
	cmd       *exec.Cmd
	done      chan struct{}
	completed bool
	canceled  bool
	exitCode  int
}

type Manager struct {
	root      string
	timeNow   func() time.Time
	newRunID  func() string
	mu        sync.Mutex
	processes map[string]*trackedProcess
}

func NewManager(options ManagerOptions) (*Manager, error) {
	runtimeRoot, err := statefs.NormalizePath(options.RuntimeRoot, "")
	if err != nil || strings.TrimSpace(runtimeRoot) == "" {
		return nil, ErrRuntimeRootRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	newRunID := options.NewRunID
	if newRunID == nil {
		newRunID = randomRunID
	}

	root := filepath.Join(runtimeRoot, "detached_runs")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}

	return &Manager{
		root:      root,
		timeNow:   timeNow,
		newRunID:  newRunID,
		processes: make(map[string]*trackedProcess),
	}, nil
}

func (m *Manager) StartRun(spec Spec) (Run, error) {
	if m == nil {
		return Run{}, ErrRuntimeRootRequired
	}

	command := strings.TrimSpace(spec.Command)
	if command == "" {
		return Run{}, ErrCommandRequired
	}

	runID := strings.TrimSpace(m.newRunID())
	if runID == "" {
		return Run{}, ErrRunIDRequired
	}
	runDir := filepath.Join(m.root, runID)
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		return Run{}, err
	}

	nowMS := m.nowMS()
	run := Run{
		RunID:           runID,
		Status:          StatusQueued,
		CreatedAtMS:     nowMS,
		Command:         command,
		SnapshotPath:    strings.TrimSpace(spec.SnapshotPath),
		ProjectConfigID: strings.TrimSpace(spec.ProjectConfigID),
		EntrySectionID:  cloneStringPtr(spec.EntrySectionID),
		Tags:            cloneTags(spec.Tags),
	}

	stdoutPath := filepath.Join(runDir, "stdout.log")
	stdoutFile, err := os.OpenFile(stdoutPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return Run{}, err
	}
	defer stdoutFile.Close()

	m.mu.Lock()
	if err := m.writeRunLocked(run); err != nil {
		m.mu.Unlock()
		return Run{}, err
	}

	cmd, err := newShellCommand(command)
	if err != nil {
		run = failedStartRun(run, nowMS)
		_ = m.writeRunLocked(run)
		m.mu.Unlock()
		return Run{}, err
	}
	cmd.Stdout = stdoutFile
	cmd.Stderr = stdoutFile
	cmd.Stdin = nil
	if err := cmd.Start(); err != nil {
		run = failedStartRun(run, m.nowMS())
		_ = m.writeRunLocked(run)
		m.mu.Unlock()
		return Run{}, err
	}

	startedAtMS := m.nowMS()
	pid := cmd.Process.Pid
	run.Status = StatusRunning
	run.StartedAtMS = &startedAtMS
	run.PID = &pid
	if err := m.writeRunLocked(run); err != nil {
		_ = killProcess(cmd)
		m.mu.Unlock()
		return Run{}, err
	}

	tracked := &trackedProcess{
		cmd:  cmd,
		done: make(chan struct{}),
	}
	m.processes[runID] = tracked
	m.mu.Unlock()

	go m.watchProcess(runID, tracked)
	return run, nil
}

func (m *Manager) GetStatus(runID string) (Run, error) {
	if m == nil {
		return Run{}, ErrRuntimeRootRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return Run{}, ErrRunIDRequired
	}

	for {
		m.mu.Lock()
		run, err := m.loadRunLocked(trimmedRunID)
		if err != nil {
			m.mu.Unlock()
			return Run{}, err
		}
		if run.Status != StatusRunning && run.Status != StatusCanceled {
			m.mu.Unlock()
			return run, nil
		}

		tracked := m.processes[trimmedRunID]
		if tracked == nil {
			if run.Status == StatusRunning {
				run = markLostRun(run, m.nowMS())
				if err := m.writeRunLocked(run); err != nil {
					m.mu.Unlock()
					return Run{}, err
				}
			}
			m.mu.Unlock()
			return run, nil
		}
		if !tracked.completed {
			m.mu.Unlock()
			return run, nil
		}
		done := tracked.done
		m.mu.Unlock()
		<-done
	}
}

func (m *Manager) CancelRun(runID string) (Run, error) {
	if m == nil {
		return Run{}, ErrRuntimeRootRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return Run{}, ErrRunIDRequired
	}

	m.mu.Lock()
	run, err := m.loadRunLocked(trimmedRunID)
	if err != nil {
		m.mu.Unlock()
		return Run{}, err
	}
	switch run.Status {
	case StatusExited, StatusFailed, StatusLost:
		m.mu.Unlock()
		return run, nil
	case StatusCanceled:
		if run.ExitCode != nil {
			m.mu.Unlock()
			return run, nil
		}
	}

	tracked := m.processes[trimmedRunID]
	if tracked == nil {
		m.mu.Unlock()
		return m.GetStatus(trimmedRunID)
	}
	tracked.canceled = true
	done := tracked.done
	cmd := tracked.cmd
	m.mu.Unlock()

	if err := terminateProcess(cmd); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return m.GetStatus(trimmedRunID)
	}
	select {
	case <-done:
		return m.GetStatus(trimmedRunID)
	case <-time.After(time.Second):
	}

	if err := killProcess(cmd); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return m.GetStatus(trimmedRunID)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
	}
	return m.GetStatus(trimmedRunID)
}

func (m *Manager) watchProcess(runID string, tracked *trackedProcess) {
	exitCode := -1
	waitErr := tracked.cmd.Wait()
	if tracked.cmd.ProcessState != nil {
		exitCode = tracked.cmd.ProcessState.ExitCode()
	} else if waitErr == nil {
		exitCode = 0
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	current, ok := m.processes[runID]
	if !ok || current != tracked {
		tracked.completed = true
		tracked.exitCode = exitCode
		close(tracked.done)
		return
	}

	run, err := m.loadRunLocked(runID)
	if err == nil {
		nowMS := m.nowMS()
		if tracked.canceled || run.Status == StatusCanceled {
			run = finalizeCanceledRun(run, exitCode, nowMS)
		} else {
			run = finalizeRun(run, exitCode, nowMS)
		}
		_ = m.writeRunLocked(run)
	}

	tracked.completed = true
	tracked.exitCode = exitCode
	delete(m.processes, runID)
	close(tracked.done)
}

func (m *Manager) nowMS() int64 {
	return m.timeNow().UTC().UnixMilli()
}

func (m *Manager) metaPath(runID string) string {
	return filepath.Join(m.root, runID, "meta.json")
}

func (m *Manager) loadRunLocked(runID string) (Run, error) {
	payload, err := os.ReadFile(m.metaPath(runID))
	if err != nil {
		if os.IsNotExist(err) {
			return Run{}, ErrRunNotFound
		}
		return Run{}, err
	}
	var run Run
	if err := json.Unmarshal(payload, &run); err != nil {
		return Run{}, err
	}
	run.Tags = cloneTags(run.Tags)
	run.EntrySectionID = cloneStringPtr(run.EntrySectionID)
	return run, nil
}

func (m *Manager) writeRunLocked(run Run) error {
	payload, err := json.MarshalIndent(run, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	return os.WriteFile(m.metaPath(run.RunID), payload, 0o644)
}

func failedStartRun(run Run, nowMS int64) Run {
	exitCode := -1
	run.Status = StatusFailed
	run.ExitCode = &exitCode
	run.ExitedAtMS = &nowMS
	run.StartedAtMS = nil
	run.PID = nil
	return run
}

func finalizeRun(run Run, exitCode int, nowMS int64) Run {
	status := StatusFailed
	if exitCode == 0 {
		status = StatusExited
	}
	run.Status = status
	run.ExitCode = &exitCode
	run.ExitedAtMS = &nowMS
	return run
}

func finalizeCanceledRun(run Run, exitCode int, nowMS int64) Run {
	run.Status = StatusCanceled
	run.ExitCode = &exitCode
	run.ExitedAtMS = &nowMS
	return run
}

func markLostRun(run Run, nowMS int64) Run {
	run.Status = StatusLost
	if run.ExitedAtMS == nil {
		run.ExitedAtMS = &nowMS
	}
	return run
}

func cloneTags(tags map[string]string) map[string]string {
	if len(tags) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(tags))
	for key, value := range tags {
		cloned[key] = value
	}
	return cloned
}

func cloneStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}

func randomRunID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Errorf("generate detached run id: %w", err))
	}
	return hex.EncodeToString(bytes)
}
