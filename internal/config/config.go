package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"setta/internal/deployments"
)

const (
	WorkspaceRootEnv     = "SETTA_WORKSPACE_ROOT"
	RuntimeRootEnv       = "SETTA_RUNTIME_ROOT"
	FilesRootEnv         = "SETTA_FILES_ROOT"
	ProfileEnv           = "SETTA_PROFILE"
	ProfileLookupHomeEnv = "SETTA_PROFILE_LOOKUP_HOME"
	serverModeEnv        = "SETTA_SERVER_MODE"
	SettaHomeEnv         = "SETTA_HOME"
	FilesLocationEnv     = "SETTA_FILES_LOCATION"
	hostEnv              = "SETTA_HOST"
	portEnv              = "SETTA_PORT"
	logLevelEnv          = "SETTA_LOG_LEVEL"
)

const (
	DefaultServerHost      = "127.0.0.1"
	DefaultServerPort      = 8000
	DefaultDevFrontendPort = 3000
)

var (
	allowedSettaHomeNames        = map[string]struct{}{".setta": {}, ".setta-development": {}}
	allowedSettaFilesRootSegment = map[string]struct{}{"setta_files": {}, "setta_files_dev": {}}
)

func AllowedSettaHomeNames() []string {
	names := make([]string, 0, len(allowedSettaHomeNames))
	for name := range allowedSettaHomeNames {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func AllowedSettaFilesRootSegments() []string {
	segments := make([]string, 0, len(allowedSettaFilesRootSegment))
	for segment := range allowedSettaFilesRootSegment {
		segments = append(segments, segment)
	}
	sort.Strings(segments)
	return segments
}

type Mode string

const (
	ModeIDE      Mode = "ide"
	ModeShare    Mode = "share"
	ModeApp      Mode = "app"
	ModeLauncher Mode = "launcher"
)

type FilesLocation string

const (
	FilesLocationAuto   FilesLocation = "auto"
	FilesLocationLocal  FilesLocation = "local"
	FilesLocationGlobal FilesLocation = "global"
)

type ResolvedFilesLocation string

const (
	ResolvedFilesLocationLocal  ResolvedFilesLocation = "local"
	ResolvedFilesLocationGlobal ResolvedFilesLocation = "global"
)

func RequestedFilesLocations() []FilesLocation {
	return []FilesLocation{
		FilesLocationAuto,
		FilesLocationLocal,
		FilesLocationGlobal,
	}
}

func ResolvedFilesLocations() []ResolvedFilesLocation {
	return []ResolvedFilesLocation{
		ResolvedFilesLocationLocal,
		ResolvedFilesLocationGlobal,
	}
}

type AutoMode string

const (
	AutoModeCreateLocal       AutoMode = "create_local"
	AutoModeUseGlobalIfExists AutoMode = "use_global_if_present"
	AutoModeCreateGlobal      AutoMode = "create_global"
)

type Config struct {
	Server Server
	Paths  Paths
	User   UserConfig
}

type Server struct {
	Host     string
	Port     int
	Mode     Mode
	LogLevel slog.Level
}

type Paths struct {
	WorkspaceRoot          string
	DeploymentRoot         string
	SettaHome              string
	ProfileLookupHome      string
	ProfileName            string
	SettaFilesRoot         string
	ResolvedFilesLocation  ResolvedFilesLocation
	UsesExplicitSettaFiles bool
	RuntimeRoot            string
	AuthCookieName         string
}

func (p Paths) ActiveSettaFilesLocation() string {
	if p.UsesExplicitSettaFiles {
		return "custom"
	}
	return string(p.ResolvedFilesLocation)
}

type UserConfig struct {
	GlobalSettaFilesBase string
	AutoMode             AutoMode
}

type ConfigError struct {
	Code    string
	Message string
	cause   error
}

func (e *ConfigError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *ConfigError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func newConfigError(code string, message string, cause error) *ConfigError {
	return &ConfigError{
		Code:    code,
		Message: message,
		cause:   cause,
	}
}

func defaultUserConfig(settaHome string) UserConfig {
	return UserConfig{
		GlobalSettaFilesBase: filepath.Join(settaHome, "setta_files"),
		AutoMode:             AutoModeCreateLocal,
	}
}

type CLIOptions struct {
	WorkspaceRoot      string
	DeploymentRoot     string
	SettaHome          string
	ProfileLookupHome  string
	SettaFilesRoot     string
	SettaFilesLocation string
	RuntimeRoot        string
	Profile            string
	Host               string
	Port               string
	Mode               string
	LogLevel           string
}

type LoadOptions struct {
	CWD       string
	EnvLookup func(string) (string, bool)
	CLI       CLIOptions
}

type profileConfig struct {
	Name               string
	WorkspaceRoot      string
	SettaHome          string
	SettaFilesRoot     string
	RuntimeRoot        string
	SettaFilesLocation FilesLocation
	AuthCookieName     string
}

type rawProfileConfig struct {
	Name               string `json:"name"`
	WorkspaceRoot      string `json:"workspaceRoot"`
	SettaHome          string `json:"settaHome"`
	SettaFilesRoot     string `json:"settaFilesRoot"`
	RuntimeRoot        string `json:"runtimeRoot"`
	SettaFilesLocation string `json:"settaFilesLocation"`
	AuthCookieName     string `json:"authCookieName"`
}

type resolvedProfileContext struct {
	profile           profileConfig
	profileName       string
	profileLookupHome string
	settaHome         string
}

type resolvedLoadPaths struct {
	workspaceRoot         string
	deploymentRoot        string
	settaFilesRoot        string
	resolvedFilesLocation ResolvedFilesLocation
	usesExplicitSettaFile bool
	runtimeRoot           string
	userConfig            UserConfig
}

func Load(opts LoadOptions) (Config, error) {
	envLookup := opts.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	cwd, err := filepath.Abs(opts.CWD)
	if err != nil {
		return Config{}, fmt.Errorf("resolve cwd: %w", err)
	}

	server, err := loadServer(opts.CLI, envLookup)
	if err != nil {
		return Config{}, err
	}

	profileContext, err := resolveProfileContext(opts.CLI, envLookup)
	if err != nil {
		return Config{}, err
	}
	if err := validateLoadSettaHomes(profileContext); err != nil {
		return Config{}, err
	}

	paths, err := resolveLoadPaths(server.Mode, cwd, opts.CLI, profileContext, envLookup)
	if err != nil {
		return Config{}, err
	}

	return Config{
		Server: server,
		Paths: Paths{
			WorkspaceRoot:          paths.workspaceRoot,
			DeploymentRoot:         paths.deploymentRoot,
			SettaHome:              profileContext.settaHome,
			ProfileLookupHome:      profileContext.profileLookupHome,
			ProfileName:            profileContext.profileName,
			SettaFilesRoot:         paths.settaFilesRoot,
			ResolvedFilesLocation:  paths.resolvedFilesLocation,
			UsesExplicitSettaFiles: paths.usesExplicitSettaFile,
			RuntimeRoot:            paths.runtimeRoot,
			AuthCookieName:         profileContext.profile.AuthCookieName,
		},
		User: paths.userConfig,
	}, nil
}

func resolveProfileContext(cli CLIOptions, envLookup func(string) (string, bool)) (resolvedProfileContext, error) {
	profileName := firstNonEmpty(trimmed(cli.Profile), lookupEnvTrimmed(envLookup, ProfileEnv))
	if profileName == "" {
		settaHome, err := resolveSettaHome(trimmed(cli.SettaHome), "", envLookup)
		if err != nil {
			return resolvedProfileContext{}, err
		}
		return resolvedProfileContext{
			profileName:       profileName,
			profileLookupHome: settaHome,
			settaHome:         settaHome,
		}, nil
	}

	profileLookupHome, err := resolveProfileLookupHome(
		trimmed(cli.ProfileLookupHome),
		trimmed(cli.SettaHome),
		envLookup,
	)
	if err != nil {
		return resolvedProfileContext{}, err
	}
	profile, err := loadProfile(profileLookupHome, profileName)
	if err != nil {
		return resolvedProfileContext{}, err
	}
	settaHome, err := resolveSettaHome(trimmed(cli.SettaHome), profile.SettaHome, envLookup)
	if err != nil {
		return resolvedProfileContext{}, err
	}
	return resolvedProfileContext{
		profile:           profile,
		profileName:       profileName,
		profileLookupHome: profileLookupHome,
		settaHome:         settaHome,
	}, nil
}

func validateLoadSettaHomes(profileContext resolvedProfileContext) error {
	if err := validateSettaHomeName(profileContext.profileLookupHome, "Setta profile lookup home"); err != nil {
		return err
	}
	return validateSettaHomeName(profileContext.settaHome, "Setta home")
}

func resolveLoadPaths(
	mode Mode,
	cwd string,
	cli CLIOptions,
	profileContext resolvedProfileContext,
	envLookup func(string) (string, bool),
) (resolvedLoadPaths, error) {
	workspaceRoot, err := resolveWorkspaceRoot(
		mode,
		trimmed(cli.WorkspaceRoot),
		profileContext.profile.WorkspaceRoot,
		cwd,
		envLookup,
	)
	if err != nil {
		return resolvedLoadPaths{}, err
	}
	if err := validateWorkspaceRoot(workspaceRoot); err != nil {
		return resolvedLoadPaths{}, err
	}

	userConfig, err := loadUserConfig(profileContext.settaHome)
	if err != nil {
		return resolvedLoadPaths{}, err
	}
	settaFilesRoot, resolvedLocation, usesExplicitFilesRoot, err := resolveSettaFilesRoot(
		mode,
		workspaceRoot,
		profileContext.settaHome,
		userConfig,
		cli,
		profileContext.profile,
		envLookup,
	)
	if err != nil {
		return resolvedLoadPaths{}, err
	}
	if err := validateSettaFilesRoot(settaFilesRoot); err != nil {
		return resolvedLoadPaths{}, err
	}

	deploymentRoot, err := resolveDeploymentRoot(mode, trimmed(cli.DeploymentRoot))
	if err != nil {
		return resolvedLoadPaths{}, err
	}
	runtimeRoot, err := resolveRuntimeRoot(
		mode,
		settaFilesRoot,
		deploymentRoot,
		trimmed(cli.RuntimeRoot),
		profileContext.profile.RuntimeRoot,
		envLookup,
	)
	if err != nil {
		return resolvedLoadPaths{}, err
	}
	if err := validateRuntimeRoot(runtimeRoot, workspaceRoot); err != nil {
		return resolvedLoadPaths{}, err
	}

	return resolvedLoadPaths{
		workspaceRoot:         workspaceRoot,
		deploymentRoot:        deploymentRoot,
		settaFilesRoot:        settaFilesRoot,
		resolvedFilesLocation: resolvedLocation,
		usesExplicitSettaFile: usesExplicitFilesRoot,
		runtimeRoot:           runtimeRoot,
		userConfig:            userConfig,
	}, nil
}

func EnsureUserConfigExists(settaHome string) error {
	configPath := filepath.Join(settaHome, "config.json")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		return fmt.Errorf("Failed to create Setta home directory: %s (%w)", settaHome, err)
	}

	if info, err := os.Stat(configPath); err == nil {
		if info.IsDir() {
			return fmt.Errorf("Setta config path exists but is not a file: %s", configPath)
		}
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("Failed to inspect Setta config path: %s (%w)", configPath, err)
	}

	payload, err := json.MarshalIndent(struct {
		GlobalSettaFilesBase string   `json:"globalSettaFilesBase"`
		AutoMode             AutoMode `json:"autoMode"`
	}{
		GlobalSettaFilesBase: defaultUserConfig(settaHome).GlobalSettaFilesBase,
		AutoMode:             defaultUserConfig(settaHome).AutoMode,
	}, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal default setta config: %w", err)
	}
	payload = append(payload, '\n')

	file, err := os.OpenFile(configPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return nil
		}
		return fmt.Errorf("Failed to write Setta config: %s (%w)", configPath, err)
	}
	defer file.Close()

	if _, err := file.Write(payload); err != nil {
		return fmt.Errorf("Failed to write Setta config: %s (%w)", configPath, err)
	}
	return nil
}

func loadServer(cli CLIOptions, envLookup func(string) (string, bool)) (Server, error) {
	mode, err := parseMode(firstNonEmpty(trimmed(cli.Mode), lookupEnvTrimmed(envLookup, serverModeEnv), string(ModeIDE)))
	if err != nil {
		return Server{}, err
	}

	port, err := parsePort(firstNonEmpty(trimmed(cli.Port), lookupEnvTrimmed(envLookup, portEnv), strconv.Itoa(DefaultServerPort)))
	if err != nil {
		return Server{}, err
	}

	logLevel, err := parseLogLevel(firstNonEmpty(trimmed(cli.LogLevel), lookupEnvTrimmed(envLookup, logLevelEnv), "info"))
	if err != nil {
		return Server{}, err
	}

	return Server{
		Host:     firstNonEmpty(trimmed(cli.Host), lookupEnvTrimmed(envLookup, hostEnv), DefaultServerHost),
		Port:     port,
		Mode:     mode,
		LogLevel: logLevel,
	}, nil
}

func parseMode(raw string) (Mode, error) {
	switch strings.ToLower(trimmed(raw)) {
	case string(ModeIDE):
		return ModeIDE, nil
	case string(ModeShare):
		return ModeShare, nil
	case string(ModeApp):
		return ModeApp, nil
	case string(ModeLauncher):
		return ModeLauncher, nil
	default:
		return "", fmt.Errorf("invalid server mode %q", raw)
	}
}

func parsePort(raw string) (int, error) {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid port %q", raw)
	}
	if value < 0 || value > 65535 {
		return 0, fmt.Errorf("port must be between 0 and 65535")
	}
	return value, nil
}

