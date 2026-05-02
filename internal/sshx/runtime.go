package sshx

import (
	"fmt"
	"strings"
	"time"

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

type remoteCommandContextRequest struct {
	sshTarget          string
	workspace          string
	profile            string
	settaHome          string
	settaFilesRoot     string
	settaFilesLocation string
	runtimeRoot        string
	sshArgs            string
	remoteCommand      string
}

type remoteCommandContext struct {
	sshTarget          string
	sshArgs            []string
	sshPrefix          []string
	shell              string
	remoteWorkspace    string
	remoteCommand      string
	settaFilesArgs     string
	settaFilesLocation string
	settaFilesRoot     string
	runtimeRoot        string
}

type prepareConnectRequest struct {
	remoteCommandContextRequest
	sessionID      string
	latest         bool
	launcherOrigin string
	timeout        time.Duration
}

type deleteRemoteWorkspaceRequest struct {
	remoteCommandContextRequest
	sessionID string
}

type listRemoteWorkspaceSessionsRequest struct {
	remoteCommandContextRequest
	serverMode RemoteServerMode
}

type preparedSessionSelection struct {
	session             RemoteSessionSummary
	startedNew          bool
	initialSessionCount int
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

func normalizePrepareConnectRequest(input PrepareConnectWorkspaceInput) (prepareConnectRequest, error) {
	request := prepareConnectRequest{
		sessionID:      NormalizeOptionalArgument(input.SessionID),
		latest:         input.Latest,
		launcherOrigin: NormalizeOptionalArgument(input.LauncherOrigin),
		timeout:        input.Timeout,
	}
	var err error
	request.sshTarget = NormalizeOptionalArgument(input.SSHTarget)
	if request.sshTarget == "" {
		return prepareConnectRequest{}, &Error{
			Code:    "InvalidSshTarget",
			Message: "sshTarget must be a non-empty string.",
		}
	}
	request.workspace = NormalizeOptionalArgument(input.Workspace)
	if request.workspace == "" {
		return prepareConnectRequest{}, &Error{
			Code:    "InvalidWorkspace",
			Message: "--workspace is required for SSH connect.",
		}
	}
	if request.sessionID != "" && request.latest {
		return prepareConnectRequest{}, &Error{
			Code:    "RemoteConnectSelection",
			Message: "Use either --session or --latest, not both.",
		}
	}
	normalizedContext, err := normalizeRemoteCommandContextRequest(remoteCommandContextRequest{
		sshTarget:          request.sshTarget,
		workspace:          request.workspace,
		profile:            input.Profile,
		settaHome:          input.SettaHome,
		settaFilesRoot:     input.SettaFilesRoot,
		settaFilesLocation: input.SettaFilesLocation,
		runtimeRoot:        input.RuntimeRoot,
		sshArgs:            input.SSHArgs,
		remoteCommand:      input.RemoteCommand,
	})
	if err != nil {
		return prepareConnectRequest{}, err
	}
	request.remoteCommandContextRequest = normalizedContext
	return request, nil
}

func normalizeListRemoteWorkspaceSessionsRequest(input ListRemoteWorkspaceSessionsInput) (listRemoteWorkspaceSessionsRequest, error) {
	request := listRemoteWorkspaceSessionsRequest{
		serverMode: input.ServerMode,
	}
	request.sshTarget = NormalizeOptionalArgument(input.SSHTarget)
	if request.sshTarget == "" {
		return listRemoteWorkspaceSessionsRequest{}, &Error{
			Code:    "InvalidSshTarget",
			Message: "sshTarget must be a non-empty string.",
		}
	}
	request.workspace = NormalizeOptionalArgument(input.Workspace)
	if request.workspace == "" {
		return listRemoteWorkspaceSessionsRequest{}, &Error{
			Code:    "InvalidWorkspace",
			Message: "--workspace is required for remote session listing.",
		}
	}
	normalizedContext, err := normalizeRemoteCommandContextRequest(remoteCommandContextRequest{
		sshTarget:          request.sshTarget,
		workspace:          request.workspace,
		profile:            input.Profile,
		settaHome:          input.SettaHome,
		settaFilesRoot:     input.SettaFilesRoot,
		settaFilesLocation: input.SettaFilesLocation,
		runtimeRoot:        input.RuntimeRoot,
		sshArgs:            input.SSHArgs,
		remoteCommand:      input.RemoteCommand,
	})
	if err != nil {
		return listRemoteWorkspaceSessionsRequest{}, err
	}
	request.remoteCommandContextRequest = normalizedContext
	return request, nil
}

func normalizeDeleteRemoteWorkspaceRequest(input DeleteRemoteWorkspaceSessionInput) (deleteRemoteWorkspaceRequest, error) {
	request := deleteRemoteWorkspaceRequest{
		sessionID: NormalizeOptionalArgument(input.SessionID),
	}
	var err error
	request.sshTarget = NormalizeOptionalArgument(input.SSHTarget)
	if request.sshTarget == "" {
		return deleteRemoteWorkspaceRequest{}, &Error{Code: "RemoteRollback", Message: "Missing sshTarget for rollback."}
	}
	request.workspace = NormalizeOptionalArgument(input.Workspace)
	if request.workspace == "" {
		return deleteRemoteWorkspaceRequest{}, &Error{Code: "RemoteRollback", Message: "Missing workspace for rollback."}
	}
	if request.sessionID == "" {
		return deleteRemoteWorkspaceRequest{}, &Error{Code: "RemoteRollback", Message: "Missing session id for rollback."}
	}
	normalizedContext, err := normalizeRemoteCommandContextRequest(remoteCommandContextRequest{
		sshTarget:          request.sshTarget,
		workspace:          request.workspace,
		profile:            input.Profile,
		settaHome:          input.SettaHome,
		settaFilesRoot:     input.SettaFilesRoot,
		settaFilesLocation: input.SettaFilesLocation,
		runtimeRoot:        input.RuntimeRoot,
		sshArgs:            input.SSHArgs,
		remoteCommand:      input.RemoteCommand,
	})
	if err != nil {
		return deleteRemoteWorkspaceRequest{}, err
	}
	request.remoteCommandContextRequest = normalizedContext
	return request, nil
}

func normalizeRemoteCommandContextRequest(input remoteCommandContextRequest) (remoteCommandContextRequest, error) {
	request := remoteCommandContextRequest{
		sshTarget:      NormalizeOptionalArgument(input.sshTarget),
		workspace:      NormalizeOptionalArgument(input.workspace),
		profile:        NormalizeOptionalArgument(input.profile),
		settaHome:      NormalizeOptionalArgument(input.settaHome),
		settaFilesRoot: NormalizeOptionalArgument(input.settaFilesRoot),
		runtimeRoot:    NormalizeOptionalArgument(input.runtimeRoot),
		sshArgs:        NormalizeOptionalArgument(input.sshArgs),
		remoteCommand:  NormalizeOptionalArgument(input.remoteCommand),
	}
	settaFilesLocation, err := NormalizeSettaFilesLocation(input.settaFilesLocation)
	if err != nil {
		return remoteCommandContextRequest{}, err
	}
	request.settaFilesLocation = defaultRemoteSettaFilesLocation(
		request.profile,
		request.settaFilesRoot,
		settaFilesLocation,
	)
	return request, nil
}
