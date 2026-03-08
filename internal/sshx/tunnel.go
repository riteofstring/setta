package sshx

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/statefs"
)

const (
	tunnelStartupWait             = 750 * time.Millisecond
	tunnelReadyTimeout            = 2 * time.Second
	tunnelReadyPollInterval       = 50 * time.Millisecond
	tunnelReadyConnectTimeout     = 100 * time.Millisecond
	tunnelPIDCreateTimeTolerance  = 0.01
	preferredTunnelPortMin        = 61000
	preferredTunnelPortMax        = 65535
	randomTunnelPortCandidateRuns = 3
)

type TunnelMetadata struct {
	KeyHash       string  `json:"keyHash"`
	RemoteHost    string  `json:"remoteHost"`
	RemotePort    int     `json:"remotePort"`
	LocalPort     int     `json:"localPort"`
	PID           int     `json:"pid"`
	PIDCreateTime float64 `json:"pidCreateTime"`
	CreatedAt     string  `json:"createdAt"`
	LastUsedAt    string  `json:"lastUsedAt"`
}

type startedTunnelProcess struct {
	cmd     *exec.Cmd
	stderr  *bytes.Buffer
	done    chan struct{}
	waitErr error
	mu      sync.RWMutex
}

func (s *Service) EnsureSSHTunnel(input EnsureSSHTunnelInput) (TunnelMetadata, error) {
	sshTarget := NormalizeOptionalArgument(input.SSHTarget)
	if sshTarget == "" {
		return TunnelMetadata{}, &Error{
			Code:    "InvalidSshTarget",
			Message: "sshTarget must be a non-empty string.",
		}
	}
	remoteHost := NormalizeOptionalArgument(input.RemoteHost)
	if remoteHost == "" {
		return TunnelMetadata{}, &Error{
			Code:    "TunnelStartFailed",
			Message: "remoteHost must be a non-empty string.",
		}
	}
	if input.RemotePort <= 0 {
		return TunnelMetadata{}, &Error{
			Code:    "TunnelStartFailed",
			Message: fmt.Sprintf("Invalid remote port: %d", input.RemotePort),
		}
	}
	if input.LocalPort != nil && (*input.LocalPort < 1 || *input.LocalPort > 65535) {
		return TunnelMetadata{}, &Error{
			Code:    "InvalidLocalPort",
			Message: fmt.Sprintf("Invalid local port: %d", *input.LocalPort),
		}
	}

	sshArgs, err := ParseSSHArgs(input.SSHArgs)
	if err != nil {
		return TunnelMetadata{}, err
	}
	sshArgs = ApplyControlSocketArgs(sshArgs)
	return s.ensureSSHTunnel(sshTarget, sshArgs, remoteHost, input.RemotePort, input.LocalPort)
}

func (s *Service) RollbackLocalSSHTunnel(input RollbackTunnelInput) error {
	sshTarget := NormalizeOptionalArgument(input.SSHTarget)
	if sshTarget == "" {
		return &Error{Code: "TunnelRollback", Message: "Missing sshTarget for tunnel rollback."}
	}
	remoteHost := NormalizeOptionalArgument(input.RemoteHost)
	if remoteHost == "" {
		return &Error{Code: "TunnelRollback", Message: "Missing remote host for tunnel rollback."}
	}
	if input.RemotePort <= 0 {
		return &Error{Code: "TunnelRollback", Message: "Missing remote port for tunnel rollback."}
	}

	sshArgs, err := ParseSSHArgs(input.SSHArgs)
	if err != nil {
		return err
	}
	sshArgs = ApplyControlSocketArgs(sshArgs)
	keyHash := ComputeTunnelKeyHash(sshTarget, sshArgs, remoteHost, input.RemotePort)
	metadataPath := serviceRuntimePath(s.runtimeRoot, "ssh_tunnels", TunnelIDForKeyHash(keyHash)+".json")
	metadata, err := s.loadTunnelMetadata(metadataPath)
	if err != nil || metadata == nil {
		return err
	}
	if metadata.KeyHash != keyHash {
		return nil
	}
	if s.pidMatchesCreateTime(metadata.PID, metadata.PIDCreateTime) {
		s.stopPID(metadata.PID, metadata.PIDCreateTime)
		if s.pidMatchesCreateTime(metadata.PID, metadata.PIDCreateTime) {
			return &Error{
				Code:    "TunnelRollback",
				Message: fmt.Sprintf("Tunnel process %d is still running for %s.", metadata.PID, sshTarget),
			}
		}
	}
	if err := os.Remove(metadataPath); err != nil && !os.IsNotExist(err) {
		return &Error{
			Code:    "TunnelRollback",
			Message: fmt.Sprintf("Failed deleting local tunnel metadata at %s.", metadataPath),
		}
	}
	return nil
}

