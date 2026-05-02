package sshx

import (
	"fmt"
	"strings"
	"time"
)

func defaultRemoteSettaFilesLocation(profile string, settaFilesRoot string, settaFilesLocation string) string {
	if settaFilesRoot == "" && settaFilesLocation == "" && profile == "" {
		return "auto"
	}
	return settaFilesLocation
}

func (s *Service) resolveRemoteCommandContext(input remoteCommandContextRequest) (remoteCommandContext, error) {
	sshArgs, err := ParseSSHArgs(input.sshArgs)
	if err != nil {
		return remoteCommandContext{}, err
	}
	sshArgs = ApplyControlSocketArgs(sshArgs)

	commandContext := remoteCommandContext{
		sshTarget:          input.sshTarget,
		sshArgs:            sshArgs,
		sshPrefix:          SSHCommandPrefix(true, s.resolvedSSHBin()),
		settaFilesLocation: input.settaFilesLocation,
		settaFilesRoot:     input.settaFilesRoot,
		runtimeRoot:        input.runtimeRoot,
	}
	commandContext.shell, err = s.resolveRemoteShell(commandContext.sshTarget, commandContext.sshArgs, commandContext.sshPrefix)
	if err != nil {
		return remoteCommandContext{}, err
	}
	commandContext.remoteWorkspace, err = s.resolveRemoteWorkspace(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		input.workspace,
		commandContext.sshPrefix,
	)
	if err != nil {
		return remoteCommandContext{}, err
	}
	commandContext.remoteCommand, err = s.resolveRemoteSettaCommand(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		input.remoteCommand,
		commandContext.sshPrefix,
	)
	if err != nil {
		return remoteCommandContext{}, err
	}
	commandContext.settaFilesArgs, err = buildRemoteSettaPathArgs(
		input.profile,
		input.settaHome,
		input.settaFilesRoot,
		input.settaFilesLocation,
		input.runtimeRoot,
	)
	if err != nil {
		return remoteCommandContext{}, err
	}
	return commandContext, nil
}

func (s *Service) prepareRemoteSessionSelection(
	commandContext remoteCommandContext,
	request prepareConnectRequest,
) (preparedSessionSelection, error) {
	sessions, err := s.fetchRemoteSessions(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		commandContext.remoteCommand,
		commandContext.settaFilesArgs,
		commandContext.sshPrefix,
		RemoteServerModeIDE,
	)
	if err != nil {
		return preparedSessionSelection{}, err
	}
	selection := preparedSessionSelection{
		initialSessionCount: len(sessions),
	}
	session, hasSelection, err := selectConnectSession(sessions, request.sessionID, request.latest)
	if err != nil {
		return preparedSessionSelection{}, err
	}
	if hasSelection {
		selection.session = session
		return selection, nil
	}
	sessions, err = s.startAndWaitForRemoteSessions(commandContext, request.timeout)
	if err != nil {
		return preparedSessionSelection{}, err
	}
	selection.startedNew = true
	selection.session = newestRemoteSession(sessions)
	return selection, nil
}

func (s *Service) startAndWaitForRemoteSessions(
	commandContext remoteCommandContext,
	timeout time.Duration,
) ([]RemoteSessionSummary, error) {
	startTimedOut := false
	if err := s.startRemoteSetta(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		commandContext.remoteCommand,
		commandContext.settaFilesArgs,
		commandContext.sshPrefix,
		commandContext.settaFilesLocation,
		commandContext.settaFilesRoot,
		commandContext.runtimeRoot,
	); err != nil {
		if errorCode(err) != "SshTimeout" {
			return nil, err
		}
		startTimedOut = true
	}
	if timeout <= 0 {
		timeout = defaultRemoteLaunchTimeout
	}
	sessions, err := s.waitForRemoteSessions(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		commandContext.remoteCommand,
		commandContext.settaFilesArgs,
		commandContext.sshPrefix,
		timeout,
		commandContext.settaFilesLocation,
		commandContext.settaFilesRoot,
		commandContext.runtimeRoot,
		RemoteServerModeIDE,
	)
	if err == nil {
		return sessions, nil
	}
	if startTimedOut && errorCode(err) == "RemoteLaunchTimeout" {
		return nil, &Error{
			Code: "RemoteStart",
			Message: "SSH command to start remote Setta timed out, and no sessions appeared before the launch timeout. " +
				"Check SSH connectivity/auth and try again. " + err.Error(),
		}
	}
	return nil, err
}

func (s *Service) deleteRemoteSession(commandContext remoteCommandContext, sessionID string) error {
	rootPrefix := ""
	if commandContext.settaFilesArgs != "" {
		rootPrefix = commandContext.settaFilesArgs + " "
	}
	result, err := s.runRemoteSettaCommand(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		commandContext.remoteCommand,
		rootPrefix+"status --delete-session "+shellQuote(sessionID),
		commandContext.sshPrefix,
		defaultRemoteCommandTimeout,
	)
	if err != nil {
		return err
	}
	if result.ExitCode == 0 {
		return nil
	}
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

func extractRemoteConnectToken(connectInfo RemoteConnectInfo) (string, error) {
	token, err := extractTokenFromBootstrapURL(connectInfo.BootstrapURLFragment)
	if err != nil {
		return "", &Error{
			Code:    "RemoteToken",
			Message: err.Error(),
		}
	}
	return token, nil
}
