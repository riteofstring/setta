package evalharness

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestPhase0SandboxReportRoundTripsStrictPassEvidence(t *testing.T) {
	evidence := validPhase0SandboxEvidenceForTest(strings.Repeat("a", 40))
	report, err := RenderPhase0SandboxReport(evidence)
	if err != nil {
		t.Fatalf("render report: %v", err)
	}
	decoded, err := ParsePhase0SandboxReport([]byte(report))
	if err != nil {
		t.Fatalf("parse report: %v", err)
	}
	if !reflect.DeepEqual(decoded, evidence) {
		t.Fatalf("decoded evidence = %#v, want %#v", decoded, evidence)
	}
	invalidAttempts := evidence
	invalidAttempts.Turns.ReadOnly.Attempts = 0
	if _, err := RenderPhase0SandboxReport(invalidAttempts); err == nil {
		t.Fatal("zero model-turn attempts were accepted")
	}
	if _, err := ParsePhase0SandboxReport([]byte(report + "\n" + phase0ReportEvidenceStart)); err == nil {
		t.Fatal("duplicate evidence block was accepted")
	}
	modifiedNarrative := strings.Replace(
		report,
		"The read-only model task observed the fixture without mutation after 1 attempt(s).",
		"A model task observed the fixture without mutation after 1 attempt(s).",
		1,
	)
	if _, err := ParsePhase0SandboxReport([]byte(modifiedNarrative)); err == nil {
		t.Fatal("modified report narrative was accepted")
	}
}

func TestCommittedPhase0PassGateRequiresCleanCommittedReportAndResolution(t *testing.T) {
	repoRoot := t.TempDir()
	runPhase0ReportGit(t, repoRoot, "init", "--initial-branch=main")
	runPhase0ReportGit(t, repoRoot, "config", "user.email", "setta-eval@example.com")
	runPhase0ReportGit(t, repoRoot, "config", "user.name", "Setta Eval")
	writePhase0ReportTestFile(t, repoRoot, "proof-source", "proof\n")
	runPhase0ReportGit(t, repoRoot, "add", "proof-source")
	runPhase0ReportGit(t, repoRoot, "commit", "-m", "add proof source")
	proofCommit := strings.TrimSpace(runPhase0ReportGit(t, repoRoot, "rev-parse", "HEAD"))

	evidence := validPhase0SandboxEvidenceForTest(proofCommit)
	report, err := RenderPhase0SandboxReport(evidence)
	if err != nil {
		t.Fatalf("render report: %v", err)
	}
	writePhase0ReportTestFile(t, repoRoot, Phase0SandboxReportRelativePath, report)
	writePhase0ReportTestFile(
		t,
		repoRoot,
		"docs/plans/live-ai-evaluation-harness-plan.md",
		"# Plan\n\n"+phase0PlanPassMarker+"\n",
	)
	runPhase0ReportGit(t, repoRoot, "add", "docs")
	runPhase0ReportGit(t, repoRoot, "commit", "-m", "record sandbox pass")

	if err := requireCommittedPhase0Pass(context.Background(), repoRoot); err != nil {
		t.Fatalf("require committed pass: %v", err)
	}
	writePhase0ReportTestFile(t, repoRoot, Phase0SandboxReportRelativePath, report+"\nmodified\n")
	if err := requireCommittedPhase0Pass(context.Background(), repoRoot); err == nil ||
		!strings.Contains(err.Error(), "clean committed worktree") {
		t.Fatalf("dirty report gate error = %v", err)
	}
}

func validPhase0SandboxEvidenceForTest(commit string) Phase0SandboxEvidence {
	digests := make(map[string]string, len(phase0EvidenceFileNames))
	for _, name := range phase0EvidenceFileNames {
		digests[name] = strings.Repeat("b", 64)
	}
	return Phase0SandboxEvidence{
		SchemaVersion: phase0SchemaVersion,
		Outcome:       phase0OutcomePass,
		ProbedAt:      time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC),
		Topology:      phase0TopologyEvidence(),
		Repository:    Phase0RepoEvidence{Commit: commit, Clean: true},
		Docker: Phase0DockerEvidence{
			ClientVersion: "29.1.3",
			ServerVersion: "29.1.3",
			ServerOS:      "linux",
			ServerArch:    "arm64",
			CPUs:          8,
			MemoryBytes:   32 * 1024 * 1024 * 1024,
		},
		Codex: Phase0CodexEvidence{
			HostVersion:   "0.146.0",
			BundleVersion: "0.146.0",
			BundleTarget:  phase0CodexBundleTarget,
			FileSHA256:    digests,
			ImageID:       "sha256:" + strings.Repeat("c", 64),
		},
		Boundary: Phase0BoundaryEvidence{
			ContainerUser:                  "65532:65532",
			ReadOnlyRootFilesystem:         true,
			WorkspaceVolumeWritable:        true,
			WorkspaceDiskLimitBytes:        phase0WorkspaceDiskBytes,
			RootWriteDenied:                true,
			HostCanaryVisible:              false,
			InternalNetwork:                true,
			FakeHostEndpointBlocked:        true,
			ControlTransport:               execServerControlTransport,
			HostControlAddress:             "127.0.0.1:45000",
			ContainerStdioAttached:         true,
			HostPortPublicationAbsent:      true,
			MountDestinations:              []string{"/tmp", phase0WorkspaceRoot},
			ContainerEnvironmentNames:      []string{"HOME", "PATH"},
			BoundaryHelperEnvironmentNames: []string{"HOME", "PATH"},
			ShellEnvironmentPolicyInherit:  phase0ShellEnvironmentInherit,
			ShellEnvironmentPolicySetNames: phase0ShellEnvironmentSetNames(),
			DroppedCapabilities:            []string{"ALL"},
			NoNewPrivileges:                true,
			Privileged:                     false,
			PIDsLimit:                      phase0ContainerPIDs,
			MemoryLimitBytes:               phase0ContainerMemory,
			NanoCPUs:                       phase0ContainerNanoCPUs,
		},
		Turns: Phase0TurnEvidence{
			ReadOnly: Phase0ModelTurnEvidence{
				Outcome:              "completed",
				Attempts:             1,
				FixtureTokenObserved: true,
				WorkspaceUnchanged:   true,
				OnlyExpectedMutation: true,
			},
			WorkspaceWrite: Phase0ModelTurnEvidence{
				Outcome:              "completed",
				Attempts:             1,
				FixtureTokenObserved: true,
				WorkspaceUnchanged:   false,
				OnlyExpectedMutation: true,
				OutputSHA256:         strings.Repeat("d", 64),
			},
		},
		Teardown: Phase0TeardownEvidence{
			HostAppServerStopped: true,
			ControlRelayStopped:  true,
			ContainerRemoved:     true,
			VolumeRemoved:        true,
			NetworkRemoved:       true,
			ImageTagRemoved:      true,
			HostCanaryRemoved:    true,
		},
	}
}

func runPhase0ReportGit(t *testing.T, repoRoot string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = repoRoot
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v: %s", strings.Join(args, " "), err, output)
	}
	return string(output)
}

func writePhase0ReportTestFile(t *testing.T, repoRoot string, relativePath string, value string) {
	t.Helper()
	path := filepath.Join(repoRoot, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("create test directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}
