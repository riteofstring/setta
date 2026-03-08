package launcher

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const launcherMetadataFileName = "launcher-install.json"

type launcherInstallMetadata struct {
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

func updateLauncherLastUsedWorkspaceIfInstalled(settaHome string, workspaceRoot string) error {
	metadataPath, err := resolveLauncherMetadataPath(settaHome)
	if err != nil {
		return err
	}
	metadataBytes, err := os.ReadFile(metadataPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read launcher metadata: %w", err)
	}

	var metadata launcherInstallMetadata
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return fmt.Errorf("decode launcher metadata: %w", err)
	}
	resolvedWorkspaceRoot, err := resolvePathLoose(workspaceRoot)
	if err != nil {
		return err
	}
	metadata.LastUsedWorkspace = stringPointer(resolvedWorkspaceRoot)

	nextBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("encode launcher metadata: %w", err)
	}
	nextBytes = append(nextBytes, '\n')
	if err := statefs.AtomicWriteFile(metadataPath, nextBytes, 0o644); err != nil {
		return fmt.Errorf("write launcher metadata: %w", err)
	}
	return nil
}

func stringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
