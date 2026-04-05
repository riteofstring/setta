package sshx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/launcher"
	"setta/internal/statefs"
)

const (
	defaultSSHCommandTimeout    = 15 * time.Second
	defaultRemoteCommandTimeout = 30 * time.Second
	defaultRemoteLaunchTimeout  = 30 * time.Second
	remoteLaunchPollInterval    = 500 * time.Millisecond
)

type ConnectWorkspaceInput struct {
	SSHTarget          string
	Workspace          string
	Profile            string
	SettaHome          string
	SettaFilesRoot     string
	SettaFilesLocation string
	RuntimeRoot        string
	SSHArgs            string
	RemoteCommand      string
	LocalPort          *int
	LauncherOrigin     string
	Timeout            time.Duration
}

type PrepareConnectWorkspaceInput struct {
	SSHTarget          string
	Workspace          string
	SessionID          string
	Latest             bool
	Profile            string
	SettaHome          string
	SettaFilesRoot     string
	SettaFilesLocation string
	RuntimeRoot        string
	SSHArgs            string
	RemoteCommand      string
	LauncherOrigin     string
	Timeout            time.Duration
}

type ListRemoteWorkspaceSessionsInput struct {
	SSHTarget          string
	Workspace          string
	Profile            string
	SettaHome          string
	SettaFilesRoot     string
	SettaFilesLocation string
	RuntimeRoot        string
	SSHArgs            string
	RemoteCommand      string
	ServerMode         RemoteServerMode
}

type DeleteRemoteWorkspaceSessionInput struct {
	SSHTarget          string
	Workspace          string
	SessionID          string
	Profile            string
	SettaHome          string
	SettaFilesRoot     string
	SettaFilesLocation string
	RuntimeRoot        string
	SSHArgs            string
	RemoteCommand      string
}

type RollbackRemoteWorkspaceInput struct {
	SSHTarget          string
	Workspace          string
	SessionID          string
	RemoteCommand      string
	RemoteHost         string
	RemotePort         int
	Profile            string
	SettaHome          string
	SettaFilesRoot     string
	SettaFilesLocation string
	RuntimeRoot        string
	SSHArgs            string
}

type RollbackTunnelInput struct {
	SSHTarget  string
	SSHArgs    string
	RemoteHost string
	RemotePort int
}

type EnsureSSHTunnelInput struct {
	SSHTarget  string
	SSHArgs    string
	RemoteHost string
	RemotePort int
	LocalPort  *int
}

type PreparedConnectWorkspaceResult struct {
	Session             RemoteSessionSummary
	StartedNew          bool
	InitialSessionCount int
	RemoteShell         string
	RemoteWorkspace     string
	RemoteCommand       string
	ConnectInfo         RemoteConnectInfo
	Token               string
}

type RemoteConnectResult struct {
	BootstrapURLFragment string
	Session              RemoteSessionSummary
	StartedNew           bool
	RemoteCommand        string
	SettaFilesLocation   string
	SettaFilesRoot       string
	RuntimeRoot          string
	SettaHome            string
	Profile              string
	LauncherOriginProof  string
}

type ServiceOptions struct {
	RuntimeRoot string
	SSHBin      string
	Now         func() time.Time
	Sleep       func(time.Duration)
}

type Service struct {
	runtimeRoot string
	sshBin      string
	now         func() time.Time
	sleep       func(time.Duration)
}

type sshCommandResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

