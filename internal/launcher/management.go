package launcher

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sort"
	"strings"
)

type LauncherUpdateCapability string

const (
	LauncherUpdateCapabilityInApp            LauncherUpdateCapability = "in_app"
	LauncherUpdateCapabilityInstallerManaged LauncherUpdateCapability = "installer_managed"
	LauncherUpdateCapabilityUnsupported      LauncherUpdateCapability = "unsupported"
)

type LauncherSetupError struct {
	Code    string
	Message string
}

func (e *LauncherSetupError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type LauncherStatusSnapshot struct {
	SettaHome                string
	LauncherDir              string
	MetadataPath             string
	Installed                bool
	TargetCommand            []string
	TargetValid              *bool
	TargetError              *string
	Channel                  *string
	SettaVersion             *string
	OpenMode                 *LauncherOpenMode
	WorkspaceBehavior        *LauncherWorkspaceBehavior
	LastUsedWorkspace        *string
	ArtifactOptions          map[string]string
	ManagedArtifacts         map[string]string
	ExistingManagedArtifacts []string
	MissingManagedArtifacts  []string
	UpdateCapability         LauncherUpdateCapability
	UpdateGuidance           *string
	Metadata                 *LauncherInstallMetadata
}

type LauncherSetupResult struct {
	SettaHome    string
	MetadataPath string
	LauncherDir  string
	Metadata     LauncherInstallMetadata
}

type LauncherRemoveResult struct {
	SettaHome       string
	MetadataPath    string
	MetadataRemoved bool
	RemovedPaths    []string
	MissingPaths    []string
}

type LauncherUpdateResult struct {
	PackageSpec string
	FromVersion *string
	ToVersion   *string
	Status      LauncherStatusSnapshot
}

type LauncherSetupInput struct {
	Channel           *string
	InstallSource     *LauncherInstallSource
	OpenMode          *LauncherOpenMode
	WorkspaceBehavior *LauncherWorkspaceBehavior
	InstallArtifacts  *bool
	ArtifactOptions   *map[string]string
	TargetCommand     []string
}

type launcherCommandResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

type launcherCommandRunner func(args []string) (launcherCommandResult, error)

type ManagementServiceOptions struct {
	ExecutablePath string
	Version        string
	Which          func(string) string
	RunCommand     launcherCommandRunner
}

type ManagementService struct {
	executablePath string
	version        string
	which          func(string) string
	runCommand     launcherCommandRunner
}

func NewManagementService(options ManagementServiceOptions) (*ManagementService, error) {
	executablePath := strings.TrimSpace(options.ExecutablePath)
	if executablePath == "" {
		return nil, fmt.Errorf("launcher executable path is required")
	}
	resolvedExecutablePath, err := resolvePathLoose(executablePath)
	if err != nil {
		return nil, fmt.Errorf("resolve launcher executable path: %w", err)
	}
	version := strings.TrimSpace(options.Version)
	if version == "" {
		version = currentSettaVersion()
	}
	which := options.Which
	if which == nil {
		which = func(name string) string {
			path, err := exec.LookPath(name)
			if err != nil {
				return ""
			}
			return path
		}
	}
	runCommand := options.RunCommand
	if runCommand == nil {
		runCommand = defaultLauncherCommandRunner
	}

	return &ManagementService{
		executablePath: resolvedExecutablePath,
		version:        version,
		which: func(name string) string {
			path := which(name)
			return strings.TrimSpace(path)
		},
		runCommand: runCommand,
	}, nil
}

func (s *ManagementService) ResolveTargetCommand() []string {
	if s == nil {
		return nil
	}
	return []string{s.executablePath}
}

func (s *ManagementService) CollectStatus(settaHome string) (LauncherStatusSnapshot, error) {
	resolvedSettaHome, err := resolvePathLoose(settaHome)
	if err != nil {
		return LauncherStatusSnapshot{}, err
	}
	launcherDir, err := resolveLauncherDir(resolvedSettaHome)
	if err != nil {
		return LauncherStatusSnapshot{}, err
	}
	metadataPath, err := resolveLauncherMetadataPath(resolvedSettaHome)
	if err != nil {
		return LauncherStatusSnapshot{}, err
	}

	metadata, err := LoadLauncherInstallMetadata(resolvedSettaHome)
	if err != nil {
		var metadataErr *LauncherMetadataError
		if errors.As(err, &metadataErr) {
			return LauncherStatusSnapshot{}, &LauncherSetupError{Code: "LauncherMetadata", Message: metadataErr.Error()}
		}
		return LauncherStatusSnapshot{}, err
	}
	if metadata == nil {
		guidance := "Launcher is not installed. Run `setta launcher setup` first."
		return LauncherStatusSnapshot{
			SettaHome:                resolvedSettaHome,
			LauncherDir:              launcherDir,
			MetadataPath:             metadataPath,
			Installed:                false,
			ArtifactOptions:          map[string]string{},
			ManagedArtifacts:         map[string]string{},
			ExistingManagedArtifacts: []string{},
			MissingManagedArtifacts:  []string{},
			UpdateCapability:         LauncherUpdateCapabilityUnsupported,
			UpdateGuidance:           &guidance,
			Metadata:                 nil,
		}, nil
	}

	if err := validateMetadataSettaHomeScope(*metadata, resolvedSettaHome, "LauncherMetadata"); err != nil {
		return LauncherStatusSnapshot{}, err
	}
	normalizedManagedArtifacts, err := validateManagedArtifactRegistry(metadata.ManagedArtifacts, resolvedSettaHome, "LauncherMetadata")
	if err != nil {
		return LauncherStatusSnapshot{}, err
	}

	targetErrorValue := LauncherTargetValidationError(*metadata)
	var targetValid *bool
	var targetError *string
	if targetErrorValue == "" {
		targetValid = boolPointer(true)
	} else {
		targetValid = boolPointer(false)
		targetError = &targetErrorValue
	}

	existingManagedArtifacts := make([]string, 0, len(normalizedManagedArtifacts))
	missingManagedArtifacts := make([]string, 0, len(normalizedManagedArtifacts))
	for _, pathString := range normalizedManagedArtifacts {
		info, err := os.Stat(pathString)
		switch {
		case err == nil && info != nil:
			existingManagedArtifacts = append(existingManagedArtifacts, pathString)
		case errors.Is(err, os.ErrNotExist):
			missingManagedArtifacts = append(missingManagedArtifacts, pathString)
		default:
			missingManagedArtifacts = append(missingManagedArtifacts, pathString)
		}
	}
	sort.Strings(existingManagedArtifacts)
	sort.Strings(missingManagedArtifacts)

	updateCapability, updateGuidance := resolveLauncherUpdateCapability(*metadata, normalizedManagedArtifacts)
	channel := metadata.Channel
	settaVersion := metadata.SettaVersion
	openMode := LauncherOpenMode(metadata.OpenMode)
	workspaceBehavior := LauncherWorkspaceBehavior(metadata.WorkspaceBehavior)

	return LauncherStatusSnapshot{
		SettaHome:                resolvedSettaHome,
		LauncherDir:              launcherDir,
		MetadataPath:             metadataPath,
		Installed:                true,
		TargetCommand:            append([]string(nil), metadata.TargetCommand...),
		TargetValid:              targetValid,
		TargetError:              targetError,
		Channel:                  &channel,
		SettaVersion:             &settaVersion,
		OpenMode:                 &openMode,
		WorkspaceBehavior:        &workspaceBehavior,
		LastUsedWorkspace:        cloneStringPointer(metadata.LastUsedWorkspace),
		ArtifactOptions:          cloneStringMap(metadata.ArtifactOptions),
		ManagedArtifacts:         normalizedManagedArtifacts,
		ExistingManagedArtifacts: existingManagedArtifacts,
		MissingManagedArtifacts:  missingManagedArtifacts,
		UpdateCapability:         updateCapability,
		UpdateGuidance:           updateGuidance,
		Metadata:                 metadata,
	}, nil
}

func (s *ManagementService) Setup(settaHome string, input LauncherSetupInput) (LauncherSetupResult, error) {
	resolvedSettaHome, err := resolvePathLoose(settaHome)
	if err != nil {
		return LauncherSetupResult{}, err
	}

	existingMetadata, err := LoadLauncherInstallMetadata(resolvedSettaHome)
	if err != nil {
		var metadataErr *LauncherMetadataError
		if errors.As(err, &metadataErr) {
			return LauncherSetupResult{}, &LauncherSetupError{Code: "LauncherMetadata", Message: metadataErr.Error()}
		}
		return LauncherSetupResult{}, err
	}

	normalizedExistingManagedArtifacts := map[string]string{}
	if existingMetadata != nil {
		if err := validateMetadataSettaHomeScope(*existingMetadata, resolvedSettaHome, "LauncherMetadata"); err != nil {
			return LauncherSetupResult{}, err
		}
		normalizedExistingManagedArtifacts, err = validateManagedArtifactRegistry(existingMetadata.ManagedArtifacts, resolvedSettaHome, "LauncherMetadata")
		if err != nil {
			return LauncherSetupResult{}, err
		}
	}

	resolvedInstallArtifacts := false
	switch {
	case input.InstallArtifacts != nil:
		resolvedInstallArtifacts = *input.InstallArtifacts
	case existingMetadata != nil:
		resolvedInstallArtifacts = len(normalizedExistingManagedArtifacts) > 0
	default:
		resolvedInstallArtifacts = false
	}

	resolvedChannel := "manual"
	if input.Channel != nil {
		resolvedChannel = strings.TrimSpace(*input.Channel)
		if resolvedChannel == "" {
			return LauncherSetupResult{}, &LauncherSetupError{Code: "BadRequest", Message: "channel must be non-empty."}
		}
	} else if existingMetadata != nil {
		resolvedChannel = existingMetadata.Channel
	}

	resolvedOpenMode := LauncherOpenModeChromeApp
	if input.OpenMode != nil {
		resolvedOpenMode = *input.OpenMode
	} else if existingMetadata != nil {
		resolvedOpenMode = LauncherOpenMode(existingMetadata.OpenMode)
	}

	resolvedWorkspaceBehavior := LauncherWorkspaceBehaviorDefault
	if input.WorkspaceBehavior != nil {
		resolvedWorkspaceBehavior = *input.WorkspaceBehavior
	} else if existingMetadata != nil {
		resolvedWorkspaceBehavior = LauncherWorkspaceBehavior(existingMetadata.WorkspaceBehavior)
	}

	resolvedInstallSource := LauncherInstallSourceUnsupported
	if input.InstallSource != nil {
		resolvedInstallSource = *input.InstallSource
	} else if existingMetadata != nil {
		resolvedInstallSource = LauncherInstallSource(existingMetadata.InstallSource)
	}

	resolvedArtifactOptions := map[string]string{}
	switch {
	case input.ArtifactOptions != nil:
		resolvedArtifactOptions = cloneStringMap(*input.ArtifactOptions)
	case existingMetadata != nil:
		resolvedArtifactOptions = cloneStringMap(existingMetadata.ArtifactOptions)
	}
	resolvedArtifactOptions, err = normalizeLauncherArtifactOptions(resolvedArtifactOptions)
	if err != nil {
		var metadataErr *LauncherMetadataError
		if errors.As(err, &metadataErr) {
			return LauncherSetupResult{}, &LauncherSetupError{Code: "BadRequest", Message: metadataErr.Error()}
		}
		return LauncherSetupResult{}, err
	}
	if err := validateArtifactOptionPaths(resolvedArtifactOptions, resolvedSettaHome); err != nil {
		return LauncherSetupResult{}, err
	}

	targetCommand := input.TargetCommand
	if len(targetCommand) == 0 {
		targetCommand = s.ResolveTargetCommand()
	}
	ownershipToken, err := resolveArtifactOwnershipToken(existingMetadata)
	if err != nil {
		return LauncherSetupResult{}, &LauncherSetupError{Code: "InternalError", Message: "Internal Server Error"}
	}

	mergedArtifacts := cloneStringMap(normalizedExistingManagedArtifacts)
	removalCandidates := map[string]string{}
	metadataCleanupCandidates := map[string]string{}
	if resolvedInstallArtifacts {
		artifactContext := launcherArtifactContext{
			TargetCommand:            append([]string(nil), targetCommand...),
			SettaHome:                resolvedSettaHome,
			ExistingManagedArtifacts: cloneStringMap(mergedArtifacts),
			Options:                  cloneStringMap(resolvedArtifactOptions),
		}
		plannedArtifacts, err := planCurrentPlatformArtifactPaths(artifactContext)
		if err != nil {
			var artifactErr *LauncherArtifactError
			if errors.As(err, &artifactErr) {
				return LauncherSetupResult{}, &LauncherSetupError{Code: "BadRequest", Message: artifactErr.Error()}
			}
			return LauncherSetupResult{}, err
		}
		if err := validatePlannedArtifactPaths(plannedArtifacts, resolvedSettaHome); err != nil {
			return LauncherSetupResult{}, err
		}
		desiredArtifacts := cloneStringMap(plannedArtifacts)
		removalCandidates = computeReplacedOrRemovedArtifacts(normalizedExistingManagedArtifacts, desiredArtifacts)
		installedArtifacts, err := installCurrentPlatformArtifacts(artifactContext)
		if err != nil {
			var artifactErr *LauncherArtifactError
			if errors.As(err, &artifactErr) {
				return LauncherSetupResult{}, &LauncherSetupError{Code: "ArtifactInstallFailed", Message: artifactErr.Error()}
			}
			return LauncherSetupResult{}, &LauncherSetupError{Code: "ArtifactInstallFailed", Message: err.Error()}
		}
		mergedArtifacts, err = validateManagedArtifactRegistry(installedArtifacts, resolvedSettaHome, "ArtifactInstallFailed")
		if err != nil {
			return LauncherSetupResult{}, err
		}
		metadataCleanupCandidates = computeNewOrReplacedArtifacts(normalizedExistingManagedArtifacts, mergedArtifacts)
		if err := writeArtifactOwnershipMarkers(mergedArtifacts, ownershipToken); err != nil {
			cleanupArtifactsAfterFailedMetadataWrite(metadataCleanupCandidates)
			return LauncherSetupResult{}, err
		}
	} else {
		removalCandidates = computeReplacedOrRemovedArtifacts(normalizedExistingManagedArtifacts, map[string]string{})
	}
	if markerErrors := validateOwnedArtifactsBeforeRemoval(removalCandidates, ownershipToken); len(markerErrors) > 0 {
		return LauncherSetupResult{}, &LauncherSetupError{
			Code:    "ArtifactRemovalFailed",
			Message: strings.Join(markerErrors, "; "),
		}
	}

	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          targetCommand,
		Channel:                resolvedChannel,
		InstallSource:          resolvedInstallSource,
		ArtifactOwnershipToken: ownershipToken,
		SettaVersion:           s.version,
		SettaHome:              resolvedSettaHome,
		OpenMode:               resolvedOpenMode,
		WorkspaceBehavior:      resolvedWorkspaceBehavior,
		LastUsedWorkspace:      launcherMetadataLastUsedWorkspace(existingMetadata),
		ArtifactOptions:        resolvedArtifactOptions,
		ManagedArtifacts:       mergedArtifacts,
	})
	if err != nil {
		cleanupArtifactsAfterFailedMetadataWrite(metadataCleanupCandidates)
		var metadataErr *LauncherMetadataError
		if errors.As(err, &metadataErr) {
			return LauncherSetupResult{}, &LauncherSetupError{Code: "BadRequest", Message: metadataErr.Error()}
		}
		return LauncherSetupResult{}, err
	}

	metadataPath, err := WriteLauncherInstallMetadata(resolvedSettaHome, metadata)
	if err != nil {
		cleanupArtifactsAfterFailedMetadataWrite(metadataCleanupCandidates)
		return LauncherSetupResult{}, &LauncherSetupError{
			Code:    "LauncherMetadata",
			Message: fmt.Sprintf("Failed to write launcher metadata: %v", err),
		}
	}
	launcherDir, err := resolveLauncherDir(resolvedSettaHome)
	if err != nil {
		return LauncherSetupResult{}, err
	}
	if len(removalCandidates) > 0 {
		removalResult := removeOwnedArtifacts(removalCandidates, ownershipToken)
		if len(removalResult.Errors) > 0 {
			return LauncherSetupResult{}, &LauncherSetupError{
				Code:    "ArtifactRemovalFailed",
				Message: strings.Join(removalResult.Errors, "; "),
			}
		}
	}

	return LauncherSetupResult{
		SettaHome:    resolvedSettaHome,
		MetadataPath: metadataPath,
		LauncherDir:  launcherDir,
		Metadata:     metadata,
	}, nil
}

