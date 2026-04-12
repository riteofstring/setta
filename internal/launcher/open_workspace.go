package launcher

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
)

const (
	launcherBootstrapPath            = "/__setta__/bootstrap"
	defaultOpenWorkspaceBootstrapTTL = 10 * time.Minute
)

type IDEWorkspaceSessionLauncher interface {
	EnsureSession(IDELaunchInput) (IDELaunchResult, error)
}

type BootstrapTokenMintFunc func(sessionID string, secret []byte, now time.Time) (string, error)

type OpenWorkspaceError struct {
	Code    string
	Message string
}

func (e *OpenWorkspaceError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type OpenWorkspaceInput struct {
	WorkspaceRoot              string
	SettaHome                  string
	Profile                    string
	SettaFilesRoot             string
	SettaFilesLocation         *string
	SettaFilesLocationProvided bool
	RuntimeRoot                string
	CreateIfMissing            bool
	RequestOrigin              string
	CurrentSession             *auth.CurrentSession
}

type OpenWorkspaceResult struct {
	BootstrapURLFragment string
	WorkspaceRoot        string
	SettaFilesLocation   string
	SettaFilesRoot       string
	RuntimeRoot          string
	SettaHome            string
	Profile              *string
	SessionID            string
	StartedNew           bool
}

type OpenWorkspaceServiceOptions struct {
	DefaultSettaHome                 string
	Home                             *HomeService
	Sessions                         IDEWorkspaceSessionLauncher
	TrustedOrigins                   *frontendorigins.Service
	Now                              func() time.Time
	MintBootstrapToken               BootstrapTokenMintFunc
	ResolveLauncherSessionAuthExpiry func(time.Time) (int64, error)
	RollbackLocalSession             func(auth.SessionMetadata, string) error
	UpdateLastUsedWorkspace          func(string, string) error
}

type OpenWorkspaceService struct {
	defaultSettaHome                 string
	home                             *HomeService
	sessions                         IDEWorkspaceSessionLauncher
	trustedOrigins                   *frontendorigins.Service
	now                              func() time.Time
	mintBootstrapToken               BootstrapTokenMintFunc
	resolveLauncherSessionAuthExpiry func(time.Time) (int64, error)
	rollbackLocalSession             func(auth.SessionMetadata, string) error
	updateLastUsedWorkspace          func(string, string) error
}

type openWorkspaceResolvedInput struct {
	workspaceRoot                string
	resolvedSettaHome            string
	normalizedProfile            string
	normalizedSettaFilesRoot     string
	normalizedRuntimeRoot        string
	normalizedRequestOrigin      string
	normalizedSettaFilesLocation *string
	currentSession               *auth.CurrentSession
}

type openWorkspaceLaunch struct {
	result               IDELaunchResult
	bootstrapURLFragment string
}

func NewOpenWorkspaceService(options OpenWorkspaceServiceOptions) (*OpenWorkspaceService, error) {
	defaultSettaHome, err := resolvePathLoose(options.DefaultSettaHome)
	if err != nil {
		return nil, fmt.Errorf("resolve default setta home: %w", err)
	}
	if options.Home == nil {
		return nil, fmt.Errorf("launcher home service is required")
	}
	if options.Sessions == nil {
		return nil, fmt.Errorf("launcher IDE session launcher is required")
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	mintBootstrapToken := options.MintBootstrapToken
	if mintBootstrapToken == nil {
		tokenManager := auth.NewBootstrapTokenManager(defaultOpenWorkspaceBootstrapTTL, auth.NewNonceTracker())
		mintBootstrapToken = tokenManager.Mint
	}
	if options.TrustedOrigins != nil && options.ResolveLauncherSessionAuthExpiry == nil {
		return nil, fmt.Errorf("launcher session auth expiry resolver is required when trusted origins are enabled")
	}
	rollbackLocalSession := options.RollbackLocalSession
	if rollbackLocalSession == nil {
		rollbackLocalSession = rollbackStartedLocalSession
	}
	updateLastUsedWorkspace := options.UpdateLastUsedWorkspace
	if updateLastUsedWorkspace == nil {
		updateLastUsedWorkspace = UpdateLauncherLastUsedWorkspaceIfInstalled
	}
	return &OpenWorkspaceService{
		defaultSettaHome:                 defaultSettaHome,
		home:                             options.Home,
		sessions:                         options.Sessions,
		trustedOrigins:                   options.TrustedOrigins,
		now:                              now,
		mintBootstrapToken:               mintBootstrapToken,
		resolveLauncherSessionAuthExpiry: options.ResolveLauncherSessionAuthExpiry,
		rollbackLocalSession:             rollbackLocalSession,
		updateLastUsedWorkspace:          updateLastUsedWorkspace,
	}, nil
}

func (s *OpenWorkspaceService) OpenWorkspace(input OpenWorkspaceInput) (OpenWorkspaceResult, error) {
	if s == nil {
		return OpenWorkspaceResult{}, newOpenWorkspaceError("InternalError", "Internal Server Error")
	}

	resolvedInput, err := s.resolveOpenWorkspaceInput(input)
	if err != nil {
		return OpenWorkspaceResult{}, err
	}

	launch, err := s.launchWorkspace(resolvedInput)
	if err != nil {
		return OpenWorkspaceResult{}, err
	}

	if err := s.persistLaunchedWorkspace(resolvedInput, launch); err != nil {
		return OpenWorkspaceResult{}, err
	}

	return openWorkspaceResultFromLaunch(launch), nil
}

func (s *OpenWorkspaceService) resolveOpenWorkspaceInput(input OpenWorkspaceInput) (openWorkspaceResolvedInput, error) {
	resolvedSettaHome, err := ResolveScopedSettaHome(s.defaultSettaHome, strings.TrimSpace(input.SettaHome))
	if err != nil {
		return openWorkspaceResolvedInput{}, newOpenWorkspaceError(
			"BadRequest",
			fmt.Sprintf("Failed to resolve Setta home: %v", err),
		)
	}
	workspaceRoot, err := s.resolveWorkspaceRoot(input.WorkspaceRoot, input.CreateIfMissing)
	if err != nil {
		return openWorkspaceResolvedInput{}, err
	}
	normalizedProfile := strings.TrimSpace(input.Profile)
	normalizedSettaFilesRoot := strings.TrimSpace(input.SettaFilesRoot)
	return openWorkspaceResolvedInput{
		workspaceRoot:            workspaceRoot,
		resolvedSettaHome:        resolvedSettaHome,
		normalizedProfile:        normalizedProfile,
		normalizedSettaFilesRoot: normalizedSettaFilesRoot,
		normalizedRuntimeRoot:    strings.TrimSpace(input.RuntimeRoot),
		normalizedRequestOrigin:  frontendorigins.NormalizeOrigin(input.RequestOrigin),
		normalizedSettaFilesLocation: NormalizeSettaFilesLocationForLaunch(
			input.SettaFilesLocation,
			input.SettaFilesLocationProvided,
			normalizedSettaFilesRoot,
			normalizedProfile,
		),
		currentSession: input.CurrentSession,
	}, nil
}

func (s *OpenWorkspaceService) resolveWorkspaceRoot(rawWorkspaceRoot string, createIfMissing bool) (string, error) {
	if createIfMissing && containsDotSegments(rawWorkspaceRoot) {
		return "", newOpenWorkspaceError(
			"BadRequest",
			"Workspace path must not contain '.' or '..' segments when creating a new project.",
		)
	}
	allowedRoots, err := s.home.AllowedRoots()
	if err != nil {
		return "", newOpenWorkspaceError("InternalError", "Internal Server Error")
	}
	workspaceRoot, err := resolvePathWithinAllowedRoots(rawWorkspaceRoot, allowedRoots, true)
	if err != nil {
		return "", openWorkspaceErrorFromHome(err)
	}
	if err := ensureWorkspaceRootIsDirectory(workspaceRoot, createIfMissing); err != nil {
		return "", err
	}
	return workspaceRoot, nil
}

func ensureWorkspaceRootIsDirectory(workspaceRoot string, createIfMissing bool) error {
	info, err := loadWorkspaceRootInfo(workspaceRoot, createIfMissing)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return nil
	}
	return newOpenWorkspaceError(
		"BadRequest",
		fmt.Sprintf("Workspace root is not a directory: %s", workspaceRoot),
	)
}

func loadWorkspaceRootInfo(workspaceRoot string, createIfMissing bool) (os.FileInfo, error) {
	info, statErr := os.Stat(workspaceRoot)
	switch {
	case statErr == nil:
		return info, nil
	case errors.Is(statErr, os.ErrNotExist):
		if !createIfMissing {
			return nil, newOpenWorkspaceError(
				"PathNotFound",
				fmt.Sprintf("Workspace root does not exist: %s", workspaceRoot),
			)
		}
		return createWorkspaceRoot(workspaceRoot)
	default:
		return nil, newOpenWorkspaceError(
			"BadRequest",
			fmt.Sprintf("Failed to resolve workspace root %s: %v", workspaceRoot, statErr),
		)
	}
}

func createWorkspaceRoot(workspaceRoot string) (os.FileInfo, error) {
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		return nil, newOpenWorkspaceError(
			"CreateWorkspaceFailed",
			fmt.Sprintf("Failed to create workspace root %s: %v", workspaceRoot, err),
		)
	}
	info, err := os.Stat(workspaceRoot)
	if err != nil {
		return nil, newOpenWorkspaceError(
			"CreateWorkspaceFailed",
			fmt.Sprintf("Failed to stat workspace root %s after creation: %v", workspaceRoot, err),
		)
	}
	return info, nil
}

