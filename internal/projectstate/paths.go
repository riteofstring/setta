package projectstate

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

var ErrSessionIDRequired = errors.New("session id is required")

type DeploymentPathPolicy struct {
	DeploymentRoot  string
	RuntimeRoot     string
	ArtifactsRoot   string
	CodeRoot        string
	JSONSourcesRoot string
	ShareRunsRoot   string
}

func ResolveDeploymentPathPolicy(deploymentRoot string, runtimeRoot string) (DeploymentPathPolicy, error) {
	resolvedDeploymentRoot, err := statefs.NormalizePath(deploymentRoot, "")
	if err != nil {
		return DeploymentPathPolicy{}, fmt.Errorf("resolve deployment root: %w", err)
	}
	resolvedRuntimeRoot, err := statefs.NormalizePath(runtimeRoot, "")
	if err != nil {
		return DeploymentPathPolicy{}, fmt.Errorf("resolve runtime root: %w", err)
	}

	return DeploymentPathPolicy{
		DeploymentRoot:  resolvedDeploymentRoot,
		RuntimeRoot:     resolvedRuntimeRoot,
		ArtifactsRoot:   filepath.Join(resolvedDeploymentRoot, "artifacts"),
		CodeRoot:        filepath.Join(resolvedDeploymentRoot, "code"),
		JSONSourcesRoot: filepath.Join(resolvedDeploymentRoot, "json_sources"),
		ShareRunsRoot:   filepath.Join(resolvedRuntimeRoot, "share_runs"),
	}, nil
}

func (p DeploymentPathPolicy) ResolveArtifactPath(raw string) (string, error) {
	return statefs.ResolveWithinRoot(p.ArtifactsRoot, raw, "artifact path")
}

func (p DeploymentPathPolicy) ResolveCodePath(raw string) (string, error) {
	return statefs.ResolveWithinRoot(p.CodeRoot, raw, "code path")
}

func (p DeploymentPathPolicy) ResolveJSONSourcePath(raw string) (string, error) {
	return statefs.ResolveWithinRoot(p.JSONSourcesRoot, raw, "json source path")
}

func (p DeploymentPathPolicy) ResolveDeploymentPath(raw string) (string, error) {
	return statefs.ResolveWithinRoot(p.DeploymentRoot, raw, "deployment path")
}

func (p DeploymentPathPolicy) SessionRunRoot(sessionID string) (string, error) {
	trimmedID := strings.TrimSpace(sessionID)
	if trimmedID == "" {
		return "", ErrSessionIDRequired
	}
	return statefs.ResolveWithinRoot(p.ShareRunsRoot, trimmedID, "session run path")
}

func (p DeploymentPathPolicy) ResolveSessionRunPath(sessionID string, raw string) (string, error) {
	sessionRoot, err := p.SessionRunRoot(sessionID)
	if err != nil {
		return "", err
	}
	return statefs.ResolveWithinRoot(sessionRoot, raw, "session run file path")
}
