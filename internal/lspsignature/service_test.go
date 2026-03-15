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

// LSP parameter labels can be either strings or signature-label ranges, so the
// parser must support both encodings.
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

func signatureTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
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
