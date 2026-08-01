package evalharness

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	phase0SchemaVersion       = 4
	phase0OutcomePass         = "PASS"
	phase0EnvironmentID       = "remote"
	phase0WorkspaceRoot       = "/workspace"
	phase0ContainerUID        = 65532
	phase0ContainerGID        = 65532
	phase0CodexBundleTarget   = "aarch64-unknown-linux-musl"
	phase0CodexBundleVariant  = "codex"
	phase0CodexLayoutVersion  = 1
	phase0ReasoningEffort     = "high"
	phase0DefaultModel        = "gpt-5.6-sol"
	phase0FakeEndpointHost    = "host.docker.internal"
	phase0ImagePlatform       = "linux/arm64"
	phase0MaximumTurnAttempts = 2
	phase0ContainerMemory     = 1024 * 1024 * 1024
	phase0ContainerNanoCPUs   = 2_000_000_000
	phase0ContainerPIDs       = 128
	phase0ContainerTmpfsBytes = 64 * 1024 * 1024
	phase0WorkspaceDiskBytes  = 64 * 1024 * 1024
)

var phase0AllowedEnvironmentNames = []string{
	"CODEX_PERMISSION_PROFILE",
	"CODEX_THREAD_ID",
	"HOME",
	"HOSTNAME",
	"LANG",
	"PATH",
	"SHELL",
}

// Phase0SandboxProbeConfig identifies local, already-installed prerequisites.
// The probe never downloads Codex, starts Docker Desktop, or logs in a user.
type Phase0SandboxProbeConfig struct {
	RepoRoot         string
	CodexLinuxBundle string
	Model            string
	DockerCommand    string
	CodexCommand     string
}

type Phase0SandboxEvidence struct {
	SchemaVersion int                    `json:"schemaVersion"`
	Outcome       string                 `json:"outcome"`
	ProbedAt      time.Time              `json:"probedAt"`
	Topology      Phase0TopologyEvidence `json:"topology"`
	Repository    Phase0RepoEvidence     `json:"repository"`
	Docker        Phase0DockerEvidence   `json:"docker"`
	Codex         Phase0CodexEvidence    `json:"codex"`
	Boundary      Phase0BoundaryEvidence `json:"boundary"`
	Turns         Phase0TurnEvidence     `json:"turns"`
	Teardown      Phase0TeardownEvidence `json:"teardown"`
}

type Phase0TopologyEvidence struct {
	Name                   string `json:"name"`
	HostOwnership          string `json:"hostOwnership"`
	ContainerOwnership     string `json:"containerOwnership"`
	AuthenticationBoundary string `json:"authenticationBoundary"`
	ControlPath            string `json:"controlPath"`
}

type Phase0RepoEvidence struct {
	Commit string `json:"commit"`
	Clean  bool   `json:"clean"`
}

type Phase0DockerEvidence struct {
	ClientVersion string `json:"clientVersion"`
	ServerVersion string `json:"serverVersion"`
	ServerOS      string `json:"serverOS"`
	ServerArch    string `json:"serverArch"`
	CPUs          int    `json:"cpus"`
	MemoryBytes   int64  `json:"memoryBytes"`
}

type Phase0CodexEvidence struct {
	HostVersion   string            `json:"hostVersion"`
	BundleVersion string            `json:"bundleVersion"`
	BundleTarget  string            `json:"bundleTarget"`
	FileSHA256    map[string]string `json:"fileSha256"`
	ImageID       string            `json:"imageId"`
}

type Phase0BoundaryEvidence struct {
	ContainerUser                  string   `json:"containerUser"`
	ReadOnlyRootFilesystem         bool     `json:"readOnlyRootFilesystem"`
	WorkspaceVolumeWritable        bool     `json:"workspaceVolumeWritable"`
	WorkspaceDiskLimitBytes        int64    `json:"workspaceDiskLimitBytes"`
	RootWriteDenied                bool     `json:"rootWriteDenied"`
	HostCanaryVisible              bool     `json:"hostCanaryVisible"`
	InternalNetwork                bool     `json:"internalNetwork"`
	FakeHostEndpointBlocked        bool     `json:"fakeHostEndpointBlocked"`
	ControlTransport               string   `json:"controlTransport"`
	HostControlAddress             string   `json:"hostControlAddress"`
	ContainerStdioAttached         bool     `json:"containerStdioAttached"`
	HostPortPublicationAbsent      bool     `json:"hostPortPublicationAbsent"`
	MountDestinations              []string `json:"mountDestinations"`
	ContainerEnvironmentNames      []string `json:"containerEnvironmentNames"`
	BoundaryHelperEnvironmentNames []string `json:"boundaryHelperEnvironmentNames"`
	ShellEnvironmentPolicyInherit  string   `json:"shellEnvironmentPolicyInherit"`
	ShellEnvironmentPolicySetNames []string `json:"shellEnvironmentPolicySetNames"`
	DroppedCapabilities            []string `json:"droppedCapabilities"`
	NoNewPrivileges                bool     `json:"noNewPrivileges"`
	Privileged                     bool     `json:"privileged"`
	PIDsLimit                      int64    `json:"pidsLimit"`
	MemoryLimitBytes               int64    `json:"memoryLimitBytes"`
	NanoCPUs                       int64    `json:"nanoCpus"`
}