func NewService(options ServiceOptions) (*Service, error) {
	runtimeRoot, err := statefs.NormalizePath(strings.TrimSpace(options.RuntimeRoot), "")
	if err != nil {
		return nil, fmt.Errorf("resolve runtime root: %w", err)
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	sleep := options.Sleep
	if sleep == nil {
		sleep = time.Sleep
	}
	return &Service{
		runtimeRoot: runtimeRoot,
		sshBin:      strings.TrimSpace(options.SSHBin),
		now:         now,
		sleep:       sleep,
	}, nil
}

func (s *Service) ListRemoteWorkspaceSessions(input ListRemoteWorkspaceSessionsInput) ([]RemoteSessionSummary, error) {
	sshTarget := NormalizeOptionalArgument(input.SSHTarget)
	if sshTarget == "" {
		return nil, &Error{
			Code:    "InvalidSshTarget",
			Message: "sshTarget must be a non-empty string.",
		}
	}
	workspace := NormalizeOptionalArgument(input.Workspace)
	if workspace == "" {
		return nil, &Error{
			Code:    "InvalidWorkspace",
			Message: "--workspace is required for remote session listing.",
		}
	}

	profile := NormalizeOptionalArgument(input.Profile)
	settaHome := NormalizeOptionalArgument(input.SettaHome)
	settaFilesRoot := NormalizeOptionalArgument(input.SettaFilesRoot)
	settaFilesLocation, err := NormalizeSettaFilesLocation(input.SettaFilesLocation)
	if err != nil {
		return nil, err
	}
	runtimeRoot := NormalizeOptionalArgument(input.RuntimeRoot)
	sshArgsRaw := NormalizeOptionalArgument(input.SSHArgs)
	remoteCommand := NormalizeOptionalArgument(input.RemoteCommand)
	if settaFilesRoot == "" && settaFilesLocation == "" && profile == "" {
		settaFilesLocation = "auto"
	}

	sshArgs, err := ParseSSHArgs(sshArgsRaw)
	if err != nil {
		return nil, err
	}
	sshArgs = ApplyControlSocketArgs(sshArgs)
	sshPrefix := SSHCommandPrefix(true, s.resolvedSSHBin())

	shell, err := s.resolveRemoteShell(sshTarget, sshArgs, sshPrefix)
	if err != nil {
		return nil, err
	}
	remoteWorkspace, err := s.resolveRemoteWorkspace(sshTarget, sshArgs, shell, workspace, sshPrefix)
	if err != nil {
		return nil, err
	}
	resolvedRemoteCommand, err := s.resolveRemoteSettaCommand(sshTarget, sshArgs, shell, remoteWorkspace, remoteCommand, sshPrefix)
	if err != nil {
		return nil, err
	}
	settaFilesArgs, err := buildRemoteSettaPathArgs(profile, settaHome, settaFilesRoot, settaFilesLocation, runtimeRoot)
	if err != nil {
		return nil, err
	}

	return s.fetchRemoteSessions(
		sshTarget,
		sshArgs,
		shell,
		remoteWorkspace,
		resolvedRemoteCommand,
		settaFilesArgs,
		sshPrefix,
		input.ServerMode,
	)
}

func (s *Service) DeleteRemoteWorkspaceSession(input DeleteRemoteWorkspaceSessionInput) error {
	sshTarget := NormalizeOptionalArgument(input.SSHTarget)
	if sshTarget == "" {
		return &Error{Code: "RemoteRollback", Message: "Missing sshTarget for rollback."}
	}
	workspace := NormalizeOptionalArgument(input.Workspace)
	if workspace == "" {
		return &Error{Code: "RemoteRollback", Message: "Missing workspace for rollback."}
	}
	sessionID := NormalizeOptionalArgument(input.SessionID)
	if sessionID == "" {
		return &Error{Code: "RemoteRollback", Message: "Missing session id for rollback."}
	}
	remoteCommand := NormalizeOptionalArgument(input.RemoteCommand)

	profile := NormalizeOptionalArgument(input.Profile)
	settaHome := NormalizeOptionalArgument(input.SettaHome)
	settaFilesRoot := NormalizeOptionalArgument(input.SettaFilesRoot)
	settaFilesLocation, err := NormalizeSettaFilesLocation(input.SettaFilesLocation)
	if err != nil {
		return err
	}
	runtimeRoot := NormalizeOptionalArgument(input.RuntimeRoot)
	if settaFilesRoot == "" && settaFilesLocation == "" && profile == "" {
		settaFilesLocation = "auto"
	}

	sshArgs, err := ParseSSHArgs(input.SSHArgs)
	if err != nil {
		return err
	}
	sshArgs = ApplyControlSocketArgs(sshArgs)
	sshPrefix := SSHCommandPrefix(true, s.resolvedSSHBin())

	shell, err := s.resolveRemoteShell(sshTarget, sshArgs, sshPrefix)
	if err != nil {
		return err
	}
	remoteWorkspace, err := s.resolveRemoteWorkspace(sshTarget, sshArgs, shell, workspace, sshPrefix)
	if err != nil {
		return err
	}
	resolvedRemoteCommand, err := s.resolveRemoteSettaCommand(sshTarget, sshArgs, shell, remoteWorkspace, remoteCommand, sshPrefix)
	if err != nil {
		return err
	}
	settaFilesArgs, err := buildRemoteSettaPathArgs(profile, settaHome, settaFilesRoot, settaFilesLocation, runtimeRoot)
	if err != nil {
		return err
	}
	rootPrefix := ""
	if settaFilesArgs != "" {
		rootPrefix = settaFilesArgs + " "
	}
	result, err := s.runRemoteSettaCommand(
		sshTarget,
		sshArgs,
		shell,
		remoteWorkspace,
		resolvedRemoteCommand,
		rootPrefix+"status --delete-session "+shellQuote(sessionID),
		sshPrefix,
		defaultRemoteCommandTimeout,
	)
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
		message := fmt.Sprintf("Failed deleting remote session %s.", sessionID)
		if details != "" {
			message += " " + details
		}
		return &Error{
			Code:    "RemoteRollback",
			Message: message,
		}
	}
	return nil
}