func (s *ManagementService) Repair(settaHome string) (LauncherStatusSnapshot, error) {
	status, err := s.CollectStatus(settaHome)
	if err != nil {
		return LauncherStatusSnapshot{}, err
	}
	if !status.Installed || status.Metadata == nil {
		return LauncherStatusSnapshot{}, &LauncherSetupError{
			Code:    "LauncherNotInstalled",
			Message: "Launcher is not installed. Run `setta launcher setup` first.",
		}
	}

	channel := status.Metadata.Channel
	installSource := LauncherInstallSource(status.Metadata.InstallSource)
	openMode := LauncherOpenMode(status.Metadata.OpenMode)
	workspaceBehavior := LauncherWorkspaceBehavior(status.Metadata.WorkspaceBehavior)
	installArtifacts := len(status.Metadata.ManagedArtifacts) > 0

	if _, err := s.Setup(settaHome, LauncherSetupInput{
		Channel:           &channel,
		InstallSource:     &installSource,
		OpenMode:          &openMode,
		WorkspaceBehavior: &workspaceBehavior,
		InstallArtifacts:  &installArtifacts,
		ArtifactOptions:   mapPointer(cloneStringMap(status.Metadata.ArtifactOptions)),
	}); err != nil {
		return LauncherStatusSnapshot{}, err
	}
	return s.CollectStatus(settaHome)
}

