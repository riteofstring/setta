package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestRuntimeSetGenCodePrefixPersistsPythonTargetField(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	snapshot, err := runtime.SetGenCodePrefix(context.Background(), "project-alpha", "import math\n")
	if err != nil {
		t.Fatalf("set gen code prefix: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("read python target after mutation: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set gen code prefix")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected persisted gen code prefix, got %q", config.GenCodePrefix)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding to remain reconciled")
	}
	if project.GeneratedCodeBinding.Path != GeneratedPythonCodeRelativePath("Alpha") {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
}

func TestRuntimeSetGenCodePrefixRequiresPythonTarget(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), codegenTargetsTestDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	_, err := runtime.SetGenCodePrefix(context.Background(), "project-alpha", "import math\n")
	if !errors.Is(err, ErrProjectCodegenPythonTargetMissing) {
		t.Fatalf("expected python-target-missing error, got %v", err)
	}
}

func TestRuntimeSetGenCodeSuffixPersistsPythonTargetField(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	snapshot, err := runtime.SetGenCodeSuffix(context.Background(), "project-alpha", "state = CustomState()\n")
	if err != nil {
		t.Fatalf("set gen code suffix: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("read python target after mutation: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set gen code suffix")
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected persisted gen code suffix, got %q", config.GenCodeSuffix)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding to remain reconciled")
	}
	if project.GeneratedCodeBinding.Path != GeneratedPythonCodeRelativePath("Alpha") {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
}

func TestRuntimeSetGenCodeSuffixRequiresPythonTarget(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), codegenTargetsTestDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	_, err := runtime.SetGenCodeSuffix(context.Background(), "project-alpha", "state = CustomState()\n")
	if !errors.Is(err, ErrProjectCodegenPythonTargetMissing) {
		t.Fatalf("expected python-target-missing error, got %v", err)
	}
}