func (s *Service) ConnectWorkspaceSession(input ConnectWorkspaceInput) (RemoteConnectResult, error) {
	plan, err := s.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget:          input.SSHTarget,
		Workspace:          input.Workspace,
		Latest:             true,
		Profile:            input.Profile,
		SettaHome:          input.SettaHome,
		SettaFilesRoot:     input.SettaFilesRoot,
		SettaFilesLocation: input.SettaFilesLocation,
		RuntimeRoot:        input.RuntimeRoot,
		SSHArgs:            input.SSHArgs,
		RemoteCommand:      input.RemoteCommand,
		LauncherOrigin:     input.LauncherOrigin,
		Timeout:            input.Timeout,
	})
	if err != nil {
		return RemoteConnectResult{}, err
	}
	tunnel, err := s.EnsureSSHTunnel(EnsureSSHTunnelInput{
		SSHTarget:  input.SSHTarget,
		SSHArgs:    input.SSHArgs,
		RemoteHost: plan.Session.Host,
		RemotePort: plan.Session.Port,
		LocalPort:  input.LocalPort,
	})
	if err != nil {
		return RemoteConnectResult{}, err
	}
	localBootstrapURLFragment, err := launcher.BuildBootstrapURLFragment("127.0.0.1", tunnel.LocalPort, plan.Token)
	if err != nil {
		return RemoteConnectResult{}, &Error{
			Code:    "RemoteConnectInfo",
			Message: fmt.Sprintf("Build local bootstrap URL fragment: %v", err),
		}
	}

	return RemoteConnectResult{
		BootstrapURLFragment: localBootstrapURLFragment,
		Session:              plan.Session,
		StartedNew:           plan.StartedNew,
		RemoteCommand:        plan.RemoteCommand,
		SettaFilesLocation:   plan.ConnectInfo.SettaFilesLocation,
		SettaFilesRoot:       plan.ConnectInfo.SettaFilesRoot,
		RuntimeRoot:          plan.ConnectInfo.RuntimeRoot,
		SettaHome:            plan.ConnectInfo.SettaHome,
		Profile:              plan.ConnectInfo.Profile,
		LauncherOriginProof:  plan.ConnectInfo.LauncherOriginProof,
	}, nil
}