func (s *ManagementService) Remove(settaHome string) (LauncherRemoveResult, error) {
	resolvedSettaHome, err := resolvePathLoose(settaHome)
	if err != nil {
		return LauncherRemoveResult{}, err
	}
	metadataPath, err := resolveLauncherMetadataPath(resolvedSettaHome)
	if err != nil {
		return LauncherRemoveResult{}, err
	}
	launcherDir, err := resolveLauncherDir(resolvedSettaHome)
	if err != nil {
		return LauncherRemoveResult{}, err
	}

	existingMetadata, err := LoadLauncherInstallMetadata(resolvedSettaHome)
	if err != nil {
		var metadataErr *LauncherMetadataError
		if errors.As(err, &metadataErr) {
			return LauncherRemoveResult{}, &LauncherSetupError{Code: "LauncherMetadata", Message: metadataErr.Error()}
		}
		return LauncherRemoveResult{}, err
	}
	if existingMetadata != nil {
		if err := validateMetadataSettaHomeScope(*existingMetadata, resolvedSettaHome, "LauncherMetadata"); err != nil {
			return LauncherRemoveResult{}, err
		}
		normalizedManagedArtifacts, err := validateManagedArtifactRegistry(existingMetadata.ManagedArtifacts, resolvedSettaHome, "LauncherMetadata")
		if err != nil {
			return LauncherRemoveResult{}, err
		}
		if len(normalizedManagedArtifacts) > 0 {
			removalResult := removeOwnedArtifacts(normalizedManagedArtifacts, existingMetadata.ArtifactOwnershipToken)
			if len(removalResult.Errors) > 0 {
				return LauncherRemoveResult{}, &LauncherSetupError{
					Code:    "ArtifactRemovalFailed",
					Message: strings.Join(removalResult.Errors, "; "),
				}
			}
			returnedRemovedPaths := append([]string(nil), removalResult.RemovedPaths...)
			returnedMissingPaths := append([]string(nil), removalResult.MissingPaths...)
			metadataRemoved, err := RemoveLauncherInstallMetadata(resolvedSettaHome)
			if err != nil {
				return LauncherRemoveResult{}, &LauncherSetupError{
					Code:    "LauncherMetadata",
					Message: fmt.Sprintf("Failed to remove launcher metadata: %v", err),
				}
			}
			if info, err := os.Stat(launcherDir); err == nil && info.IsDir() {
				_ = os.Remove(launcherDir)
			}
			return LauncherRemoveResult{
				SettaHome:       resolvedSettaHome,
				MetadataPath:    metadataPath,
				MetadataRemoved: metadataRemoved,
				RemovedPaths:    returnedRemovedPaths,
				MissingPaths:    returnedMissingPaths,
			}, nil
		}
	}

	metadataRemoved, err := RemoveLauncherInstallMetadata(resolvedSettaHome)
	if err != nil {
		return LauncherRemoveResult{}, &LauncherSetupError{
			Code:    "LauncherMetadata",
			Message: fmt.Sprintf("Failed to remove launcher metadata: %v", err),
		}
	}
	if info, err := os.Stat(launcherDir); err == nil && info.IsDir() {
		_ = os.Remove(launcherDir)
	}

	return LauncherRemoveResult{
		SettaHome:       resolvedSettaHome,
		MetadataPath:    metadataPath,
		MetadataRemoved: metadataRemoved,
		RemovedPaths:    []string{},
		MissingPaths:    []string{},
	}, nil
}

