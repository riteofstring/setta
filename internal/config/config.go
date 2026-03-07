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
	"strconv"
	"strings"

	"setta/internal/deployments"
)

const (
	workspaceRootEnv     = "SETTA_WORKSPACE_ROOT"
	runtimeRootEnv       = "SETTA_RUNTIME_ROOT"
	filesRootEnv         = "SETTA_FILES_ROOT"
	profileEnv           = "SETTA_PROFILE"
	profileLookupHomeEnv = "SETTA_PROFILE_LOOKUP_HOME"
	serverModeEnv        = "SETTA_SERVER_MODE"
	settaHomeEnv         = "SETTA_HOME"
	filesLocationEnv     = "SETTA_FILES_LOCATION"
	hostEnv              = "SETTA_HOST"
	portEnv              = "SETTA_PORT"
	logLevelEnv          = "SETTA_LOG_LEVEL"
)

var (
	allowedSettaHomeNames        = map[string]struct{}{".setta": {}, ".setta-development": {}}
	allowedSettaFilesRootSegment = map[string]struct{}{"setta_files": {}, "setta_files_dev": {}}
)

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

	profileName := firstNonEmpty(trimmed(opts.CLI.Profile), lookupEnvTrimmed(envLookup, profileEnv))
	var (
		profile           profileConfig
		profileLookupHome string
		settaHome         string
	)
	if profileName == "" {
		settaHome, err = resolveSettaHome(trimmed(opts.CLI.SettaHome), "", envLookup)
		if err != nil {
			return Config{}, err
		}
		profileLookupHome = settaHome
	} else {
		profileLookupHome, err = resolveProfileLookupHome(
			trimmed(opts.CLI.ProfileLookupHome),
			trimmed(opts.CLI.SettaHome),
			envLookup,
		)
		if err != nil {
			return Config{}, err
		}
		profile, err = loadProfile(profileLookupHome, profileName)
		if err != nil {
			return Config{}, err
		}
		settaHome, err = resolveSettaHome(trimmed(opts.CLI.SettaHome), profile.SettaHome, envLookup)
		if err != nil {
			return Config{}, err
		}
	}

	if err := validateSettaHomeName(profileLookupHome, "Setta profile lookup home"); err != nil {
		return Config{}, err
	}
	if err := validateSettaHomeName(settaHome, "Setta home"); err != nil {
		return Config{}, err
	}

	workspaceRoot, err := resolveWorkspaceRoot(trimmed(opts.CLI.WorkspaceRoot), profile.WorkspaceRoot, cwd, envLookup)
	if err != nil {
		return Config{}, err
	}
	if err := validateWorkspaceRoot(workspaceRoot); err != nil {
		return Config{}, err
	}

	userConfig, err := loadUserConfig(settaHome)
	if err != nil {
		return Config{}, err
	}

	settaFilesRoot, resolvedLocation, usesExplicitFilesRoot, err := resolveSettaFilesRoot(
		workspaceRoot,
		settaHome,
		userConfig,
		opts.CLI,
		profile,
		envLookup,
	)
	if err != nil {
		return Config{}, err
	}
	if err := validateSettaFilesRoot(settaFilesRoot); err != nil {
		return Config{}, err
	}

	deploymentRoot, err := resolveDeploymentRoot(server.Mode, trimmed(opts.CLI.DeploymentRoot))
	if err != nil {
		return Config{}, err
	}
	runtimeRoot, err := resolveRuntimeRoot(
		server.Mode,
		settaFilesRoot,
		deploymentRoot,
		trimmed(opts.CLI.RuntimeRoot),
		profile.RuntimeRoot,
		envLookup,
	)
	if err != nil {
		return Config{}, err
	}
	if err := validateRuntimeRoot(runtimeRoot, workspaceRoot); err != nil {
		return Config{}, err
	}

	return Config{
		Server: server,
		Paths: Paths{
			WorkspaceRoot:          workspaceRoot,
			DeploymentRoot:         deploymentRoot,
			SettaHome:              settaHome,
			ProfileLookupHome:      profileLookupHome,
			ProfileName:            profileName,
			SettaFilesRoot:         settaFilesRoot,
			ResolvedFilesLocation:  resolvedLocation,
			UsesExplicitSettaFiles: usesExplicitFilesRoot,
			RuntimeRoot:            runtimeRoot,
			AuthCookieName:         profile.AuthCookieName,
		},
		User: userConfig,
	}, nil
}

