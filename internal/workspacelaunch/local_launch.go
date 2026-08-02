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
	BootstrapURLFragment   string
	ReturnURL              string
	WorkspaceRoot          string
	SettaFilesLocation     string
	UsesExplicitSettaFiles bool
	SettaFilesRoot         string
	RuntimeRoot            string
	SettaHome              string
	Profile                *string
	RemoteCmdResolved      *string
	SessionID              string
	StartedNew             bool
	Session                auth.SessionMetadata
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
	launchRequest, returnURL, err := s.resolveLaunchRequest(input)
	if err != nil {
		return LocalLaunchResult{}, err
	}

	normalized := normalizeLaunchRequest(launchRequest)
	if normalized.isRemote() {
		return s.launchRemoteWorkspace(
			launchRequest,
			returnURL,
			input.RequestOrigin,
			input.CurrentSession,
			normalized.Profile,
			normalized.SettaHome,
			normalized.SettaFilesRoot,
			normalized.SettaFilesLocation,
			normalized.RuntimeRoot,
		)
	}

	return s.launchLocalWorkspace(input, returnURL, normalized)
}

type normalizedLaunchRequest struct {
	WorkspaceRoot      string
	Profile            string
	SettaHome          string
	SettaFilesRoot     string
	SettaFilesLocation *string
	RuntimeRoot        string
	SSHTarget          string
}

func normalizeLaunchRequest(request Request) normalizedLaunchRequest {
	normalizedProfile := trimmedStringPointer(request.Profile)
	normalizedSettaFilesRoot := trimmedStringPointer(request.SettaFilesRoot)
	return normalizedLaunchRequest{
		WorkspaceRoot:  trimmedStringPointer(request.WorkspaceRoot),
		Profile:        normalizedProfile,
		SettaHome:      trimmedStringPointer(request.SettaHome),
		SettaFilesRoot: normalizedSettaFilesRoot,
		SettaFilesLocation: launcher.NormalizeSettaFilesLocationForLaunch(
			request.SettaFilesLocation,
			request.FieldProvided("settaFilesLocation"),
			normalizedSettaFilesRoot,
			normalizedProfile,
		),
		RuntimeRoot: trimmedStringPointer(request.RuntimeRoot),
		SSHTarget:   trimmedStringPointer(request.SSHTarget),
	}
}

func (r normalizedLaunchRequest) isRemote() bool {
	return r.SSHTarget != ""
}

func (s *LocalLaunchService) resolveLaunchRequest(input LocalLaunchInput) (Request, string, error) {
	returnURL := buildSafeLaunchReturnURL(input.RequestOrigin)
	if input.CurrentSession == nil {
		return Request{}, returnURL, &LaunchError{
			Code:      "Unauthorized",
			Message:   "Missing session.",
			ReturnURL: returnURL,
		}
	}
	launchIntentToken := trimmedStringPointer(input.Request.LaunchIntentToken)
	if launchIntentToken == "" {
		return Request{}, returnURL, &LaunchError{
			Code:      "BadRequest",
			Message:   "launchIntentToken is required.",
			ReturnURL: returnURL,
		}
	}
	if launchRequestHasInlineOverrides(input.Request) {
		return Request{}, returnURL, &LaunchError{
			Code:      "BadRequest",
			Message:   "launchIntentToken must be the only request field when provided.",
			ReturnURL: returnURL,
		}
	}

	launchRequest, storedReturnURL, err := s.intents.ConsumeIntent(input.CurrentSession, launchIntentToken)
	if err != nil {
		return Request{}, returnURL, mapIntentLaunchError(err, returnURL)
	}
	return launchRequest, storedReturnURL, nil
}

func mapIntentLaunchError(err error, returnURL string) error {
	var intentErr *IntentError
	if errors.As(err, &intentErr) {
		return &LaunchError{
			Code:      intentErr.Code,
			Message:   intentErr.Message,
			ReturnURL: returnURL,
		}
	}
	return internalLaunchError(returnURL)
}

func (s *LocalLaunchService) launchLocalWorkspace(
	input LocalLaunchInput,
	returnURL string,
	normalized normalizedLaunchRequest,
) (LocalLaunchResult, error) {
	launchResult, err := s.sessions.EnsureSession(s.buildLocalSessionInput(normalized))
	if err != nil {
		return LocalLaunchResult{}, mapLocalSessionLaunchError(err, returnURL)
	}

	bootstrapURLFragment, normalizedRequestOrigin, err := s.buildLocalBootstrapURLFragment(launchResult, input.RequestOrigin, returnURL)
	if err != nil {
		return LocalLaunchResult{}, err
	}
	if err := s.persistLocalLaunchTrust(normalizedRequestOrigin, bootstrapURLFragment, input.CurrentSession, launchResult, returnURL); err != nil {
		return LocalLaunchResult{}, err
	}

	_ = launcher.UpdateLauncherLastUsedWorkspaceIfInstalled(launchResult.Paths.SettaHome, launchResult.Paths.WorkspaceRoot)
	return buildLocalLaunchResult(launchResult, bootstrapURLFragment, returnURL), nil
}