func (s *Service) PrepareConnectWorkspaceSession(input PrepareConnectWorkspaceInput) (PreparedConnectWorkspaceResult, error) {
	sshTarget := NormalizeOptionalArgument(input.SSHTarget)
	if sshTarget == "" {
		return PreparedConnectWorkspaceResult{}, &Error{
			Code:    "InvalidSshTarget",
			Message: "sshTarget must be a non-empty string.",
		}
	}
	workspace := NormalizeOptionalArgument(input.Workspace)
	if workspace == "" {
		return PreparedConnectWorkspaceResult{}, &Error{
			Code:    "InvalidWorkspace",
			Message: "--workspace is required for SSH connect.",
		}
	}
	sessionID := NormalizeOptionalArgument(input.SessionID)
	if sessionID != "" && input.Latest {
		return PreparedConnectWorkspaceResult{}, &Error{
			Code:    "RemoteConnectSelection",
			Message: "Use either --session or --latest, not both.",
		}
	}

	profile := NormalizeOptionalArgument(input.Profile)
	settaHome := NormalizeOptionalArgument(input.SettaHome)
	settaFilesRoot := NormalizeOptionalArgument(input.SettaFilesRoot)
	settaFilesLocation, err := NormalizeSettaFilesLocation(input.SettaFilesLocation)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	runtimeRoot := NormalizeOptionalArgument(input.RuntimeRoot)
	sshArgsRaw := NormalizeOptionalArgument(input.SSHArgs)
	remoteCommand := NormalizeOptionalArgument(input.RemoteCommand)
	launcherOrigin := NormalizeOptionalArgument(input.LauncherOrigin)
	if settaFilesRoot == "" && settaFilesLocation == "" && profile == "" {
		settaFilesLocation = "auto"
	}

	sshArgs, err := ParseSSHArgs(sshArgsRaw)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	sshArgs = ApplyControlSocketArgs(sshArgs)
	sshPrefix := SSHCommandPrefix(true, s.resolvedSSHBin())

	shell, err := s.resolveRemoteShell(sshTarget, sshArgs, sshPrefix)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	remoteWorkspace, err := s.resolveRemoteWorkspace(sshTarget, sshArgs, shell, workspace, sshPrefix)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	resolvedRemoteCommand, err := s.resolveRemoteSettaCommand(sshTarget, sshArgs, shell, remoteWorkspace, remoteCommand, sshPrefix)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	settaFilesArgs, err := buildRemoteSettaPathArgs(profile, settaHome, settaFilesRoot, settaFilesLocation, runtimeRoot)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}

	sessions, err := s.fetchRemoteSessions(
		sshTarget,
		sshArgs,
		shell,
		remoteWorkspace,
		resolvedRemoteCommand,
		settaFilesArgs,
		sshPrefix,
		RemoteServerModeIDE,
	)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	initialSessionCount := len(sessions)

	startedNew := false
	startTimedOut := false
	session, hasSelection, err := selectConnectSession(sessions, sessionID, input.Latest)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	if !hasSelection {
		startedNew = true
		if err := s.startRemoteSetta(
			sshTarget,
			sshArgs,
			shell,
			remoteWorkspace,
			resolvedRemoteCommand,
			settaFilesArgs,
			sshPrefix,
			settaFilesLocation,
			settaFilesRoot,
			runtimeRoot,
		); err != nil {
			if errorCode(err) == "SshTimeout" {
				startTimedOut = true
			} else {
				return PreparedConnectWorkspaceResult{}, err
			}
		}

		timeout := input.Timeout
		if timeout <= 0 {
			timeout = defaultRemoteLaunchTimeout
		}
		sessions, err = s.waitForRemoteSessions(
			sshTarget,
			sshArgs,
			shell,
			remoteWorkspace,
			resolvedRemoteCommand,
			settaFilesArgs,
			sshPrefix,
			timeout,
			settaFilesLocation,
			settaFilesRoot,
			runtimeRoot,
			RemoteServerModeIDE,
		)
		if err != nil {
			if startTimedOut && errorCode(err) == "RemoteLaunchTimeout" {
				return PreparedConnectWorkspaceResult{}, &Error{
					Code: "RemoteStart",
					Message: "SSH command to start remote Setta timed out, and no sessions appeared before the launch timeout. " +
						"Check SSH connectivity/auth and try again. " + err.Error(),
				}
			}
			return PreparedConnectWorkspaceResult{}, err
		}
		session = newestRemoteSession(sessions)
	}

	connectInfo, err := s.fetchRemoteConnectInfo(
		sshTarget,
		sshArgs,
		shell,
		remoteWorkspace,
		resolvedRemoteCommand,
		settaFilesArgs,
		session.ID,
		sshPrefix,
		launcherOrigin,
	)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	token, err := extractTokenFromBootstrapURL(connectInfo.BootstrapURLFragment)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, &Error{
			Code:    "RemoteToken",
			Message: err.Error(),
		}
	}

	return PreparedConnectWorkspaceResult{
		Session:             session,
		StartedNew:          startedNew,
		InitialSessionCount: initialSessionCount,
		RemoteShell:         shell,
		RemoteWorkspace:     remoteWorkspace,
		RemoteCommand:       resolvedRemoteCommand,
		ConnectInfo:         connectInfo,
		Token:               token,
	}, nil
}

func (s *Service) RollbackRemoteWorkspaceLaunch(input RollbackRemoteWorkspaceInput) error {
	rollbackErrors := make([]string, 0, 2)
	if err := s.RollbackRemoteWorkspaceSession(input); err != nil {
		rollbackErrors = append(rollbackErrors, err.Error())
	}
	if err := s.RollbackLocalSSHTunnel(RollbackTunnelInput{
		SSHTarget:  input.SSHTarget,
		SSHArgs:    input.SSHArgs,
		RemoteHost: input.RemoteHost,
		RemotePort: input.RemotePort,
	}); err != nil {
		rollbackErrors = append(rollbackErrors, err.Error())
	}
	if len(rollbackErrors) > 0 {
		return &Error{
			Code:    "RemoteRollback",
			Message: "Failed rolling back SSH launch side effects. " + strings.Join(rollbackErrors, "; "),
		}
	}
	return nil
}

func (s *Service) RollbackRemoteWorkspaceSession(input RollbackRemoteWorkspaceInput) error {
	return s.DeleteRemoteWorkspaceSession(DeleteRemoteWorkspaceSessionInput{
		SSHTarget:          input.SSHTarget,
		Workspace:          input.Workspace,
		SessionID:          input.SessionID,
		Profile:            input.Profile,
		SettaHome:          input.SettaHome,
		SettaFilesRoot:     input.SettaFilesRoot,
		SettaFilesLocation: input.SettaFilesLocation,
		RuntimeRoot:        input.RuntimeRoot,
		SSHArgs:            input.SSHArgs,
		RemoteCommand:      input.RemoteCommand,
	})
}