func (s *Service) ensureSSHTunnel(sshTarget string, sshArgs []string, remoteHost string, remotePort int, requestedLocalPort *int) (TunnelMetadata, error) {
	keyHash := ComputeTunnelKeyHash(sshTarget, sshArgs, remoteHost, remotePort)
	tunnelID := TunnelIDForKeyHash(keyHash)
	metadataPath := serviceRuntimePath(s.runtimeRoot, "ssh_tunnels", tunnelID+".json")
	existing, err := s.loadTunnelMetadata(metadataPath)
	if err != nil {
		return TunnelMetadata{}, err
	}
	now := s.now().UTC().Format(time.RFC3339Nano)
	if existing != nil && existing.KeyHash != keyHash {
		existing = nil
	}
	if existing != nil && s.isPIDAlive(existing.PID) {
		if !s.pidMatchesCreateTime(existing.PID, existing.PIDCreateTime) {
			_ = os.Remove(metadataPath)
			existing = nil
		} else if requestedLocalPort == nil || *requestedLocalPort == existing.LocalPort {
			existing.LastUsedAt = now
			if err := s.writeTunnelMetadata(metadataPath, *existing); err != nil {
				return TunnelMetadata{}, err
			}
			return *existing, nil
		} else {
			s.stopPID(existing.PID, existing.PIDCreateTime)
		}
	}
	if existing != nil && !s.isPIDAlive(existing.PID) {
		_ = os.Remove(metadataPath)
	}

	candidatePorts := make([]int, 0, 1+1+randomTunnelPortCandidateRuns)
	if requestedLocalPort != nil {
		candidatePorts = append(candidatePorts, *requestedLocalPort)
	}
	candidatePorts = append(candidatePorts, preferredLocalPort(keyHash))
	for range randomTunnelPortCandidateRuns {
		port, err := selectFreePort("127.0.0.1")
		if err != nil {
			break
		}
		candidatePorts = append(candidatePorts, port)
	}

	sshPrefix := SSHCommandPrefix(true, s.resolvedSSHBin())
	seenPorts := make(map[int]struct{}, len(candidatePorts))
	lastFailure := ""
	for _, candidatePort := range candidatePorts {
		if _, seen := seenPorts[candidatePort]; seen {
			continue
		}
		seenPorts[candidatePort] = struct{}{}
		processHandle, err := s.startTunnelProcess(BuildSSHTunnelArgs(
			sshTarget,
			sshArgs,
			remoteHost,
			candidatePort,
			remotePort,
			sshPrefix,
		))
		if err != nil {
			return TunnelMetadata{}, err
		}

		launchErr := s.ensureBackgroundTunnelStarted(processHandle)
		if launchErr == nil && !testStubForwardDisabled() && !waitForLocalPort("127.0.0.1", candidatePort, tunnelReadyTimeout) {
			if processHandle.Exited() {
				launchErr = &Error{
					Code:    "TunnelStartFailed",
					Message: fmt.Sprintf("SSH tunnel failed to start (exit %d).", processHandle.ExitCode()),
				}
			} else {
				launchErr = &Error{
					Code:    "TunnelStartFailed",
					Message: fmt.Sprintf("SSH tunnel did not bind local port %d within 2 seconds.", candidatePort),
				}
			}
		}
		if launchErr != nil {
			stderr := strings.TrimSpace(processHandle.Stderr())
			if stderr != "" {
				launchErr = &Error{
					Code:    errorCodeOrDefault(launchErr, "TunnelStartFailed"),
					Message: launchErr.Error() + " " + stderr,
				}
			}
			processHandle.Kill()
			lastFailure = launchErr.Error()
			continue
		}

		pid := processHandle.PID()
		pidCreateTime, ok := s.pidCreateTime(pid)
		if !ok {
			processHandle.Kill()
			lastFailure = "Failed to capture tunnel process identity."
			continue
		}
		metadata := TunnelMetadata{
			KeyHash:       keyHash,
			RemoteHost:    remoteHost,
			RemotePort:    remotePort,
			LocalPort:     candidatePort,
			PID:           pid,
			PIDCreateTime: pidCreateTime,
			CreatedAt:     now,
			LastUsedAt:    now,
		}
		if err := s.writeTunnelMetadata(metadataPath, metadata); err != nil {
			processHandle.Kill()
			return TunnelMetadata{}, err
		}
		return metadata, nil
	}

	if strings.TrimSpace(lastFailure) != "" {
		return TunnelMetadata{}, &Error{
			Code:    "TunnelStartFailed",
			Message: lastFailure,
		}
	}
	return TunnelMetadata{}, &Error{
		Code:    "TunnelStartFailed",
		Message: "Unable to start SSH tunnel (all candidate ports failed). Provide localPort to override.",
	}
}

