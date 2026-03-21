package runs

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/codegen"
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
	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		pythonPath, err = exec.LookPath("python")
	}
	if err != nil {
		t.Fatalf("resolve python executable: %v", err)
	}
	expectedCommand := shellQuote(pythonPath) + " " + shellQuote(fixture.pythonPath)
	if plan.Command != expectedCommand {
		t.Fatalf("expected command %q, got %q", expectedCommand, plan.Command)
	}
}

func TestPlannerPlanUsesGeneratedEntryForPythonCodegenProjects(t *testing.T) {
	t.Parallel()

	fixture := newGeneratedEntryPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		RunSnapshotMode: RunSnapshotModeNever,
	})
	if err != nil {
		t.Fatalf("plan generated entry run: %v", err)
	}

	if plan.TargetKind != projectstate.RunTargetKindGeneratedEntry {
		t.Fatalf("expected generated entry target kind, got %q", plan.TargetKind)
	}
	if plan.SectionID != "" {
		t.Fatalf("did not expect attached section id for generated entry, got %q", plan.SectionID)
	}
	if plan.EntryPath != fixture.generatedPath {
		t.Fatalf("expected generated entry path %q, got %q", fixture.generatedPath, plan.EntryPath)
	}
}

func TestPlannerPlanSnapshotsGeneratedEntryAndMetadataFiles(t *testing.T) {
	t.Parallel()

	fixture := newGeneratedEntryPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		RunSnapshotMode: RunSnapshotModeEphemeral,
	})
	if err != nil {
		t.Fatalf("plan generated snapshot run: %v", err)
	}

	if plan.TargetKind != projectstate.RunTargetKindGeneratedEntry {
		t.Fatalf("expected generated entry target kind, got %q", plan.TargetKind)
	}
	snapshotGeneratedPath := filepath.Join(plan.SnapshotDirectory, filepath.Base(fixture.generatedPath))
	snapshotMetadataPath := filepath.Join(plan.SnapshotDirectory, filepath.Base(fixture.generatedMetaPath))
	if plan.EntryPath != snapshotGeneratedPath {
		t.Fatalf("expected snapshot generated entry path %q, got %q", snapshotGeneratedPath, plan.EntryPath)
	}
	if got, err := os.ReadFile(snapshotGeneratedPath); err != nil {
		t.Fatalf("read snapshot generated entry file: %v", err)
	} else if strings.TrimSpace(string(got)) != "print('generated')" {
		t.Fatalf("unexpected snapshot generated entry content %q", string(got))
	}
	if got, err := os.ReadFile(snapshotMetadataPath); err != nil {
		t.Fatalf("read snapshot generated metadata file: %v", err)
	} else if strings.TrimSpace(string(got)) != "META = True" {
		t.Fatalf("unexpected snapshot generated metadata content %q", string(got))
	}
}

func TestPlannerPlanCollapsesExplicitGeneratedSectionSelectionToEntry(t *testing.T) {
	t.Parallel()

	fixture := newGeneratedEntryPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		SectionID:       "gen-python-section",
		RunSnapshotMode: RunSnapshotModeNever,
	})
	if err != nil {
		t.Fatalf("plan explicit generated section run: %v", err)
	}

	if plan.TargetKind != projectstate.RunTargetKindGeneratedEntry {
		t.Fatalf("expected generated entry target kind, got %q", plan.TargetKind)
	}
	if plan.EntryPath != fixture.generatedPath {
		t.Fatalf("expected generated entry path %q, got %q", fixture.generatedPath, plan.EntryPath)
	}
}