func parseLogLevel(raw string) (slog.Level, error) {
	switch strings.ToLower(trimmed(raw)) {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn", "warning":
		return slog.LevelWarn, nil
	case "error", "critical":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("invalid log level %q", raw)
	}
}

func resolveProfileLookupHome(explicitProfileLookupHome, explicitSettaHome string, envLookup func(string) (string, bool)) (string, error) {
	if explicitProfileLookupHome != "" {
		return resolvePath(explicitProfileLookupHome, "")
	}
	return resolveSettaHomeWithoutProfile(explicitSettaHome, envLookup)
}

func resolveSettaHome(explicitSettaHome, profileSettaHome string, envLookup func(string) (string, bool)) (string, error) {
	if explicitSettaHome != "" {
		return resolvePath(explicitSettaHome, "")
	}
	if profileSettaHome != "" {
		return resolvePath(profileSettaHome, "")
	}
	if raw := lookupEnvTrimmed(envLookup, SettaHomeEnv); raw != "" {
		return resolvePath(raw, "")
	}
	return defaultSettaHome(envLookup)
}

func resolveSettaHomeWithoutProfile(explicitSettaHome string, envLookup func(string) (string, bool)) (string, error) {
	if explicitSettaHome != "" {
		return resolvePath(explicitSettaHome, "")
	}
	if raw := lookupEnvTrimmed(envLookup, ProfileLookupHomeEnv); raw != "" {
		return resolvePath(raw, "")
	}
	if raw := lookupEnvTrimmed(envLookup, SettaHomeEnv); raw != "" {
		return resolvePath(raw, "")
	}
	return defaultSettaHome(envLookup)
}

