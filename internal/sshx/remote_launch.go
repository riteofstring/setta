package sshx

import (
	"fmt"
	"os"
	"strings"
	"time"
)

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

func (s *Service) selectRemoteBackgroundRunner(sshTarget string, sshArgs []string, sshPrefix []string) (string, error) {
	for _, candidate := range []string{"setsid", "nohup"} {
		exists, err := s.remoteCommandExists(sshTarget, sshArgs, candidate, sshPrefix)
		if err != nil {
			return "", err
		}
		if exists {
			return candidate, nil
		}
	}
	return "", &Error{
		Code:    "RemoteStart",
		Message: "Remote host missing nohup/setsid; cannot background Setta automatically. Start it manually or install nohup/setsid.",
	}
}

func buildRemoteSettaStartPart(runner string, shell string, settaCommand string, settaArgs string) string {
	if needsShellWrapper(settaCommand) {
		wrapped := strings.TrimSpace(settaCommand + " " + settaArgs)
		return runner + " " + shell + " -lc " + shellQuote(wrapped)
	}
	return runner + " " + strings.TrimSpace(settaCommand+" "+settaArgs)
}

func buildRemoteSettaLaunchCommand(workspace string, remoteLogsDir string, remoteLogFile string, startPart string) string {
	return "mkdir -p " + shellQuote(remoteLogsDir) + " && " +
		"cd " + shellQuote(workspace) + " && " +
		startPart + " > " + shellQuote(remoteLogFile) + " 2>&1 < /dev/null &"
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
	runner, err := s.selectRemoteBackgroundRunner(sshTarget, sshArgs, sshPrefix)
	if err != nil {
		return err
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
	startPart := buildRemoteSettaStartPart(runner, shell, settaCommand, settaArgs)
	launch := buildRemoteSettaLaunchCommand(workspace, remoteLogsDir, remoteLogFile, startPart)
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
