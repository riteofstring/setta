package settacmd

import (
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"setta/internal/config"
	"setta/internal/launcher"
)

type launcherErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type launcherStatusPayload struct {
	Ok                       bool                  `json:"ok"`
	Installed                bool                  `json:"installed"`
	SettaHome                string                `json:"settaHome,omitempty"`
	LauncherDir              string                `json:"launcherDir,omitempty"`
	MetadataPath             string                `json:"metadataPath,omitempty"`
	TargetCommand            []string              `json:"targetCommand,omitempty"`
	TargetValid              *bool                 `json:"targetValid,omitempty"`
	TargetError              *string               `json:"targetError,omitempty"`
	Channel                  *string               `json:"channel,omitempty"`
	SettaVersion             *string               `json:"settaVersion,omitempty"`
	OpenMode                 *string               `json:"openMode,omitempty"`
	WorkspaceBehavior        *string               `json:"workspaceBehavior,omitempty"`
	LastUsedWorkspace        *string               `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions          map[string]string     `json:"artifactOptions"`
	ManagedArtifacts         map[string]string     `json:"managedArtifacts"`
	ExistingManagedArtifacts []string              `json:"existingManagedArtifacts"`
	MissingManagedArtifacts  []string              `json:"missingManagedArtifacts"`
	UpdateCapability         string                `json:"updateCapability,omitempty"`
	UpdateGuidance           *string               `json:"updateGuidance,omitempty"`
	Error                    *launcherErrorPayload `json:"error,omitempty"`
}

type launcherRemovePayload struct {
	Ok              bool                  `json:"ok"`
	MetadataRemoved bool                  `json:"metadataRemoved"`
	RemovedPaths    []string              `json:"removedPaths"`
	MissingPaths    []string              `json:"missingPaths"`
	Error           *launcherErrorPayload `json:"error,omitempty"`
}

type launcherRepairPayload struct {
	Ok     bool                   `json:"ok"`
	Status *launcherStatusPayload `json:"status,omitempty"`
	Error  *launcherErrorPayload  `json:"error,omitempty"`
}

type launcherUpdatePayload struct {
	Ok          bool                   `json:"ok"`
	PackageSpec string                 `json:"packageSpec,omitempty"`
	FromVersion *string                `json:"fromVersion,omitempty"`
	ToVersion   *string                `json:"toVersion,omitempty"`
	Status      *launcherStatusPayload `json:"status,omitempty"`
	Error       *launcherErrorPayload  `json:"error,omitempty"`
}

type launcherRootFlags struct {
	jsonOutput bool
	workspace  string
	openMode   string
	noOpen     bool
	timeout    float64
}

type launcherCommandFailure struct {
	code     string
	message  string
	exitCode int
}

func (e *launcherCommandFailure) emit(stdout io.Writer, stderr io.Writer, jsonOutput bool) error {
	if e == nil {
		return nil
	}
	return emitLauncherCommandError(stdout, stderr, jsonOutput, e.code, e.message, e.exitCode)
}

type launcherRootRequest struct {
	flags              launcherRootFlags
	installedMetadata  *launcher.LauncherInstallMetadata
	requestedOpenMode  launcher.LauncherOpenMode
	shouldOpenSwitcher bool
	launchTimeout      time.Duration
	sessionLaunchInput launcher.IDELaunchInput
}

type launcherRootResult struct {
	launchResult launcher.IDELaunchResult
	bootstrapURL string
}

type launcherRunPayload struct {
	Ok                    bool                  `json:"ok"`
	BootstrapURL          string                `json:"bootstrapUrl,omitempty"`
	WorkspaceRoot         string                `json:"workspaceRoot,omitempty"`
	SessionID             string                `json:"sessionId,omitempty"`
	StartedNew            bool                  `json:"startedNew"`
	ReusedSession         bool                  `json:"reusedSession"`
	SessionServerMode     string                `json:"sessionServerMode,omitempty"`
	OpenMode              string                `json:"openMode,omitempty"`
	WorkspaceBehavior     string                `json:"workspaceBehavior,omitempty"`
	OpenWorkspaceSwitcher bool                  `json:"openWorkspaceSwitcher"`
	SettaHome             string                `json:"settaHome,omitempty"`
	Profile               *string               `json:"profile,omitempty"`
	Error                 *launcherErrorPayload `json:"error,omitempty"`
}

type launcherSetupFlags struct {
	jsonOutput           bool
	channel              string
	installSource        string
	openMode             string
	workspaceBehavior    string
	artifactOptionSpecs  stringSliceFlag
	clearArtifactOptions bool
	installArtifacts     optionalBoolChoice
}

type stringSliceFlag struct {
	values []string
}

func (f *stringSliceFlag) String() string {
	if f == nil {
		return ""
	}
	return strings.Join(f.values, ",")
}

func (f *stringSliceFlag) Set(value string) error {
	f.values = append(f.values, value)
	return nil
}

type optionalBoolChoice struct {
	value *bool
}

type boolChoiceFlag struct {
	target *optionalBoolChoice
	value  bool
}

type launcherRootDependencies struct {
	loadBaseConfig           func(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error)
	loadMetadata             func(string) (*launcher.LauncherInstallMetadata, error)
	resolveUserHome          func() (string, error)
	validateMetadataTarget   func(launcher.LauncherInstallMetadata) string
	resolveCurrentExecutable func() (string, error)
	resolveServerExecutable  func(string, func(string) (string, bool)) (string, error)
	newSessionLauncher       func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error)
	now                      func() time.Time
	mintBootstrapToken       func(string, []byte, time.Time) (string, error)
	updateLastUsedWorkspace  func(string, string) error
	openURLWithMode          func(string, launcher.LauncherOpenMode, io.Writer) launcher.LauncherOpenMode
}

func (f *boolChoiceFlag) String() string {
	if f == nil || f.target == nil || f.target.value == nil {
		return ""
	}
	return strconv.FormatBool(*f.target.value)
}

func (f *boolChoiceFlag) Set(string) error {
	if f.target == nil {
		return fmt.Errorf("bool flag target is required")
	}
	if f.target.value != nil && *f.target.value != f.value {
		return fmt.Errorf("use either --install-artifacts or --no-install-artifacts, not both")
	}
	resolved := f.value
	f.target.value = &resolved
	return nil
}

func (f *boolChoiceFlag) IsBoolFlag() bool {
	return true
}