func defaultSettaHome(envLookup func(string) (string, bool)) (string, error) {
	return defaultSettaHomeFor(runtime.GOOS, envLookup, os.UserHomeDir)
}

func defaultSettaHomeFor(goos string, envLookup func(string) (string, bool), userHomeDir func() (string, error)) (string, error) {
	if goos == "windows" {
		if appData := lookupEnvTrimmed(envLookup, "APPDATA"); appData != "" {
			return resolvePath(filepath.Join(appData, ".setta"), "")
		}
		home, err := userHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return resolvePath(filepath.Join(home, "AppData", "Roaming", ".setta"), "")
	}

	home, err := userHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}
	return resolvePath(filepath.Join(home, ".setta"), "")
}

func resolveWorkspaceRoot(mode Mode, explicitWorkspaceRoot, profileWorkspaceRoot, cwd string, envLookup func(string) (string, bool)) (string, error) {
	switch {
	case explicitWorkspaceRoot != "":
		return resolvePath(explicitWorkspaceRoot, "")
	case profileWorkspaceRoot != "":
		return resolvePath(profileWorkspaceRoot, "")
	case lookupEnvTrimmed(envLookup, WorkspaceRootEnv) != "":
		return resolvePath(lookupEnvTrimmed(envLookup, WorkspaceRootEnv), "")
	case mode == ModeLauncher:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return resolvePath(home, "")
	default:
		return resolvePath(cwd, "")
	}
}