func (s *ManagementService) Update(settaHome string, packageSpec string) (LauncherUpdateResult, error) {
	status, err := s.CollectStatus(settaHome)
	if err != nil {
		return LauncherUpdateResult{}, err
	}
	if !status.Installed || status.Metadata == nil {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "LauncherNotInstalled",
			Message: "Launcher is not installed. Run `setta launcher setup` first.",
		}
	}
	if status.UpdateCapability != LauncherUpdateCapabilityInApp {
		guidance := "In-app launcher update is unavailable."
		if status.UpdateGuidance != nil {
			guidance = *status.UpdateGuidance
		}
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateUnavailable",
			Message: guidance,
		}
	}

	normalizedPackageSpec := strings.TrimSpace(packageSpec)
	if normalizedPackageSpec == "" {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "BadRequest",
			Message: "package spec must be non-empty.",
		}
	}

	uvPath := s.which("uv")
	if uvPath == "" {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "MissingDependency",
			Message: "uv is required for in-app update but was not found on PATH.",
		}
	}

	installResult, err := s.runCommand([]string{uvPath, "tool", "install", "--upgrade", normalizedPackageSpec})
	if err != nil {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: fmt.Sprintf("uv tool install --upgrade failed: %v", err),
		}
	}
	if installResult.ExitCode != 0 {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: fmt.Sprintf("uv tool install --upgrade failed: %s", formatLauncherCommandFailure(installResult)),
		}
	}

	dirResult, err := s.runCommand([]string{uvPath, "tool", "dir", "--bin"})
	if err != nil {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: fmt.Sprintf("uv tool dir --bin failed: %v", err),
		}
	}
	if dirResult.ExitCode != 0 {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: fmt.Sprintf("uv tool dir --bin failed: %s", formatLauncherCommandFailure(dirResult)),
		}
	}

	binDir := strings.TrimSpace(dirResult.Stdout)
	if binDir == "" {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: "uv tool dir --bin returned an empty path.",
		}
	}
	settaExecutable, err := resolveSettaExecutable(binDir)
	if err != nil {
		return LauncherUpdateResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: err.Error(),
		}
	}

	channel := status.Metadata.Channel
	installSource := LauncherInstallSource(status.Metadata.InstallSource)
	openMode := LauncherOpenMode(status.Metadata.OpenMode)
	workspaceBehavior := LauncherWorkspaceBehavior(status.Metadata.WorkspaceBehavior)
	installArtifacts := len(status.Metadata.ManagedArtifacts) > 0

	if _, err := s.Setup(settaHome, LauncherSetupInput{
		Channel:           &channel,
		InstallSource:     &installSource,
		OpenMode:          &openMode,
		WorkspaceBehavior: &workspaceBehavior,
		InstallArtifacts:  &installArtifacts,
		ArtifactOptions:   mapPointer(cloneStringMap(status.Metadata.ArtifactOptions)),
		TargetCommand:     []string{settaExecutable},
	}); err != nil {
		return LauncherUpdateResult{}, err
	}

	nextStatus, err := s.CollectStatus(settaHome)
	if err != nil {
		return LauncherUpdateResult{}, err
	}

	fromVersion := cloneStringPointer(status.Metadata.SettaVersionPointer())
	toVersion := cloneStringPointer(nextStatus.Metadata.SettaVersionPointer())
	return LauncherUpdateResult{
		PackageSpec: normalizedPackageSpec,
		FromVersion: fromVersion,
		ToVersion:   toVersion,
		Status:      nextStatus,
	}, nil
}

