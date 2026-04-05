package projectstate

import (
	"context"
	"encoding/json"
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