func TestPlannerPlanRejectsPluginGeneratedSections(t *testing.T) {
	t.Parallel()

	fixture := newGeneratedEntryPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID:       "project-alpha",
		SectionID:       "gen-plugin-section",
		RunSnapshotMode: RunSnapshotModeNever,
	})
	if err == nil {
		t.Fatal("expected plugin generated run to fail")
	}
	if err != ErrPluginCodegenRunUnsupported {
		t.Fatalf("expected ErrPluginCodegenRunUnsupported, got %v", err)
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
	if plan.VariantID != "code-bash-variant" {
		t.Fatalf("expected resolved variant id code-bash-variant, got %q", plan.VariantID)
	}
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Fatalf("resolve bash executable: %v", err)
	}
	if !strings.HasPrefix(plan.Command, shellQuote(bashPath)+" ") {
		t.Fatalf("expected bash command using %q, got %q", bashPath, plan.Command)
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
	if !errors.Is(err, projectstate.ErrSectionNotFound) {
		t.Fatalf("expected ErrSectionNotFound, got %v", err)
	}
}

func TestPlannerPlanRejectsMismatchedVariantOverride(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		SectionVariantOverrides: map[string]string{
			"code-section": "helper-variant",
		},
	})
	if err == nil {
		t.Fatal("expected mismatched variant override error")
	}
	if !errors.Is(err, projectstate.ErrSectionVariantMembership) {
		t.Fatalf("expected ErrSectionVariantMembership, got %v", err)
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

func TestPlannerPlanAcceptsParamOverridesWithoutMutatingBaseState(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		ParamOverrides: map[string]string{
			"params-section:param-text": "2",
		},
	})
	if err != nil {
		t.Fatalf("plan run with param overrides: %v", err)
	}
	if plan.RunSnapshotMode != RunSnapshotModeEphemeral {
		t.Fatalf("expected overrides to promote default mode to ephemeral, got %q", plan.RunSnapshotMode)
	}

	snapshot := fixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, _, impl, err := project.ResolveSectionCodeObject("params-section", "param-text")
	if err != nil {
		t.Fatalf("resolve base param: %v", err)
	}
	if got := strings.TrimSpace(impl.Type); got != "TextParam" {
		t.Fatalf("expected TextParam impl type, got %q", got)
	}
	if got := payloadValueString(t, project, "params-section", "param-text"); got != "1" {
		t.Fatalf("expected base param value 1, got %q", got)
	}
}

func TestPlannerPlanRejectsCodeParamOverridesWhenDisallowed(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID:                  "project-alpha",
		DisallowCodeParamOverrides: true,
		ParamOverrides: map[string]string{
			"code-params-section:param-code": "print('updated')",
		},
	})
	if err == nil {
		t.Fatal("expected code param override denial")
	}
	if err != ErrCodeParamOverridesDenied {
		t.Fatalf("expected ErrCodeParamOverridesDenied, got %v", err)
	}
}

func TestPlannerPlanRejectsPasswordParamOverrides(t *testing.T) {
	t.Parallel()

	fixture := newPlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	_, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		ParamOverrides: map[string]string{
			"password-params-section:param-secret": "secret",
		},
	})
	if err == nil {
		t.Fatal("expected password param override error")
	}
	if err != ErrPasswordParamOverrideUnsupported {
		t.Fatalf("expected ErrPasswordParamOverrideUnsupported, got %v", err)
	}
}