type settaFilesSelection struct {
	rootRaw     string
	locationRaw string
}

func resolveSettaFilesRoot(
	mode Mode,
	workspaceRoot string,
	settaHome string,
	userConfig UserConfig,
	cli CLIOptions,
	profile profileConfig,
	envLookup func(string) (string, bool),
) (string, ResolvedFilesLocation, bool, error) {
	localRoot, err := resolvePath(filepath.Join(workspaceRoot, "setta_files"), "")
	if err != nil {
		return "", "", false, err
	}

	selection, err := selectSettaFilesRoot(mode, cli, profile, envLookup)
	if err != nil {
		return "", "", false, err
	}
	if selection.rootRaw != "" {
		return resolveExplicitSettaFilesRoot(selection.rootRaw)
	}
	selectedLocation, err := parseFilesLocation(selection.locationRaw)
	if err != nil {
		return "", "", false, err
	}
	return resolveLocationBackedSettaFilesRoot(localRoot, workspaceRoot, settaHome, userConfig, selectedLocation)
}

func selectSettaFilesRoot(
	mode Mode,
	cli CLIOptions,
	profile profileConfig,
	envLookup func(string) (string, bool),
) (settaFilesSelection, error) {
	explicitRootRaw := trimmed(cli.SettaFilesRoot)
	explicitLocationRaw := trimmed(cli.SettaFilesLocation)
	profileRootRaw := profile.SettaFilesRoot
	profileLocationRaw := string(profile.SettaFilesLocation)
	envRootRaw := lookupEnvTrimmed(envLookup, FilesRootEnv)
	envLocationRaw := lookupEnvTrimmed(envLookup, FilesLocationEnv)

	if err := validateConflictingSettaFilesSelection(
		explicitRootRaw,
		explicitLocationRaw,
		"cannot use --setta-files-root together with --setta-files-location",
	); err != nil {
		return settaFilesSelection{}, err
	}
	if err := validateConflictingSettaFilesSelection(
		envRootRaw,
		envLocationRaw,
		fmt.Sprintf("environment variables %s and %s cannot both be set", FilesRootEnv, FilesLocationEnv),
	); err != nil {
		return settaFilesSelection{}, err
	}

	switch {
	case explicitRootRaw != "":
		return settaFilesSelection{rootRaw: explicitRootRaw}, nil
	case explicitLocationRaw != "":
		return settaFilesSelection{locationRaw: explicitLocationRaw}, nil
	case profileRootRaw != "":
		return settaFilesSelection{rootRaw: profileRootRaw}, nil
	case profileLocationRaw != "":
		return settaFilesSelection{locationRaw: profileLocationRaw}, nil
	case envRootRaw != "":
		return settaFilesSelection{rootRaw: envRootRaw}, nil
	case envLocationRaw != "":
		return settaFilesSelection{locationRaw: envLocationRaw}, nil
	case mode == ModeLauncher:
		return settaFilesSelection{locationRaw: string(FilesLocationGlobal)}, nil
	default:
		return settaFilesSelection{locationRaw: string(FilesLocationAuto)}, nil
	}
}

