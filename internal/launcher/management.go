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
	"sort"
	"strings"

	"setta/internal/buildinfo"
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

type launcherSetupState struct {
	settaHome                string
	existingMetadata         *LauncherInstallMetadata
	existingManagedArtifacts map[string]string
}

type launcherManagementState struct {
	settaHome        string
	launcherDir      string
	metadataPath     string
	metadata         *LauncherInstallMetadata
	managedArtifacts map[string]string
}

type launcherSetupPlan struct {
	launcherSetupState
	installArtifacts  bool
	channel           string
	installSource     LauncherInstallSource
	openMode          LauncherOpenMode
	workspaceBehavior LauncherWorkspaceBehavior
	artifactOptions   map[string]string
	targetCommand     []string
	ownershipToken    string
}

type launcherSetupArtifacts struct {
	mergedArtifacts           map[string]string
	removalCandidates         map[string]string
	metadataCleanupCandidates map[string]string
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
	state, err := loadLauncherManagementState(settaHome)
	if err != nil {
		return LauncherStatusSnapshot{}, err
	}
	if state.metadata == nil {
		return buildLauncherNotInstalledStatus(state), nil
	}
	return buildLauncherInstalledStatus(state), nil
}

func (s *ManagementService) Setup(settaHome string, input LauncherSetupInput) (LauncherSetupResult, error) {
	setupPlan, err := s.buildLauncherSetupPlan(settaHome, input)
	if err != nil {
		return LauncherSetupResult{}, err
	}
	setupArtifacts, err := s.prepareLauncherSetupArtifacts(setupPlan)
	if err != nil {
		return LauncherSetupResult{}, err
	}
	if err := validateLauncherSetupArtifactRemoval(setupArtifacts.removalCandidates, setupPlan.ownershipToken); err != nil {
		return LauncherSetupResult{}, err
	}
	metadata, err := s.buildLauncherSetupMetadata(setupPlan, setupArtifacts)
	if err != nil {
		return LauncherSetupResult{}, err
	}
	metadataPath, err := writeLauncherSetupMetadata(setupPlan.settaHome, metadata, setupArtifacts.metadataCleanupCandidates)
	if err != nil {
		return LauncherSetupResult{}, err
	}
	launcherDir, err := resolveLauncherDir(setupPlan.settaHome)
	if err != nil {
		return LauncherSetupResult{}, err
	}
	if err := finalizeLauncherSetupRemoval(setupArtifacts.removalCandidates, setupPlan.ownershipToken); err != nil {
		return LauncherSetupResult{}, err
	}

	return LauncherSetupResult{
		SettaHome:    setupPlan.settaHome,
		MetadataPath: metadataPath,
		LauncherDir:  launcherDir,
		Metadata:     metadata,
	}, nil
}

func loadLauncherSetupState(settaHome string) (launcherSetupState, error) {
	state, err := loadLauncherManagementState(settaHome)
	if err != nil {
		return launcherSetupState{}, err
	}
	return launcherSetupState{
		settaHome:                state.settaHome,
		existingMetadata:         state.metadata,
		existingManagedArtifacts: cloneStringMap(state.managedArtifacts),
	}, nil
}

func (s *ManagementService) buildLauncherSetupPlan(settaHome string, input LauncherSetupInput) (launcherSetupPlan, error) {
	setupState, err := loadLauncherSetupState(settaHome)
	if err != nil {
		return launcherSetupPlan{}, err
	}
	channel, err := resolveLauncherSetupChannel(input.Channel, setupState.existingMetadata)
	if err != nil {
		return launcherSetupPlan{}, err
	}
	artifactOptions, err := resolveLauncherSetupArtifactOptions(input.ArtifactOptions, setupState.existingMetadata, setupState.settaHome)
	if err != nil {
		return launcherSetupPlan{}, err
	}
	ownershipToken, err := resolveArtifactOwnershipToken(setupState.existingMetadata)
	if err != nil {
		return launcherSetupPlan{}, &LauncherSetupError{Code: "InternalError", Message: "Internal Server Error"}
	}
	targetCommand := input.TargetCommand
	if len(targetCommand) == 0 {
		targetCommand = s.ResolveTargetCommand()
	}
	return launcherSetupPlan{
		launcherSetupState: setupState,
		installArtifacts:   resolveLauncherSetupInstallArtifacts(input.InstallArtifacts, setupState.existingManagedArtifacts),
		channel:            channel,
		installSource:      resolveLauncherSetupInstallSource(input.InstallSource, setupState.existingMetadata),
		openMode:           resolveLauncherSetupOpenMode(input.OpenMode, setupState.existingMetadata),
		workspaceBehavior:  resolveLauncherSetupWorkspaceBehavior(input.WorkspaceBehavior, setupState.existingMetadata),
		artifactOptions:    artifactOptions,
		targetCommand:      targetCommand,
		ownershipToken:     ownershipToken,
	}, nil
}

