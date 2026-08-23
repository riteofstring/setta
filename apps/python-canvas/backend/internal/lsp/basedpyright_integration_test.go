package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
	"unicode/utf16"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
	"github.com/setta/python-canvas/backend/internal/project/materializer"
	"github.com/setta/python-canvas/backend/internal/pythonenv"
)

func TestExplicitBasedpyrightV2CoordinatorIntegration(t *testing.T) {
	workspaceRoot := t.TempDir()
	writeV2FixtureModule(t, workspaceRoot)
	projectPath := filepath.Join(workspaceRoot, "project.json")
	executable := basedpyrightExecutableForIntegration(t)
	pythonEnvironment, err := pythonenv.Resolve(context.Background(), pythonenv.Options{
		ProjectPath:    projectPath,
		LauncherPython: lspTestPython(t),
	})
	if err != nil {
		t.Fatalf("resolve integration Python environment: %v", err)
	}
	provider, err := NewBasedpyrightProvider(BasedpyrightOptions{
		Command:           executable,
		WorkspaceRoot:     workspaceRoot,
		PythonEnvironment: pythonEnvironment,
		RequestTimeout:    20 * time.Second,
		DiagnosticTimeout: 15 * time.Second,
	})
	if err != nil {
		t.Fatalf("NewBasedpyrightProvider() error = %v", err)
	}
	document, err := materializer.New(projectPath)
	if err != nil {
		_ = provider.Close()
		t.Fatalf("materializer.New() error = %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	application, err := coordinator.Open(ctx, coordinator.Options{
		ProjectPath: projectPath,
		Create:      true,
		IDGenerator: pinnedIntegrationIDs(
			"project-v2",
			"callable-zero",
			"callable-math",
			"parameter-math-x",
			"callable-styles",
			"parameter-positional-only",
			"parameter-positional-or-keyword",
			"parameter-variadic-positional",
			"parameter-keyword-only",
			"parameter-variadic-keyword",
		),
		Materializer: document,
		Provider:     provider,
	})
	if err != nil {
		_ = provider.Close()
		_ = document.Close()
		t.Fatalf("coordinator.Open() error = %v", err)
	}
	defer func() {
		if err := application.Close(); err != nil {
			t.Fatalf("Coordinator.Close() error = %v", err)
		}
	}()

	snapshot := application.Snapshot()
	requireReadyBasedpyrightProvider(t, snapshot.ProviderStatus)
	snapshot = setIntegrationTarget(t, ctx, application, snapshot, "import fixture")

	zero := createIntegrationCallable(t, ctx, application, snapshot, "Zero", "fixture.zero")
	if len(zero.State.Callables) != 1 || len(zero.State.Callables[0].Parameters) != 0 {
		t.Fatalf("zero-parameter signature = %#v, want one callable with zero parameters", zero.State.Callables)
	}

	resolvedMath := exerciseAutomaticMathRefresh(t, ctx, application, zero)

	styles := createIntegrationCallable(t, ctx, application, resolvedMath, "All styles", "fixture.all_styles")
	callable := integrationCallable(t, styles.State, "callable-styles")
	requireAllPassingStyles(t, callable.Parameters)

	callableCompletions, err := application.CompleteCallable(
		ctx,
		styles.State.Project.ID,
		callable.ID,
		"fixture.al",
		utf16Length("fixture.al"),
	)
	if err != nil {
		t.Fatalf("CompleteCallable() error = %v", err)
	}
	requireCompletion(t, callableCompletions, "all_styles")

	for _, testCase := range []struct {
		name           string
		prefix         string
		suffix         string
		label          string
		cursorAtSuffix bool
	}{
		{
			name:           "fixture callable in prefix",
			prefix:         "import fixture\nfixture.al",
			suffix:         styles.State.PythonTarget.Suffix,
			label:          "all_styles",
			cursorAtSuffix: false,
		},
		{
			name:           "generated class in suffix",
			prefix:         styles.State.PythonTarget.Prefix,
			suffix:         "state = SettaSta",
			label:          "SettaState",
			cursorAtSuffix: true,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			code, protectedRange := targetCompletionDocument(styles, testCase.prefix, testCase.suffix)
			cursor := utf16Length(testCase.prefix)
			if testCase.cursorAtSuffix {
				cursor = utf16Length(code)
			}
			items, err := application.CompletePythonTarget(
				ctx,
				styles.State.Project.ID,
				code,
				protectedRange,
				cursor,
			)
			if err != nil {
				t.Fatalf("CompletePythonTarget() error = %v", err)
			}
			requireCompletion(t, items, testCase.label)
		})
	}

	proposals := make([]aggregate.ParameterProposal, 0, len(callable.Parameters))
	var diagnosedParameterID string
	for _, parameter := range callable.Parameters {
		expression := ""
		if parameter.PassingStyle == aggregate.PassingStylePositionalOnly {
			expression = "missing_fixture_value"
			diagnosedParameterID = parameter.ID
		}
		proposals = append(proposals, aggregate.ParameterProposal{
			ID:                 parameter.ID,
			Name:               parameter.Name,
			AuthoredExpression: expression,
		})
	}
	if diagnosedParameterID == "" {
		t.Fatal("all-style signature has no positional-only parameter")
	}
	diagnosed, err := application.SetParameters(ctx, aggregate.SetParametersCommand{
		ProjectID:        styles.State.Project.ID,
		CallableID:       callable.ID,
		ExpectedRevision: styles.State.Project.Revision,
		Parameters:       proposals,
	})
	if err != nil {
		t.Fatalf("SetParameters(missing fixture value) error = %v", err)
	}
	requireReadyBasedpyrightProvider(t, diagnosed.ProviderStatus)
	requireDiagnosticForTarget(t, diagnosed.Diagnostics, diagnosedParameterID)
}