func TestPlannerPlanSnapshotsGeneratedEntryFromOverrideState(t *testing.T) {
	t.Parallel()

	fixture := newGeneratedEntryParamOverridePlannerTestFixture(t)
	planner := newPlannerForTest(t, fixture)

	plan, err := planner.Plan(PlanRequest{
		ProjectID: "project-alpha",
		ParamOverrides: map[string]string{
			"params-section:param-text": "override-value",
		},
	})
	if err != nil {
		t.Fatalf("plan generated entry override run: %v", err)
	}

	snapshotGeneratedPath := filepath.Join(plan.SnapshotDirectory, filepath.Base(fixture.generatedPath))
	got, err := os.ReadFile(snapshotGeneratedPath)
	if err != nil {
		t.Fatalf("read snapshot generated file: %v", err)
	}
	if !strings.Contains(string(got), "override-value") {
		t.Fatalf("expected snapshot generated code to contain override value, got:\n%s", string(got))
	}

	diskGenerated, err := os.ReadFile(fixture.generatedPath)
	if err != nil {
		t.Fatalf("read disk generated file: %v", err)
	}
	if !strings.Contains(string(diskGenerated), "base-value") {
		t.Fatalf("expected disk generated code to keep base value, got:\n%s", string(diskGenerated))
	}
	if strings.Contains(string(diskGenerated), "override-value") {
		t.Fatalf("did not expect disk generated code to be mutated:\n%s", string(diskGenerated))
	}

	snapshot := fixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if got := payloadValueString(t, project, "params-section", "param-text"); got != "base-value" {
		t.Fatalf("expected live project param value to remain base-value, got %q", got)
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
	runtime           *projectstate.Runtime
	settaFilesRoot    string
	runtimeRoot       string
	pythonPath        string
	bashPath          string
	helperPath        string
	generatedPath     string
	generatedMetaPath string
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
					"params-section",
					"code-params-section",
					"password-params-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":            "code-python-variant",
					"helper-section":          "helper-variant",
					"params-section":          "params-variant",
					"code-params-section":     "code-params-variant",
					"password-params-section": "password-params-variant",
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
					"params-section": {
						ID:               "params-section",
						Name:             "Globals",
						VariantIDs:       []string{"params-variant"},
						DefaultVariantID: "params-variant",
					},
					"code-params-section": {
						ID:               "code-params-section",
						Name:             "Code Params",
						VariantIDs:       []string{"code-params-variant"},
						DefaultVariantID: "code-params-variant",
					},
					"password-params-section": {
						ID:               "password-params-section",
						Name:             "Password Params",
						VariantIDs:       []string{"password-params-variant"},
						DefaultVariantID: "password-params-variant",
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
					"params-variant": {
						ID:     "params-variant",
						ImplID: "params-impl",
					},
					"code-params-variant": {
						ID:     "code-params-variant",
						ImplID: "code-params-impl",
					},
					"password-params-variant": {
						ID:     "password-params-variant",
						ImplID: "password-params-impl",
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
					"params-impl": {
						ID:      "params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant"}}`),
					},
					"code-params-impl": {
						ID:      "code-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"code-params-impl","type":"Dict","codeObjVariantMap":{"param-code":"param-code-variant"}}`),
					},
					"password-params-impl": {
						ID:      "password-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"password-params-impl","type":"Dict","codeObjVariantMap":{"param-secret":"param-secret-variant"}}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"param-text": {
						ID:               "param-text",
						Name:             "text_param",
						VariantIDs:       []string{"param-text-variant"},
						DefaultVariantID: "param-text-variant",
					},
					"param-code": {
						ID:               "param-code",
						Name:             "code_param",
						VariantIDs:       []string{"param-code-variant"},
						DefaultVariantID: "param-code-variant",
					},
					"param-secret": {
						ID:               "param-secret",
						Name:             "secret_param",
						VariantIDs:       []string{"param-secret-variant"},
						DefaultVariantID: "param-secret-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"param-text-variant": {
						ID:     "param-text-variant",
						ImplID: "param-text-impl",
					},
					"param-code-variant": {
						ID:     "param-code-variant",
						ImplID: "param-code-impl",
					},
					"param-secret-variant": {
						ID:     "param-secret-variant",
						ImplID: "param-secret-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"param-text-impl": {
						ID:      "param-text-impl",
						Type:    "TextParam",
						Payload: projectstate.RawJSON(`{"id":"param-text-impl","type":"TextParam","value":"1"}`),
					},
					"param-code-impl": {
						ID:      "param-code-impl",
						Type:    "CodeParam",
						Payload: projectstate.RawJSON(`{"id":"param-code-impl","type":"CodeParam","value":"print('base')"}`),
					},
					"param-secret-impl": {
						ID:      "param-secret-impl",
						Type:    "PasswordParam",
						Payload: projectstate.RawJSON(`{"id":"param-secret-impl","type":"PasswordParam","value":"ignored"}`),
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

func newGeneratedEntryParamOverridePlannerTestFixture(t *testing.T) plannerTestFixture {
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
	helperPath := filepath.Join(codeRoot, "helper.py")
	generatedPath := filepath.Join(codeRoot, "generated.py")
	generatedMetaPath := filepath.Join(codeRoot, "setta_gen_meta.py")
	if err := os.WriteFile(pythonPath, []byte("print('python')\n"), 0o644); err != nil {
		t.Fatalf("write python file: %v", err)
	}
	if err := os.WriteFile(helperPath, []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper file: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{Language: string(projectstate.CodeLanguagePython)},
				},
				GeneratedCodeBinding: &projectstate.CodeFileBinding{
					Path:       "code/generated.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &projectstate.CodeFileBinding{
					Path:       "code/setta_gen_meta.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
					"helper-section",
					"params-section",
					"gen-python-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":       "code-python-variant",
					"helper-section":     "helper-variant",
					"params-section":     "params-variant",
					"gen-python-section": "gen-python-variant",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Runner",
						VariantIDs:       []string{"code-python-variant"},
						DefaultVariantID: "code-python-variant",
					},
					"helper-section": {
						ID:               "helper-section",
						Name:             "Helper",
						VariantIDs:       []string{"helper-variant"},
						DefaultVariantID: "helper-variant",
					},
					"params-section": {
						ID:               "params-section",
						Name:             "Globals",
						VariantIDs:       []string{"params-variant"},
						DefaultVariantID: "params-variant",
					},
					"gen-python-section": {
						ID:               "gen-python-section",
						Name:             "Generated Python",
						VariantIDs:       []string{"gen-python-variant"},
						DefaultVariantID: "gen-python-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"helper-variant": {
						ID:     "helper-variant",
						ImplID: "helper-impl",
					},
					"params-variant": {
						ID:     "params-variant",
						ImplID: "params-impl",
					},
					"gen-python-variant": {
						ID:     "gen-python-variant",
						ImplID: "gen-python-impl",
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
					"params-impl": {
						ID:      "params-impl",
						Kind:    projectstate.SectionKind("global_variables"),
						Payload: projectstate.RawJSON(`{"id":"params-impl","type":"GlobalVariables","topLevelParamId":"root-param","codeObjVariantMap":{"root-param":"root-param-variant","param-text":"param-text-variant"}}`),
					},
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonCode,
						},
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"root-param": {
						ID:               "root-param",
						Name:             "root",
						VariantIDs:       []string{"root-param-variant"},
						DefaultVariantID: "root-param-variant",
					},
					"param-text": {
						ID:               "param-text",
						Name:             "text_param",
						VariantIDs:       []string{"param-text-variant"},
						DefaultVariantID: "param-text-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"root-param-variant": {
						ID:     "root-param-variant",
						ImplID: "root-param-impl",
					},
					"param-text-variant": {
						ID:     "param-text-variant",
						ImplID: "param-text-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"root-param-impl": {
						ID:      "root-param-impl",
						Type:    "NestedParam",
						Payload: projectstate.RawJSON(`{"id":"root-param-impl","type":"NestedParam","children":["param-text"]}`),
					},
					"param-text-impl": {
						ID:      "param-text-impl",
						Type:    "TextParam",
						Payload: projectstate.RawJSON(`{"id":"param-text-impl","type":"TextParam","value":"base-value"}`),
					},
				},
			},
		},
	}

	rendered, ok, err := codegen.RenderPythonProject(document.Projects["project-alpha"], settaFilesRoot, runtimeRoot)
	if err != nil {
		t.Fatalf("render base generated project: %v", err)
	}
	if !ok {
		t.Fatal("expected python codegen render to succeed")
	}
	if err := os.WriteFile(generatedPath, []byte(rendered.Code), 0o644); err != nil {
		t.Fatalf("write generated file: %v", err)
	}
	if err := os.WriteFile(generatedMetaPath, []byte(rendered.MetadataCode), 0o644); err != nil {
		t.Fatalf("write generated metadata file: %v", err)
	}

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		_ = runtime.Close()
	})

	return plannerTestFixture{
		runtime:           runtime,
		settaFilesRoot:    settaFilesRoot,
		runtimeRoot:       runtimeRoot,
		pythonPath:        pythonPath,
		helperPath:        helperPath,
		generatedPath:     generatedPath,
		generatedMetaPath: generatedMetaPath,
	}
}