func EnsureUserConfigExists(settaHome string) error {
	configPath := filepath.Join(settaHome, "config.json")
	if info, err := os.Stat(configPath); err == nil {
		if info.IsDir() {
			return fmt.Errorf("setta config path exists but is a directory: %s", configPath)
		}
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat setta config: %w", err)
	}

	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		return fmt.Errorf("create setta home: %w", err)
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
		return fmt.Errorf("create setta config: %w", err)
	}
	defer file.Close()

	if _, err := file.Write(payload); err != nil {
		return fmt.Errorf("write setta config: %w", err)
	}
	return nil
}

func loadServer(cli CLIOptions, envLookup func(string) (string, bool)) (Server, error) {
	mode, err := parseMode(firstNonEmpty(trimmed(cli.Mode), lookupEnvTrimmed(envLookup, serverModeEnv), string(ModeIDE)))
	if err != nil {
		return Server{}, err
	}

	port, err := parsePort(firstNonEmpty(trimmed(cli.Port), lookupEnvTrimmed(envLookup, portEnv), "8000"))
	if err != nil {
		return Server{}, err
	}

	logLevel, err := parseLogLevel(firstNonEmpty(trimmed(cli.LogLevel), lookupEnvTrimmed(envLookup, logLevelEnv), "info"))
	if err != nil {
		return Server{}, err
	}

	return Server{
		Host:     firstNonEmpty(trimmed(cli.Host), lookupEnvTrimmed(envLookup, hostEnv), "127.0.0.1"),
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
	if value < 1 || value > 65535 {
		return 0, fmt.Errorf("port must be between 1 and 65535")
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
	case "error":
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
	if raw := lookupEnvTrimmed(envLookup, settaHomeEnv); raw != "" {
		return resolvePath(raw, "")
	}
	return defaultSettaHome(envLookup)
}

func resolveSettaHomeWithoutProfile(explicitSettaHome string, envLookup func(string) (string, bool)) (string, error) {
	if explicitSettaHome != "" {
		return resolvePath(explicitSettaHome, "")
	}
	if raw := lookupEnvTrimmed(envLookup, profileLookupHomeEnv); raw != "" {
		return resolvePath(raw, "")
	}
	if raw := lookupEnvTrimmed(envLookup, settaHomeEnv); raw != "" {
		return resolvePath(raw, "")
	}
	return defaultSettaHome(envLookup)
}

func defaultSettaHome(envLookup func(string) (string, bool)) (string, error) {
	if runtime.GOOS == "windows" {
		if appData := lookupEnvTrimmed(envLookup, "APPDATA"); appData != "" {
			return resolvePath(filepath.Join(appData, ".setta"), "")
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return resolvePath(filepath.Join(home, "AppData", "Roaming", ".setta"), "")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}
	return resolvePath(filepath.Join(home, ".setta"), "")
}

func resolveWorkspaceRoot(explicitWorkspaceRoot, profileWorkspaceRoot, cwd string, envLookup func(string) (string, bool)) (string, error) {
	switch {
	case explicitWorkspaceRoot != "":
		return resolvePath(explicitWorkspaceRoot, "")
	case profileWorkspaceRoot != "":
		return resolvePath(profileWorkspaceRoot, "")
	case lookupEnvTrimmed(envLookup, workspaceRootEnv) != "":
		return resolvePath(lookupEnvTrimmed(envLookup, workspaceRootEnv), "")
	default:
		return resolvePath(cwd, "")
	}
}

func resolveSettaFilesRoot(
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

	explicitRootRaw := trimmed(cli.SettaFilesRoot)
	explicitLocationRaw := trimmed(cli.SettaFilesLocation)
	profileRootRaw := profile.SettaFilesRoot
	profileLocationRaw := string(profile.SettaFilesLocation)
	envRootRaw := lookupEnvTrimmed(envLookup, filesRootEnv)
	envLocationRaw := lookupEnvTrimmed(envLookup, filesLocationEnv)

	if explicitRootRaw != "" && explicitLocationRaw != "" {
		return "", "", false, fmt.Errorf("cannot use --setta-files-root together with --setta-files-location")
	}
	if envRootRaw != "" && envLocationRaw != "" {
		return "", "", false, fmt.Errorf("environment variables %s and %s cannot both be set", filesRootEnv, filesLocationEnv)
	}

	selectedRootRaw := ""
	selectedLocationRaw := ""
	switch {
	case explicitRootRaw != "":
		selectedRootRaw = explicitRootRaw
	case explicitLocationRaw != "":
		selectedLocationRaw = explicitLocationRaw
	case profileRootRaw != "":
		selectedRootRaw = profileRootRaw
	case profileLocationRaw != "":
		selectedLocationRaw = profileLocationRaw
	case envRootRaw != "":
		selectedRootRaw = envRootRaw
	case envLocationRaw != "":
		selectedLocationRaw = envLocationRaw
	default:
		selectedLocationRaw = string(FilesLocationAuto)
	}

	if selectedRootRaw != "" {
		selectedRoot, err := resolvePath(selectedRootRaw, "")
		if err != nil {
			return "", "", false, err
		}
		if err := validateExistingDir(selectedRoot, "setta files root"); err != nil {
			return "", "", false, err
		}
		return selectedRoot, ResolvedFilesLocationLocal, true, nil
	}

	selectedLocation, err := parseFilesLocation(selectedLocationRaw)
	if err != nil {
		return "", "", false, err
	}

	if err := validateExistingDir(localRoot, "local setta_files path"); err != nil {
		return "", "", false, err
	}
	if isDir(localRoot) {
		return localRoot, ResolvedFilesLocationLocal, false, nil
	}
	if selectedLocation == FilesLocationLocal {
		return localRoot, ResolvedFilesLocationLocal, false, nil
	}

	globalBase, err := resolvePath(userConfig.GlobalSettaFilesBase, settaHome)
	if err != nil {
		return "", "", false, err
	}
	globalRoot := buildFilesRootFromBase(globalBase, workspaceRoot)
	if err := validateExistingDir(globalRoot, "global setta_files path"); err != nil {
		return "", "", false, err
	}
	if selectedLocation == FilesLocationGlobal {
		return globalRoot, ResolvedFilesLocationGlobal, false, nil
	}

	switch userConfig.AutoMode {
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
		return "", "", false, fmt.Errorf("unsupported auto mode %q", userConfig.AutoMode)
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
	case lookupEnvTrimmed(envLookup, runtimeRootEnv) != "":
		return resolvePath(lookupEnvTrimmed(envLookup, runtimeRootEnv), "")
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
		return UserConfig{}, fmt.Errorf("read setta config: %w", err)
	}

	var raw struct {
		GlobalSettaFilesBase  string `json:"globalSettaFilesBase"`
		AutoMode              string `json:"autoMode"`
		OpenWorkspaceFallback any    `json:"openWorkspaceFallback"`
		DefaultCreateLocation any    `json:"defaultCreateLocation"`
	}
	if err := json.Unmarshal(content, &raw); err != nil {
		return UserConfig{}, fmt.Errorf("invalid json in setta config: %w", err)
	}
	if raw.OpenWorkspaceFallback != nil || raw.DefaultCreateLocation != nil {
		return UserConfig{}, fmt.Errorf("setta config uses removed keys openWorkspaceFallback/defaultCreateLocation; use autoMode instead")
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
		return UserConfig{}, fmt.Errorf("autoMode must be one of: create_local, use_global_if_present, create_global")
	}

	resolvedBase, err := resolvePath(result.GlobalSettaFilesBase, settaHome)
	if err != nil {
		return UserConfig{}, err
	}
	if err := validateExistingDir(resolvedBase, "globalSettaFilesBase"); err != nil {
		return UserConfig{}, err
	}
	result.GlobalSettaFilesBase = resolvedBase
	return result, nil
}

func loadProfile(settaHome string, profileName string) (profileConfig, error) {
	trimmedName := trimmed(profileName)
	if trimmedName == "" {
		return profileConfig{}, fmt.Errorf("missing profile name")
	}
	if trimmedName == "." || trimmedName == ".." || strings.ContainsAny(trimmedName, "/\\") {
		return profileConfig{}, fmt.Errorf("invalid profile name %q", profileName)
	}

	profilePath := filepath.Join(settaHome, "profiles", trimmedName+".json")
	content, err := os.ReadFile(profilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return profileConfig{}, fmt.Errorf("unknown setta profile %q", trimmedName)
		}
		return profileConfig{}, fmt.Errorf("read setta profile: %w", err)
	}

	var raw struct {
		Name               string `json:"name"`
		WorkspaceRoot      string `json:"workspaceRoot"`
		SettaHome          string `json:"settaHome"`
		SettaFilesRoot     string `json:"settaFilesRoot"`
		RuntimeRoot        string `json:"runtimeRoot"`
		SettaFilesLocation string `json:"settaFilesLocation"`
		AuthCookieName     string `json:"authCookieName"`
	}
	if err := json.Unmarshal(content, &raw); err != nil {
		return profileConfig{}, fmt.Errorf("invalid json in setta profile: %w", err)
	}

	if raw.Name != "" && trimmed(raw.Name) != trimmedName {
		return profileConfig{}, fmt.Errorf("profile name mismatch: expected %q, got %q", trimmedName, trimmed(raw.Name))
	}

	location, err := parseOptionalFilesLocation(raw.SettaFilesLocation)
	if err != nil {
		return profileConfig{}, err
	}
	if trimmed(raw.SettaFilesRoot) != "" && location != "" {
		return profileConfig{}, fmt.Errorf("profile config cannot set both settaFilesRoot and settaFilesLocation")
	}

	workspaceRoot, err := resolveOptionalPath(raw.WorkspaceRoot, settaHome)
	if err != nil {
		return profileConfig{}, err
	}
	profileSettaHome, err := resolveOptionalPath(raw.SettaHome, settaHome)
	if err != nil {
		return profileConfig{}, err
	}
	settaFilesRoot, err := resolveOptionalPath(raw.SettaFilesRoot, settaHome)
	if err != nil {
		return profileConfig{}, err
	}
	runtimeRoot, err := resolveOptionalPath(raw.RuntimeRoot, settaHome)
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
			return fmt.Errorf("workspace root does not exist: %s", path)
		}
		return fmt.Errorf("stat workspace root: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("workspace root is not a directory: %s", path)
	}
	return nil
}

func validateSettaHomeName(path string, label string) error {
	if _, ok := allowedSettaHomeNames[filepath.Base(path)]; ok {
		return nil
	}
	return fmt.Errorf("%s must end with one of: .setta, .setta-development. received: %s", label, path)
}

func validateSettaFilesRoot(path string) error {
	for _, part := range strings.Split(filepath.Clean(path), string(filepath.Separator)) {
		if _, ok := allowedSettaFilesRootSegment[part]; ok {
			return nil
		}
	}
	return fmt.Errorf("setta files root must include one of these folder names: setta_files, setta_files_dev. received: %s", path)
}

func validateRuntimeRoot(runtimeRoot string, workspaceRoot string) error {
	if samePath(runtimeRoot, workspaceRoot) {
		return fmt.Errorf("runtime root cannot be the workspace root. use a dedicated runtime directory")
	}
	return validateExistingDir(runtimeRoot, "runtime root")
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

func buildFilesRootFromBase(baseRoot string, workspaceRoot string) string {
	sanitizedLeaf := sanitizeLeaf(filepath.Base(workspaceRoot))
	if len(sanitizedLeaf) > 48 {
		sanitizedLeaf = strings.TrimRight(sanitizedLeaf[:48], "._-")
		if sanitizedLeaf == "" {
			sanitizedLeaf = "workspace"
		}
	}
	sum := sha256.Sum256([]byte(workspaceRoot))
	return filepath.Join(baseRoot, fmt.Sprintf("%s-%s", sanitizedLeaf, hex.EncodeToString(sum[:4])))
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