type Phase0TurnEvidence struct {
	ReadOnly       Phase0ModelTurnEvidence `json:"readOnly"`
	WorkspaceWrite Phase0ModelTurnEvidence `json:"workspaceWrite"`
}

type Phase0ModelTurnEvidence struct {
	Outcome              string `json:"outcome"`
	Attempts             int    `json:"attempts"`
	FixtureTokenMatched  bool   `json:"fixtureTokenMatched"`
	WorkspaceUnchanged   bool   `json:"workspaceUnchanged"`
	OnlyExpectedMutation bool   `json:"onlyExpectedMutation"`
	OutputSHA256         string `json:"outputSha256,omitempty"`
}

type Phase0TeardownEvidence struct {
	HostAppServerStopped bool `json:"hostAppServerStopped"`
	ControlRelayStopped  bool `json:"controlRelayStopped"`
	ContainerRemoved     bool `json:"containerRemoved"`
	VolumeRemoved        bool `json:"volumeRemoved"`
	NetworkRemoved       bool `json:"networkRemoved"`
	ImageTagRemoved      bool `json:"imageTagRemoved"`
	HostCanaryRemoved    bool `json:"hostCanaryRemoved"`
}

type phase0ProbeConfig struct {
	repoRoot         string
	codexLinuxBundle string
	model            string
	dockerCommand    string
	codexCommand     string
}

func normalizePhase0Config(config Phase0SandboxProbeConfig) (phase0ProbeConfig, error) {
	repoRoot := strings.TrimSpace(config.RepoRoot)
	if repoRoot == "" {
		var err error
		repoRoot, err = os.Getwd()
		if err != nil {
			return phase0ProbeConfig{}, fmt.Errorf("find repository root: %w", err)
		}
	}
	repoRoot, err := filepath.Abs(repoRoot)
	if err != nil {
		return phase0ProbeConfig{}, fmt.Errorf("resolve repository root: %w", err)
	}
	bundle := strings.TrimSpace(config.CodexLinuxBundle)
	if bundle == "" {
		return phase0ProbeConfig{}, errors.New("--codex-linux-bundle is required; the probe never downloads Codex")
	}
	bundle, err = filepath.EvalSymlinks(bundle)
	if err != nil {
		return phase0ProbeConfig{}, fmt.Errorf("resolve Codex Linux bundle: %w", err)
	}
	model := strings.TrimSpace(config.Model)
	if model == "" {
		model = phase0DefaultModel
	}
	dockerCommand := strings.TrimSpace(config.DockerCommand)
	if dockerCommand == "" {
		dockerCommand = "docker"
	}
	codexCommand := strings.TrimSpace(config.CodexCommand)
	if codexCommand == "" {
		codexCommand = "codex"
	}
	if runtime.GOOS != "darwin" || runtime.GOARCH != "arm64" {
		return phase0ProbeConfig{}, fmt.Errorf(
			"Phase 0 requires the target darwin/arm64 MacBook, found %s/%s",
			runtime.GOOS,
			runtime.GOARCH,
		)
	}
	return phase0ProbeConfig{
		repoRoot:         repoRoot,
		codexLinuxBundle: bundle,
		model:            model,
		dockerCommand:    dockerCommand,
		codexCommand:     codexCommand,
	}, nil
}

func validateEnvironmentNames(actual []string) error {
	allowed := make(map[string]struct{}, len(phase0AllowedEnvironmentNames))
	for _, name := range phase0AllowedEnvironmentNames {
		allowed[name] = struct{}{}
	}
	for _, name := range actual {
		if _, ok := allowed[name]; !ok {
			return fmt.Errorf("sandbox environment contains non-allowlisted variable %q", name)
		}
	}
	return nil
}

func sortedUnique(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