func (s *Service) resolvedSSHBin() string {
	if strings.TrimSpace(s.sshBin) != "" {
		return s.sshBin
	}
	return strings.TrimSpace(os.Getenv("SETTA_SSH_BIN"))
}

func (s *Service) runSSHCommand(sshTarget string, sshArgs []string, remoteCommand string, sshPrefix []string, timeout time.Duration) (sshCommandResult, error) {
	cmdArgs := append(append(append([]string(nil), sshPrefix...), sshArgs...), sshTarget, remoteCommand)
	if len(cmdArgs) == 0 {
		return sshCommandResult{}, &Error{
			Code:    "SshFailed",
			Message: "SSH command failed: missing ssh command",
		}
	}
	ctx := context.Background()
	var cancel context.CancelFunc
	if timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	command := exec.CommandContext(ctx, cmdArgs[0], cmdArgs[1:]...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	if err == nil {
		return sshCommandResult{ExitCode: 0, Stdout: stdout.String(), Stderr: stderr.String()}, nil
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return sshCommandResult{}, &Error{
			Code:    "SshTimeout",
			Message: fmt.Sprintf("SSH command timed out: %v", cmdArgs),
		}
	}

	var execErr *exec.Error
	if errors.Is(err, exec.ErrNotFound) || (errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound)) {
		sshBin := cmdArgs[0]
		if strings.TrimSpace(sshBin) == "" {
			sshBin = "ssh"
		}
		return sshCommandResult{}, &Error{
			Code:    "SshMissing",
			Message: fmt.Sprintf("ssh binary not found (%q). Install ssh or set SETTA_SSH_BIN.", sshBin),
		}
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return sshCommandResult{
			ExitCode: exitErr.ExitCode(),
			Stdout:   stdout.String(),
			Stderr:   stderr.String(),
		}, nil
	}
	return sshCommandResult{}, &Error{
		Code:    "SshFailed",
		Message: fmt.Sprintf("SSH command failed: %v", err),
	}
}

func (s *Service) resolveRemoteShell(sshTarget string, sshArgs []string, sshPrefix []string) (string, error) {
	for _, candidate := range []string{"bash", "sh"} {
		result, err := s.runSSHCommand(sshTarget, sshArgs, "command -v "+candidate, sshPrefix, defaultSSHCommandTimeout)
		if err != nil {
			return "", err
		}
		if result.ExitCode == 0 {
			return candidate, nil
		}
		if result.ExitCode == 255 {
			details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
			message := "SSH failed while probing remote shell."
			if details != "" {
				message += " " + details
			}
			return "", &Error{
				Code:    "SshFailed",
				Message: message,
			}
		}
	}
	return "", &Error{
		Code:    "RemoteShell",
		Message: "Remote shell not found (bash/sh missing).",
	}
}

func (s *Service) resolveRemoteWorkspace(sshTarget string, sshArgs []string, shell string, workspace string, sshPrefix []string) (string, error) {
	inner := ""
	tildePrefix, remainder, ok := splitTildePath(workspace)
	if strings.HasPrefix(workspace, "~") && !ok {
		unsupportedPrefix := workspace
		if index := strings.IndexRune(workspace, '/'); index >= 0 {
			unsupportedPrefix = workspace[:index]
		}
		return "", &Error{
			Code:    "RemoteWorkspace",
			Message: fmt.Sprintf("Invalid remote workspace path. Unsupported tilde prefix: %q", unsupportedPrefix),
		}
	}
	if ok {
		if remainder != "" {
			inner = "cd " + tildePrefix + " && cd " + shellQuote(remainder) + " && pwd -P"
		} else {
			inner = "cd " + tildePrefix + " && pwd -P"
		}
	} else {
		inner = "cd " + shellQuote(workspace) + " && pwd -P"
	}
	result, err := s.runSSHCommand(
		sshTarget,
		sshArgs,
		buildRemoteShellCommand(shell, inner),
		sshPrefix,
		defaultSSHCommandTimeout,
	)
	if err != nil {
		return "", err
	}
	if result.ExitCode != 0 {
		details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
		message := "Failed to resolve remote workspace."
		if details != "" {
			message += " " + details
		}
		return "", &Error{
			Code:    "RemoteWorkspace",
			Message: message,
		}
	}
	lines := nonBlankLines(result.Stdout)
	if len(lines) == 0 {
		return "", &Error{
			Code:    "RemoteWorkspace",
			Message: "Failed to resolve remote workspace path.",
		}
	}
	return lines[len(lines)-1], nil
}

