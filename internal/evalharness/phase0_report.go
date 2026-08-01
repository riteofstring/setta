package evalharness

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"setta/internal/jsonio"
)

const (
	Phase0SandboxReportRelativePath = "docs/reports/live-ai-eval-sandbox-phase0.md"
	phase0SandboxReportMaxBytes     = 128 * 1024
	phase0ReportEvidenceStart       = "<!-- setta-eval-phase0-evidence:v5 -->\n```json\n"
	phase0ReportEvidenceEnd         = "```\n<!-- /setta-eval-phase0-evidence -->"
	phase0PlanPassMarker            = "### Phase 0 resolution\n\n**Outcome:** `PASS`"
)

var phase0EvidenceFileNames = []string{
	"Dockerfile",
	"bwrap",
	"codex",
	"control-relay",
	"rg",
	"sandbox-helper",
	"zsh",
}

type phase0BoundaryInvariants struct {
	ContainerUser           string
	ReadOnlyRootFilesystem  bool
	WorkspaceVolumeWritable bool
	WorkspaceDiskLimitBytes int64
	RootWriteDenied         bool
	HostCanaryVisible       bool
	InternalNetwork         bool
	FakeHostEndpointBlocked bool
	ContainerStdioAttached  bool
	HostPortPublicationFree bool
	NoNewPrivileges         bool
	Privileged              bool
	PIDsLimit               int64
	MemoryLimitBytes        int64
	NanoCPUs                int64
}

type phase0TurnInvariants struct {
	Outcome              string
	FixtureTokenMatched  bool
	WorkspaceUnchanged   bool
	OnlyExpectedMutation bool
}

// ValidatePhase0SandboxEvidence is the proof boundary shared by the live probe,
// its committed report, and the Phase 1 execution gate.
func ValidatePhase0SandboxEvidence(evidence Phase0SandboxEvidence) error {
	if evidence.SchemaVersion != phase0SchemaVersion {
		return fmt.Errorf("Phase 0 evidence schemaVersion is %d, want %d", evidence.SchemaVersion, phase0SchemaVersion)
	}
	if evidence.Outcome != phase0OutcomePass {
		return fmt.Errorf("Phase 0 evidence outcome is %q, want %q", evidence.Outcome, phase0OutcomePass)
	}
	if evidence.ProbedAt.IsZero() {
		return errors.New("Phase 0 evidence probedAt is required")
	}
	if _, offset := evidence.ProbedAt.Zone(); offset != 0 {
		return errors.New("Phase 0 evidence probedAt must use UTC")
	}
	if err := validatePhase0TopologyEvidence(evidence.Topology); err != nil {
		return err
	}
	if err := validatePhase0RepositoryEvidence(evidence.Repository); err != nil {
		return err
	}
	if err := validatePhase0DockerEvidence(evidence.Docker); err != nil {
		return err
	}
	if err := validatePhase0ProofCodexEvidence(evidence.Codex); err != nil {
		return err
	}
	if err := validatePhase0BoundaryEvidence(evidence.Boundary); err != nil {
		return err
	}
	if err := validatePhase0TurnEvidence(evidence.Turns); err != nil {
		return err
	}
	return validatePhase0TeardownEvidence(evidence.Teardown)
}

func validatePhase0ProofCodexEvidence(evidence Phase0CodexEvidence) error {
	if err := validatePhase0CodexEvidence(evidence); err != nil {
		return err
	}
	return validatePhase0ReleaseAgentEvidence(evidence)
}

func validatePhase0TopologyEvidence(evidence Phase0TopologyEvidence) error {
	want := phase0TopologyEvidence()
	if !reflect.DeepEqual(evidence, want) {
		return errors.New("Phase 0 evidence does not name the supported host-app-server/container-exec-server topology")
	}
	return nil
}

func validatePhase0RepositoryEvidence(evidence Phase0RepoEvidence) error {
	if !validGitCommit(evidence.Commit) {
		return fmt.Errorf("Phase 0 evidence repository commit %q is invalid", evidence.Commit)
	}
	if !evidence.Clean {
		return errors.New("Phase 0 evidence repository was not clean")
	}
	return nil
}

func validatePhase0DockerEvidence(evidence Phase0DockerEvidence) error {
	if strings.TrimSpace(evidence.ClientVersion) == "" || strings.TrimSpace(evidence.ServerVersion) == "" {
		return errors.New("Phase 0 evidence requires Docker client and server versions")
	}
	if evidence.ServerOS != "linux" || !phase0ARM64(evidence.ServerArch) {
		return fmt.Errorf("Phase 0 evidence Docker server is %s/%s, want linux/arm64", evidence.ServerOS, evidence.ServerArch)
	}
	if evidence.CPUs <= 0 || evidence.MemoryBytes < phase0ContainerMemory {
		return errors.New("Phase 0 evidence Docker server resources are insufficient")
	}
	return nil
}

