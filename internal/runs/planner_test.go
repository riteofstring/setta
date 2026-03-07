package runs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/projectstate"
)

func TestPlannerPlanUsesDirectEntryPathForNeverMode(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		RunSnapshotMode: RunSnapshotModeNever,
	})
	if err != nil {
		t.Fatalf("plan run: %v", err)
	}

	if plan.SectionID != "code-section" {
		t.Fatalf("expected entry section code-section, got %q", plan.SectionID)
	}
	if plan.RunSnapshotMode != RunSnapshotModeNever {
		t.Fatalf("expected never mode, got %q", plan.RunSnapshotMode)
	}
	if plan.SnapshotDirectory != "" {
		t.Fatalf("did not expect snapshot directory for never mode, got %q", plan.SnapshotDirectory)
	}
	if plan.EntryPath != fixture.pythonPath {
		t.Fatalf("expected entry path %q, got %q", fixture.pythonPath, plan.EntryPath)
	}
	expectedCommand := "python " + shellQuote(fixture.pythonPath)
	if plan.Command != expectedCommand {
		t.Fatalf("expected command %q, got %q", expectedCommand, plan.Command)
	}
}

func TestPlannerPlanSnapshotsAllManualCodeSections(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		RunSnapshotMode: RunSnapshotModeEphemeral,
	})
	if err != nil {
		t.Fatalf("plan run: %v", err)
	}

	if plan.RunSnapshotMode != RunSnapshotModeEphemeral {
		t.Fatalf("expected ephemeral mode, got %q", plan.RunSnapshotMode)
	}
	if plan.SnapshotDirectory == "" {
		t.Fatal("expected snapshot directory to be recorded")
	}
	if !strings.HasPrefix(plan.SnapshotDirectory, fixture.runtimeRoot+string(os.PathSeparator)) {
		t.Fatalf("expected snapshot directory under runtime root %q, got %q", fixture.runtimeRoot, plan.SnapshotDirectory)
	}

	snapshotPythonPath := filepath.Join(plan.SnapshotDirectory, filepath.Base(fixture.pythonPath))
	snapshotHelperPath := filepath.Join(plan.SnapshotDirectory, filepath.Base(fixture.helperPath))

	if plan.EntryPath != snapshotPythonPath {
		t.Fatalf("expected snapshot entry path %q, got %q", snapshotPythonPath, plan.EntryPath)
	}
	if got, err := os.ReadFile(snapshotPythonPath); err != nil {
		t.Fatalf("read snapshot entry file: %v", err)
	} else if strings.TrimSpace(string(got)) != "print('python')" {
		t.Fatalf("unexpected snapshot entry content %q", string(got))
	}
	if got, err := os.ReadFile(snapshotHelperPath); err != nil {
		t.Fatalf("read helper snapshot file: %v", err)
	} else if strings.TrimSpace(string(got)) != "print('helper')" {
		t.Fatalf("unexpected helper snapshot content %q", string(got))
	}
}

func TestPlannerPlanAppliesSectionVariantOverridesWithoutMutatingBaseState(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		RunSnapshotMode: RunSnapshotModeNever,
		SectionVariantOverrides: map[string]string{
			"code-section": "code-bash-variant",
		},
	})
	if err != nil {
		t.Fatalf("plan run with overrides: %v", err)
	}

	if plan.RunSnapshotMode != RunSnapshotModeEphemeral {
		t.Fatalf("expected overrides to promote never to ephemeral, got %q", plan.RunSnapshotMode)
	}
	if plan.Language != projectstate.CodeLanguageBash {
		t.Fatalf("expected bash language, got %q", plan.Language)
	}
	if !strings.HasPrefix(plan.Command, "bash ") {
		t.Fatalf("expected bash command, got %q", plan.Command)
	}

	snapshot := fixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["code-section"]; got != "code-python-variant" {
		t.Fatalf("expected base state to keep python variant, got %q", got)
	}
}

func TestPlannerPlanRejectsUnknownVariantOverride(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		SectionVariantOverrides: map[string]string{
			"missing-section": "missing-variant",
		},
	})
	if err == nil {
		t.Fatal("expected override error")
	}
	if !strings.Contains(err.Error(), "unknown section id") {
		t.Fatalf("expected unknown section id error, got %v", err)
	}
}