func validateConflictingSettaFilesSelection(rootRaw, locationRaw, message string) error {
	if rootRaw == "" || locationRaw == "" {
		return nil
	}
	return newConfigError("InvalidSettaFilesConfig", message, nil)
}

func resolveExplicitSettaFilesRoot(selectedRootRaw string) (string, ResolvedFilesLocation, bool, error) {
	selectedRoot, err := resolvePath(selectedRootRaw, "")
	if err != nil {
		return "", "", false, err
	}
	if err := validateExistingDir(selectedRoot, "setta files root"); err != nil {
		return "", "", false, newConfigError("InvalidSettaFilesRoot", err.Error(), err)
	}
	return selectedRoot, ResolvedFilesLocationLocal, true, nil
}

func resolveLocationBackedSettaFilesRoot(
	localRoot string,
	workspaceRoot string,
	settaHome string,
	userConfig UserConfig,
	selectedLocation FilesLocation,
) (string, ResolvedFilesLocation, bool, error) {
	if err := validateExistingDir(localRoot, "local setta_files path"); err != nil {
		return "", "", false, newConfigError("InvalidSettaFilesRoot", err.Error(), err)
	}
	if isDir(localRoot) {
		return localRoot, ResolvedFilesLocationLocal, false, nil
	}
	if selectedLocation == FilesLocationLocal {
		return localRoot, ResolvedFilesLocationLocal, false, nil
	}

	globalRoot, err := resolveGlobalSettaFilesRoot(workspaceRoot, settaHome, userConfig)
	if err != nil {
		return "", "", false, err
	}
	if selectedLocation == FilesLocationGlobal {
		return globalRoot, ResolvedFilesLocationGlobal, false, nil
	}
	return resolveAutoSettaFilesRoot(localRoot, globalRoot, userConfig.AutoMode)
}

func resolveGlobalSettaFilesRoot(workspaceRoot string, settaHome string, userConfig UserConfig) (string, error) {
	globalBase, err := resolvePath(userConfig.GlobalSettaFilesBase, settaHome)
	if err != nil {
		return "", err
	}
	globalRoot := buildFilesRootFromBase(globalBase, workspaceRoot)
	if err := validateExistingDir(globalRoot, "global setta_files path"); err != nil {
		return "", newConfigError("InvalidSettaFilesRoot", err.Error(), err)
	}
	return globalRoot, nil
}

func resolveAutoSettaFilesRoot(localRoot, globalRoot string, autoMode AutoMode) (string, ResolvedFilesLocation, bool, error) {
	switch autoMode {
	case AutoModeCreateLocal:
		return localRoot, ResolvedFilesLocationLocal, false, nil
	case AutoModeUseGlobalIfExists:
		if isDir(globalRoot) {
			return globalRoot, ResolvedFilesLocationGlobal, false, nil
		}
		return localRoot, ResolvedFilesLocationLocal, false, nil
	case AutoModeCreateGlobal:
		return globalRoot, ResolvedFilesLocationGlobal, false, nil
	default:
		return "", "", false, fmt.Errorf("unsupported auto mode %q", autoMode)
	}
}