func (s *OpenWorkspaceService) launchWorkspace(input openWorkspaceResolvedInput) (openWorkspaceLaunch, error) {
	launchResult, err := s.sessions.EnsureSession(IDELaunchInput{
		WorkspaceRoot:      input.workspaceRoot,
		SettaHome:          input.resolvedSettaHome,
		Profile:            input.normalizedProfile,
		SettaFilesRoot:     input.normalizedSettaFilesRoot,
		SettaFilesLocation: input.normalizedSettaFilesLocation,
		RuntimeRoot:        input.normalizedRuntimeRoot,
	})
	if err != nil {
		return openWorkspaceLaunch{}, openWorkspaceErrorFromLaunch(err)
	}
	bootstrapURLFragment, err := s.buildBootstrapURLFragment(launchResult)
	if err != nil {
		return openWorkspaceLaunch{}, err
	}
	bootstrapURLFragment, err = appendLauncherOriginHandoff(
		bootstrapURLFragment,
		input.normalizedRequestOrigin,
		launchResult,
	)
	if err != nil {
		return openWorkspaceLaunch{}, err
	}
	return openWorkspaceLaunch{
		result:               launchResult,
		bootstrapURLFragment: bootstrapURLFragment,
	}, nil
}

func (s *OpenWorkspaceService) buildBootstrapURLFragment(launchResult IDELaunchResult) (string, error) {
	token, err := s.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, s.now().UTC())
	if err != nil {
		return "", newOpenWorkspaceError("InternalError", "Internal Server Error")
	}
	bootstrapURLFragment, err := BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return "", newOpenWorkspaceError("InternalError", "Internal Server Error")
	}
	return bootstrapURLFragment, nil
}