func TestPlannerPlanRejectsInvalidParamOverrideKey(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		ParamOverrides: map[string]string{
			"bad": "2",
		},
	})
	if err == nil {
		t.Fatal("expected invalid param override error")
	}
	if !strings.Contains(err.Error(), ErrInvalidParamOverrideKey.Error()) {
		t.Fatalf("expected invalid param override key error, got %v", err)
	}
}

func TestPlannerPlanRejectsParamOverridesUntilParamStateExists(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		ParamOverrides: map[string]string{
			"params-section:param-alpha": "2",
		},
	})
	if err == nil {
		t.Fatal("expected param override unsupported error")
	}
	if err != ErrParamOverridesUnsupported {
		t.Fatalf("expected ErrParamOverridesUnsupported, got %v", err)
	}
}

func TestPlannerPlanRejectsMissingEntryTarget(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	document := fixture.runtime.Snapshot().Document
	project := document.Projects["project-alpha"]
	project.EntryCodeBlockID = ""
	document.Projects["project-alpha"] = project

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	defer runtime.Close()

	planner, err := NewPlanner(PlannerOptions{
		ProjectState:   runtime,
		SettaFilesRoot: fixture.settaFilesRoot,
		RuntimeRoot:    fixture.runtimeRoot,
		Now: func() time.Time {
			return time.Date(2026, time.March, 6, 12, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new planner: %v", err)
	}

	_, err = planner.Plan(PlanRequest{ProjectID: "project-alpha"})
	if err == nil {
		t.Fatal("expected missing entry error")
	}
	if err != ErrRunTargetRequired {
		t.Fatalf("expected ErrRunTargetRequired, got %v", err)
	}
}

type plannerTestFixture struct {
	runtime        *projectstate.Runtime
	settaFilesRoot string
	runtimeRoot    string
	pythonPath     string
	bashPath       string
	helperPath     string
}

func newPlannerForTest(t *testing.T, fixture plannerTestFixture) *Planner {
	t.Helper()

	planner, err := NewPlanner(PlannerOptions{
		ProjectState:   fixture.runtime,
		SettaFilesRoot: fixture.settaFilesRoot,
		RuntimeRoot:    fixture.runtimeRoot,
		Now: func() time.Time {
			return time.Date(2026, time.March, 6, 12, 34, 56, 123000000, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new planner: %v", err)
	}
	return planner
}

func newPlannerTestFixture(t *testing.T) plannerTestFixture {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	codeRoot := filepath.Join(settaFilesRoot, "code")
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}

	pythonPath := filepath.Join(codeRoot, "run.py")
	bashPath := filepath.Join(codeRoot, "run.sh")
	helperPath := filepath.Join(codeRoot, "helper.py")
	if err := os.WriteFile(pythonPath, []byte("print('python')\n"), 0o644); err != nil {
		t.Fatalf("write python file: %v", err)
	}
	if err := os.WriteFile(bashPath, []byte("echo bash\n"), 0o644); err != nil {
		t.Fatalf("write bash file: %v", err)
	}
	if err := os.WriteFile(helperPath, []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper file: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
					"helper-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":   "code-python-variant",
					"helper-section": "helper-variant",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Runner",
						VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
						DefaultVariantID: "code-python-variant",
					},
					"helper-section": {
						ID:               "helper-section",
						Name:             "Helper",
						VariantIDs:       []string{"helper-variant"},
						DefaultVariantID: "helper-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"code-bash-variant": {
						ID:     "code-bash-variant",
						ImplID: "code-bash-impl",
					},
					"helper-variant": {
						ID:     "helper-variant",
						ImplID: "helper-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"code-python-impl": {
						ID:   "code-python-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/run.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
					"code-bash-impl": {
						ID:   "code-bash-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguageBash,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/run.sh",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
					"helper-impl": {
						ID:   "helper-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/helper.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
				},
			},
		},
	}

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		_ = runtime.Close()
	})

	return plannerTestFixture{
		runtime:        runtime,
		settaFilesRoot: settaFilesRoot,
		runtimeRoot:    runtimeRoot,
		pythonPath:     pythonPath,
		bashPath:       bashPath,
		helperPath:     helperPath,
	}
}