func (s *Service) resolveRemoteSettaCommand(sshTarget string, sshArgs []string, shell string, workspace string, remoteCommand string, sshPrefix []string) (string, error) {
	if remoteCommand != "" {
		return remoteCommand, nil
	}
	quotedWorkspace := shellQuote(workspace)
	inner := "cd " + quotedWorkspace + " || exit 1;" +
		`if [ -x "./.venv/bin/python" ]; then printf '%s' "./.venv/bin/python -m setta"; exit 0; fi;` +
		`if [ -x "./venv/bin/python" ]; then printf '%s' "./venv/bin/python -m setta"; exit 0; fi;` +
		`if [ -x "./env/bin/python" ]; then printf '%s' "./env/bin/python -m setta"; exit 0; fi;` +
		`if [ -f "pyproject.toml" ] && command -v poetry >/dev/null 2>&1; then printf '%s' "poetry run python -m setta"; exit 0; fi;` +
		`if [ -f "pyproject.toml" ] && command -v uv >/dev/null 2>&1; then printf '%s' "uv run python -m setta"; exit 0; fi;` +
		`if command -v setta >/dev/null 2>&1; then printf '%s' "setta"; exit 0; fi;` +
		"exit 2;"
	result, err := s.runSSHCommand(
		sshTarget,
		sshArgs,
		buildRemoteShellCommand(shell, inner),
		sshPrefix,
		defaultSSHCommandTimeout,
	)
	if err != nil {
		return "", err
	}
	if result.ExitCode != 0 {
		return "", &Error{
			Code:    "RemoteSettaCmd",
			Message: "Unable to resolve remote Setta command. Provide remoteCmd or ensure setta is installed.",
		}
	}
	lines := nonBlankLines(result.Stdout)
	if len(lines) == 0 {
		return "", &Error{
			Code:    "RemoteSettaCmd",
			Message: "Remote Setta command resolution returned no output.",
		}
	}
	return lines[len(lines)-1], nil
}

func buildRemoteSettaPathArgs(profile string, settaHome string, settaFilesRoot string, settaFilesLocation string, runtimeRoot string) (string, error) {
	args := make([]string, 0, 4)
	if profile != "" {
		args = append(args, "--profile "+shellQuote(profile))
	}
	if settaHome != "" {
		args = append(args, "--setta-home "+shellQuote(settaHome))
	}
	normalizedLocation, err := NormalizeSettaFilesLocation(settaFilesLocation)
	if err != nil {
		return "", err
	}
	if settaFilesRoot != "" && normalizedLocation != "" {
		return "", &Error{
			Code:    "InvalidSettaFilesConfig",
			Message: "Cannot pass both --setta-files-root and --setta-files-location for remote commands.",
		}
	}
	if settaFilesRoot != "" {
		args = append(args, "--setta-files-root "+shellQuote(settaFilesRoot))
	} else if normalizedLocation != "" {
		args = append(args, "--setta-files-location "+shellQuote(normalizedLocation))
	}
	if runtimeRoot != "" {
		args = append(args, "--runtime-root "+shellQuote(runtimeRoot))
	}
	return strings.Join(args, " "), nil
}

func (s *Service) runRemoteSettaCommand(
	sshTarget string,
	sshArgs []string,
	shell string,
	workspace string,
	settaCommand string,
	settaArgs string,
	sshPrefix []string,
	timeout time.Duration,
) (sshCommandResult, error) {
	inner := "cd " + shellQuote(workspace) + " && " + strings.TrimSpace(settaCommand+" "+settaArgs)
	return s.runSSHCommand(
		sshTarget,
		sshArgs,
		buildRemoteShellCommand(shell, inner),
		sshPrefix,
		timeout,
	)
}

func (s *Service) fetchRemoteSessions(
	sshTarget string,
	sshArgs []string,
	shell string,
	workspace string,
	settaCommand string,
	settaFilesArgs string,
	sshPrefix []string,
	serverMode RemoteServerMode,
) ([]RemoteSessionSummary, error) {
	rootPrefix := ""
	if settaFilesArgs != "" {
		rootPrefix = settaFilesArgs + " "
	}
	serverModeArg := ""
	if serverMode != "" {
		serverModeArg = " --server-mode " + string(serverMode)
	}
	result, err := s.runRemoteSettaCommand(
		sshTarget,
		sshArgs,
		shell,
		workspace,
		settaCommand,
		rootPrefix+"status --list-sessions --json --workspace "+shellQuote(workspace)+serverModeArg,
		sshPrefix,
		defaultRemoteCommandTimeout,
	)
	if err != nil {
		return nil, err
	}
	if result.ExitCode != 0 {
		details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
		message := "Failed to list remote sessions."
		if details != "" {
			message += " " + details
		}
		return nil, &Error{
			Code:    "RemoteSessions",
			Message: message,
		}
	}
	payload, err := ParseJSONPayload(result.Stdout)
	if err != nil {
		return nil, err
	}
	return ParseRemoteSessionList(payload)
}

