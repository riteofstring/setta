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
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "InternalError",
			Message: "Internal Server Error",
		}
	}

	resolvedSettaHome, err := ResolveScopedSettaHome(s.defaultSettaHome, strings.TrimSpace(input.SettaHome))
	if err != nil {
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("Failed to resolve Setta home: %v", err),
		}
	}
	if input.CreateIfMissing && containsDotSegments(input.WorkspaceRoot) {
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "BadRequest",
			Message: "Workspace path must not contain '.' or '..' segments when creating a new project.",
		}
	}

	allowedRoots, err := s.home.AllowedRoots()
	if err != nil {
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "InternalError",
			Message: "Internal Server Error",
		}
	}

	workspaceRoot, err := resolvePathWithinAllowedRoots(input.WorkspaceRoot, allowedRoots, true)
	if err != nil {
		return OpenWorkspaceResult{}, openWorkspaceErrorFromHome(err)
	}
	info, statErr := os.Stat(workspaceRoot)
	switch {
	case statErr == nil:
	case errors.Is(statErr, os.ErrNotExist):
		if !input.CreateIfMissing {
			return OpenWorkspaceResult{}, &OpenWorkspaceError{
				Code:    "PathNotFound",
				Message: fmt.Sprintf("Workspace root does not exist: %s", workspaceRoot),
			}
		}
		if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
			return OpenWorkspaceResult{}, &OpenWorkspaceError{
				Code:    "CreateWorkspaceFailed",
				Message: fmt.Sprintf("Failed to create workspace root %s: %v", workspaceRoot, err),
			}
		}
		info, statErr = os.Stat(workspaceRoot)
		if statErr != nil {
			return OpenWorkspaceResult{}, &OpenWorkspaceError{
				Code:    "CreateWorkspaceFailed",
				Message: fmt.Sprintf("Failed to stat workspace root %s after creation: %v", workspaceRoot, statErr),
			}
		}
	default:
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("Failed to resolve workspace root %s: %v", workspaceRoot, statErr),
		}
	}

	if !info.IsDir() {
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "BadRequest",
			Message: fmt.Sprintf("Workspace root is not a directory: %s", workspaceRoot),
		}
	}

	normalizedProfile := strings.TrimSpace(input.Profile)
	normalizedSettaFilesRoot := strings.TrimSpace(input.SettaFilesRoot)
	normalizedRuntimeRoot := strings.TrimSpace(input.RuntimeRoot)
	normalizedSettaFilesLocation := NormalizeSettaFilesLocationForLaunch(
		input.SettaFilesLocation,
		input.SettaFilesLocationProvided,
		normalizedSettaFilesRoot,
		normalizedProfile,
	)

	launchResult, err := s.sessions.EnsureSession(IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          resolvedSettaHome,
		Profile:            normalizedProfile,
		SettaFilesRoot:     normalizedSettaFilesRoot,
		SettaFilesLocation: normalizedSettaFilesLocation,
		RuntimeRoot:        normalizedRuntimeRoot,
	})
	if err != nil {
		return OpenWorkspaceResult{}, openWorkspaceErrorFromLaunch(err)
	}

	token, err := s.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, s.now().UTC())
	if err != nil {
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "InternalError",
			Message: "Internal Server Error",
		}
	}
	bootstrapURLFragment, err := BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    "InternalError",
			Message: "Internal Server Error",
		}
	}

	normalizedRequestOrigin := frontendorigins.NormalizeOrigin(input.RequestOrigin)
	if err := s.trustLaunchedWorkspaceOriginForLauncherSession(normalizedRequestOrigin, bootstrapURLFragment, input.CurrentSession); err != nil {
		if launchResult.StartedNew {
			if rollbackErr := s.rollbackLocalSession(launchResult.Session, launchResult.Paths.RuntimeRoot); rollbackErr != nil {
				return OpenWorkspaceResult{}, &OpenWorkspaceError{
					Code: "LocalRollbackFailed",
					Message: fmt.Sprintf(
						"Launch trust persistence failed and rollback of local session %s also failed: %v",
						launchResult.Session.ID,
						rollbackErr,
					),
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
		return OpenWorkspaceResult{}, &OpenWorkspaceError{
			Code:    code,
			Message: message,
		}
	}

	_ = s.updateLastUsedWorkspace(launchResult.Paths.SettaHome, launchResult.Paths.WorkspaceRoot)
	_, _ = s.home.AddRecentWorkspace(launchResult.Paths.SettaHome, launchResult.Paths.WorkspaceRoot, nil)

	return OpenWorkspaceResult{
		BootstrapURLFragment: bootstrapURLFragment,
		WorkspaceRoot:        launchResult.Paths.WorkspaceRoot,
		SettaFilesLocation:   string(launchResult.Paths.ResolvedFilesLocation),
		SettaFilesRoot:       launchResult.Paths.SettaFilesRoot,
		RuntimeRoot:          launchResult.Paths.RuntimeRoot,
		SettaHome:            launchResult.Paths.SettaHome,
		Profile:              stringPointer(launchResult.Paths.ProfileName),
		SessionID:            launchResult.Session.ID,
		StartedNew:           launchResult.StartedNew,
	}, nil
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