func resolveLauncherUpdateCapability(metadata LauncherInstallMetadata, managedArtifacts map[string]string) (LauncherUpdateCapability, *string) {
	_ = managedArtifacts
	switch LauncherInstallSource(metadata.InstallSource) {
	case LauncherInstallSourceUVTool:
		return LauncherUpdateCapabilityInApp, nil
	case LauncherInstallSourceInstallerManaged:
		guidance := "This launcher is installer-managed. Upgrade via installer/environment, then run `setta launcher setup`."
		return LauncherUpdateCapabilityInstallerManaged, &guidance
	default:
		guidance := "In-app update is unavailable for this launcher installation source."
		return LauncherUpdateCapabilityUnsupported, &guidance
	}
}

func validateManagedArtifactRegistry(managedArtifacts map[string]string, settaHome string, errorCode string) (map[string]string, error) {
	allowedKeys := currentPlatformArtifactKeys()
	normalized := make(map[string]string, 0)
	for name, rawPath := range managedArtifacts {
		if _, ok := allowedKeys[name]; !ok {
			return nil, &LauncherSetupError{
				Code:    errorCode,
				Message: fmt.Sprintf("Unsupported managed artifact key for this platform: %s", name),
			}
		}
		resolvedPath, err := resolvePathLoose(rawPath)
		if err != nil {
			return nil, &LauncherSetupError{
				Code:    errorCode,
				Message: fmt.Sprintf("Failed to resolve launcher artifact path %q: %v", rawPath, err),
			}
		}
		if err := validatePathWithinTrustedRoots(resolvedPath, settaHome, errorCode, false); err != nil {
			return nil, err
		}
		normalized[name] = resolvedPath
	}
	if err := validateUniqueArtifactPaths(normalized, errorCode); err != nil {
		return nil, err
	}
	return normalized, nil
}

