package workspacelaunch

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/localsessions"
	"setta/internal/sshx"
)

const (
	defaultLocalLaunchBootstrapTTL = 10 * time.Minute
)

type LaunchError struct {
	Code      string
	Message   string
	ReturnURL string
}

func (e *LaunchError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type LocalLaunchInput struct {
	Request        Request
	RequestOrigin  string
	CurrentSession *auth.CurrentSession
}

type LocalLaunchResult struct {
	BootstrapURLFragment string
	ReturnURL            string
	WorkspaceRoot        string
	SettaFilesLocation   string
	SettaFilesRoot       string
	RuntimeRoot          string
	SettaHome            string
	Profile              *string
	RemoteCmdResolved    *string
	SessionID            string
	StartedNew           bool
	Session              auth.SessionMetadata
}

type SSHWorkspaceRuntime interface {
	ConnectWorkspaceSession(sshx.ConnectWorkspaceInput) (sshx.RemoteConnectResult, error)
	RollbackRemoteWorkspaceLaunch(sshx.RollbackRemoteWorkspaceInput) error
}

type LocalLaunchServiceOptions struct {
	DefaultSettaHome                 string
	DefaultProfileLookupHome         string
	Intents                          *IntentService
	TrustedOrigins                   *frontendorigins.Service
	Sessions                         launcher.IDEWorkspaceSessionLauncher
	SSH                              SSHWorkspaceRuntime
	Now                              func() time.Time
	MintBootstrapToken               launcher.BootstrapTokenMintFunc
	ResolveLauncherSessionAuthExpiry func(time.Time) (int64, error)
	RollbackLocalSession             func(auth.SessionMetadata, string) error
}

type LocalLaunchService struct {
	defaultSettaHome                 string
	defaultProfileLookupHome         string
	intents                          *IntentService
	trustedOrigins                   *frontendorigins.Service
	sessions                         launcher.IDEWorkspaceSessionLauncher
	ssh                              SSHWorkspaceRuntime
	now                              func() time.Time
	mintBootstrapToken               launcher.BootstrapTokenMintFunc
	resolveLauncherSessionAuthExpiry func(time.Time) (int64, error)
	rollbackLocalSession             func(auth.SessionMetadata, string) error
}

func NewLocalLaunchService(options LocalLaunchServiceOptions) (*LocalLaunchService, error) {
	defaultSettaHome := strings.TrimSpace(options.DefaultSettaHome)
	if defaultSettaHome == "" {
		return nil, fmt.Errorf("default setta home is required")
	}
	defaultProfileLookupHome := strings.TrimSpace(options.DefaultProfileLookupHome)
	if defaultProfileLookupHome == "" {
		defaultProfileLookupHome = defaultSettaHome
	}
	if options.Intents == nil {
		return nil, fmt.Errorf("workspace launch intent service is required")
	}
	if options.TrustedOrigins == nil {
		return nil, fmt.Errorf("trusted frontend origin service is required")
	}
	if options.Sessions == nil {
		return nil, fmt.Errorf("local IDE session launcher is required")
	}
	if options.SSH == nil {
		return nil, fmt.Errorf("ssh workspace runtime is required")
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	mintBootstrapToken := options.MintBootstrapToken
	if mintBootstrapToken == nil {
		tokenManager := auth.NewBootstrapTokenManager(defaultLocalLaunchBootstrapTTL, auth.NewNonceTracker())
		mintBootstrapToken = tokenManager.Mint
	}
	if options.ResolveLauncherSessionAuthExpiry == nil {
		return nil, fmt.Errorf("launcher session auth expiry resolver is required")
	}
	rollbackLocalSession := options.RollbackLocalSession
	if rollbackLocalSession == nil {
		rollbackLocalSession = rollbackStartedLocalSession
	}

	return &LocalLaunchService{
		defaultSettaHome:                 defaultSettaHome,
		defaultProfileLookupHome:         defaultProfileLookupHome,
		intents:                          options.Intents,
		trustedOrigins:                   options.TrustedOrigins,
		sessions:                         options.Sessions,
		ssh:                              options.SSH,
		now:                              now,
		mintBootstrapToken:               mintBootstrapToken,
		resolveLauncherSessionAuthExpiry: options.ResolveLauncherSessionAuthExpiry,
		rollbackLocalSession:             rollbackLocalSession,
	}, nil
}

func (s *LocalLaunchService) Launch(input LocalLaunchInput) (LocalLaunchResult, error) {
	returnURL := buildSafeLaunchReturnURL(input.RequestOrigin)
	if input.CurrentSession == nil {
		return LocalLaunchResult{}, &LaunchError{
			Code:      "Unauthorized",
			Message:   "Missing session.",
			ReturnURL: returnURL,
		}
	}

	launchIntentToken := trimmedStringPointer(input.Request.LaunchIntentToken)
	if launchIntentToken == "" {
		return LocalLaunchResult{}, &LaunchError{
			Code:      "BadRequest",
			Message:   "launchIntentToken is required.",
			ReturnURL: returnURL,
		}
	}
	if launchRequestHasInlineOverrides(input.Request) {
		return LocalLaunchResult{}, &LaunchError{
			Code:      "BadRequest",
			Message:   "launchIntentToken must be the only request field when provided.",
			ReturnURL: returnURL,
		}
	}

	launchRequest, storedReturnURL, err := s.intents.ConsumeIntent(input.CurrentSession, launchIntentToken)
	if err != nil {
		intentErr, ok := err.(*IntentError)
		if !ok {
			return LocalLaunchResult{}, &LaunchError{
				Code:      "InternalError",
				Message:   "Internal Server Error",
				ReturnURL: returnURL,
			}
		}
		return LocalLaunchResult{}, &LaunchError{
			Code:      intentErr.Code,
			Message:   intentErr.Message,
			ReturnURL: returnURL,
		}
	}
	returnURL = storedReturnURL

	normalizedProfile := trimmedStringPointer(launchRequest.Profile)
	normalizedSettaFilesRoot := trimmedStringPointer(launchRequest.SettaFilesRoot)
	normalizedRuntimeRoot := trimmedStringPointer(launchRequest.RuntimeRoot)
	normalizedSettaFilesLocation := launcher.NormalizeSettaFilesLocationForLaunch(
		launchRequest.SettaFilesLocation,
		launchRequest.FieldProvided("settaFilesLocation"),
		normalizedSettaFilesRoot,
		normalizedProfile,
	)
	normalizedSettaHome := trimmedStringPointer(launchRequest.SettaHome)
	if trimmedStringPointer(launchRequest.SSHTarget) != "" {
		return s.launchRemoteWorkspace(
			launchRequest,
			returnURL,
			input.RequestOrigin,
			input.CurrentSession,
			normalizedProfile,
			normalizedSettaHome,
			normalizedSettaFilesRoot,
			normalizedSettaFilesLocation,
			normalizedRuntimeRoot,
		)
	}

	explicitSettaHome := normalizedSettaHome
	normalizedSettaHome = strings.TrimSpace(s.defaultSettaHome)
	if explicitSettaHome != "" {
		normalizedSettaHome = explicitSettaHome
	}
	profileLookupHome := ""
	if normalizedProfile != "" && explicitSettaHome == "" {
		profileLookupHome = s.defaultProfileLookupHome
	}

	launchResult, err := s.sessions.EnsureSession(launcher.IDELaunchInput{
		WorkspaceRoot:      trimmedStringPointer(launchRequest.WorkspaceRoot),
		SettaHome:          normalizedSettaHome,
		ProfileLookupHome:  profileLookupHome,
		Profile:            normalizedProfile,
		SettaFilesRoot:     normalizedSettaFilesRoot,
		SettaFilesLocation: normalizedSettaFilesLocation,
		RuntimeRoot:        normalizedRuntimeRoot,
	})
	if err != nil {
		var sessionLaunchErr *launcher.SessionLaunchError
		if errors.As(err, &sessionLaunchErr) {
			return LocalLaunchResult{}, &LaunchError{
				Code:      sessionLaunchErr.Code,
				Message:   sessionLaunchErr.Message,
				ReturnURL: returnURL,
			}
		}
		return LocalLaunchResult{}, &LaunchError{
			Code:      "InternalError",
			Message:   "Internal Server Error",
			ReturnURL: returnURL,
		}
	}

	token, err := s.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, s.now().UTC())
	if err != nil {
		return LocalLaunchResult{}, &LaunchError{
			Code:      "InternalError",
			Message:   "Internal Server Error",
			ReturnURL: returnURL,
		}
	}
	bootstrapURLFragment, err := launcher.BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return LocalLaunchResult{}, &LaunchError{
			Code:      "InternalError",
			Message:   "Internal Server Error",
			ReturnURL: returnURL,
		}
	}

	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(input.RequestOrigin)
	if normalizedRequestOrigin != "" {
		proof := frontendorigins.MintLauncherOriginHandoffProof(
			launchResult.Session.ID,
			normalizedRequestOrigin,
			launchResult.Secret,
		)
		bootstrapURLFragment, err = frontendorigins.AppendLauncherOriginHandoffToBootstrapURL(
			bootstrapURLFragment,
			normalizedRequestOrigin,
			proof,
		)
		if err != nil {
			return LocalLaunchResult{}, &LaunchError{
				Code:      "InternalError",
				Message:   "Internal Server Error",
				ReturnURL: returnURL,
			}
		}
	}

	if err := s.trustLaunchedWorkspaceOriginForLauncherSession(normalizedRequestOrigin, bootstrapURLFragment, input.CurrentSession); err != nil {
		if launchResult.StartedNew {
			if rollbackErr := s.rollbackLocalSession(launchResult.Session, launchResult.Paths.RuntimeRoot); rollbackErr != nil {
				return LocalLaunchResult{}, &LaunchError{
					Code:      "LocalRollbackFailed",
					Message:   fmt.Sprintf("Launch trust persistence failed and rollback of local session %s also failed: %v", launchResult.Session.ID, rollbackErr),
					ReturnURL: returnURL,
				}
			}
		}
		code := "InternalError"
		message := "Internal Server Error"
		switch {
		case isTrustedOriginUnavailableError(err):
			code = "TrustedFrontendOriginStoreUnavailable"
			message = err.Error()
		case isTrustedOriginStateError(err):
			code = "TrustedFrontendOriginStoreInvalid"
			message = err.Error()
		}
		return LocalLaunchResult{}, &LaunchError{
			Code:      code,
			Message:   message,
			ReturnURL: returnURL,
		}
	}

	_ = launcher.UpdateLauncherLastUsedWorkspaceIfInstalled(launchResult.Paths.SettaHome, launchResult.Paths.WorkspaceRoot)

	return LocalLaunchResult{
		BootstrapURLFragment: bootstrapURLFragment,
		ReturnURL:            returnURL,
		WorkspaceRoot:        launchResult.Paths.WorkspaceRoot,
		SettaFilesLocation:   string(launchResult.Paths.ResolvedFilesLocation),
		SettaFilesRoot:       launchResult.Paths.SettaFilesRoot,
		RuntimeRoot:          launchResult.Paths.RuntimeRoot,
		SettaHome:            launchResult.Paths.SettaHome,
		Profile:              optionalStringPointer(launchResult.Paths.ProfileName),
		RemoteCmdResolved:    nil,
		SessionID:            launchResult.Session.ID,
		StartedNew:           launchResult.StartedNew,
		Session:              launchResult.Session,
	}, nil
}