func (s *Service) waitForRemoteSessions(
	sshTarget string,
	sshArgs []string,
	shell string,
	workspace string,
	settaCommand string,
	settaFilesArgs string,
	sshPrefix []string,
	timeout time.Duration,
	settaFilesLocation string,
	settaFilesRoot string,
	runtimeRoot string,
	serverMode RemoteServerMode,
) ([]RemoteSessionSummary, error) {
	remoteLogsDir, err := ResolveRemoteLogsDir(workspace, settaFilesLocation, settaFilesRoot, runtimeRoot)
	if err != nil {
		return nil, err
	}
	deadline := s.now().Add(timeout)
	for {
		sessions, err := s.fetchRemoteSessions(
			sshTarget,
			sshArgs,
			shell,
			workspace,
			settaCommand,
			settaFilesArgs,
			sshPrefix,
			serverMode,
		)
		if err != nil {
			return nil, err
		}
		if len(sessions) > 0 {
			return sessions, nil
		}
		if !s.now().Before(deadline) {
			return nil, &Error{
				Code:    "RemoteLaunchTimeout",
				Message: "Timed out waiting for remote Setta session to start. Check logs under: " + remoteLogsDir,
			}
		}
		s.sleep(remoteLaunchPollInterval)
	}
}

func (s *Service) fetchRemoteConnectInfo(
	sshTarget string,
	sshArgs []string,
	shell string,
	workspace string,
	settaCommand string,
	settaFilesArgs string,
	sessionID string,
	sshPrefix []string,
	launcherOrigin string,
) (RemoteConnectInfo, error) {
	rootPrefix := ""
	if settaFilesArgs != "" {
		rootPrefix = settaFilesArgs + " "
	}
	settaArgs := rootPrefix + "status --connect-info --json --workspace " + shellQuote(workspace) +
		" --session " + shellQuote(sessionID)
	if launcherOrigin != "" {
		settaArgs += " --launcher-origin " + shellQuote(launcherOrigin)
	}
	result, err := s.runRemoteSettaCommand(
		sshTarget,
		sshArgs,
		shell,
		workspace,
		settaCommand,
		settaArgs,
		sshPrefix,
		defaultRemoteCommandTimeout,
	)
	if err != nil {
		return RemoteConnectInfo{}, err
	}
	if result.ExitCode != 0 {
		details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
		message := "Failed to read remote connect info."
		if details != "" {
			message += " " + details
		}
		return RemoteConnectInfo{}, &Error{
			Code:    "RemoteConnectInfo",
			Message: message,
		}
	}
	payload, err := ParseJSONPayload(result.Stdout)
	if err != nil {
		return RemoteConnectInfo{}, err
	}
	return ParseRemoteConnectInfo(payload, launcherOrigin)
}

func (s *Service) remoteCommandExists(sshTarget string, sshArgs []string, command string, sshPrefix []string) (bool, error) {
	result, err := s.runSSHCommand(
		sshTarget,
		sshArgs,
		"command -v "+shellQuote(command),
		sshPrefix,
		defaultSSHCommandTimeout,
	)
	if err != nil {
		return false, err
	}
	return result.ExitCode == 0, nil
}