func validateArtifactOptionPaths(options map[string]string, settaHome string) error {
	for key := range artifactWritePathOptionKeys() {
		rawPath, ok := options[key]
		if !ok {
			continue
		}
		resolvedPath, err := resolvePathLoose(rawPath)
		if err != nil {
			return &LauncherSetupError{
				Code:    "BadRequest",
				Message: fmt.Sprintf("Failed to resolve launcher artifact path %q: %v", rawPath, err),
			}
		}
		allowRootMatch := key == "applications_dir"
		if err := validatePathWithinTrustedRoots(resolvedPath, settaHome, "BadRequest", allowRootMatch); err != nil {
			return err
		}
	}
	return nil
}

func validateUniqueArtifactPaths(artifactPaths map[string]string, errorCode string) error {
	pathToKeys := map[string][]string{}
	for key, rawPath := range artifactPaths {
		resolvedPath, err := resolvePathLoose(rawPath)
		if err != nil {
			return &LauncherSetupError{
				Code:    errorCode,
				Message: fmt.Sprintf("Failed to resolve launcher artifact path %q: %v", rawPath, err),
			}
		}
		pathToKeys[resolvedPath] = append(pathToKeys[resolvedPath], key)
	}

	conflicts := make([]string, 0)
	for path, keys := range pathToKeys {
		if len(keys) < 2 {
			continue
		}
		sort.Strings(keys)
		conflicts = append(conflicts, fmt.Sprintf("%s: %s", path, strings.Join(keys, ", ")))
	}
	if len(conflicts) == 0 {
		return nil
	}
	sort.Strings(conflicts)
	return &LauncherSetupError{
		Code:    errorCode,
		Message: "Launcher artifact paths must be unique per artifact key. Conflicts: " + strings.Join(conflicts, "; "),
	}
}