func resolveDeploymentRoot(mode Mode, explicitDeploymentRoot string) (string, error) {
	if mode != ModeShare && mode != ModeApp {
		return "", nil
	}
	if explicitDeploymentRoot == "" {
		return "", fmt.Errorf("deployment root is required in %s mode", mode)
	}

	deploymentRoot, err := resolvePath(explicitDeploymentRoot, "")
	if err != nil {
		return "", err
	}
	if err := validateExistingDir(deploymentRoot, "deployment root"); err != nil {
		return "", err
	}
	return deploymentRoot, nil
}

func resolveRuntimeRoot(
	mode Mode,
	settaFilesRoot string,
	deploymentRoot string,
	explicitRuntimeRoot string,
	profileRuntimeRoot string,
	envLookup func(string) (string, bool),
) (string, error) {
	switch {
	case explicitRuntimeRoot != "":
		return resolvePath(explicitRuntimeRoot, "")
	case profileRuntimeRoot != "":
		return resolvePath(profileRuntimeRoot, "")
	case lookupEnvTrimmed(envLookup, RuntimeRootEnv) != "":
		return resolvePath(lookupEnvTrimmed(envLookup, RuntimeRootEnv), "")
	case (mode == ModeShare || mode == ModeApp) && deploymentRoot != "":
		return deployments.DefaultRuntimeRoot(deploymentRoot)
	default:
		return resolvePath(filepath.Join(settaFilesRoot, "runtime"), "")
	}
}

func loadUserConfig(settaHome string) (UserConfig, error) {
	configPath := filepath.Join(settaHome, "config.json")
	defaults := defaultUserConfig(settaHome)
	content, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return defaults, nil
		}
		return UserConfig{}, newConfigError("InvalidSettaUserConfig", fmt.Sprintf("read setta config: %v", err), err)
	}

	var raw struct {
		GlobalSettaFilesBase  string `json:"globalSettaFilesBase"`
		AutoMode              string `json:"autoMode"`
		OpenWorkspaceFallback any    `json:"openWorkspaceFallback"`
		DefaultCreateLocation any    `json:"defaultCreateLocation"`
	}
	if err := json.Unmarshal(content, &raw); err != nil {
		return UserConfig{}, newConfigError("InvalidSettaUserConfig", fmt.Sprintf("invalid json in setta config: %v", err), err)
	}
	if raw.OpenWorkspaceFallback != nil || raw.DefaultCreateLocation != nil {
		return UserConfig{}, newConfigError(
			"InvalidSettaUserConfig",
			"setta config uses removed keys openWorkspaceFallback/defaultCreateLocation; use autoMode instead",
			nil,
		)
	}

	result := defaults
	if trimmed(raw.GlobalSettaFilesBase) != "" {
		result.GlobalSettaFilesBase = trimmed(raw.GlobalSettaFilesBase)
	}
	if trimmed(raw.AutoMode) != "" {
		result.AutoMode = AutoMode(trimmed(raw.AutoMode))
	}

	switch result.AutoMode {
	case AutoModeCreateLocal, AutoModeUseGlobalIfExists, AutoModeCreateGlobal:
	default:
		return UserConfig{}, newConfigError(
			"InvalidSettaUserConfig",
			"autoMode must be one of: create_local, use_global_if_present, create_global",
			nil,
		)
	}

	resolvedBase, err := resolvePath(result.GlobalSettaFilesBase, settaHome)
	if err != nil {
		return UserConfig{}, newConfigError("InvalidSettaUserConfig", err.Error(), err)
	}
	if err := validateExistingDir(resolvedBase, "globalSettaFilesBase"); err != nil {
		return UserConfig{}, newConfigError("InvalidSettaUserConfig", err.Error(), err)
	}
	result.GlobalSettaFilesBase = resolvedBase
	return result, nil
}

func loadProfile(settaHome string, profileName string) (profileConfig, error) {
	trimmedName, err := validateProfileName(profileName)
	if err != nil {
		return profileConfig{}, err
	}
	raw, err := readRawProfileConfig(settaHome, trimmedName)
	if err != nil {
		return profileConfig{}, err
	}
	if err := validateProfileNameMatch(trimmedName, raw.Name); err != nil {
		return profileConfig{}, err
	}
	location, err := parseProfileFilesLocation(raw)
	if err != nil {
		return profileConfig{}, err
	}
	workspaceRoot, profileSettaHome, settaFilesRoot, runtimeRoot, err := resolveProfilePaths(raw, settaHome)
	if err != nil {
		return profileConfig{}, err
	}
	return profileConfig{
		Name:               trimmedName,
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          profileSettaHome,
		SettaFilesRoot:     settaFilesRoot,
		RuntimeRoot:        runtimeRoot,
		SettaFilesLocation: location,
		AuthCookieName:     trimmed(raw.AuthCookieName),
	}, nil
}