func TestV2CoordinatorUnavailableProviderDoesNotReturnEmptyResults(t *testing.T) {
	projectPath := filepath.Join(t.TempDir(), "project.json")
	document, err := materializer.New(projectPath)
	if err != nil {
		t.Fatalf("materializer.New() error = %v", err)
	}
	application, err := coordinator.Open(context.Background(), coordinator.Options{
		ProjectPath:  projectPath,
		Create:       true,
		IDGenerator:  pinnedIntegrationIDs("project-unavailable"),
		Materializer: document,
	})
	if err != nil {
		_ = document.Close()
		t.Fatalf("coordinator.Open() error = %v", err)
	}
	defer func() {
		if err := application.Close(); err != nil {
			t.Fatalf("Coordinator.Close() error = %v", err)
		}
	}()

	snapshot := application.Snapshot()
	if snapshot.ProviderStatus.Availability != coordinator.ProviderAvailabilityUnavailable {
		t.Fatalf("provider status = %#v, want unavailable", snapshot.ProviderStatus)
	}
	_, err = application.SetTarget(context.Background(), aggregate.SetTargetCommand{
		ProjectID:        snapshot.State.Project.ID,
		ExpectedRevision: snapshot.State.Project.Revision,
		Prefix:           snapshot.State.PythonTarget.Prefix,
		Suffix:           snapshot.State.PythonTarget.Suffix,
	})
	if !errors.Is(err, coordinator.ErrProviderUnavailable) {
		t.Fatalf("SetTarget(unchanged) error = %v, want provider unavailable", err)
	}
	code, protectedRange := targetCompletionDocument(
		snapshot,
		snapshot.State.PythonTarget.Prefix,
		snapshot.State.PythonTarget.Suffix,
	)
	items, err := application.CompletePythonTarget(
		context.Background(),
		snapshot.State.Project.ID,
		code,
		protectedRange,
		0,
	)
	if !errors.Is(err, coordinator.ErrProviderUnavailable) {
		t.Fatalf("CompletePythonTarget() error = %v, want provider unavailable", err)
	}
	if items != nil {
		t.Fatalf("CompletePythonTarget() items = %#v, want no empty fallback", items)
	}
}

func writeV2FixtureModule(t *testing.T, workspaceRoot string) {
	t.Helper()
	const module = `def zero() -> int:
    return 0


def all_styles(
    positional_only: int,
    /,
    positional_or_keyword: str = "default",
    *variadic: float,
    keyword_only: bool,
    **keyword_options: object,
) -> str:
    return positional_or_keyword
`
	if err := os.WriteFile(filepath.Join(workspaceRoot, "fixture.py"), []byte(module), 0o600); err != nil {
		t.Fatalf("write fixture module: %v", err)
	}
}

