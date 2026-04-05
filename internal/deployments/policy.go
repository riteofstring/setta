package deployments

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

var (
	ErrPolicyRunSnapshotModeInvalid         = errors.New("deployment run snapshot mode is invalid")
	ErrDeploymentRunSnapshotModeNeverDenied = errors.New("deployment run snapshot mode never is unsupported")
)

type RunSnapshotMode string

const (
	RunSnapshotModeEphemeral RunSnapshotMode = "ephemeral"
	RunSnapshotModeAlways    RunSnapshotMode = "always"
	RunSnapshotModeNever     RunSnapshotMode = "never"
)

type Policy struct {
	AllowParamChanges   bool            `json:"allowParamChanges"`
	AllowVariantChanges bool            `json:"allowVariantChanges"`
	AllowLayoutChanges  bool            `json:"allowLayoutChanges"`
	AllowRun            bool            `json:"allowRun"`
	AllowLLM            bool            `json:"allowLLM"`
	AllowExternalLinks  bool            `json:"allowExternalLinks"`
	AllowFileDownloads  bool            `json:"allowFileDownloads"`
	AllowMultipleRuns   bool            `json:"allowMultipleRuns"`
	RunSnapshotMode     RunSnapshotMode `json:"runSnapshotMode"`
}

func DefaultPolicy() Policy {
	return Policy{
		AllowParamChanges:   true,
		AllowVariantChanges: true,
		AllowLayoutChanges:  true,
		AllowRun:            false,
		AllowLLM:            false,
		AllowExternalLinks:  false,
		AllowFileDownloads:  false,
		AllowMultipleRuns:   true,
		RunSnapshotMode:     RunSnapshotModeEphemeral,
	}
}

func FrontendDefaultPolicy() Policy {
	return DefaultPolicy()
}

func DefaultAppPolicy() Policy {
	return Policy{
		AllowParamChanges:   true,
		AllowVariantChanges: false,
		AllowLayoutChanges:  false,
		AllowRun:            true,
		AllowLLM:            false,
		AllowExternalLinks:  false,
		AllowFileDownloads:  false,
		AllowMultipleRuns:   true,
		RunSnapshotMode:     RunSnapshotModeEphemeral,
	}
}

func LoadPolicy(deploymentRoot string) (Policy, error) {
	resolvedRoot, err := statefs.NormalizePath(deploymentRoot, "")
	if err != nil {
		return Policy{}, fmt.Errorf("resolve deployment root: %w", err)
	}

	content, err := os.ReadFile(filepath.Join(resolvedRoot, "policy.json"))
	if err != nil {
		return Policy{}, fmt.Errorf("read deployment policy: %w", err)
	}

	policy := DefaultPolicy()
	if err := json.Unmarshal(content, &policy); err != nil {
		return Policy{}, fmt.Errorf("decode deployment policy: %w", err)
	}
	return policy.Normalized()
}

func (p Policy) Normalized() (Policy, error) {
	normalized := p
	normalized.RunSnapshotMode = RunSnapshotMode(strings.TrimSpace(string(normalized.RunSnapshotMode)))
	switch normalized.RunSnapshotMode {
	case "":
		normalized.RunSnapshotMode = RunSnapshotModeEphemeral
	case RunSnapshotModeEphemeral, RunSnapshotModeAlways:
	case RunSnapshotModeNever:
		return Policy{}, ErrDeploymentRunSnapshotModeNeverDenied
	default:
		return Policy{}, fmt.Errorf("%w: %q", ErrPolicyRunSnapshotModeInvalid, normalized.RunSnapshotMode)
	}
	return normalized, nil
}