func payloadValueString(t *testing.T, project projectstate.Project, sectionID string, codeObjID string) string {
	t.Helper()

	payload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		t.Fatalf("resolve section code object %s:%s: %v", sectionID, codeObjID, err)
	}
	value, ok := payload["value"].(string)
	if !ok {
		t.Fatalf("expected payload value field for %s:%s, got %#v", sectionID, codeObjID, payload["value"])
	}
	return value
}

func newGeneratedEntryPlannerTestFixture(t *testing.T) plannerTestFixture {
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
	helperPath := filepath.Join(codeRoot, "helper.py")
	generatedPath := filepath.Join(codeRoot, "generated.py")
	generatedMetaPath := filepath.Join(codeRoot, "setta_gen_meta.py")
	if err := os.WriteFile(pythonPath, []byte("print('python')\n"), 0o644); err != nil {
		t.Fatalf("write python file: %v", err)
	}
	if err := os.WriteFile(helperPath, []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper file: %v", err)
	}
	if err := os.WriteFile(generatedPath, []byte("print('generated')\n"), 0o644); err != nil {
		t.Fatalf("write generated file: %v", err)
	}
	if err := os.WriteFile(generatedMetaPath, []byte("META = True\n"), 0o644); err != nil {
		t.Fatalf("write generated metadata file: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{Language: string(projectstate.CodeLanguagePython)},
				},
				GeneratedCodeBinding: &projectstate.CodeFileBinding{
					Path:       "code/generated.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &projectstate.CodeFileBinding{
					Path:       "code/setta_gen_meta.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
					"helper-section",
					"gen-python-section",
					"gen-plugin-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":       "code-python-variant",
					"helper-section":     "helper-variant",
					"gen-python-section": "gen-python-variant",
					"gen-plugin-section": "gen-plugin-variant",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Runner",
						VariantIDs:       []string{"code-python-variant"},
						DefaultVariantID: "code-python-variant",
					},
					"helper-section": {
						ID:               "helper-section",
						Name:             "Helper",
						VariantIDs:       []string{"helper-variant"},
						DefaultVariantID: "helper-variant",
					},
					"gen-python-section": {
						ID:               "gen-python-section",
						Name:             "Generated Python",
						VariantIDs:       []string{"gen-python-variant"},
						DefaultVariantID: "gen-python-variant",
					},
					"gen-plugin-section": {
						ID:               "gen-plugin-section",
						Name:             "Generated Plugin",
						VariantIDs:       []string{"gen-plugin-variant"},
						DefaultVariantID: "gen-plugin-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"helper-variant": {
						ID:     "helper-variant",
						ImplID: "helper-impl",
					},
					"gen-python-variant": {
						ID:     "gen-python-variant",
						ImplID: "gen-python-impl",
					},
					"gen-plugin-variant": {
						ID:     "gen-plugin-variant",
						ImplID: "gen-plugin-impl",
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
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonCode,
						},
					},
					"gen-plugin-impl": {
						ID:   "gen-plugin-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPlugin,
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
		runtime:           runtime,
		settaFilesRoot:    settaFilesRoot,
		runtimeRoot:       runtimeRoot,
		pythonPath:        pythonPath,
		helperPath:        helperPath,
		generatedPath:     generatedPath,
		generatedMetaPath: generatedMetaPath,
	}
}