func validatePhase0CodexEvidence(evidence Phase0CodexEvidence) error {
	if strings.TrimSpace(evidence.HostVersion) == "" || evidence.HostVersion != evidence.BundleVersion {
		return errors.New("Phase 0 evidence requires matching non-empty host and bundle Codex versions")
	}
	if evidence.BundleTarget != phase0CodexBundleTarget {
		return fmt.Errorf("Phase 0 evidence Codex bundle target is %q, want %q", evidence.BundleTarget, phase0CodexBundleTarget)
	}
	if strings.TrimSpace(evidence.Model) == "" || strings.TrimSpace(evidence.ReasoningEffort) == "" {
		return errors.New("Phase 0 evidence requires the exact model and reasoning effort")
	}
	if !validPhase1ImageID(evidence.ImageID) {
		return errors.New("Phase 0 evidence Codex imageId must be an exact sha256 image id")
	}
	if len(evidence.FileSHA256) != len(phase0EvidenceFileNames) {
		return errors.New("Phase 0 evidence has an unexpected proof-file digest set")
	}
	for _, name := range phase0EvidenceFileNames {
		if !validLowerHex(evidence.FileSHA256[name], 64) {
			return fmt.Errorf("Phase 0 evidence proof-file digest %q is invalid", name)
		}
	}
	return nil
}

func validatePhase0ReleaseAgentEvidence(evidence Phase0CodexEvidence) error {
	model, reasoningEffort, err := phase0ReleaseAgentBaseline()
	if err != nil {
		return err
	}
	if evidence.Model != model || evidence.ReasoningEffort != reasoningEffort {
		return fmt.Errorf(
			"Phase 0 evidence used %s/%s, want the release Agent baseline %s/%s",
			evidence.Model,
			evidence.ReasoningEffort,
			model,
			reasoningEffort,
		)
	}
	return nil
}

func validatePhase0BoundaryEvidence(evidence Phase0BoundaryEvidence) error {
	got := phase0BoundaryInvariants{
		ContainerUser:           evidence.ContainerUser,
		ReadOnlyRootFilesystem:  evidence.ReadOnlyRootFilesystem,
		WorkspaceVolumeWritable: evidence.WorkspaceVolumeWritable,
		WorkspaceDiskLimitBytes: evidence.WorkspaceDiskLimitBytes,
		RootWriteDenied:         evidence.RootWriteDenied,
		HostCanaryVisible:       evidence.HostCanaryVisible,
		InternalNetwork:         evidence.InternalNetwork,
		FakeHostEndpointBlocked: evidence.FakeHostEndpointBlocked,
		ContainerStdioAttached:  evidence.ContainerStdioAttached,
		HostPortPublicationFree: evidence.HostPortPublicationAbsent,
		NoNewPrivileges:         evidence.NoNewPrivileges,
		Privileged:              evidence.Privileged,
		PIDsLimit:               evidence.PIDsLimit,
		MemoryLimitBytes:        evidence.MemoryLimitBytes,
		NanoCPUs:                evidence.NanoCPUs,
	}
	want := phase0BoundaryInvariants{
		ContainerUser:           fmt.Sprintf("%d:%d", phase0ContainerUID, phase0ContainerGID),
		ReadOnlyRootFilesystem:  true,
		WorkspaceVolumeWritable: true,
		WorkspaceDiskLimitBytes: phase0WorkspaceDiskBytes,
		RootWriteDenied:         true,
		HostCanaryVisible:       false,
		InternalNetwork:         true,
		FakeHostEndpointBlocked: true,
		ContainerStdioAttached:  true,
		HostPortPublicationFree: true,
		NoNewPrivileges:         true,
		Privileged:              false,
		PIDsLimit:               phase0ContainerPIDs,
		MemoryLimitBytes:        phase0ContainerMemory,
		NanoCPUs:                phase0ContainerNanoCPUs,
	}
	if got != want {
		return errors.New("Phase 0 evidence does not prove the required filesystem, user, and network boundary")
	}
	if evidence.ControlTransport != execServerControlTransport {
		return errors.New("Phase 0 evidence does not name the shared exec-server control transport")
	}
	if err := validateNumericLoopbackAddress(evidence.HostControlAddress); err != nil {
		return fmt.Errorf("Phase 0 evidence control address: %w", err)
	}
	if !strings.HasPrefix(evidence.HostControlAddress, "127.0.0.1:") {
		return errors.New("Phase 0 evidence control address must use IPv4 host loopback")
	}
	if !reflect.DeepEqual(evidence.MountDestinations, []string{"/tmp", phase0WorkspaceRoot}) {
		return errors.New("Phase 0 evidence must contain only the temporary filesystem and workspace volume")
	}
	if err := validatePhase0EvidenceEnvironment(evidence.ContainerEnvironmentNames, "container"); err != nil {
		return err
	}
	if err := validatePhase0EvidenceEnvironment(evidence.BoundaryHelperEnvironmentNames, "boundary helper"); err != nil {
		return err
	}
	if evidence.ShellEnvironmentPolicyInherit != phase0ShellEnvironmentInherit {
		return errors.New("Phase 0 evidence shell environment policy must inherit none")
	}
	if !reflect.DeepEqual(evidence.ShellEnvironmentPolicySetNames, phase0ShellEnvironmentSetNames()) {
		return errors.New("Phase 0 evidence shell environment policy has an unexpected set-variable list")
	}
	if !reflect.DeepEqual(evidence.DroppedCapabilities, []string{"ALL"}) {
		return errors.New("Phase 0 evidence must show that the container dropped all capabilities")
	}
	return nil
}