func appendLauncherOriginHandoff(
	bootstrapURLFragment string,
	normalizedRequestOrigin string,
	launchResult IDELaunchResult,
) (string, error) {
	if normalizedRequestOrigin == "" {
		return bootstrapURLFragment, nil
	}
	proof := frontendorigins.MintLauncherOriginHandoffProof(
		launchResult.Session.ID,
		normalizedRequestOrigin,
		launchResult.Secret,
	)
	bootstrapURLFragment, err := frontendorigins.AppendLauncherOriginHandoffToBootstrapURL(
		bootstrapURLFragment,
		normalizedRequestOrigin,
		proof,
	)
	if err != nil {
		return "", newOpenWorkspaceError("InternalError", "Internal Server Error")
	}
	return bootstrapURLFragment, nil
}

func (s *OpenWorkspaceService) persistLaunchedWorkspace(
	input openWorkspaceResolvedInput,
	launch openWorkspaceLaunch,
) error {
	if err := s.trustLaunchedWorkspaceOriginForLauncherSession(
		input.normalizedRequestOrigin,
		launch.bootstrapURLFragment,
		input.currentSession,
	); err != nil {
		return s.handleLaunchedWorkspaceTrustFailure(launch.result, err)
	}
	_ = s.updateLastUsedWorkspace(launch.result.Paths.SettaHome, launch.result.Paths.WorkspaceRoot)
	_, _ = s.home.AddRecentWorkspace(launch.result.Paths.SettaHome, launch.result.Paths.WorkspaceRoot, nil)
	return nil
}

func (s *OpenWorkspaceService) handleLaunchedWorkspaceTrustFailure(launchResult IDELaunchResult, err error) error {
	if launchResult.StartedNew {
		if rollbackErr := s.rollbackLocalSession(launchResult.Session, launchResult.Paths.RuntimeRoot); rollbackErr != nil {
			return newOpenWorkspaceError(
				"LocalRollbackFailed",
				fmt.Sprintf(
					"Launch trust persistence failed and rollback of local session %s also failed: %v",
					launchResult.Session.ID,
					rollbackErr,
				),
			)
		}
	}
	return openWorkspaceTrustError(err)
}