func buildSafeLaunchReturnURL(requestOrigin string) string {
	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(requestOrigin)
	if normalizedRequestOrigin == "" {
		return "/home"
	}
	return normalizedRequestOrigin + "/home"
}

func launchRequestHasInlineOverrides(request Request) bool {
	if len(request.fieldSet) > 0 {
		for fieldName := range request.fieldSet {
			if fieldName != launchIntentTokenField {
				return true
			}
		}
		return false
	}
	return request.WorkspaceRoot != nil ||
		request.Profile != nil ||
		request.SettaHome != nil ||
		request.SettaFilesRoot != nil ||
		request.SettaFilesLocation != nil ||
		request.RuntimeRoot != nil ||
		request.SSHTarget != nil ||
		request.SSHArgs != nil ||
		request.RemoteCmd != nil ||
		request.LocalPort != nil
}

func optionalStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func (s *LocalLaunchService) trustLaunchedWorkspaceOriginForLauncherSession(requestOrigin string, bootstrapURLFragment string, currentSession *auth.CurrentSession) error {
	if strings.TrimSpace(requestOrigin) == "" || currentSession == nil {
		return nil
	}
	launchedWorkspaceOrigin := resolveBootstrapOrigin(bootstrapURLFragment)
	if launchedWorkspaceOrigin == "" || launchedWorkspaceOrigin == requestOrigin {
		return nil
	}
	exp, err := s.resolveLauncherSessionAuthExpiry(s.now().UTC())
	if err != nil {
		return fmt.Errorf("resolve launcher session auth expiry: %w", err)
	}
	_, err = s.trustedOrigins.TrustOrigin(launchedWorkspaceOrigin, currentSession.Metadata.ID, exp)
	return err
}

func resolveBootstrapOrigin(bootstrapURLFragment string) string {
	parsedBootstrapURL, err := url.Parse(strings.TrimSpace(bootstrapURLFragment))
	if err != nil {
		return ""
	}
	if parsedBootstrapURL.Scheme != "http" && parsedBootstrapURL.Scheme != "https" {
		return ""
	}
	if strings.TrimSpace(parsedBootstrapURL.Host) == "" {
		return ""
	}
	return frontendorigins.NormalizeOrigin(parsedBootstrapURL.Scheme + "://" + parsedBootstrapURL.Host)
}

func isTrustedOriginStateError(err error) bool {
	var stateErr *frontendorigins.StoreStateError
	return errors.As(err, &stateErr)
}

func isTrustedOriginUnavailableError(err error) bool {
	var unavailableErr *frontendorigins.StoreUnavailableError
	return errors.As(err, &unavailableErr)
}

func rollbackStartedLocalSession(session auth.SessionMetadata, runtimeRoot string) error {
	return localsessions.RollbackStartedLocalSession(session, runtimeRoot)
}