func setIntegrationTarget(
	t *testing.T,
	ctx context.Context,
	application *coordinator.Coordinator,
	snapshot coordinator.Snapshot,
	prefix string,
) coordinator.Snapshot {
	t.Helper()
	next, err := application.SetTarget(ctx, aggregate.SetTargetCommand{
		ProjectID:        snapshot.State.Project.ID,
		ExpectedRevision: snapshot.State.Project.Revision,
		Prefix:           prefix,
		Suffix:           snapshot.State.PythonTarget.Suffix,
	})
	if err != nil {
		t.Fatalf("SetTarget(%q) error = %v", prefix, err)
	}
	requireReadyBasedpyrightProvider(t, next.ProviderStatus)
	return next
}

func createIntegrationCallable(
	t *testing.T,
	ctx context.Context,
	application *coordinator.Coordinator,
	snapshot coordinator.Snapshot,
	name string,
	expression string,
) coordinator.Snapshot {
	t.Helper()
	created, err := application.CreateCallable(ctx, aggregate.CreateCallableCommand{
		ProjectID:        snapshot.State.Project.ID,
		ExpectedRevision: snapshot.State.Project.Revision,
		Name:             name,
	})
	if err != nil {
		t.Fatalf("CreateCallable(%q) error = %v", name, err)
	}
	callable := created.State.Callables[len(created.State.Callables)-1]
	committed, err := application.CommitCallable(ctx, aggregate.CommitCallableCommand{
		ProjectID:          created.State.Project.ID,
		CallableID:         callable.ID,
		ExpectedRevision:   created.State.Project.Revision,
		AuthoredExpression: expression,
	})
	if err != nil {
		t.Fatalf("CommitCallable(%q) error = %v", expression, err)
	}
	requireReadyBasedpyrightProvider(t, committed.ProviderStatus)
	refreshed, err := application.RefreshCallableParameters(ctx, aggregate.RefreshCallableParametersCommand{
		ProjectID:        committed.State.Project.ID,
		CallableID:       callable.ID,
		ExpectedRevision: committed.State.Project.Revision,
	})
	if err != nil {
		t.Fatalf("RefreshCallableParameters(%q) error = %v", expression, err)
	}
	requireReadyBasedpyrightProvider(t, refreshed.ProviderStatus)
	return refreshed
}

func exerciseAutomaticMathRefresh(
	t *testing.T,
	ctx context.Context,
	application *coordinator.Coordinator,
	snapshot coordinator.Snapshot,
) coordinator.Snapshot {
	t.Helper()
	created, err := application.CreateCallable(ctx, aggregate.CreateCallableCommand{
		ProjectID: snapshot.State.Project.ID, ExpectedRevision: snapshot.State.Project.Revision, Name: "Missing math import",
	})
	if err != nil {
		t.Fatalf("CreateCallable(math.sqrt) error = %v", err)
	}
	unresolved, err := application.CommitCallable(ctx, aggregate.CommitCallableCommand{
		ProjectID: created.State.Project.ID, CallableID: "callable-math", ExpectedRevision: created.State.Project.Revision, AuthoredExpression: "math.sqrt",
	})
	if err != nil {
		t.Fatalf("CommitCallable(math.sqrt) error = %v", err)
	}
	callable := integrationCallable(t, unresolved.State, "callable-math")
	if len(callable.Parameters) != 0 {
		t.Fatalf("unresolved math.sqrt parameters = %#v, want none before import", callable.Parameters)
	}
	requireDiagnosticCodeForTarget(t, unresolved.Diagnostics, callable.ID, "reportUndefinedVariable")

	resolved := setIntegrationTarget(t, ctx, application, unresolved, "import fixture\nimport math")
	callable = integrationCallable(t, resolved.State, "callable-math")
	if len(callable.Parameters) != 1 || callable.Parameters[0].Name != "x" {
		t.Fatalf("automatically refreshed math.sqrt parameters = %#v, want x", callable.Parameters)
	}
	requireNoDiagnosticCodeForTarget(t, resolved.Diagnostics, callable.ID, "reportUndefinedVariable")
	return resolved
}

func integrationCallable(t *testing.T, state aggregate.State, callableID string) aggregate.Callable {
	t.Helper()
	for _, callable := range state.Callables {
		if callable.ID == callableID {
			return callable
		}
	}
	t.Fatalf("callable %q is missing from %#v", callableID, state.Callables)
	return aggregate.Callable{}
}