func openWorkspaceTrustError(err error) error {
	switch {
	case isTrustedOriginUnavailableError(err):
		return newOpenWorkspaceError("TrustedFrontendOriginStoreUnavailable", err.Error())
	case isTrustedOriginStateError(err):
		return newOpenWorkspaceError("TrustedFrontendOriginStoreInvalid", err.Error())
	default:
		return newOpenWorkspaceError("InternalError", "Internal Server Error")
	}
}

func openWorkspaceResultFromLaunch(launch openWorkspaceLaunch) OpenWorkspaceResult {
	return OpenWorkspaceResult{
		BootstrapURLFragment: launch.bootstrapURLFragment,
		WorkspaceRoot:        launch.result.Paths.WorkspaceRoot,
		SettaFilesLocation:   string(launch.result.Paths.ResolvedFilesLocation),
		SettaFilesRoot:       launch.result.Paths.SettaFilesRoot,
		RuntimeRoot:          launch.result.Paths.RuntimeRoot,
		SettaHome:            launch.result.Paths.SettaHome,
		Profile:              stringPointer(launch.result.Paths.ProfileName),
		SessionID:            launch.result.Session.ID,
		StartedNew:           launch.result.StartedNew,
	}
}

func newOpenWorkspaceError(code string, message string) *OpenWorkspaceError {
	return &OpenWorkspaceError{
		Code:    code,
		Message: message,
	}
}

func NormalizeSettaFilesLocationForLaunch(settaFilesLocation *string, provided bool, settaFilesRoot string, profile string) *string {
	if settaFilesLocation != nil {
		trimmed := strings.TrimSpace(*settaFilesLocation)
		if trimmed == "" {
			return nil
		}
		if strings.TrimSpace(settaFilesRoot) != "" && trimmed == string(config.FilesLocationAuto) {
			return nil
		}
		return &trimmed
	}
	if !provided {
		if strings.TrimSpace(settaFilesRoot) != "" || strings.TrimSpace(profile) != "" {
			return nil
		}
		auto := string(config.FilesLocationAuto)
		return &auto
	}
	if strings.TrimSpace(settaFilesRoot) != "" || strings.TrimSpace(profile) != "" {
		return nil
	}
	auto := string(config.FilesLocationAuto)
	return &auto
}

func containsDotSegments(rawPath string) bool {
	normalized := strings.ReplaceAll(rawPath, "\\", "/")
	for _, segment := range strings.Split(normalized, "/") {
		if segment == "." || segment == ".." {
			return true
		}
	}
	return false
}

func openWorkspaceErrorFromHome(err error) error {
	var homeErr *HomeError
	if errors.As(err, &homeErr) {
		return &OpenWorkspaceError{
			Code:    homeErr.Code,
			Message: homeErr.Message,
		}
	}
	return &OpenWorkspaceError{
		Code:    "InternalError",
		Message: "Internal Server Error",
	}
}

func openWorkspaceErrorFromLaunch(err error) error {
	var launchErr *SessionLaunchError
	if errors.As(err, &launchErr) {
		return &OpenWorkspaceError{
			Code:    launchErr.Code,
			Message: launchErr.Message,
		}
	}
	var openErr *OpenWorkspaceError
	if errors.As(err, &openErr) {
		return openErr
	}
	return &OpenWorkspaceError{
		Code:    "InternalError",
		Message: "Internal Server Error",
	}
}

func (s *OpenWorkspaceService) trustLaunchedWorkspaceOriginForLauncherSession(
	requestOrigin string,
	bootstrapURLFragment string,
	currentSession *auth.CurrentSession,
) error {
	if s == nil || s.trustedOrigins == nil {
		return nil
	}
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

func BuildBootstrapURLFragment(host string, port int, token string) (string, error) {
	trimmedHost := strings.TrimSpace(host)
	trimmedToken := strings.TrimSpace(token)
	if trimmedHost == "" {
		return "", fmt.Errorf("bootstrap host is required")
	}
	if port <= 0 {
		return "", fmt.Errorf("bootstrap port must be positive")
	}
	if trimmedToken == "" {
		return "", fmt.Errorf("bootstrap token is required")
	}

	bootstrapURL := url.URL{
		Scheme:   "http",
		Host:     net.JoinHostPort(trimmedHost, strconv.Itoa(port)),
		Path:     launcherBootstrapPath,
		Fragment: url.Values{"token": []string{trimmedToken}}.Encode(),
	}
	return bootstrapURL.String(), nil
}