func (s *Service) loadTunnelMetadata(path string) (*TunnelMetadata, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, nil
	}
	var metadata TunnelMetadata
	if err := json.Unmarshal(content, &metadata); err != nil {
		_ = os.Remove(path)
		return nil, nil
	}
	if !validTunnelMetadata(metadata) {
		_ = os.Remove(path)
		return nil, nil
	}
	return &metadata, nil
}

func (s *Service) writeTunnelMetadata(path string, metadata TunnelMetadata) error {
	content, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return &Error{
			Code:    "TunnelStartFailed",
			Message: fmt.Sprintf("Encode SSH tunnel metadata: %v", err),
		}
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(path, content, 0o644); err != nil {
		return &Error{
			Code:    "TunnelStartFailed",
			Message: fmt.Sprintf("Write SSH tunnel metadata: %v", err),
		}
	}
	return nil
}

func (s *Service) startTunnelProcess(args []string) (*startedTunnelProcess, error) {
	command := exec.Command(args[0], args[1:]...)
	command.Stdin = nil
	command.Stdout = nil
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		var execErr *exec.Error
		if errors.Is(err, exec.ErrNotFound) || (errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound)) {
			return nil, &Error{
				Code:    "SshMissing",
				Message: "ssh binary not found. Install ssh or set SETTA_SSH_BIN.",
			}
		}
		return nil, &Error{
			Code:    "TunnelStartFailed",
			Message: fmt.Sprintf("Failed to start SSH tunnel: %v", err),
		}
	}
	processHandle := &startedTunnelProcess{
		cmd:    command,
		stderr: &stderr,
		done:   make(chan struct{}),
	}
	go func() {
		waitErr := command.Wait()
		processHandle.mu.Lock()
		processHandle.waitErr = waitErr
		processHandle.mu.Unlock()
		close(processHandle.done)
	}()
	return processHandle, nil
}

func (s *Service) ensureBackgroundTunnelStarted(processHandle *startedTunnelProcess) error {
	s.sleep(tunnelStartupWait)
	if processHandle.Exited() {
		return &Error{
			Code:    "TunnelStartFailed",
			Message: fmt.Sprintf("SSH tunnel failed to start (exit %d).", processHandle.ExitCode()),
		}
	}
	return nil
}

func (s *Service) isPIDAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return false
	}
	running, err := proc.IsRunning()
	if err != nil || !running {
		return false
	}
	status, err := proc.Status()
	if err != nil {
		return true
	}
	for _, entry := range status {
		if strings.EqualFold(strings.TrimSpace(entry), "zombie") {
			return false
		}
	}
	return true
}

func (s *Service) pidMatchesCreateTime(pid int, expected float64) bool {
	if !s.isPIDAlive(pid) {
		return false
	}
	actual, ok := s.pidCreateTime(pid)
	if !ok {
		return false
	}
	diff := actual - expected
	if diff < 0 {
		diff = -diff
	}
	return diff <= tunnelPIDCreateTimeTolerance
}

