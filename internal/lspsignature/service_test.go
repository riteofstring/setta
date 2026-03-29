package lspsignature

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/lsp"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

// The signature service should build a generated Python snapshot, request
// signatureHelp on that temp document, and decode ordered parameter proposals.
func TestServiceResolveCallableSignatureFromSnapshot(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	service, closeService := newFixtureSignatureService(t, settaFilesRoot)
	defer closeService()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, ok, err := service.ResolveCallableSignature(ctx, signatureTestProject(t), "callable-section", "sorted")
	if err != nil {
		t.Fatalf("resolve callable signature: %v", err)
	}
	if !ok {
		t.Fatal("expected signature request to be available")
	}
	if result.Status != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", result.Status)
	}
	if result.Documentation == "" {
		t.Fatal("expected signature documentation")
	}
	if len(result.Params) != 5 {
		t.Fatalf("expected five proposals, got %#v", result.Params)
	}
	if result.Params[0].Name != "iterable" || result.Params[0].PassingStyle != "POSITIONAL_ONLY" {
		t.Fatalf("unexpected first proposal %#v", result.Params[0])
	}
	if result.Params[3].Name != "key" || result.Params[3].DefaultValue != "None" {
		t.Fatalf("unexpected key proposal %#v", result.Params[3])
	}
	if result.Params[4].Name != "reverse" || result.Params[4].PassingStyle != "KEYWORD_ONLY" {
		t.Fatalf("unexpected reverse proposal %#v", result.Params[4])
	}

	matches, err := filepath.Glob(filepath.Join(settaFilesRoot, "code", "sections", "Alpha", "setta_gen__*.py"))
	if err != nil {
		t.Fatalf("glob temp snapshots: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected signature temp snapshots to be removed, found %#v", matches)
	}
}

// Unknown callables should still round-trip a real signatureHelp request but
// return a typed no-match result instead of guessed params.
func TestServiceResolveCallableSignatureReturnsNoMatch(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	service, closeService := newFixtureSignatureService(t, settaFilesRoot)
	defer closeService()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, ok, err := service.ResolveCallableSignature(ctx, signatureTestProject(t), "callable-section", "brand_new")
	if err != nil {
		t.Fatalf("resolve callable signature: %v", err)
	}
	if !ok {
		t.Fatal("expected signature request to be available")
	}
	if result.Status != projectstate.SignatureHelpStatusNoMatch {
		t.Fatalf("expected no_match status, got %q", result.Status)
	}
	if len(result.Params) != 0 {
		t.Fatalf("expected no proposals, got %#v", result.Params)
	}
}

// A watch-code callable imported from the workspace root should resolve through
// the real basedpyright service when the generated snapshot imports that module.
func TestServiceResolveCallableSignatureFromWorkspaceImportWithCurrentProcessLSP(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "watch_code_test.py")
	if err := statefs.AtomicWriteFile(
		sourcePath,
		[]byte("def cool_fn(a, b, c):\n    return a + b + c\n"),
		0o644,
	); err != nil {
		t.Fatalf("write workspace callable source: %v", err)
	}

	service, _, closeService := newCurrentProcessSignatureService(t, workspaceRoot)
	defer closeService()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	result, ok, err := service.ResolveCallableSignature(
		ctx,
		signatureImportTestProject(t, "from watch_code_test import cool_fn\n"),
		"callable-section",
		"cool_fn",
	)
	if err != nil {
		t.Fatalf("resolve callable signature: %v", err)
	}
	if !ok {
		t.Fatal("expected signature request to be available")
	}
	if result.Status != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", result.Status)
	}
	if got := paramNames(result.Params); !equalStrings(got, []string{"a", "b", "c"}) {
		t.Fatalf("expected params [a b c], got %#v", result.Params)
	}
}

// Basedpyright resolves the generated snapshot import against the setta_files
// shadow when one exists, even if the live workspace document has newer
// content. The synchronizer tests cover the product fix by keeping that mirror
// fresh before signature help runs.
func TestServiceResolveCallableSignatureUsesStaleSettaFilesShadowWhenMirrorIsOutOfDate(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesShadowPath := filepath.Join(workspaceRoot, "setta_files", "watch_code_test.py")
	if err := statefs.AtomicWriteFile(
		settaFilesShadowPath,
		[]byte("def cool_fn():\n    return 0\n"),
		0o644,
	); err != nil {
		t.Fatalf("write stale setta_files shadow: %v", err)
	}

	service, session, closeService := newCurrentProcessSignatureService(t, filepath.Join(workspaceRoot, "setta_files"))
	defer closeService()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	workspaceSourcePath := filepath.Join(workspaceRoot, "watch_code_test.py")
	workspaceContent := "def cool_fn(a, b, c):\n    return a + b + c\n"
	if err := session.OpenDocument(ctx, workspaceSourcePath, "python", workspaceContent, nil); err != nil {
		t.Fatalf("open workspace watch-code document: %v", err)
	}

	result, ok, err := service.ResolveCallableSignature(
		ctx,
		signatureImportTestProject(t, "from watch_code_test import cool_fn\n"),
		"callable-section",
		"cool_fn",
	)
	if err != nil {
		t.Fatalf("resolve callable signature with stale shadow: %v", err)
	}
	if !ok {
		t.Fatal("expected signature request to be available")
	}
	if result.Status != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", result.Status)
	}
	if len(result.Params) != 0 {
		t.Fatalf("expected stale zero-arg shadow to win, got %#v", result.Params)
	}
}