func (s *Service) startRemoteSetta(
	sshTarget string,
	sshArgs []string,
	shell string,
	workspace string,
	settaCommand string,
	settaFilesArgs string,
	sshPrefix []string,
	settaFilesLocation string,
	settaFilesRoot string,
	runtimeRoot string,
) error {
	runner := ""
	hasSetsid, err := s.remoteCommandExists(sshTarget, sshArgs, "setsid", sshPrefix)
	if err != nil {
		return err
	}
	if hasSetsid {
		runner = "setsid"
	} else {
		hasNohup, err := s.remoteCommandExists(sshTarget, sshArgs, "nohup", sshPrefix)
		if err != nil {
			return err
		}
		if hasNohup {
			runner = "nohup"
		}
	}
	if runner == "" {
		return &Error{
			Code:    "RemoteStart",
			Message: "Remote host missing nohup/setsid; cannot background Setta automatically. Start it manually or install nohup/setsid.",
		}
	}

	remoteLogsDir, err := ResolveRemoteLogsDir(workspace, settaFilesLocation, settaFilesRoot, runtimeRoot)
	if err != nil {
		return err
	}
	remoteLogFile := fmt.Sprintf("%s/nohup-%d-%d.out", remoteLogsDir, time.Now().UnixNano(), os.Getpid())
	rootPrefix := ""
	if settaFilesArgs != "" {
		rootPrefix = settaFilesArgs + " "
	}
	settaArgs := strings.TrimSpace(rootPrefix + "--no-open")
	startPart := runner + " " + strings.TrimSpace(settaCommand+" "+settaArgs)
	if needsShellWrapper(settaCommand) {
		wrapped := strings.TrimSpace(settaCommand + " " + settaArgs)
		startPart = runner + " " + shell + " -lc " + shellQuote(wrapped)
	}
	launch := "mkdir -p " + shellQuote(remoteLogsDir) + " && " +
		"cd " + shellQuote(workspace) + " && " +
		startPart + " > " + shellQuote(remoteLogFile) + " 2>&1 < /dev/null &"
	result, err := s.runSSHCommand(
		sshTarget,
		sshArgs,
		buildRemoteShellCommand(shell, launch),
		sshPrefix,
		10*time.Second,
	)
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
		message := "Failed to start remote Setta."
		if details != "" {
			message += " " + details
		}
		message += " (remote log: " + remoteLogFile + ")"
		return &Error{
			Code:    "RemoteStart",
			Message: message,
		}
	}
	return nil
}

func buildRemoteShellCommand(shell string, innerCommand string) string {
	return shell + " -lc " + shellQuote(innerCommand)
}

func extractTokenFromBootstrapURL(bootstrapURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(bootstrapURL))
	if err != nil {
		return "", err
	}
	for _, candidate := range []string{parsed.Fragment, parsed.RawQuery} {
		if candidate == "" {
			continue
		}
		values, err := url.ParseQuery(candidate)
		if err != nil {
			continue
		}
		token := strings.TrimSpace(values.Get("token"))
		if token != "" {
			return token, nil
		}
	}
	return "", errors.New("Bootstrap URL missing token parameter.")
}

func newestRemoteSession(sessions []RemoteSessionSummary) RemoteSessionSummary {
	best := sessions[0]
	for _, session := range sessions[1:] {
		if session.StartedAt.After(best.StartedAt) {
			best = session
		}
	}
	return best
}

func selectConnectSession(sessions []RemoteSessionSummary, sessionID string, latest bool) (RemoteSessionSummary, bool, error) {
	if trimmed := NormalizeOptionalArgument(sessionID); trimmed != "" {
		for _, session := range sessions {
			if session.ID == trimmed {
				return session, true, nil
			}
		}
		return RemoteSessionSummary{}, false, &Error{
			Code:    "RemoteConnectSelection",
			Message: fmt.Sprintf("Session %s not found.", trimmed),
		}
	}
	if latest {
		if len(sessions) == 0 {
			return RemoteSessionSummary{}, false, nil
		}
		return newestRemoteSession(sessions), true, nil
	}
	switch len(sessions) {
	case 0:
		return RemoteSessionSummary{}, false, nil
	case 1:
		return sessions[0], true, nil
	default:
		return RemoteSessionSummary{}, false, &Error{
			Code:    "RemoteConnectSelection",
			Message: "Use --session or --latest for remote connect.",
		}
	}
}

func nonBlankLines(raw string) []string {
	lines := strings.Split(raw, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}

func needsShellWrapper(command string) bool {
	trimmed := strings.TrimSpace(command)
	if strings.HasPrefix(trimmed, "source ") || strings.HasPrefix(trimmed, ". ") {
		return true
	}
	return strings.Contains(command, "&&") ||
		strings.Contains(command, "||") ||
		strings.Contains(command, ";") ||
		strings.Contains(command, "|")
}

func errorCode(err error) string {
	var typed *Error
	if errors.As(err, &typed) {
		return typed.Code
	}
	return ""
}

func testStubForwardDisabled() bool {
	raw := strings.TrimSpace(os.Getenv("SETTA_SSH_STUB_DISABLE_FORWARD"))
	return !strings.EqualFold(raw, "") &&
		!strings.EqualFold(raw, "0") &&
		!strings.EqualFold(raw, "false")
}

func serviceRuntimePath(runtimeRoot string, parts ...string) string {
	segments := append([]string{runtimeRoot}, parts...)
	return filepath.Join(segments...)
}