func requireAllPassingStyles(t *testing.T, parameters []aggregate.Parameter) {
	t.Helper()
	want := []struct {
		name  string
		style aggregate.PassingStyle
	}{
		{name: "positional_only", style: aggregate.PassingStylePositionalOnly},
		{name: "positional_or_keyword", style: aggregate.PassingStylePositionalOrKeyword},
		{name: "variadic", style: aggregate.PassingStyleVariadicPositional},
		{name: "keyword_only", style: aggregate.PassingStyleKeywordOnly},
		{name: "keyword_options", style: aggregate.PassingStyleVariadicKeyword},
	}
	if len(parameters) != len(want) {
		t.Fatalf("all-style parameters = %#v, want %d records", parameters, len(want))
	}
	for index, expected := range want {
		parameter := parameters[index]
		if parameter.Name != expected.name || parameter.PassingStyle != expected.style || parameter.NameEditable || parameter.ProviderOrdinal == nil || *parameter.ProviderOrdinal != index {
			t.Fatalf("all-style parameter %d = %#v, want %q/%q/provider ordinal %d", index, parameter, expected.name, expected.style, index)
		}
	}
}

func targetCompletionDocument(
	snapshot coordinator.Snapshot,
	prefix string,
	suffix string,
) (string, coordinator.UTF16Range) {
	code := prefix + "\n\n" + snapshot.Rendered.Body + "\n\n" + suffix
	bodyStart := utf16Length(prefix + "\n\n")
	return code, coordinator.UTF16Range{
		Start: bodyStart,
		End:   bodyStart + utf16Length(snapshot.Rendered.Body),
	}
}

func requireReadyBasedpyrightProvider(t *testing.T, status coordinator.ProviderStatus) {
	t.Helper()
	if status.Provider != "basedpyright" || status.Availability != coordinator.ProviderAvailabilityAvailable || status.State != coordinator.ProviderLifecycleReady {
		t.Fatalf("provider status = %#v, want available ready Basedpyright", status)
	}
}

func requireCompletion(t *testing.T, items []coordinator.CompletionItem, label string) {
	t.Helper()
	for _, item := range items {
		if item.Label == label && item.InsertText == label {
			return
		}
	}
	t.Fatalf("completion items = %#v, want %q", items, label)
}

func requireDiagnosticForTarget(t *testing.T, diagnostics []coordinator.Diagnostic, targetID string) {
	t.Helper()
	for _, diagnostic := range diagnostics {
		if diagnostic.TargetID != nil && *diagnostic.TargetID == targetID && diagnostic.Severity == coordinator.ProviderDiagnosticError {
			return
		}
	}
	t.Fatalf("diagnostics = %#v, want an error mapped to %q", diagnostics, targetID)
}

func requireDiagnosticCodeForTarget(t *testing.T, diagnostics []coordinator.Diagnostic, targetID string, code string) {
	t.Helper()
	for _, diagnostic := range diagnostics {
		if diagnostic.TargetID != nil && *diagnostic.TargetID == targetID && diagnostic.Code == code {
			return
		}
	}
	t.Fatalf("diagnostics = %#v, want %q mapped to %q", diagnostics, code, targetID)
}

func requireNoDiagnosticCodeForTarget(t *testing.T, diagnostics []coordinator.Diagnostic, targetID string, code string) {
	t.Helper()
	for _, diagnostic := range diagnostics {
		if diagnostic.TargetID != nil && *diagnostic.TargetID == targetID && diagnostic.Code == code {
			t.Fatalf("diagnostics = %#v, do not want %q mapped to %q", diagnostics, code, targetID)
		}
	}
}

func pinnedIntegrationIDs(ids ...string) aggregate.IDGenerator {
	index := 0
	return func() (string, error) {
		if index >= len(ids) {
			return "", fmt.Errorf("unexpected integration ID allocation %d", index)
		}
		id := ids[index]
		index++
		return id, nil
	}
}

func utf16Length(value string) int {
	return len(utf16.Encode([]rune(value)))
}

func basedpyrightExecutableForIntegration(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if info, err := os.Stat(filepath.Join(directory, "backend", "go.mod")); err == nil && info.Mode().IsRegular() {
			name := "basedpyright-langserver"
			if runtime.GOOS == "windows" {
				name += ".cmd"
			}
			executable := filepath.Join(directory, "node_modules", ".bin", name)
			if _, err := ResolveBasedpyrightExecutable(executable); err != nil {
				t.Fatalf("resolve integration Basedpyright executable: %v", err)
			}
			return executable
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("find integration Basedpyright executable")
		}
		directory = parent
	}
}