func resolveLauncherSetupInstallArtifacts(input *bool, existingManagedArtifacts map[string]string) bool {
	switch {
	case input != nil:
		return *input
	case len(existingManagedArtifacts) > 0:
		return true
	default:
		return false
	}
}

func resolveLauncherSetupChannel(input *string, existingMetadata *LauncherInstallMetadata) (string, error) {
	channel := "manual"
	if existingMetadata != nil {
		channel = existingMetadata.Channel
	}
	if input == nil {
		return channel, nil
	}
	channel = strings.TrimSpace(*input)
	if channel == "" {
		return "", &LauncherSetupError{Code: "BadRequest", Message: "channel must be non-empty."}
	}
	return channel, nil
}

func resolveLauncherSetupInstallSource(input *LauncherInstallSource, existingMetadata *LauncherInstallMetadata) LauncherInstallSource {
	if input != nil {
		return *input
	}
	if existingMetadata != nil {
		return LauncherInstallSource(existingMetadata.InstallSource)
	}
	return LauncherInstallSourceUnsupported
}

func resolveLauncherSetupOpenMode(input *LauncherOpenMode, existingMetadata *LauncherInstallMetadata) LauncherOpenMode {
	if input != nil {
		return *input
	}
	if existingMetadata != nil {
		return LauncherOpenMode(existingMetadata.OpenMode)
	}
	return LauncherOpenModeChromeApp
}

func resolveLauncherSetupWorkspaceBehavior(input *LauncherWorkspaceBehavior, existingMetadata *LauncherInstallMetadata) LauncherWorkspaceBehavior {
	if input != nil {
		return *input
	}
	if existingMetadata != nil {
		return LauncherWorkspaceBehavior(existingMetadata.WorkspaceBehavior)
	}
	return LauncherWorkspaceBehaviorDefault
}

func resolveLauncherSetupArtifactOptions(input *map[string]string, existingMetadata *LauncherInstallMetadata, settaHome string) (map[string]string, error) {
	artifactOptions := map[string]string{}
	switch {
	case input != nil:
		artifactOptions = cloneStringMap(*input)
	case existingMetadata != nil:
		artifactOptions = cloneStringMap(existingMetadata.ArtifactOptions)
	}
	artifactOptions, err := normalizeLauncherArtifactOptions(artifactOptions)
	if err != nil {
		return nil, wrapLauncherSetupMetadataError("BadRequest", err)
	}
	if err := validateArtifactOptionPaths(artifactOptions, settaHome); err != nil {
		return nil, err
	}
	return artifactOptions, nil
}

