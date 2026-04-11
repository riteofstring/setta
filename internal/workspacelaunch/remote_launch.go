package workspacelaunch

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/auth"
	"setta/internal/frontendorigins"
	"setta/internal/sshx"
)

func (s *LocalLaunchService) launchRemoteWorkspace(
	launchRequest Request,
	returnURL string,
	requestOrigin string,
	currentSession *auth.CurrentSession,
	normalizedProfile string,
	normalizedSettaHome string,
	normalizedSettaFilesRoot string,
	normalizedSettaFilesLocation *string,
	normalizedRuntimeRoot string,
) (LocalLaunchResult, error) {
	remoteLaunchResult, err := s.ssh.ConnectWorkspaceSession(sshx.ConnectWorkspaceInput{
		SSHTarget:          trimmedStringPointer(launchRequest.SSHTarget),
		Workspace:          trimmedStringPointer(launchRequest.WorkspaceRoot),
		Profile:            normalizedProfile,
		SettaHome:          normalizedSettaHome,
		SettaFilesRoot:     normalizedSettaFilesRoot,
		SettaFilesLocation: trimmedStringPointer(normalizedSettaFilesLocation),
		RuntimeRoot:        normalizedRuntimeRoot,
		SSHArgs:            trimmedStringPointer(launchRequest.SSHArgs),
		RemoteCommand:      trimmedStringPointer(launchRequest.RemoteCmd),
		LocalPort:          launchRequest.LocalPort,
		LauncherOrigin:     requestOrigin,
	})
	if err != nil {
		return LocalLaunchResult{}, mapRemoteLaunchError(err, returnURL)
	}

	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(requestOrigin)
	bootstrapURLFragment := remoteLaunchResult.BootstrapURLFragment
	if normalizedRequestOrigin != "" {
		if strings.TrimSpace(remoteLaunchResult.LauncherOriginProof) == "" {
			return LocalLaunchResult{}, &LaunchError{
				Code:      "RemoteConnectInfo",
				Message:   "Remote connect info did not include launcherOriginProof.",
				ReturnURL: returnURL,
			}
		}
		bootstrapURLFragment, err = frontendorigins.AppendLauncherOriginHandoffToBootstrapURL(
			bootstrapURLFragment,
			normalizedRequestOrigin,
			remoteLaunchResult.LauncherOriginProof,
		)
		if err != nil {
			return LocalLaunchResult{}, internalLaunchError(returnURL)
		}
	}

	if err := s.trustLaunchedWorkspaceOriginForLauncherSession(normalizedRequestOrigin, bootstrapURLFragment, currentSession); err != nil {
		if remoteLaunchResult.StartedNew {
			rollbackErr := s.ssh.RollbackRemoteWorkspaceLaunch(sshx.RollbackRemoteWorkspaceInput{
				SSHTarget:          trimmedStringPointer(launchRequest.SSHTarget),
				Workspace:          remoteLaunchResult.Session.WorkspacePathCanonical,
				SessionID:          remoteLaunchResult.Session.ID,
				RemoteCommand:      remoteLaunchResult.RemoteCommand,
				RemoteHost:         remoteLaunchResult.Session.Host,
				RemotePort:         remoteLaunchResult.Session.Port,
				Profile:            normalizedProfile,
				SettaHome:          normalizedSettaHome,
				SettaFilesRoot:     normalizedSettaFilesRoot,
				SettaFilesLocation: trimmedStringPointer(normalizedSettaFilesLocation),
				RuntimeRoot:        normalizedRuntimeRoot,
				SSHArgs:            trimmedStringPointer(launchRequest.SSHArgs),
			})
			if rollbackErr != nil {
				return LocalLaunchResult{}, &LaunchError{
					Code:      "RemoteRollbackFailed",
					Message:   fmt.Sprintf("Launch trust persistence failed and rollback of remote session %s also failed: %v", remoteLaunchResult.Session.ID, rollbackErr),
					ReturnURL: returnURL,
				}
			}
		}

		return LocalLaunchResult{}, mapTrustedOriginPersistenceError(err, returnURL)
	}

	return LocalLaunchResult{
		BootstrapURLFragment: bootstrapURLFragment,
		ReturnURL:            returnURL,
		WorkspaceRoot:        remoteLaunchResult.Session.WorkspacePathCanonical,
		SettaFilesLocation:   remoteLaunchResult.SettaFilesLocation,
		SettaFilesRoot:       remoteLaunchResult.SettaFilesRoot,
		RuntimeRoot:          remoteLaunchResult.RuntimeRoot,
		SettaHome:            remoteLaunchResult.SettaHome,
		Profile:              optionalStringPointer(remoteLaunchResult.Profile),
		RemoteCmdResolved:    optionalStringPointer(remoteLaunchResult.RemoteCommand),
		SessionID:            remoteLaunchResult.Session.ID,
		StartedNew:           remoteLaunchResult.StartedNew,
		Session: auth.SessionMetadata{
			ID:                     remoteLaunchResult.Session.ID,
			WorkspacePath:          remoteLaunchResult.Session.WorkspacePath,
			WorkspacePathCanonical: remoteLaunchResult.Session.WorkspacePathCanonical,
			Host:                   remoteLaunchResult.Session.Host,
			Port:                   remoteLaunchResult.Session.Port,
			PID:                    remoteLaunchResult.Session.PID,
			StartedAt:              remoteLaunchResult.Session.StartedAt,
			SettaFilesLocation:     remoteLaunchResult.SettaFilesLocation,
			SettaFilesRoot:         remoteLaunchResult.SettaFilesRoot,
			RuntimeRoot:            remoteLaunchResult.RuntimeRoot,
			SettaHome:              remoteLaunchResult.SettaHome,
			Profile:                remoteLaunchResult.Profile,
			ServerMode:             string(remoteLaunchResult.Session.ServerMode),
		},
	}, nil
}

func mapRemoteLaunchError(err error, returnURL string) error {
	var remoteErr *sshx.Error
	if errors.As(err, &remoteErr) {
		return &LaunchError{
			Code:      remoteErr.Code,
			Message:   remoteErr.Message,
			ReturnURL: returnURL,
		}
	}
	return internalLaunchError(returnURL)
}