// LSP parameter labels can be either strings or signature-label ranges, so the
// parser must support both encodings.
func TestParseParamLabelCapturesTypeAnnotationFromStringLabel(t *testing.T) {
	t.Parallel()

	name, typeAnnotation, defaultValue := parseParamLabel(
		"fn(title: str | None)",
		[]byte(`"title: str | None"`),
	)
	if name != "title" {
		t.Fatalf("expected title name, got %q", name)
	}
	if typeAnnotation != "str | None" {
		t.Fatalf("expected str | None annotation, got %q", typeAnnotation)
	}
	if defaultValue != "" {
		t.Fatalf("expected empty default value, got %q", defaultValue)
	}
}

func TestParseParamLabelSupportsRangeOffsets(t *testing.T) {
	t.Parallel()

	name, typeAnnotation, defaultValue := parseParamLabel(
		"fn(value: str = 'x')",
		[]byte(`[3,19]`),
	)
	if name != "value" {
		t.Fatalf("expected value name, got %q", name)
	}
	if typeAnnotation != "str" {
		t.Fatalf("expected str annotation, got %q", typeAnnotation)
	}
	if defaultValue != "'x'" {
		t.Fatalf("expected default 'x', got %q", defaultValue)
	}
}

func newFixtureSignatureService(t *testing.T, settaFilesRoot string) (*Service, func()) {
	t.Helper()

	pythonBinary := resolveFixturePythonBinary(t)
	fixtureServerPath := filepath.Join(
		repoRoot(t),
		"tests",
		"fixtures",
		"lsp",
		"mini_language_server.py",
	)
	session, err := lsp.NewSession(lsp.SessionOptions{
		WorkspaceRoot: settaFilesRoot,
		Command:       pythonBinary,
		Args:          []string{fixtureServerPath},
		Environment:   os.Environ(),
	})
	if err != nil {
		t.Fatalf("new lsp session: %v", err)
	}
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		LSPService:     lsp.NewService(session),
	})
	if err != nil {
		t.Fatalf("new signature service: %v", err)
	}
	return service, func() {
		closer, ok := service.lspService.(interface{ Close(context.Context) error })
		if !ok {
			t.Fatal("expected signature lsp service to expose Close")
		}
		if err := closer.Close(context.Background()); err != nil {
			t.Fatalf("close lsp service: %v", err)
		}
	}
}

func newCurrentProcessSignatureService(t *testing.T, settaFilesRoot string) (*Service, *lsp.Session, func()) {
	t.Helper()

	workspaceRoot := settaFilesRoot
	if filepath.Base(workspaceRoot) == "setta_files" {
		workspaceRoot = filepath.Dir(workspaceRoot)
	}

	session, err := lsp.NewCurrentProcessPythonSession(lsp.CurrentProcessPythonSessionOptions{
		WorkspaceRoot: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new current-process python session: %v", err)
	}
	service, err := NewService(ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		LSPService:     lsp.NewService(session),
	})
	if err != nil {
		t.Fatalf("new signature service: %v", err)
	}
	return service, session, func() {
		if err := session.Close(context.Background()); err != nil {
			t.Fatalf("close lsp session: %v", err)
		}
	}
}

func signatureTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return signatureImportTestProject(t, "")
}

func signatureImportTestProject(t *testing.T, genCodePrefix string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload: projectstate.RawJSON(`{
					"language":"python",
					"genCodePrefix":` + strconvQuote(genCodePrefix) + `
				}`),
			},
		},
		TopLevelSectionIDs: []string{"callable-section"},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "CallSection",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":"callable-1",
					"codeObjVariantMap":{
						"callable-1":"callable-codeobj-variant-1"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "MissingFunc",
				VariantIDs:       []string{"callable-codeobj-variant-1"},
				DefaultVariantID: "callable-codeobj-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-codeobj-variant-1": {
				ID:     "callable-codeobj-variant-1",
				ImplID: "callable-codeobj-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-codeobj-impl-1": {
				ID:      "callable-codeobj-impl-1",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-codeobj-impl-1","type":"CodeCallable","children":[]}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signature test project: %v", err)
	}
	return project
}

func paramNames(params []projectstate.CallableParamProposal) []string {
	output := make([]string, 0, len(params))
	for _, param := range params {
		output = append(output, param.Name)
	}
	return output
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func strconvQuote(value string) string {
	return `"` + escapeJSONString(value) + `"`
}

func escapeJSONString(value string) string {
	escaped := make([]byte, 0, len(value))
	for i := 0; i < len(value); i++ {
		switch value[i] {
		case '\\':
			escaped = append(escaped, '\\', '\\')
		case '"':
			escaped = append(escaped, '\\', '"')
		case '\n':
			escaped = append(escaped, '\\', 'n')
		default:
			escaped = append(escaped, value[i])
		}
	}
	return string(escaped)
}

func resolveFixturePythonBinary(t *testing.T) string {
	t.Helper()

	for _, candidate := range []string{"python3", "python"} {
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}
	t.Fatal("python binary not found in PATH")
	return ""
}

func repoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}