func (s *ManagementService) prepareLauncherSetupArtifacts(plan launcherSetupPlan) (launcherSetupArtifacts, error) {
	artifacts := launcherSetupArtifacts{
		mergedArtifacts:           cloneStringMap(plan.existingManagedArtifacts),
		removalCandidates:         map[string]string{},
		metadataCleanupCandidates: map[string]string{},
	}
	if !plan.installArtifacts {
		artifacts.removalCandidates = computeReplacedOrRemovedArtifacts(plan.existingManagedArtifacts, map[string]string{})
		return artifacts, nil
	}

	artifactContext := launcherArtifactContext{
		TargetCommand:            append([]string(nil), plan.targetCommand...),
		SettaHome:                plan.settaHome,
		ExistingManagedArtifacts: cloneStringMap(artifacts.mergedArtifacts),
		Options:                  cloneStringMap(plan.artifactOptions),
	}
	plannedArtifacts, err := planCurrentPlatformArtifactPaths(artifactContext)
	if err != nil {
		return launcherSetupArtifacts{}, wrapLauncherSetupArtifactBadRequest(err)
	}
	if err := validatePlannedArtifactPaths(plannedArtifacts, plan.settaHome); err != nil {
		return launcherSetupArtifacts{}, err
	}

	artifacts.removalCandidates = computeReplacedOrRemovedArtifacts(plan.existingManagedArtifacts, cloneStringMap(plannedArtifacts))
	installedArtifacts, err := installCurrentPlatformArtifacts(artifactContext)
	if err != nil {
		return launcherSetupArtifacts{}, wrapLauncherSetupArtifactInstallError(err)
	}
	artifacts.mergedArtifacts, err = validateManagedArtifactRegistry(installedArtifacts, plan.settaHome, "ArtifactInstallFailed")
	if err != nil {
		return launcherSetupArtifacts{}, err
	}
	artifacts.metadataCleanupCandidates = computeNewOrReplacedArtifacts(plan.existingManagedArtifacts, artifacts.mergedArtifacts)
	if err := writeArtifactOwnershipMarkers(artifacts.mergedArtifacts, plan.ownershipToken); err != nil {
		cleanupArtifactsAfterFailedMetadataWrite(artifacts.metadataCleanupCandidates)
		return launcherSetupArtifacts{}, err
	}
	return artifacts, nil
}

func validateLauncherSetupArtifactRemoval(removalCandidates map[string]string, ownershipToken string) error {
	if markerErrors := validateOwnedArtifactsBeforeRemoval(removalCandidates, ownershipToken); len(markerErrors) > 0 {
		return &LauncherSetupError{
			Code:    "ArtifactRemovalFailed",
			Message: strings.Join(markerErrors, "; "),
		}
	}
	return nil
}

func (s *ManagementService) buildLauncherSetupMetadata(plan launcherSetupPlan, artifacts launcherSetupArtifacts) (LauncherInstallMetadata, error) {
	metadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          plan.targetCommand,
		Channel:                plan.channel,
		InstallSource:          plan.installSource,
		ArtifactOwnershipToken: plan.ownershipToken,
		SettaVersion:           s.version,
		SettaHome:              plan.settaHome,
		OpenMode:               plan.openMode,
		WorkspaceBehavior:      plan.workspaceBehavior,
		LastUsedWorkspace:      launcherMetadataLastUsedWorkspace(plan.existingMetadata),
		ArtifactOptions:        plan.artifactOptions,
		ManagedArtifacts:       artifacts.mergedArtifacts,
	})
	if err != nil {
		cleanupArtifactsAfterFailedMetadataWrite(artifacts.metadataCleanupCandidates)
		return LauncherInstallMetadata{}, wrapLauncherSetupMetadataError("BadRequest", err)
	}
	return metadata, nil
}

func writeLauncherSetupMetadata(settaHome string, metadata LauncherInstallMetadata, cleanupCandidates map[string]string) (string, error) {
	metadataPath, err := WriteLauncherInstallMetadata(settaHome, metadata)
	if err != nil {
		cleanupArtifactsAfterFailedMetadataWrite(cleanupCandidates)
		return "", &LauncherSetupError{
			Code:    "LauncherMetadata",
			Message: fmt.Sprintf("Failed to write launcher metadata: %v", err),
		}
	}
	return metadataPath, nil
}

func finalizeLauncherSetupRemoval(removalCandidates map[string]string, ownershipToken string) error {
	if len(removalCandidates) == 0 {
		return nil
	}
	removalResult := removeOwnedArtifacts(removalCandidates, ownershipToken)
	if len(removalResult.Errors) > 0 {
		return &LauncherSetupError{
			Code:    "ArtifactRemovalFailed",
			Message: strings.Join(removalResult.Errors, "; "),
		}
	}
	return nil
}

func wrapLauncherSetupMetadataError(code string, err error) error {
	var metadataErr *LauncherMetadataError
	if errors.As(err, &metadataErr) {
		return &LauncherSetupError{Code: code, Message: metadataErr.Error()}
	}
	return err
}

func wrapLauncherSetupArtifactBadRequest(err error) error {
	var artifactErr *LauncherArtifactError
	if errors.As(err, &artifactErr) {
		return &LauncherSetupError{Code: "BadRequest", Message: artifactErr.Error()}
	}
	return err
}

