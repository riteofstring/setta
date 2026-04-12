package launcher

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"setta/internal/statefs"
)

const (
	launcherMetadataFileName         = "launcher-install.json"
	launcherMetadataSchemaVersion    = 3
	LauncherMetadataSchemaVersion    = launcherMetadataSchemaVersion
	LauncherWorkspaceBehaviorDefault = LauncherWorkspaceBehaviorLastUsedOrPrompt
)

type LauncherOpenMode string

const (
	LauncherOpenModeBrowser   LauncherOpenMode = "browser"
	LauncherOpenModeChromeApp LauncherOpenMode = "chrome-app"
)

type LauncherWorkspaceBehavior string

const (
	LauncherWorkspaceBehaviorLastUsedOrPrompt LauncherWorkspaceBehavior = "last_used_or_prompt"
	LauncherWorkspaceBehaviorAlwaysPrompt     LauncherWorkspaceBehavior = "always_prompt"
)

type LauncherInstallSource string

const (
	LauncherInstallSourceUVTool           LauncherInstallSource = "uv_tool"
	LauncherInstallSourceInstallerManaged LauncherInstallSource = "installer_managed"
	LauncherInstallSourceUnsupported      LauncherInstallSource = "unsupported"
)

type LauncherInstallMetadata struct {
	SchemaVersion          int               `json:"schemaVersion"`
	TargetCommand          []string          `json:"targetCommand"`
	Channel                string            `json:"channel"`
	InstallSource          string            `json:"installSource"`
	ArtifactOwnershipToken string            `json:"artifactOwnershipToken"`
	SettaVersion           string            `json:"settaVersion"`
	SettaHome              string            `json:"settaHome"`
	OpenMode               string            `json:"openMode"`
	WorkspaceBehavior      string            `json:"workspaceBehavior"`
	LastUsedWorkspace      *string           `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions        map[string]string `json:"artifactOptions"`
	ManagedArtifacts       map[string]string `json:"managedArtifacts"`
}

type LauncherInstallMetadataInput struct {
	TargetCommand          []string
	Channel                string
	InstallSource          LauncherInstallSource
	ArtifactOwnershipToken string
	SettaVersion           string
	SettaHome              string
	OpenMode               LauncherOpenMode
	WorkspaceBehavior      LauncherWorkspaceBehavior
	LastUsedWorkspace      *string
	ArtifactOptions        map[string]string
	ManagedArtifacts       map[string]string
}

type launcherInstallMetadataIdentity struct {
	targetCommand          []string
	channel                string
	installSource          LauncherInstallSource
	artifactOwnershipToken string
	settaVersion           string
	settaHome              string
}

type launcherInstallMetadataBehavior struct {
	openMode          LauncherOpenMode
	workspaceBehavior LauncherWorkspaceBehavior
	lastUsedWorkspace *string
}

type launcherInstallMetadataArtifacts struct {
	artifactOptions  map[string]string
	managedArtifacts map[string]string
}

type LauncherMetadataError struct {
	Message string
}

func (e *LauncherMetadataError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func resolveLauncherDir(settaHome string) (string, error) {
	resolvedSettaHome, err := resolvePathLoose(settaHome)
	if err != nil {
		return "", err
	}
	return filepath.Join(resolvedSettaHome, "launcher"), nil
}

func resolveLauncherMetadataPath(settaHome string) (string, error) {
	launcherDir, err := resolveLauncherDir(settaHome)
	if err != nil {
		return "", err
	}
	return filepath.Join(launcherDir, launcherMetadataFileName), nil
}

func BuildLauncherInstallMetadata(input LauncherInstallMetadataInput) (LauncherInstallMetadata, error) {
	identity, err := buildLauncherInstallMetadataIdentity(input)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}
	behavior, err := buildLauncherInstallMetadataBehavior(input)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}
	artifacts, err := buildLauncherInstallMetadataArtifacts(input)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}

	return LauncherInstallMetadata{
		SchemaVersion:          launcherMetadataSchemaVersion,
		TargetCommand:          identity.targetCommand,
		Channel:                identity.channel,
		InstallSource:          string(identity.installSource),
		ArtifactOwnershipToken: identity.artifactOwnershipToken,
		SettaVersion:           identity.settaVersion,
		SettaHome:              identity.settaHome,
		OpenMode:               string(behavior.openMode),
		WorkspaceBehavior:      string(behavior.workspaceBehavior),
		LastUsedWorkspace:      behavior.lastUsedWorkspace,
		ArtifactOptions:        artifacts.artifactOptions,
		ManagedArtifacts:       artifacts.managedArtifacts,
	}, nil
}

func buildLauncherInstallMetadataIdentity(input LauncherInstallMetadataInput) (launcherInstallMetadataIdentity, error) {
	targetCommand, err := normalizeLauncherTargetCommand(input.TargetCommand)
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	channel, err := normalizeRequiredLauncherString(input.Channel, "channel")
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	installSource, err := normalizeLauncherInstallSource(string(input.InstallSource))
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	artifactOwnershipToken, err := normalizeRequiredLauncherString(input.ArtifactOwnershipToken, "artifactOwnershipToken")
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	settaVersion, err := normalizeRequiredLauncherString(input.SettaVersion, "settaVersion")
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	settaHome, err := normalizeRequiredLauncherSettaHome(input.SettaHome)
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	return launcherInstallMetadataIdentity{
		targetCommand:          targetCommand,
		channel:                channel,
		installSource:          installSource,
		artifactOwnershipToken: artifactOwnershipToken,
		settaVersion:           settaVersion,
		settaHome:              settaHome,
	}, nil
}

func buildLauncherInstallMetadataBehavior(input LauncherInstallMetadataInput) (launcherInstallMetadataBehavior, error) {
	openMode, err := normalizeLauncherOpenMode(string(input.OpenMode))
	if err != nil {
		return launcherInstallMetadataBehavior{}, err
	}
	workspaceBehavior, err := normalizeLauncherWorkspaceBehaviorInput(input.WorkspaceBehavior)
	if err != nil {
		return launcherInstallMetadataBehavior{}, err
	}
	lastUsedWorkspace, err := normalizeOptionalLauncherWorkspace(input.LastUsedWorkspace)
	if err != nil {
		return launcherInstallMetadataBehavior{}, err
	}
	return launcherInstallMetadataBehavior{
		openMode:          openMode,
		workspaceBehavior: workspaceBehavior,
		lastUsedWorkspace: lastUsedWorkspace,
	}, nil
}

func buildLauncherInstallMetadataArtifacts(input LauncherInstallMetadataInput) (launcherInstallMetadataArtifacts, error) {
	artifactOptions, err := normalizeLauncherArtifactOptions(input.ArtifactOptions)
	if err != nil {
		return launcherInstallMetadataArtifacts{}, err
	}
	managedArtifacts, err := normalizeLauncherManagedArtifacts(input.ManagedArtifacts)
	if err != nil {
		return launcherInstallMetadataArtifacts{}, err
	}
	return launcherInstallMetadataArtifacts{
		artifactOptions:  artifactOptions,
		managedArtifacts: managedArtifacts,
	}, nil
}

func WriteLauncherInstallMetadata(settaHome string, metadata LauncherInstallMetadata) (string, error) {
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		return "", err
	}
	payload, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encode launcher metadata: %w", err)
	}
	payload = append(payload, '\n')
	if err := statefs.AtomicWriteFile(metadataPath, payload, 0o644); err != nil {
		return "", fmt.Errorf("write launcher metadata: %w", err)
	}
	return metadataPath, nil
}

func LoadLauncherInstallMetadata(settaHome string) (*LauncherInstallMetadata, error) {
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(metadataPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read launcher metadata: %w", err)
	}

	var rawPayload any
	if err := json.Unmarshal(content, &rawPayload); err != nil {
		return nil, &LauncherMetadataError{
			Message: fmt.Sprintf("Invalid launcher metadata JSON: %s", metadataPath),
		}
	}
	rawObject, ok := rawPayload.(map[string]any)
	if !ok {
		return nil, &LauncherMetadataError{
			Message: fmt.Sprintf("Launcher metadata must be a JSON object: %s", metadataPath),
		}
	}

	metadata, err := parseLauncherInstallMetadata(rawObject, metadataPath)
	if err != nil {
		return nil, err
	}
	return &metadata, nil
}

func RemoveLauncherInstallMetadata(settaHome string) (bool, error) {
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		return false, err
	}
	if err := os.Remove(metadataPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("remove launcher metadata: %w", err)
	}
	return true, nil
}

func UpdateLauncherLastUsedWorkspaceIfInstalled(settaHome string, workspaceRoot string) error {
	metadata, err := LoadLauncherInstallMetadata(settaHome)
	if err != nil {
		return err
	}
	if metadata == nil {
		return nil
	}
	resolvedWorkspaceRoot, err := resolvePathLoose(workspaceRoot)
	if err != nil {
		return err
	}
	metadata.LastUsedWorkspace = stringPointer(resolvedWorkspaceRoot)
	_, err = WriteLauncherInstallMetadata(settaHome, *metadata)
	return err
}

func LauncherTargetValidationError(metadata LauncherInstallMetadata) string {
	if len(metadata.TargetCommand) == 0 {
		return "Configured launcher target is missing. Re-run `setta launcher setup`."
	}

	executablePath, err := resolvePathLoose(metadata.TargetCommand[0])
	if err != nil {
		executablePath = strings.TrimSpace(metadata.TargetCommand[0])
	}

	info, statErr := os.Stat(executablePath)
	switch {
	case errors.Is(statErr, os.ErrNotExist):
		return fmt.Sprintf(
			"Configured launcher target is missing: %s. Re-run `setta launcher setup`.",
			executablePath,
		)
	case statErr != nil:
		return fmt.Sprintf(
			"Configured launcher target is missing: %s. Re-run `setta launcher setup`.",
			executablePath,
		)
	}
	if !info.Mode().IsRegular() {
		return fmt.Sprintf(
			"Configured launcher target is not an executable file: %s. Re-run `setta launcher setup`.",
			executablePath,
		)
	}
	if !launcherTargetInvokable(executablePath, info.Mode()) {
		return fmt.Sprintf(
			"Configured launcher target is not executable: %s. Re-run `setta launcher setup`.",
			executablePath,
		)
	}
	return ""
}

func parseLauncherInstallMetadata(rawPayload map[string]any, metadataPath string) (LauncherInstallMetadata, error) {
	schemaVersion, err := parseLauncherMetadataSchema(rawPayload["schemaVersion"], metadataPath)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}
	identity, err := parseLauncherMetadataIdentityFields(rawPayload)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}
	behavior, err := parseLauncherMetadataBehaviorFields(rawPayload)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}
	artifacts, err := parseLauncherMetadataArtifactFields(rawPayload)
	if err != nil {
		return LauncherInstallMetadata{}, err
	}

	return LauncherInstallMetadata{
		SchemaVersion:          schemaVersion,
		TargetCommand:          identity.targetCommand,
		Channel:                identity.channel,
		InstallSource:          string(identity.installSource),
		ArtifactOwnershipToken: identity.artifactOwnershipToken,
		SettaVersion:           identity.settaVersion,
		SettaHome:              identity.settaHome,
		OpenMode:               string(behavior.openMode),
		WorkspaceBehavior:      string(behavior.workspaceBehavior),
		LastUsedWorkspace:      behavior.lastUsedWorkspace,
		ArtifactOptions:        artifacts.artifactOptions,
		ManagedArtifacts:       artifacts.managedArtifacts,
	}, nil
}

func parseLauncherMetadataIdentityFields(rawPayload map[string]any) (launcherInstallMetadataIdentity, error) {
	targetCommand, err := parseLauncherMetadataTargetCommand(rawPayload["targetCommand"])
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	channel, err := parseLauncherMetadataString(rawPayload["channel"], "channel")
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	installSource, err := parseLauncherMetadataInstallSource(rawPayload["installSource"])
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	artifactOwnershipToken, err := parseLauncherMetadataString(rawPayload["artifactOwnershipToken"], "artifactOwnershipToken")
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	settaVersion, err := parseLauncherMetadataString(rawPayload["settaVersion"], "settaVersion")
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	settaHome, err := parseLauncherMetadataSettaHome(rawPayload["settaHome"])
	if err != nil {
		return launcherInstallMetadataIdentity{}, err
	}
	return launcherInstallMetadataIdentity{
		targetCommand:          targetCommand,
		channel:                channel,
		installSource:          installSource,
		artifactOwnershipToken: artifactOwnershipToken,
		settaVersion:           settaVersion,
		settaHome:              settaHome,
	}, nil
}

func parseLauncherMetadataBehaviorFields(rawPayload map[string]any) (launcherInstallMetadataBehavior, error) {
	openMode, err := parseLauncherMetadataOpenMode(rawPayload["openMode"])
	if err != nil {
		return launcherInstallMetadataBehavior{}, err
	}
	workspaceBehavior, err := parseLauncherMetadataWorkspaceBehavior(rawPayload["workspaceBehavior"])
	if err != nil {
		return launcherInstallMetadataBehavior{}, err
	}
	lastUsedWorkspace, err := parseLauncherMetadataOptionalWorkspace(rawPayload["lastUsedWorkspace"])
	if err != nil {
		return launcherInstallMetadataBehavior{}, err
	}
	return launcherInstallMetadataBehavior{
		openMode:          openMode,
		workspaceBehavior: workspaceBehavior,
		lastUsedWorkspace: lastUsedWorkspace,
	}, nil
}

func parseLauncherMetadataArtifactFields(rawPayload map[string]any) (launcherInstallMetadataArtifacts, error) {
	managedArtifacts, err := parseLauncherMetadataManagedArtifacts(rawPayload["managedArtifacts"])
	if err != nil {
		return launcherInstallMetadataArtifacts{}, err
	}
	artifactOptions, err := parseLauncherMetadataArtifactOptions(rawPayload["artifactOptions"])
	if err != nil {
		return launcherInstallMetadataArtifacts{}, err
	}
	return launcherInstallMetadataArtifacts{
		artifactOptions:  artifactOptions,
		managedArtifacts: managedArtifacts,
	}, nil
}

func parseLauncherMetadataSchema(rawValue any, metadataPath string) (int, error) {
	value, ok := rawValue.(float64)
	if !ok || value != float64(int(value)) || int(value) != launcherMetadataSchemaVersion {
		return 0, &LauncherMetadataError{
			Message: fmt.Sprintf(
				"Unsupported launcher metadata schemaVersion (%v) in %s.",
				rawValue,
				metadataPath,
			),
		}
	}
	return int(value), nil
}

func parseLauncherMetadataString(rawValue any, label string) (string, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", &LauncherMetadataError{Message: fmt.Sprintf("%s must be a string.", label)}
	}
	return normalizeRequiredLauncherString(value, label)
}

func parseLauncherMetadataSettaHome(rawValue any) (string, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", &LauncherMetadataError{Message: "settaHome must be a string."}
	}
	return normalizeRequiredLauncherSettaHome(value)
}

func parseLauncherMetadataTargetCommand(rawValue any) ([]string, error) {
	items, ok := rawValue.([]any)
	if !ok {
		return nil, &LauncherMetadataError{Message: "targetCommand must be a list of strings."}
	}
	if len(items) == 0 {
		return nil, &LauncherMetadataError{Message: "targetCommand must include at least one value."}
	}
	values := make([]string, 0, len(items))
	for _, item := range items {
		value, ok := item.(string)
		if !ok {
			return nil, &LauncherMetadataError{Message: "targetCommand entries must be strings."}
		}
		values = append(values, value)
	}
	return normalizeLauncherTargetCommand(values)
}

func parseLauncherMetadataOpenMode(rawValue any) (LauncherOpenMode, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", &LauncherMetadataError{Message: "openMode must be a string."}
	}
	return normalizeLauncherOpenMode(value)
}

func parseLauncherMetadataInstallSource(rawValue any) (LauncherInstallSource, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", &LauncherMetadataError{Message: "installSource must be a string."}
	}
	return normalizeLauncherInstallSource(value)
}

func parseLauncherMetadataWorkspaceBehavior(rawValue any) (LauncherWorkspaceBehavior, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", &LauncherMetadataError{Message: "workspaceBehavior must be a string."}
	}
	return normalizeLauncherWorkspaceBehavior(value)
}

func parseLauncherMetadataOptionalWorkspace(rawValue any) (*string, error) {
	if rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil, &LauncherMetadataError{Message: "lastUsedWorkspace must be a string when provided."}
	}
	return normalizeOptionalLauncherWorkspace(&value)
}

func parseLauncherMetadataManagedArtifacts(rawValue any) (map[string]string, error) {
	if rawValue == nil {
		return map[string]string{}, nil
	}
	items, ok := rawValue.(map[string]any)
	if !ok {
		return nil, &LauncherMetadataError{Message: "managedArtifacts must be an object."}
	}
	values := make(map[string]string, len(items))
	for rawName, rawPath := range items {
		pathString, ok := rawPath.(string)
		if !ok {
			return nil, &LauncherMetadataError{Message: "managedArtifacts values must be string paths."}
		}
		values[rawName] = pathString
	}
	return normalizeLauncherManagedArtifacts(values)
}

func parseLauncherMetadataArtifactOptions(rawValue any) (map[string]string, error) {
	if rawValue == nil {
		return map[string]string{}, nil
	}
	items, ok := rawValue.(map[string]any)
	if !ok {
		return nil, &LauncherMetadataError{Message: "artifactOptions must be an object."}
	}
	values := make(map[string]string, len(items))
	for rawName, rawValue := range items {
		stringValue, ok := rawValue.(string)
		if !ok {
			return nil, &LauncherMetadataError{Message: "artifactOptions values must be strings."}
		}
		values[rawName] = stringValue
	}
	return normalizeLauncherArtifactOptions(values)
}

func normalizeRequiredLauncherString(value string, label string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", &LauncherMetadataError{Message: fmt.Sprintf("%s must be non-empty.", label)}
	}
	return trimmed, nil
}

func normalizeRequiredLauncherSettaHome(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", &LauncherMetadataError{Message: "settaHome must be non-empty."}
	}
	resolved, err := resolvePathLoose(trimmed)
	if err != nil {
		return "", err
	}
	return resolved, nil
}

func normalizeLauncherTargetCommand(rawValues []string) ([]string, error) {
	if len(rawValues) == 0 {
		return nil, &LauncherMetadataError{Message: "targetCommand must include at least one value."}
	}
	normalized := make([]string, 0, len(rawValues))
	for idx, rawValue := range rawValues {
		trimmed := strings.TrimSpace(rawValue)
		if trimmed == "" {
			return nil, &LauncherMetadataError{Message: "targetCommand entries must be non-empty."}
		}
		if idx == 0 {
			expandedExecutable, err := expandLauncherHomePrefix(trimmed)
			if err != nil {
				return nil, err
			}
			if !filepath.IsAbs(expandedExecutable) {
				return nil, &LauncherMetadataError{Message: "targetCommand[0] must be an absolute executable path."}
			}
			normalized = append(normalized, filepath.Clean(expandedExecutable))
			continue
		}
		normalized = append(normalized, trimmed)
	}
	return normalized, nil
}

func normalizeLauncherOpenMode(rawValue string) (LauncherOpenMode, error) {
	trimmed := strings.ToLower(strings.TrimSpace(rawValue))
	switch LauncherOpenMode(trimmed) {
	case LauncherOpenModeBrowser, LauncherOpenModeChromeApp:
		return LauncherOpenMode(trimmed), nil
	default:
		return "", &LauncherMetadataError{Message: "openMode must be either 'browser' or 'chrome-app'."}
	}
}

func normalizeLauncherInstallSource(rawValue string) (LauncherInstallSource, error) {
	trimmed := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(rawValue), "-", "_"))
	switch LauncherInstallSource(trimmed) {
	case LauncherInstallSourceUVTool, LauncherInstallSourceInstallerManaged, LauncherInstallSourceUnsupported:
		return LauncherInstallSource(trimmed), nil
	default:
		return "", &LauncherMetadataError{
			Message: "installSource must be one of 'uv_tool', 'installer_managed', or 'unsupported'.",
		}
	}
}

func normalizeLauncherWorkspaceBehavior(rawValue string) (LauncherWorkspaceBehavior, error) {
	trimmed := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(rawValue), "-", "_"))
	switch LauncherWorkspaceBehavior(trimmed) {
	case LauncherWorkspaceBehaviorLastUsedOrPrompt, LauncherWorkspaceBehaviorAlwaysPrompt:
		return LauncherWorkspaceBehavior(trimmed), nil
	default:
		return "", &LauncherMetadataError{
			Message: "workspaceBehavior must be either 'last_used_or_prompt' or 'always_prompt'.",
		}
	}
}

func normalizeLauncherWorkspaceBehaviorInput(rawValue LauncherWorkspaceBehavior) (LauncherWorkspaceBehavior, error) {
	if strings.TrimSpace(string(rawValue)) == "" {
		rawValue = LauncherWorkspaceBehaviorDefault
	}
	return normalizeLauncherWorkspaceBehavior(string(rawValue))
}

func normalizeOptionalLauncherWorkspace(rawValue *string) (*string, error) {
	if rawValue == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*rawValue)
	if trimmed == "" {
		return nil, nil
	}
	resolved, err := resolvePathLoose(trimmed)
	if err != nil {
		return nil, err
	}
	return &resolved, nil
}

func normalizeLauncherManagedArtifacts(rawValues map[string]string) (map[string]string, error) {
	if rawValues == nil {
		return map[string]string{}, nil
	}
	normalized := make(map[string]string, len(rawValues))
	for rawName, rawPath := range rawValues {
		name := strings.TrimSpace(rawName)
		if name == "" {
			return nil, &LauncherMetadataError{Message: "managedArtifacts keys must be non-empty."}
		}
		trimmedPath := strings.TrimSpace(rawPath)
		if trimmedPath == "" {
			return nil, &LauncherMetadataError{Message: "managedArtifacts values must be non-empty paths."}
		}
		resolvedPath, err := resolvePathLoose(trimmedPath)
		if err != nil {
			return nil, err
		}
		normalized[name] = resolvedPath
	}
	return normalized, nil
}

func normalizeLauncherArtifactOptions(rawValues map[string]string) (map[string]string, error) {
	if rawValues == nil {
		return map[string]string{}, nil
	}
	normalized := make(map[string]string, len(rawValues))
	for rawName, rawValue := range rawValues {
		name := strings.TrimSpace(rawName)
		if name == "" {
			return nil, &LauncherMetadataError{Message: "artifactOptions keys must be non-empty."}
		}
		value := strings.TrimSpace(rawValue)
		if value == "" {
			return nil, &LauncherMetadataError{Message: "artifactOptions values must be non-empty."}
		}
		normalized[name] = value
	}
	return normalized, nil
}

func expandLauncherHomePrefix(path string) (string, error) {
	if path == "~" || strings.HasPrefix(path, "~/") || strings.HasPrefix(path, "~\\") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		return filepath.Join(homeDir, strings.TrimLeft(path[1:], `/\`)), nil
	}
	return path, nil
}

func launcherTargetInvokable(executablePath string, mode os.FileMode) bool {
	if runtime.GOOS == "windows" {
		return launcherHasWindowsExecutableExtension(executablePath)
	}
	return mode&0o111 != 0
}

func launcherHasWindowsExecutableExtension(executablePath string) bool {
	rawExtensions := os.Getenv("PATHEXT")
	extensions := []string{".exe", ".bat", ".cmd", ".com", ".ps1"}
	if strings.TrimSpace(rawExtensions) != "" {
		extensions = extensions[:0]
		for _, rawExtension := range strings.Split(rawExtensions, ";") {
			trimmed := strings.ToLower(strings.TrimSpace(rawExtension))
			if trimmed == "" {
				continue
			}
			extensions = append(extensions, trimmed)
		}
	}
	suffix := strings.ToLower(filepath.Ext(executablePath))
	for _, extension := range extensions {
		if suffix == extension {
			return true
		}
	}
	return false
}

func stringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