func validatePhase0EvidenceEnvironment(names []string, label string) error {
	if names == nil {
		return fmt.Errorf("Phase 0 evidence %s environment names must be an array", label)
	}
	if err := validateEnvironmentNames(names); err != nil {
		return err
	}
	if !sort.StringsAreSorted(names) || !reflect.DeepEqual(names, sortedUnique(names)) {
		return fmt.Errorf("Phase 0 evidence %s environment names must be sorted and unique", label)
	}
	return nil
}

func validatePhase0TurnEvidence(evidence Phase0TurnEvidence) error {
	if err := validatePhase0ModelTurnEvidence(evidence.ReadOnly, true, false, "read-only"); err != nil {
		return err
	}
	return validatePhase0ModelTurnEvidence(evidence.WorkspaceWrite, false, true, "workspace-write")
}

func validatePhase0ModelTurnEvidence(
	evidence Phase0ModelTurnEvidence,
	wantUnchanged bool,
	wantOutput bool,
	label string,
) error {
	if evidence.Attempts < 1 || evidence.Attempts > phase0MaximumTurnAttempts {
		return fmt.Errorf("Phase 0 evidence %s turn has an invalid attempt count", label)
	}
	got := phase0TurnInvariants{
		Outcome:              evidence.Outcome,
		FixtureTokenMatched:  evidence.FixtureTokenMatched,
		WorkspaceUnchanged:   evidence.WorkspaceUnchanged,
		OnlyExpectedMutation: evidence.OnlyExpectedMutation,
	}
	want := phase0TurnInvariants{
		Outcome:              "completed",
		FixtureTokenMatched:  true,
		WorkspaceUnchanged:   wantUnchanged,
		OnlyExpectedMutation: true,
	}
	if got != want {
		return fmt.Errorf("Phase 0 evidence %s turn did not prove its exact benign outcome", label)
	}
	if err := validatePhase0TurnOutput(evidence.OutputSHA256, wantOutput); err != nil {
		return fmt.Errorf("Phase 0 evidence %s turn: %w", label, err)
	}
	return nil
}

func validatePhase0TurnOutput(digest string, wantOutput bool) error {
	if wantOutput && !validLowerHex(digest, 64) {
		return errors.New("output digest is invalid")
	}
	if !wantOutput && digest != "" {
		return errors.New("output digest must be absent")
	}
	return nil
}

func validatePhase0TeardownEvidence(evidence Phase0TeardownEvidence) error {
	if !evidence.HostAppServerStopped || !evidence.ControlRelayStopped ||
		!evidence.ContainerRemoved ||
		!evidence.VolumeRemoved || !evidence.NetworkRemoved ||
		!evidence.ImageTagRemoved || !evidence.HostCanaryRemoved {
		return errors.New("Phase 0 evidence does not prove complete teardown")
	}
	return nil
}

func validLowerHex(value string, length int) bool {
	if len(value) != length {
		return false
	}
	for _, character := range value {
		if character >= '0' && character <= '9' || character >= 'a' && character <= 'f' {
			continue
		}
		return false
	}
	return true
}

