package projectstate

import (
	"context"
	"path/filepath"
	"testing"
)

func TestDocumentResolveRunTargetUsesEntryCodeBlock(t *testing.T) {
	t.Parallel()

	document := newRunGraphTestDocument()

	target, err := document.ResolveRunTarget("project-alpha", "")
	if err != nil {
		t.Fatalf("resolve run target: %v", err)
	}
	if target.Section.ID != "code-section" {
		t.Fatalf("expected entry code section, got %q", target.Section.ID)
	}
	if !target.Impl.IsCode() {
		t.Fatalf("expected code impl, got kind %q", target.Impl.Kind)
	}
}

func TestSectionImplIsRunnableCode(t *testing.T) {
	t.Parallel()

	if !(SectionImpl{
		ID:   "code-impl",
		Kind: SectionKindCode,
		Code: &CodeSectionImpl{Language: CodeLanguagePython},
	}).IsRunnableCode() {
		t.Fatal("expected python code impl to be runnable")
	}
	if (SectionImpl{
		ID:   "code-impl",
		Kind: SectionKindCode,
		Code: &CodeSectionImpl{Language: CodeLanguage("javascript")},
	}).IsRunnableCode() {
		t.Fatal("did not expect non-python/bash code impl to be runnable")
	}
}

func TestDocumentValidateAttachedTerminalRequiresEmbeddedTerminalStructure(t *testing.T) {
	t.Parallel()

	document := newRunGraphTestDocument()
	if _, err := document.EnsureCodeSectionAttachedTerminal("project-alpha", "code-section", newRunGraphTerminalSeed("attached-terminal")); err != nil {
		t.Fatalf("ensure attached terminal: %v", err)
	}

	valid, err := document.ValidateAttachedTerminal("project-alpha", "code-section", "attached-terminal")
	if err != nil {
		t.Fatalf("validate attached terminal: %v", err)
	}
	if !valid {
		t.Fatal("expected embedded terminal relationship to be valid")
	}

	project := document.Projects["project-alpha"]
	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "attached-terminal")
	document.Projects["project-alpha"] = project

	valid, err = document.ValidateAttachedTerminal("project-alpha", "code-section", "attached-terminal")
	if err != nil {
		t.Fatalf("validate attached terminal after top-level mutation: %v", err)
	}
	if valid {
		t.Fatal("expected top-level terminal to be rejected as an attached terminal")
	}
}

func TestRuntimeEnsureCodeSectionAttachedTerminalCreatesEmbeddedTerminal(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newRunGraphTestDocument())

	snapshot, terminalID, err := runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		newRunGraphTerminalSeed("attached-terminal"),
	)
	if err != nil {
		t.Fatalf("ensure attached terminal: %v", err)
	}
	if terminalID != "attached-terminal" {
		t.Fatalf("expected attached-terminal id, got %q", terminalID)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after attached terminal creation, got %d", snapshot.Revision)
	}

	project := snapshot.Document.Projects["project-alpha"]
	codeSection, _, codeImpl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if codeSection.ID != "code-section" {
		t.Fatalf("expected code section, got %q", codeSection.ID)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalID {
		t.Fatalf("expected attached terminal id %q, got %q", terminalID, codeImpl.Code.AttachedTerminalSectionID)
	}
	if len(codeImpl.Code.Children) != 1 || codeImpl.Code.Children[0] != terminalID {
		t.Fatalf("expected code section children [%q], got %#v", terminalID, codeImpl.Code.Children)
	}

	terminalSection, _, terminalImpl, err := project.ResolveSection(terminalID)
	if err != nil {
		t.Fatalf("resolve terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "code-section" {
		t.Fatalf("expected embedded terminal parent code-section, got %q", terminalSection.ParentSectionID)
	}
	if !terminalImpl.IsTerminal() {
		t.Fatalf("expected terminal impl, got kind %q", terminalImpl.Kind)
	}
	if project.HasTopLevelSection(terminalID) {
		t.Fatal("did not expect attached terminal to be top-level")
	}
}

func TestRuntimeEnsureCodeSectionAttachedTerminalReusesValidExistingTerminal(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newRunGraphTestDocument())

	firstSnapshot, firstTerminalID, err := runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		newRunGraphTerminalSeed("attached-terminal"),
	)
	if err != nil {
		t.Fatalf("ensure first attached terminal: %v", err)
	}

	secondSnapshot, secondTerminalID, err := runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		newRunGraphTerminalSeed("replacement-terminal"),
	)
	if err != nil {
		t.Fatalf("ensure second attached terminal: %v", err)
	}
	if secondTerminalID != firstTerminalID {
		t.Fatalf("expected existing attached terminal %q to be reused, got %q", firstTerminalID, secondTerminalID)
	}
	if secondSnapshot.Revision != firstSnapshot.Revision {
		t.Fatalf("expected no-op attached terminal ensure to keep revision %d, got %d", firstSnapshot.Revision, secondSnapshot.Revision)
	}
	if _, _, _, err := secondSnapshot.Document.Projects["project-alpha"].ResolveSection("replacement-terminal"); err == nil {
		t.Fatal("did not expect replacement terminal section to be created")
	}
}

func TestRuntimeCreateTemporaryTerminalCreatesTopLevelTerminal(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newRunGraphTestDocument())

	snapshot, terminalID, err := runtime.CreateTemporaryTerminal(
		"project-alpha",
		newRunGraphTerminalSeed("temporary-terminal"),
	)
	if err != nil {
		t.Fatalf("create temporary terminal: %v", err)
	}
	if terminalID != "temporary-terminal" {
		t.Fatalf("expected temporary-terminal id, got %q", terminalID)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after temporary terminal creation, got %d", snapshot.Revision)
	}

	project := snapshot.Document.Projects["project-alpha"]
	terminalSection, terminalVariant, terminalImpl, err := project.ResolveSection(terminalID)
	if err != nil {
		t.Fatalf("resolve temporary terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "" {
		t.Fatalf("expected top-level temporary terminal to have no parent, got %q", terminalSection.ParentSectionID)
	}
	if !project.HasTopLevelSection(terminalID) {
		t.Fatal("expected temporary terminal to be top-level")
	}
	if terminalVariant.ID != "temporary-terminal-variant" {
		t.Fatalf("expected temporary variant id, got %q", terminalVariant.ID)
	}
	if !terminalImpl.IsTerminal() {
		t.Fatalf("expected terminal impl, got kind %q", terminalImpl.Kind)
	}
}

func openRunGraphTestRuntime(t *testing.T, document Document) *Runtime {
	t.Helper()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save run-graph test document: %v", err)
	}
	return openTestRuntime(t, store)
}

func newRunGraphTestDocument() Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
				},
				SectionVariantMap: map[string]string{
					"code-section": "code-variant",
				},
				Sections: map[string]Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Code Section",
						VariantIDs:       []string{"code-variant"},
						DefaultVariantID: "code-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"code-variant": {
						ID:     "code-variant",
						ImplID: "code-impl",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"code-impl": {
						ID:   "code-impl",
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
							Binding: &CodeFileBinding{
								Path:       "code/run.py",
								AccessMode: CodeFileAccessModeReadWrite,
							},
						},
					},
				},
			},
		},
	}
}

func newRunGraphTerminalSeed(sectionID string) TerminalSectionSeed {
	return TerminalSectionSeed{
		SectionID: sectionID,
		VariantID: sectionID + "-variant",
		ImplID:    sectionID + "-impl",
		Name:      "Terminal",
	}
}
