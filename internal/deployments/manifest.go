package deployments

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

var (
	ErrManifestVersionRequired     = errors.New("deployment manifest version is required")
	ErrDeploymentNameRequired      = errors.New("deployment name is required")
	ErrDeploymentTypeRequired      = errors.New("deployment type is required")
	ErrUnsupportedDeploymentType   = errors.New("unsupported deployment type")
	ErrDefaultProjectIDRequired    = errors.New("deployment default project id is required")
	ErrDeploymentVersionRequired   = errors.New("deployment version is required")
	ErrListenerEntrypointRequired  = errors.New("deployment listener entrypoint is required")
	ErrCreatedAtInvalid            = errors.New("deployment createdAt timestamp is invalid")
	ErrManifestDefaultProjectMatch = errors.New("deployment manifest default project id was not found in project document")
)

type Type string

const (
	TypeShare Type = "share"
	TypeApp   Type = "app"
)

type ListenerConfig struct {
	Entrypoint string `json:"entrypoint"`
	Enabled    bool   `json:"enabled"`
}

type Manifest struct {
	Version           int             `json:"version"`
	DeploymentName    string          `json:"deploymentName"`
	DeploymentType    Type            `json:"deploymentType"`
	DefaultProjectID  string          `json:"defaultProjectConfigId"`
	DeploymentVersion string          `json:"deploymentVersion"`
	CreatedAt         time.Time       `json:"createdAt,omitempty"`
	Listener          *ListenerConfig `json:"listener,omitempty"`
}

type rawManifest struct {
	Version           int               `json:"version"`
	DeploymentName    string            `json:"deploymentName"`
	DeploymentType    string            `json:"deploymentType"`
	DefaultProjectID  string            `json:"defaultProjectConfigId"`
	DeploymentVersion string            `json:"deploymentVersion"`
	CreatedAt         string            `json:"createdAt"`
	Listener          *rawListenerEntry `json:"listener"`
}

type rawListenerEntry struct {
	Entrypoint string `json:"entrypoint"`
	Enabled    *bool  `json:"enabled"`
}

func LoadManifest(deploymentRoot string) (Manifest, error) {
	resolvedRoot, err := statefs.NormalizePath(deploymentRoot, "")
	if err != nil {
		return Manifest{}, fmt.Errorf("resolve deployment root: %w", err)
	}

	content, err := os.ReadFile(filepath.Join(resolvedRoot, "manifest.json"))
	if err != nil {
		return Manifest{}, fmt.Errorf("read deployment manifest: %w", err)
	}

	var raw rawManifest
	if err := json.Unmarshal(content, &raw); err != nil {
		return Manifest{}, fmt.Errorf("decode deployment manifest: %w", err)
	}

	manifest := Manifest{
		Version:           raw.Version,
		DeploymentName:    raw.DeploymentName,
		DeploymentType:    Type(raw.DeploymentType),
		DefaultProjectID:  raw.DefaultProjectID,
		DeploymentVersion: raw.DeploymentVersion,
	}
	if strings.TrimSpace(raw.CreatedAt) != "" {
		createdAt, err := time.Parse(time.RFC3339Nano, raw.CreatedAt)
		if err != nil {
			return Manifest{}, fmt.Errorf("%w: %q", ErrCreatedAtInvalid, raw.CreatedAt)
		}
		manifest.CreatedAt = createdAt.UTC()
	}
	if raw.Listener != nil {
		enabled := true
		if raw.Listener.Enabled != nil {
			enabled = *raw.Listener.Enabled
		}
		manifest.Listener = &ListenerConfig{
			Entrypoint: raw.Listener.Entrypoint,
			Enabled:    enabled,
		}
	}

	return manifest.Normalized()
}

func (m Manifest) Normalized() (Manifest, error) {
	normalized := m
	normalized.DeploymentName = strings.TrimSpace(normalized.DeploymentName)
	normalized.DefaultProjectID = strings.TrimSpace(normalized.DefaultProjectID)
	normalized.DeploymentVersion = strings.TrimSpace(normalized.DeploymentVersion)

	if normalized.Version < 1 {
		return Manifest{}, ErrManifestVersionRequired
	}
	if normalized.DeploymentName == "" {
		return Manifest{}, ErrDeploymentNameRequired
	}
	switch normalized.DeploymentType {
	case TypeShare, TypeApp:
	case "":
		return Manifest{}, ErrDeploymentTypeRequired
	default:
		return Manifest{}, fmt.Errorf("%w: %q", ErrUnsupportedDeploymentType, normalized.DeploymentType)
	}
	if normalized.DefaultProjectID == "" {
		return Manifest{}, ErrDefaultProjectIDRequired
	}
	if normalized.DeploymentVersion == "" {
		return Manifest{}, ErrDeploymentVersionRequired
	}
	if normalized.Listener != nil {
		normalized.Listener = &ListenerConfig{
			Entrypoint: strings.TrimSpace(normalized.Listener.Entrypoint),
			Enabled:    normalized.Listener.Enabled,
		}
		if normalized.Listener.Entrypoint == "" {
			return Manifest{}, ErrListenerEntrypointRequired
		}
	}
	return normalized, nil
}

func applyManifestDefaultProject(document projectstate.Document, manifest Manifest) (projectstate.Document, error) {
	normalized := document.Clone()
	normalized.DefaultProjectID = manifest.DefaultProjectID
	if _, err := normalized.ProjectByID(manifest.DefaultProjectID); err != nil {
		return projectstate.Document{}, fmt.Errorf("%w: %q", ErrManifestDefaultProjectMatch, manifest.DefaultProjectID)
	}
	return normalized, nil
}