// RenderPhase0SandboxReport produces the one accepted PASS report shape. The
// embedded strict JSON is the machine-readable gate; the surrounding Markdown
// is the human-readable topology and benign-probe record required by the plan.
func RenderPhase0SandboxReport(evidence Phase0SandboxEvidence) (string, error) {
	if err := ValidatePhase0SandboxEvidence(evidence); err != nil {
		return "", err
	}
	encoded, err := json.MarshalIndent(evidence, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encode Phase 0 sandbox report evidence: %w", err)
	}
	var report strings.Builder
	report.WriteString("# Live AI Evaluation Sandbox Phase 0\n\n")
	report.WriteString(phase0ReportEvidenceStart)
	report.Write(encoded)
	report.WriteByte('\n')
	report.WriteString(phase0ReportEvidenceEnd)
	report.WriteString("\n\n## Supported boundary\n\n")
	fmt.Fprintf(&report, "- Topology: %s\n", evidence.Topology.Name)
	fmt.Fprintf(&report, "- Host ownership: %s\n", evidence.Topology.HostOwnership)
	fmt.Fprintf(&report, "- Container ownership: %s\n", evidence.Topology.ContainerOwnership)
	fmt.Fprintf(&report, "- Authentication boundary: %s\n", evidence.Topology.AuthenticationBoundary)
	fmt.Fprintf(&report, "- Allowed control path: %s\n", evidence.Topology.ControlPath)
	report.WriteString("\n## Benign probe evidence\n\n")
	fmt.Fprintf(&report, "- Probe time: `%s`\n", evidence.ProbedAt.Format("2006-01-02T15:04:05.999999999Z07:00"))
	fmt.Fprintf(&report, "- Repository commit: `%s`\n", evidence.Repository.Commit)
	fmt.Fprintf(&report, "- Codex version and target: `%s` / `%s`\n", evidence.Codex.HostVersion, evidence.Codex.BundleTarget)
	fmt.Fprintf(
		&report,
		"- Release Agent model and reasoning effort: `%s` / `%s`\n",
		evidence.Codex.Model,
		evidence.Codex.ReasoningEffort,
	)
	fmt.Fprintf(
		&report,
		"- The read-only model task observed the fixture without mutation after %d attempt(s).\n",
		evidence.Turns.ReadOnly.Attempts,
	)
	fmt.Fprintf(
		&report,
		"- The workspace-write model task made only the declared throwaway mutation after %d attempt(s).\n",
		evidence.Turns.WorkspaceWrite.Attempts,
	)
	report.WriteString("- The host canary and fake host endpoint were unreachable from the sandbox.\n")
	report.WriteString("- Docker inspection and the boundary helper observed only allowlisted environment names; the strict remote shell policy inherited none.\n")
	report.WriteString("- The app-server, host control relay, container, volume, network, image tag, and canary were removed.\n")
	return report.String(), nil
}

func ParsePhase0SandboxReport(value []byte) (Phase0SandboxEvidence, error) {
	if len(value) == 0 || len(value) > phase0SandboxReportMaxBytes {
		return Phase0SandboxEvidence{}, fmt.Errorf("Phase 0 sandbox report is %d bytes, want 1-%d", len(value), phase0SandboxReportMaxBytes)
	}
	evidence, err := decodePhase0SandboxReportEvidence(value)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	if err := ValidatePhase0SandboxEvidence(evidence); err != nil {
		return Phase0SandboxEvidence{}, err
	}
	rendered, err := RenderPhase0SandboxReport(evidence)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	if !bytes.Equal(value, []byte(rendered)) {
		return Phase0SandboxEvidence{}, errors.New("Phase 0 sandbox report does not match the one current PASS report shape")
	}
	return evidence, nil
}

func decodePhase0SandboxReportEvidence(value []byte) (Phase0SandboxEvidence, error) {
	if !bytes.HasPrefix(value, []byte("# Live AI Evaluation Sandbox Phase 0\n\n")) {
		return Phase0SandboxEvidence{}, errors.New("Phase 0 sandbox report has an invalid title")
	}
	start := bytes.Index(value, []byte(phase0ReportEvidenceStart))
	if start < 0 || start != bytes.LastIndex(value, []byte(phase0ReportEvidenceStart)) {
		return Phase0SandboxEvidence{}, errors.New("Phase 0 sandbox report must contain exactly one evidence block")
	}
	payloadStart := start + len(phase0ReportEvidenceStart)
	remaining := value[payloadStart:]
	end := bytes.Index(remaining, []byte(phase0ReportEvidenceEnd))
	if end < 0 || end != bytes.LastIndex(remaining, []byte(phase0ReportEvidenceEnd)) {
		return Phase0SandboxEvidence{}, errors.New("Phase 0 sandbox report must close exactly one evidence block")
	}
	var evidence Phase0SandboxEvidence
	if err := jsonio.DecodeSingle(bytes.NewReader(remaining[:end]), &evidence); err != nil {
		return Phase0SandboxEvidence{}, fmt.Errorf("decode Phase 0 sandbox report evidence: %w", err)
	}
	return evidence, nil
}