func validateProfileName(profileName string) (string, error) {
	trimmedName := trimmed(profileName)
	if trimmedName == "" {
		return "", newConfigError("InvalidSettaProfile", "missing profile name", nil)
	}
	if trimmedName == "." || trimmedName == ".." || strings.ContainsAny(trimmedName, "/\\") {
		return "", newConfigError("InvalidSettaProfile", fmt.Sprintf("invalid profile name %q", profileName), nil)
	}
	return trimmedName, nil
}

func readRawProfileConfig(settaHome string, trimmedName string) (rawProfileConfig, error) {
	profilePath := filepath.Join(settaHome, "profiles", trimmedName+".json")
	content, err := os.ReadFile(profilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return rawProfileConfig{}, newConfigError("UnknownSettaProfile", fmt.Sprintf("unknown setta profile %q", trimmedName), err)
		}
		return rawProfileConfig{}, newConfigError("InvalidSettaProfile", fmt.Sprintf("read setta profile: %v", err), err)
	}

	var raw rawProfileConfig
	if err := json.Unmarshal(content, &raw); err != nil {
		return rawProfileConfig{}, newConfigError("InvalidSettaProfile", fmt.Sprintf("invalid json in setta profile: %v", err), err)
	}
	return raw, nil
}

func validateProfileNameMatch(expectedName string, rawName string) error {
	if rawName == "" || trimmed(rawName) == expectedName {
		return nil
	}
	return newConfigError(
		"InvalidSettaProfile",
		fmt.Sprintf("profile name mismatch: expected %q, got %q", expectedName, trimmed(rawName)),
		nil,
	)
}

func parseProfileFilesLocation(raw rawProfileConfig) (FilesLocation, error) {
	location, err := parseOptionalFilesLocation(raw.SettaFilesLocation)
	if err != nil {
		return "", newConfigError("InvalidSettaProfile", err.Error(), err)
	}
	if trimmed(raw.SettaFilesRoot) != "" && location != "" {
		return "", newConfigError(
			"InvalidSettaProfile",
			"profile config cannot set both settaFilesRoot and settaFilesLocation",
			nil,
		)
	}
	return location, nil
}

func resolveProfilePaths(raw rawProfileConfig, settaHome string) (string, string, string, string, error) {
	workspaceRoot, err := resolveOptionalPath(raw.WorkspaceRoot, settaHome)
	if err != nil {
		return "", "", "", "", newConfigError("InvalidSettaProfile", err.Error(), err)
	}
	profileSettaHome, err := resolveOptionalPath(raw.SettaHome, settaHome)
	if err != nil {
		return "", "", "", "", newConfigError("InvalidSettaProfile", err.Error(), err)
	}
	settaFilesRoot, err := resolveOptionalPath(raw.SettaFilesRoot, settaHome)
	if err != nil {
		return "", "", "", "", newConfigError("InvalidSettaProfile", err.Error(), err)
	}
	runtimeRoot, err := resolveOptionalPath(raw.RuntimeRoot, settaHome)
	if err != nil {
		return "", "", "", "", newConfigError("InvalidSettaProfile", err.Error(), err)
	}
	return workspaceRoot, profileSettaHome, settaFilesRoot, runtimeRoot, nil
}

func parseFilesLocation(raw string) (FilesLocation, error) {
	switch strings.ToLower(trimmed(raw)) {
	case string(FilesLocationAuto):
		return FilesLocationAuto, nil
	case string(FilesLocationLocal):
		return FilesLocationLocal, nil
	case string(FilesLocationGlobal):
		return FilesLocationGlobal, nil
	default:
		return "", fmt.Errorf("invalid setta files location %q", raw)
	}
}

func parseOptionalFilesLocation(raw string) (FilesLocation, error) {
	if trimmed(raw) == "" {
		return "", nil
	}
	return parseFilesLocation(raw)
}

func validateWorkspaceRoot(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return newConfigError("InvalidWorkspace", fmt.Sprintf("workspace root does not exist: %s", path), err)
		}
		return newConfigError("InvalidWorkspace", fmt.Sprintf("stat workspace root: %v", err), err)
	}
	if !info.IsDir() {
		return newConfigError("InvalidWorkspace", fmt.Sprintf("workspace root is not a directory: %s", path), nil)
	}
	return nil
}

func validateSettaHomeName(path string, label string) error {
	if _, ok := allowedSettaHomeNames[filepath.Base(path)]; ok {
		return nil
	}
	return newConfigError(
		"InvalidSettaHome",
		fmt.Sprintf("%s must end with one of: .setta, .setta-development. received: %s", label, path),
		nil,
	)
}

func validateSettaFilesRoot(path string) error {
	for _, part := range strings.Split(filepath.Clean(path), string(filepath.Separator)) {
		if _, ok := allowedSettaFilesRootSegment[part]; ok {
			return nil
		}
	}
	return newConfigError(
		"InvalidSettaFilesRoot",
		fmt.Sprintf("setta files root must include one of these folder names: setta_files, setta_files_dev. received: %s", path),
		nil,
	)
}