func (s *LocalLaunchService) buildLocalSessionInput(normalized normalizedLaunchRequest) launcher.IDELaunchInput {
	settaHome := strings.TrimSpace(s.defaultSettaHome)
	profileLookupHome := ""
	if normalized.SettaHome != "" {
		settaHome = normalized.SettaHome
	} else if normalized.Profile != "" {
		profileLookupHome = s.defaultProfileLookupHome
	}
	return launcher.IDELaunchInput{
		WorkspaceRoot:      normalized.WorkspaceRoot,
		SettaHome:          settaHome,
		ProfileLookupHome:  profileLookupHome,
		Profile:            normalized.Profile,
		SettaFilesRoot:     normalized.SettaFilesRoot,
		SettaFilesLocation: normalized.SettaFilesLocation,
		RuntimeRoot:        normalized.RuntimeRoot,
	}
}

func mapLocalSessionLaunchError(err error, returnURL string) error {
	var sessionLaunchErr *launcher.SessionLaunchError
	if errors.As(err, &sessionLaunchErr) {
		return &LaunchError{
			Code:      sessionLaunchErr.Code,
			Message:   sessionLaunchErr.Message,
			ReturnURL: returnURL,
		}
	}
	return internalLaunchError(returnURL)
}

func (s *LocalLaunchService) buildLocalBootstrapURLFragment(
	launchResult launcher.IDELaunchResult,
	requestOrigin string,
	returnURL string,
) (string, string, error) {
	token, err := s.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, s.now().UTC())
	if err != nil {
		return "", "", internalLaunchError(returnURL)
	}
	bootstrapURLFragment, err := launcher.BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return "", "", internalLaunchError(returnURL)
	}

	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(requestOrigin)
	if normalizedRequestOrigin == "" {
		return bootstrapURLFragment, "", nil
	}
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
		return "", "", internalLaunchError(returnURL)
	}
	return bootstrapURLFragment, normalizedRequestOrigin, nil
}

func (s *LocalLaunchService) persistLocalLaunchTrust(
	requestOrigin string,
	bootstrapURLFragment string,
	currentSession *auth.CurrentSession,
	launchResult launcher.IDELaunchResult,
	returnURL string,
) error {
	if err := s.trustLaunchedWorkspaceOriginForLauncherSession(requestOrigin, bootstrapURLFragment, currentSession); err != nil {
		if launchResult.StartedNew {
			if rollbackErr := s.rollbackLocalSession(launchResult.Session, launchResult.Paths.RuntimeRoot); rollbackErr != nil {
				return &LaunchError{
					Code:      "LocalRollbackFailed",
					Message:   fmt.Sprintf("Launch trust persistence failed and rollback of local session %s also failed: %v", launchResult.Session.ID, rollbackErr),
					ReturnURL: returnURL,
				}
			}
		}
		return mapTrustedOriginPersistenceError(err, returnURL)
	}
	return nil
}

func buildLocalLaunchResult(
	launchResult launcher.IDELaunchResult,
	bootstrapURLFragment string,
	returnURL string,
) LocalLaunchResult {
	return LocalLaunchResult{
		BootstrapURLFragment:   bootstrapURLFragment,
		ReturnURL:              returnURL,
		WorkspaceRoot:          launchResult.Paths.WorkspaceRoot,
		SettaFilesLocation:     string(launchResult.Paths.ResolvedFilesLocation),
		UsesExplicitSettaFiles: launchResult.Paths.UsesExplicitSettaFiles,
		SettaFilesRoot:         launchResult.Paths.SettaFilesRoot,
		RuntimeRoot:            launchResult.Paths.RuntimeRoot,
		SettaHome:              launchResult.Paths.SettaHome,
		Profile:                optionalStringPointer(launchResult.Paths.ProfileName),
		RemoteCmdResolved:      nil,
		SessionID:              launchResult.Session.ID,
		StartedNew:             launchResult.StartedNew,
		Session:                launchResult.Session,
	}
}

func internalLaunchError(returnURL string) *LaunchError {
	return &LaunchError{
		Code:      "InternalError",
		Message:   "Internal Server Error",
		ReturnURL: returnURL,
	}
}

func mapTrustedOriginPersistenceError(err error, returnURL string) *LaunchError {
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
	return &LaunchError{
		Code:      code,
		Message:   message,
		ReturnURL: returnURL,
	}
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
		return launchRequestFieldSetHasInlineOverrides(request.fieldSet)
	}
	return launchRequestPointerHasInlineOverrides(request)
}

func launchRequestFieldSetHasInlineOverrides(fieldSet map[string]struct{}) bool {
	for fieldName := range fieldSet {
		if fieldName != launchIntentTokenField {
			return true
		}
	}
	return false
}

func launchRequestPointerHasInlineOverrides(request Request) bool {
	for _, provided := range []bool{
		request.WorkspaceRoot != nil,
		request.Profile != nil,
		request.SettaHome != nil,
		request.SettaFilesRoot != nil,
		request.SettaFilesLocation != nil,
		request.RuntimeRoot != nil,
		request.SSHTarget != nil,
		request.SSHArgs != nil,
		request.RemoteCmd != nil,
		request.LocalPort != nil,
	} {
		if provided {
			return true
		}
	}
	return false
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