func wrapLauncherSetupArtifactInstallError(err error) error {
	var artifactErr *LauncherArtifactError
	if errors.As(err, &artifactErr) {
		return &LauncherSetupError{Code: "ArtifactInstallFailed", Message: artifactErr.Error()}
	}
	return &LauncherSetupError{Code: "ArtifactInstallFailed", Message: err.Error()}
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

	if _, err := s.Setup(settaHome, launcherSetupInputFromMetadata(status.Metadata, nil)); err != nil {
		return LauncherStatusSnapshot{}, err
	}
	return s.CollectStatus(settaHome)
}

func (s *ManagementService) Remove(settaHome string) (LauncherRemoveResult, error) {
	state, err := loadLauncherManagementState(settaHome)
	if err != nil {
		return LauncherRemoveResult{}, err
	}
	if state.metadata != nil && len(state.managedArtifacts) > 0 {
		removedPaths, missingPaths, err := removeLauncherManagedArtifacts(state.managedArtifacts, state.metadata.ArtifactOwnershipToken)
		if err != nil {
			return LauncherRemoveResult{}, err
		}
		return finalizeLauncherRemoval(state, removedPaths, missingPaths)
	}
	return finalizeLauncherRemoval(state, nil, nil)
}

func (s *ManagementService) Update(settaHome string, packageSpec string) (LauncherUpdateResult, error) {
	status, err := s.CollectStatus(settaHome)
	if err != nil {
		return LauncherUpdateResult{}, err
	}
	if err := validateLauncherUpdateStatus(status); err != nil {
		return LauncherUpdateResult{}, err
	}
	normalizedPackageSpec, err := normalizeLauncherUpdatePackageSpec(packageSpec)
	if err != nil {
		return LauncherUpdateResult{}, err
	}
	settaExecutable, err := s.installUpdatedLauncher(normalizedPackageSpec)
	if err != nil {
		return LauncherUpdateResult{}, err
	}
	if _, err := s.Setup(settaHome, launcherSetupInputFromMetadata(status.Metadata, []string{settaExecutable})); err != nil {
		return LauncherUpdateResult{}, err
	}
	nextStatus, err := s.CollectStatus(settaHome)
	if err != nil {
		return LauncherUpdateResult{}, err
	}
	return buildLauncherUpdateResult(normalizedPackageSpec, status, nextStatus), nil
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

func loadLauncherManagementState(settaHome string) (launcherManagementState, error) {
	resolvedSettaHome, err := resolvePathLoose(settaHome)
	if err != nil {
		return launcherManagementState{}, err
	}
	launcherDir, err := resolveLauncherDir(resolvedSettaHome)
	if err != nil {
		return launcherManagementState{}, err
	}
	metadataPath, err := resolveLauncherMetadataPath(resolvedSettaHome)
	if err != nil {
		return launcherManagementState{}, err
	}
	metadata, err := LoadLauncherInstallMetadata(resolvedSettaHome)
	if err != nil {
		return launcherManagementState{}, wrapLauncherSetupMetadataError("LauncherMetadata", err)
	}

	state := launcherManagementState{
		settaHome:        resolvedSettaHome,
		launcherDir:      launcherDir,
		metadataPath:     metadataPath,
		metadata:         metadata,
		managedArtifacts: map[string]string{},
	}
	if metadata == nil {
		return state, nil
	}
	if err := validateMetadataSettaHomeScope(*metadata, resolvedSettaHome, "LauncherMetadata"); err != nil {
		return launcherManagementState{}, err
	}
	managedArtifacts, err := validateManagedArtifactRegistry(metadata.ManagedArtifacts, resolvedSettaHome, "LauncherMetadata")
	if err != nil {
		return launcherManagementState{}, err
	}
	state.managedArtifacts = managedArtifacts
	return state, nil
}

func buildLauncherNotInstalledStatus(state launcherManagementState) LauncherStatusSnapshot {
	guidance := "Launcher is not installed. Run `setta launcher setup` first."
	return LauncherStatusSnapshot{
		SettaHome:                state.settaHome,
		LauncherDir:              state.launcherDir,
		MetadataPath:             state.metadataPath,
		Installed:                false,
		ArtifactOptions:          map[string]string{},
		ManagedArtifacts:         map[string]string{},
		ExistingManagedArtifacts: []string{},
		MissingManagedArtifacts:  []string{},
		UpdateCapability:         LauncherUpdateCapabilityUnsupported,
		UpdateGuidance:           &guidance,
		Metadata:                 nil,
	}
}

func buildLauncherInstalledStatus(state launcherManagementState) LauncherStatusSnapshot {
	metadata := state.metadata
	targetValid, targetError := launcherTargetValidationPointers(*metadata)
	existingManagedArtifacts, missingManagedArtifacts := collectManagedArtifactPresence(state.managedArtifacts)
	updateCapability, updateGuidance := resolveLauncherUpdateCapability(*metadata, state.managedArtifacts)
	channel := metadata.Channel
	settaVersion := metadata.SettaVersion
	openMode := LauncherOpenMode(metadata.OpenMode)
	workspaceBehavior := LauncherWorkspaceBehavior(metadata.WorkspaceBehavior)

	return LauncherStatusSnapshot{
		SettaHome:                state.settaHome,
		LauncherDir:              state.launcherDir,
		MetadataPath:             state.metadataPath,
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
		ManagedArtifacts:         state.managedArtifacts,
		ExistingManagedArtifacts: existingManagedArtifacts,
		MissingManagedArtifacts:  missingManagedArtifacts,
		UpdateCapability:         updateCapability,
		UpdateGuidance:           updateGuidance,
		Metadata:                 metadata,
	}
}

func launcherTargetValidationPointers(metadata LauncherInstallMetadata) (*bool, *string) {
	targetErrorValue := LauncherTargetValidationError(metadata)
	if targetErrorValue == "" {
		return boolPointer(true), nil
	}
	return boolPointer(false), &targetErrorValue
}

func collectManagedArtifactPresence(managedArtifacts map[string]string) ([]string, []string) {
	existingManagedArtifacts := make([]string, 0, len(managedArtifacts))
	missingManagedArtifacts := make([]string, 0, len(managedArtifacts))
	for _, pathString := range managedArtifacts {
		if info, err := os.Stat(pathString); err == nil && info != nil {
			existingManagedArtifacts = append(existingManagedArtifacts, pathString)
			continue
		}
		missingManagedArtifacts = append(missingManagedArtifacts, pathString)
	}
	sort.Strings(existingManagedArtifacts)
	sort.Strings(missingManagedArtifacts)
	return existingManagedArtifacts, missingManagedArtifacts
}

func removeLauncherManagedArtifacts(managedArtifacts map[string]string, ownershipToken string) ([]string, []string, error) {
	removalResult := removeOwnedArtifacts(managedArtifacts, ownershipToken)
	if len(removalResult.Errors) > 0 {
		return nil, nil, &LauncherSetupError{
			Code:    "ArtifactRemovalFailed",
			Message: strings.Join(removalResult.Errors, "; "),
		}
	}
	return append([]string(nil), removalResult.RemovedPaths...), append([]string(nil), removalResult.MissingPaths...), nil
}

func finalizeLauncherRemoval(state launcherManagementState, removedPaths []string, missingPaths []string) (LauncherRemoveResult, error) {
	metadataRemoved, err := RemoveLauncherInstallMetadata(state.settaHome)
	if err != nil {
		return LauncherRemoveResult{}, &LauncherSetupError{
			Code:    "LauncherMetadata",
			Message: fmt.Sprintf("Failed to remove launcher metadata: %v", err),
		}
	}
	removeLauncherDirIfPresent(state.launcherDir)
	return LauncherRemoveResult{
		SettaHome:       state.settaHome,
		MetadataPath:    state.metadataPath,
		MetadataRemoved: metadataRemoved,
		RemovedPaths:    append([]string(nil), removedPaths...),
		MissingPaths:    append([]string(nil), missingPaths...),
	}, nil
}

func removeLauncherDirIfPresent(launcherDir string) {
	if info, err := os.Stat(launcherDir); err == nil && info.IsDir() {
		_ = os.Remove(launcherDir)
	}
}

func validateLauncherUpdateStatus(status LauncherStatusSnapshot) error {
	if !status.Installed || status.Metadata == nil {
		return &LauncherSetupError{
			Code:    "LauncherNotInstalled",
			Message: "Launcher is not installed. Run `setta launcher setup` first.",
		}
	}
	if status.UpdateCapability == LauncherUpdateCapabilityInApp {
		return nil
	}
	guidance := "In-app launcher update is unavailable."
	if status.UpdateGuidance != nil {
		guidance = *status.UpdateGuidance
	}
	return &LauncherSetupError{
		Code:    "UpdateUnavailable",
		Message: guidance,
	}
}

func normalizeLauncherUpdatePackageSpec(packageSpec string) (string, error) {
	normalizedPackageSpec := strings.TrimSpace(packageSpec)
	if normalizedPackageSpec != "" {
		return normalizedPackageSpec, nil
	}
	return "", &LauncherSetupError{
		Code:    "BadRequest",
		Message: "package spec must be non-empty.",
	}
}

func launcherSetupInputFromMetadata(metadata *LauncherInstallMetadata, targetCommand []string) LauncherSetupInput {
	if metadata == nil {
		return LauncherSetupInput{
			TargetCommand: append([]string(nil), targetCommand...),
		}
	}
	channel := metadata.Channel
	installSource := LauncherInstallSource(metadata.InstallSource)
	openMode := LauncherOpenMode(metadata.OpenMode)
	workspaceBehavior := LauncherWorkspaceBehavior(metadata.WorkspaceBehavior)
	installArtifacts := len(metadata.ManagedArtifacts) > 0
	return LauncherSetupInput{
		Channel:           &channel,
		InstallSource:     &installSource,
		OpenMode:          &openMode,
		WorkspaceBehavior: &workspaceBehavior,
		InstallArtifacts:  &installArtifacts,
		ArtifactOptions:   mapPointer(cloneStringMap(metadata.ArtifactOptions)),
		TargetCommand:     append([]string(nil), targetCommand...),
	}
}

func (s *ManagementService) installUpdatedLauncher(packageSpec string) (string, error) {
	uvPath := s.which("uv")
	if uvPath == "" {
		return "", &LauncherSetupError{
			Code:    "MissingDependency",
			Message: "uv is required for in-app update but was not found on PATH.",
		}
	}
	if _, err := s.runLauncherUpdateCommand([]string{uvPath, "tool", "install", "--upgrade", packageSpec}, "uv tool install --upgrade"); err != nil {
		return "", err
	}
	dirResult, err := s.runLauncherUpdateCommand([]string{uvPath, "tool", "dir", "--bin"}, "uv tool dir --bin")
	if err != nil {
		return "", err
	}
	binDir := strings.TrimSpace(dirResult.Stdout)
	if binDir == "" {
		return "", &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: "uv tool dir --bin returned an empty path.",
		}
	}
	settaExecutable, err := resolveSettaExecutable(binDir)
	if err != nil {
		return "", &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: err.Error(),
		}
	}
	return settaExecutable, nil
}