func validateRuntimeRoot(runtimeRoot string, workspaceRoot string) error {
	if samePath(runtimeRoot, workspaceRoot) {
		return newConfigError(
			"InvalidRuntimeRoot",
			"runtime root cannot be the workspace root. use a dedicated runtime directory",
			nil,
		)
	}
	if err := validateExistingDir(runtimeRoot, "runtime root"); err != nil {
		return newConfigError("InvalidRuntimeRoot", err.Error(), err)
	}
	return nil
}

func validateExistingDir(path string, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat %s: %w", label, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory: %s", label, path)
	}
	return nil
}

func canonicalWorkspaceRootForHash(workspaceRoot string) string {
	resolvedRoot, err := resolvePath(workspaceRoot, "")
	if err != nil {
		return filepath.Clean(workspaceRoot)
	}
	candidate := resolvedRoot
	missingSegments := []string{}
	for {
		if _, err := os.Lstat(candidate); err == nil {
			canonicalRoot, evalErr := filepath.EvalSymlinks(candidate)
			if evalErr == nil && trimmed(canonicalRoot) != "" {
				for index := len(missingSegments) - 1; index >= 0; index-- {
					canonicalRoot = filepath.Join(canonicalRoot, missingSegments[index])
				}
				return filepath.Clean(canonicalRoot)
			}
			break
		}

		parent := filepath.Dir(candidate)
		if parent == candidate {
			break
		}
		missingSegments = append(missingSegments, filepath.Base(candidate))
		candidate = parent
	}
	return resolvedRoot
}

func BuildFilesRootFromBase(baseRoot string, workspaceRoot string) string {
	sanitizedLeaf := sanitizeLeaf(filepath.Base(workspaceRoot))
	if len(sanitizedLeaf) > 48 {
		sanitizedLeaf = strings.TrimRight(sanitizedLeaf[:48], "._-")
		if sanitizedLeaf == "" {
			sanitizedLeaf = "workspace"
		}
	}
	sum := sha256.Sum256([]byte(canonicalWorkspaceRootForHash(workspaceRoot)))
	return filepath.Join(baseRoot, fmt.Sprintf("%s-%s", sanitizedLeaf, hex.EncodeToString(sum[:4])))
}

func buildFilesRootFromBase(baseRoot string, workspaceRoot string) string {
	return BuildFilesRootFromBase(baseRoot, workspaceRoot)
}

func sanitizeLeaf(value string) string {
	if value == "" {
		return "workspace"
	}
	var builder strings.Builder
	for _, ch := range value {
		switch {
		case ch >= '0' && ch <= '9':
			builder.WriteRune(ch)
		case ch >= 'a' && ch <= 'z':
			builder.WriteRune(ch)
		case ch >= 'A' && ch <= 'Z':
			builder.WriteRune(ch)
		case ch == '.', ch == '_', ch == '-':
			builder.WriteRune(ch)
		default:
			builder.WriteByte('_')
		}
	}
	cleaned := strings.Trim(builder.String(), "._-")
	if cleaned == "" {
		return "workspace"
	}
	return cleaned
}

func resolveOptionalPath(raw string, relativeTo string) (string, error) {
	if trimmed(raw) == "" {
		return "", nil
	}
	return resolvePath(raw, relativeTo)
}

func resolvePath(raw string, relativeTo string) (string, error) {
	value := os.ExpandEnv(trimmed(raw))
	if value == "" {
		return "", fmt.Errorf("missing path")
	}
	if value == "~" || strings.HasPrefix(value, "~/") || strings.HasPrefix(value, "~\\") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		suffix := strings.TrimPrefix(strings.TrimPrefix(value, "~"), string(os.PathSeparator))
		suffix = strings.TrimPrefix(strings.TrimPrefix(suffix, "/"), "\\")
		value = filepath.Join(home, suffix)
	}
	if relativeTo != "" && !filepath.IsAbs(value) {
		value = filepath.Join(relativeTo, value)
	}
	absValue, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve path %q: %w", raw, err)
	}
	return filepath.Clean(absValue), nil
}

func lookupEnvTrimmed(lookup func(string) (string, bool), key string) string {
	if lookup == nil {
		return ""
	}
	value, ok := lookup(key)
	if !ok {
		return ""
	}
	return trimmed(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed(value) != "" {
			return trimmed(value)
		}
	}
	return ""
}

func trimmed(value string) string {
	return strings.TrimSpace(value)
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func samePath(left string, right string) bool {
	return filepath.Clean(left) == filepath.Clean(right)
}