func validateMetadataSettaHomeScope(metadata LauncherInstallMetadata, settaHome string, errorCode string) error {
	resolvedSettaHome, err := resolvePathLoose(settaHome)
	if err != nil {
		return err
	}
	if metadata.SettaHome == resolvedSettaHome {
		return nil
	}
	return &LauncherSetupError{
		Code: errorCode,
		Message: "Launcher metadata settaHome does not match requested scope. " +
			fmt.Sprintf("metadata=%s, requested=%s", metadata.SettaHome, resolvedSettaHome),
	}
}

func validatePathWithinTrustedRoots(path string, settaHome string, errorCode string, allowRootMatch bool) error {
	trustedRoots, err := trustedArtifactRoots(settaHome)
	if err != nil {
		return err
	}
	for _, root := range trustedRoots {
		if path == root || isWithinRoot(path, root) {
			if allowRootMatch {
				return nil
			}
			dangerousPaths := map[string]struct{}{root: {}}
			if homeDir, homeErr := os.UserHomeDir(); homeErr == nil {
				if resolvedHome, resolveErr := resolvePathLoose(homeDir); resolveErr == nil {
					dangerousPaths[resolvedHome] = struct{}{}
				}
			}
			if resolvedSettaHome, resolveErr := resolvePathLoose(settaHome); resolveErr == nil {
				dangerousPaths[resolvedSettaHome] = struct{}{}
			}
			if volume := filepath.VolumeName(path); volume != "" {
				dangerousPaths[filepath.Clean(volume+string(os.PathSeparator))] = struct{}{}
			} else {
				dangerousPaths[string(os.PathSeparator)] = struct{}{}
			}
			if _, ok := dangerousPaths[path]; ok {
				return &LauncherSetupError{
					Code:    errorCode,
					Message: fmt.Sprintf("Launcher artifact path resolves to a protected root: %s", path),
				}
			}
			return nil
		}
	}
	return &LauncherSetupError{
		Code:    errorCode,
		Message: fmt.Sprintf("Launcher artifact path is outside trusted roots: %s", path),
	}
}

func trustedArtifactRoots(settaHome string) ([]string, error) {
	launcherDir, err := resolveLauncherDir(settaHome)
	if err != nil {
		return nil, err
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve user home: %w", err)
	}
	resolvedHome, err := resolvePathLoose(homeDir)
	if err != nil {
		return nil, err
	}

	roots := []string{launcherDir}
	switch runtime.GOOS {
	case "darwin":
		roots = append(roots, filepath.Join(resolvedHome, "Applications"))
	case "windows":
		roots = append(roots,
			resolveEnvPathLoose("LOCALAPPDATA", filepath.Join(resolvedHome, "AppData", "Local")),
			filepath.Join(resolveEnvPathLoose("APPDATA", filepath.Join(resolvedHome, "AppData", "Roaming")), "Microsoft", "Windows", "Start Menu", "Programs"),
			filepath.Join(resolveEnvPathLoose("USERPROFILE", resolvedHome), "Desktop"),
		)
	default:
		roots = append(roots,
			filepath.Join(resolvedHome, ".local", "share", "applications"),
			filepath.Join(resolvedHome, ".local", "share", "setta"),
			filepath.Join(resolvedHome, "Desktop"),
		)
	}

	unique := make([]string, 0, len(roots))
	seen := map[string]struct{}{}
	for _, root := range roots {
		resolvedRoot, err := resolvePathLoose(root)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[resolvedRoot]; ok {
			continue
		}
		seen[resolvedRoot] = struct{}{}
		unique = append(unique, resolvedRoot)
	}
	return unique, nil
}

