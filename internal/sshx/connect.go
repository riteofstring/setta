package sshx

import (
	"fmt"
	"strings"

	"setta/internal/launcher"
)

func (s *Service) ListRemoteWorkspaceSessions(input ListRemoteWorkspaceSessionsInput) ([]RemoteSessionSummary, error) {
	request, err := normalizeListRemoteWorkspaceSessionsRequest(input)
	if err != nil {
		return nil, err
	}
	commandContext, err := s.resolveRemoteCommandContext(request.remoteCommandContextRequest)
	if err != nil {
		return nil, err
	}
	return s.fetchRemoteSessions(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		commandContext.remoteCommand,
		commandContext.settaFilesArgs,
		commandContext.sshPrefix,
		request.serverMode,
	)
}

func (s *Service) DeleteRemoteWorkspaceSession(input DeleteRemoteWorkspaceSessionInput) error {
	request, err := normalizeDeleteRemoteWorkspaceRequest(input)
	if err != nil {
		return err
	}
	commandContext, err := s.resolveRemoteCommandContext(request.remoteCommandContextRequest)
	if err != nil {
		return err
	}
	return s.deleteRemoteSession(commandContext, request.sessionID)
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
	request, err := normalizePrepareConnectRequest(input)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	commandContext, err := s.resolveRemoteCommandContext(request.remoteCommandContextRequest)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	selection, err := s.prepareRemoteSessionSelection(commandContext, request)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	connectInfo, err := s.fetchRemoteConnectInfo(
		commandContext.sshTarget,
		commandContext.sshArgs,
		commandContext.shell,
		commandContext.remoteWorkspace,
		commandContext.remoteCommand,
		commandContext.settaFilesArgs,
		selection.session.ID,
		commandContext.sshPrefix,
		request.launcherOrigin,
	)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	token, err := extractRemoteConnectToken(connectInfo)
	if err != nil {
		return PreparedConnectWorkspaceResult{}, err
	}
	return PreparedConnectWorkspaceResult{
		Session:             selection.session,
		StartedNew:          selection.startedNew,
		InitialSessionCount: selection.initialSessionCount,
		RemoteShell:         commandContext.shell,
		RemoteWorkspace:     commandContext.remoteWorkspace,
		RemoteCommand:       commandContext.remoteCommand,
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