func (s *Service) pidCreateTime(pid int) (float64, bool) {
	if pid <= 0 {
		return 0, false
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return 0, false
	}
	createTimeMillis, err := proc.CreateTime()
	if err != nil {
		return 0, false
	}
	return float64(createTimeMillis) / 1000.0, true
}

func (s *Service) stopPID(pid int, expectedCreateTime float64) {
	if pid <= 0 {
		return
	}
	if expectedCreateTime > 0 && !s.pidMatchesCreateTime(pid, expectedCreateTime) {
		return
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return
	}
	_ = proc.Terminate()
	if waitForPIDExit(pid, 2*time.Second) {
		return
	}
	if expectedCreateTime > 0 && !s.pidMatchesCreateTime(pid, expectedCreateTime) {
		return
	}
	_ = proc.Kill()
	_ = waitForPIDExit(pid, 2*time.Second)
}

func validTunnelMetadata(metadata TunnelMetadata) bool {
	return strings.TrimSpace(metadata.KeyHash) != "" &&
		strings.TrimSpace(metadata.RemoteHost) != "" &&
		metadata.RemotePort > 0 &&
		metadata.LocalPort > 0 &&
		metadata.PID > 0 &&
		metadata.PIDCreateTime > 0 &&
		strings.TrimSpace(metadata.CreatedAt) != "" &&
		strings.TrimSpace(metadata.LastUsedAt) != ""
}

func preferredLocalPort(keyHash string) int {
	decoded, err := hex.DecodeString(strings.TrimSpace(keyHash))
	if err != nil || len(decoded) < 4 {
		return preferredTunnelPortMin
	}
	value := int(decoded[0])<<24 | int(decoded[1])<<16 | int(decoded[2])<<8 | int(decoded[3])
	return preferredTunnelPortMin + (value % (preferredTunnelPortMax - preferredTunnelPortMin + 1))
}

func selectFreePort(host string) (int, error) {
	listener, err := net.Listen("tcp", net.JoinHostPort(host, "0"))
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return 0, fmt.Errorf("unexpected listener addr %T", listener.Addr())
	}
	return tcpAddr.Port, nil
}

func waitForLocalPort(host string, port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for {
		conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), tunnelReadyConnectTimeout)
		if err == nil {
			_ = conn.Close()
			return true
		}
		if isPermissionError(err) {
			return true
		}
		if !time.Now().Before(deadline) {
			return false
		}
		time.Sleep(tunnelReadyPollInterval)
	}
}

func waitForPIDExit(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		proc, err := process.NewProcess(int32(pid))
		if err != nil {
			return true
		}
		running, err := proc.IsRunning()
		if err != nil || !running {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return true
	}
	running, err := proc.IsRunning()
	return err != nil || !running
}

func isPermissionError(err error) bool {
	return errors.Is(err, syscall.EPERM)
}

func errorCodeOrDefault(err error, fallback string) string {
	if code := errorCode(err); code != "" {
		return code
	}
	return fallback
}

func (p *startedTunnelProcess) Exited() bool {
	select {
	case <-p.done:
		return true
	default:
		return false
	}
}

func (p *startedTunnelProcess) ExitCode() int {
	if !p.Exited() {
		return -1
	}
	if p.cmd.ProcessState != nil {
		return p.cmd.ProcessState.ExitCode()
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	var exitErr *exec.ExitError
	if errors.As(p.waitErr, &exitErr) {
		return exitErr.ExitCode()
	}
	if p.waitErr == nil {
		return 0
	}
	return -1
}

func (p *startedTunnelProcess) PID() int {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return 0
	}
	return p.cmd.Process.Pid
}

func (p *startedTunnelProcess) Stderr() string {
	if p == nil || p.stderr == nil {
		return ""
	}
	return p.stderr.String()
}

func (p *startedTunnelProcess) Kill() {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return
	}
	_ = p.cmd.Process.Kill()
	select {
	case <-p.done:
	case <-time.After(2 * time.Second):
	}
}