// WritePhase0SandboxReport writes the report only after the live probe has
// completed. O_EXCL preserves prior evidence and avoids replacing a report by
// accident.
func WritePhase0SandboxReport(repoRoot string, evidence Phase0SandboxEvidence) (string, error) {
	report, err := RenderPhase0SandboxReport(evidence)
	if err != nil {
		return "", err
	}
	root, err := filepath.Abs(repoRoot)
	if err != nil {
		return "", fmt.Errorf("resolve Phase 0 repository root: %w", err)
	}
	root, err = cleanExistingPhase1Directory("repository root", root)
	if err != nil {
		return "", err
	}
	path := filepath.Join(root, filepath.FromSlash(Phase0SandboxReportRelativePath))
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", fmt.Errorf("create Phase 0 sandbox report: %w", err)
	}
	writeErr := writeAndClosePhase0Report(file, report)
	if writeErr != nil {
		_ = os.Remove(path)
		return "", writeErr
	}
	return path, nil
}

func writeAndClosePhase0Report(file *os.File, report string) error {
	if _, err := file.WriteString(report); err != nil {
		_ = file.Close()
		return fmt.Errorf("write Phase 0 sandbox report: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync Phase 0 sandbox report: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close Phase 0 sandbox report: %w", err)
	}
	return nil
}

func requireCommittedPhase0Pass(ctx context.Context, repoRoot string) error {
	repository, err := inspectPhase0Repository(ctx, repoRoot)
	if err != nil {
		return fmt.Errorf("Phase 1 live execution gate: %w", err)
	}
	report, err := readPhase0CommittedFile(ctx, repoRoot, Phase0SandboxReportRelativePath)
	if err != nil {
		return fmt.Errorf("Phase 1 live execution requires a committed Phase 0 PASS report at %s: %w", Phase0SandboxReportRelativePath, err)
	}
	evidence, err := ParsePhase0SandboxReport([]byte(report))
	if err != nil {
		return fmt.Errorf("Phase 1 live execution rejected the committed Phase 0 report: %w", err)
	}
	plan, err := readPhase0CommittedFile(ctx, repoRoot, "docs/plans/live-ai-evaluation-harness-plan.md")
	if err != nil {
		return fmt.Errorf("Phase 1 live execution gate could not read the committed plan: %w", err)
	}
	if !strings.Contains(plan, phase0PlanPassMarker) {
		return errors.New("Phase 1 live execution requires the committed plan's Phase 0 resolution with outcome PASS")
	}
	if _, err := runPhase0Command(
		ctx,
		repoRoot,
		nil,
		"git",
		"merge-base",
		"--is-ancestor",
		evidence.Repository.Commit,
		repository.Commit,
	); err != nil {
		return errors.New("Phase 1 live execution requires Phase 0 evidence from an ancestor of the current commit")
	}
	return nil
}

func readCommittedPhase0PassEvidence(
	ctx context.Context,
	repoRoot string,
) (Phase0SandboxEvidence, error) {
	report, err := readPhase0CommittedFile(ctx, repoRoot, Phase0SandboxReportRelativePath)
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	evidence, err := ParsePhase0SandboxReport([]byte(report))
	if err != nil {
		return Phase0SandboxEvidence{}, err
	}
	return evidence, nil
}

func readPhase0CommittedFile(ctx context.Context, repoRoot string, relativePath string) (string, error) {
	if filepath.IsAbs(relativePath) || filepath.ToSlash(filepath.Clean(relativePath)) != relativePath || strings.HasPrefix(relativePath, "../") {
		return "", fmt.Errorf("invalid committed path %q", relativePath)
	}
	command := exec.CommandContext(ctx, "git", "show", "HEAD:"+relativePath)
	command.Dir = repoRoot
	diagnostic := newPhase1DiagnosticBuffer(phase0MaxDiagnosticBytes)
	command.Stderr = diagnostic
	output, err := command.Output()
	if err != nil {
		return "", fmt.Errorf(
			"read committed file %s: %w: %s",
			relativePath,
			err,
			diagnostic.String(),
		)
	}
	return string(output), nil
}
