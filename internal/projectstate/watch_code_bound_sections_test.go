package projectstate

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestProjectApplyWatchCodeBoundSectionUpdateCreatesCallableWithoutWatchInputs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := codeUpdateTestProject(t, CodeFileAccessModeReadWrite)
	project.WatchCodeEnabled = true
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}

	if err := project.SetCode(
		"section-main",
		"def existing(value):\n    return value\n\n\ndef added(value):\n    return value\n",
	); err != nil {
		t.Fatalf("set code: %v", err)
	}

	didUpdate, err := project.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		"section-main",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code bound section update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected bound section update to change project state")
	}

	entry, ok := project.WatchCodeRegistry["pkg.bound.added:function"]
	if !ok {
		t.Fatalf("expected added callable in watch code registry, got %#v", project.WatchCodeRegistry)
	}
	if entry.SourcePath == "" {
		t.Fatalf("expected registry entry source path, got %#v", entry)
	}
	if len(entry.SectionIDs) != 1 {
		t.Fatalf("expected one linked callable section, got %#v", entry.SectionIDs)
	}

	sectionPayload, err := currentCallablePayloadForWatchCodeTest(project, entry.SectionIDs[0])
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		t.Fatalf("expected callable section to select the added callable, got %#v", sectionPayload)
	}
	if got := project.CodeObjs[callableID].Name; got != "added" {
		t.Fatalf("expected callable object name added, got %q", got)
	}
}

func TestProjectResolveWatchCodeBoundSectionLoadsBoundFileAndIgnoreState(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := codeUpdateTestProject(t, CodeFileAccessModeReadWrite)
	project.WatchCodeEnabled = true
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}

	if err := project.SetCodeSectionDiagnosticsMute("section-main", true); err != nil {
		t.Fatalf("set diagnostics mute: %v", err)
	}
	clearWatchCodeTestInlineCode(t, &project, "impl-main")

	boundPath := filepath.Join(workspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(boundPath), 0o755); err != nil {
		t.Fatalf("mkdir bound file parent: %v", err)
	}
	const boundSource = "def bound(value):\n    return value\n"
	if err := os.WriteFile(boundPath, []byte(boundSource), 0o644); err != nil {
		t.Fatalf("write bound file: %v", err)
	}

	resolved, ok, err := project.ResolveWatchCodeBoundSection("section-main", workspaceRoot)
	if err != nil {
		t.Fatalf("resolve watch code bound section: %v", err)
	}
	if !ok {
		t.Fatal("expected watch code bound section to resolve")
	}
	if resolved.SectionID != "section-main" {
		t.Fatalf("expected section-main, got %q", resolved.SectionID)
	}
	if resolved.RelativePath != "pkg/bound.py" {
		t.Fatalf("expected pkg/bound.py, got %q", resolved.RelativePath)
	}
	if resolved.SourcePath != boundPath {
		t.Fatalf("expected source path %q, got %q", boundPath, resolved.SourcePath)
	}
	if resolved.Code != boundSource {
		t.Fatalf("expected bound source %q, got %q", boundSource, resolved.Code)
	}
	if !resolved.IgnoreState.Muted {
		t.Fatalf("expected muted ignore state, got %#v", resolved.IgnoreState)
	}
}

func clearWatchCodeTestInlineCode(t *testing.T, project *Project, implID string) {
	t.Helper()

	impl := project.SectionImpls[implID]
	payload, err := rawObjectFromProjectPayload(impl.Payload)
	if err != nil {
		t.Fatalf("decode watch code impl payload: %v", err)
	}
	delete(payload, "code")
	impl.Payload = mustWatchCodeTestRawJSON(t, payload)
	project.SectionImpls[implID] = impl
}

func mustWatchCodeTestRawJSON(t *testing.T, value map[string]any) RawJSON {
	t.Helper()

	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal watch code payload: %v", err)
	}
	return RawJSON(raw)
}