func resolveEnvPathLoose(envVar string, fallback string) string {
	if rawValue := strings.TrimSpace(os.Getenv(envVar)); rawValue != "" {
		if resolved, err := resolvePathLoose(rawValue); err == nil {
			return resolved
		}
	}
	resolved, err := resolvePathLoose(fallback)
	if err != nil {
		return filepath.Clean(fallback)
	}
	return resolved
}

func resolveArtifactOwnershipToken(metadata *LauncherInstallMetadata) (string, error) {
	if metadata != nil {
		return metadata.ArtifactOwnershipToken, nil
	}
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func launcherMetadataLastUsedWorkspace(metadata *LauncherInstallMetadata) *string {
	if metadata == nil {
		return nil
	}
	return cloneStringPointer(metadata.LastUsedWorkspace)
}

func cloneStringMap(value map[string]string) map[string]string {
	if value == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(value))
	for key, entry := range value {
		cloned[key] = entry
	}
	return cloned
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func boolPointer(value bool) *bool {
	return &value
}

func mapPointer(value map[string]string) *map[string]string {
	return &value
}

func formatLauncherCommandFailure(result launcherCommandResult) string {
	detail := strings.TrimSpace(result.Stderr)
	if detail == "" {
		detail = strings.TrimSpace(result.Stdout)
	}
	if detail == "" {
		detail = fmt.Sprintf("process exited with status %d", result.ExitCode)
	}
	return detail
}

func defaultLauncherCommandRunner(args []string) (launcherCommandResult, error) {
	if len(args) == 0 {
		return launcherCommandResult{}, fmt.Errorf("missing command")
	}
	cmd := exec.Command(args[0], args[1:]...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err == nil {
		return launcherCommandResult{ExitCode: 0, Stdout: stdout.String(), Stderr: stderr.String()}, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return launcherCommandResult{
			ExitCode: exitErr.ExitCode(),
			Stdout:   stdout.String(),
			Stderr:   stderr.String(),
		}, nil
	}
	return launcherCommandResult{}, err
}

func resolveSettaExecutable(binDir string) (string, error) {
	resolvedBinDir, err := resolvePathLoose(binDir)
	if err != nil {
		return "", fmt.Errorf("Could not resolve Setta executable directory %s: %v", binDir, err)
	}
	candidates := []string{"setta"}
	if runtime.GOOS == "windows" {
		for _, extension := range launcherExecutableExtensions() {
			candidates = append(candidates, "setta"+extension)
		}
	}
	for _, candidate := range candidates {
		path := filepath.Join(resolvedBinDir, candidate)
		info, err := os.Stat(path)
		if err != nil || info == nil || !info.Mode().IsRegular() {
			continue
		}
		if !launcherTargetInvokable(path, info.Mode()) {
			continue
		}
		resolvedPath, resolveErr := resolvePathLoose(path)
		if resolveErr != nil {
			continue
		}
		return resolvedPath, nil
	}
	return "", fmt.Errorf("Could not find Setta executable under %s.", resolvedBinDir)
}

func launcherExecutableExtensions() []string {
	if runtime.GOOS != "windows" {
		return nil
	}
	rawExtensions := strings.TrimSpace(os.Getenv("PATHEXT"))
	if rawExtensions == "" {
		return []string{".exe", ".bat", ".cmd", ".com", ".ps1"}
	}
	extensions := make([]string, 0)
	for _, rawExtension := range strings.Split(rawExtensions, ";") {
		trimmed := strings.ToLower(strings.TrimSpace(rawExtension))
		if trimmed == "" {
			continue
		}
		extensions = append(extensions, trimmed)
	}
	if len(extensions) == 0 {
		return []string{".exe", ".bat", ".cmd", ".com", ".ps1"}
	}
	return extensions
}

func currentSettaVersion() string {
	buildInfo, ok := debug.ReadBuildInfo()
	if ok {
		version := strings.TrimSpace(buildInfo.Main.Version)
		if version != "" {
			return version
		}
	}
	return "dev"
}

func (m *LauncherInstallMetadata) SettaVersionPointer() *string {
	if m == nil {
		return nil
	}
	return &m.SettaVersion
}