func (s *ManagementService) runLauncherUpdateCommand(args []string, commandDescription string) (launcherCommandResult, error) {
	result, err := s.runCommand(args)
	if err != nil {
		return launcherCommandResult{}, &LauncherSetupError{
			Code:    "UpdateFailed",
			Message: fmt.Sprintf("%s failed: %v", commandDescription, err),
		}
	}
	if result.ExitCode == 0 {
		return result, nil
	}
	return launcherCommandResult{}, &LauncherSetupError{
		Code:    "UpdateFailed",
		Message: fmt.Sprintf("%s failed: %s", commandDescription, formatLauncherCommandFailure(result)),
	}
}

func buildLauncherUpdateResult(packageSpec string, previousStatus LauncherStatusSnapshot, nextStatus LauncherStatusSnapshot) LauncherUpdateResult {
	return LauncherUpdateResult{
		PackageSpec: packageSpec,
		FromVersion: cloneStringPointer(previousStatus.Metadata.SettaVersionPointer()),
		ToVersion:   cloneStringPointer(nextStatus.Metadata.SettaVersionPointer()),
		Status:      nextStatus,
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
	return buildinfo.Version()
}

func (m *LauncherInstallMetadata) SettaVersionPointer() *string {
	if m == nil {
		return nil
	}
	return &m.SettaVersion
}
