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

func TestDocumentResolveRunTargetUsesGeneratedEntryWhenPythonCodegenEnabled(t *testing.T) {
	t.Parallel()

	document := newGeneratedRunGraphTestDocument()

	target, err := document.ResolveRunTarget("project-alpha", "")
	if err != nil {
		t.Fatalf("resolve generated run target: %v", err)
	}
	if target.Kind != RunTargetKindGeneratedEntry {
		t.Fatalf("expected generated entry target, got %q", target.Kind)
	}
	if target.Generated == nil || target.Generated.CodeBinding == nil {
		t.Fatal("expected generated entry binding to be available")
	}
	if target.Generated.CodeBinding.Path != "code/generated.py" {
		t.Fatalf("expected generated entry binding path code/generated.py, got %q", target.Generated.CodeBinding.Path)
	}
}

func TestDocumentResolveRunTargetCollapsesGeneratedSectionSelectionToEntry(t *testing.T) {
	t.Parallel()

	document := newGeneratedRunGraphTestDocument()

	target, err := document.ResolveRunTarget("project-alpha", "gen-python-section")
	if err != nil {
		t.Fatalf("resolve generated python section: %v", err)
	}
	if target.Kind != RunTargetKindGeneratedEntry {
		t.Fatalf("expected generated entry target, got %q", target.Kind)
	}
	if target.Generated == nil || target.Generated.UsesPluginCodegen {
		t.Fatal("expected first-party generated entry target")
	}
}

func TestDocumentResolveRunTargetMarksPluginGeneratedSelectionUnsupported(t *testing.T) {
	t.Parallel()

	document := newGeneratedRunGraphTestDocument()

	target, err := document.ResolveRunTarget("project-alpha", "gen-plugin-section")
	if err != nil {
		t.Fatalf("resolve plugin generated section: %v", err)
	}
	if target.Kind != RunTargetKindGeneratedEntry {
		t.Fatalf("expected generated entry target, got %q", target.Kind)
	}
	if target.Generated == nil || !target.Generated.UsesPluginCodegen {
		t.Fatal("expected plugin-generated target to be marked unsupported")
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

func TestRuntimeEnsureCodeSectionAttachedTerminalCreatesConcreteSizedEmbeddedTerminal(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newAttachedTerminalWriteTestDocument())

	snapshot, terminalID, err := runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		newRunGraphTerminalSeed("ensured-terminal"),
	)
	if err != nil {
		t.Fatalf("ensure attached terminal: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	terminalPayload, err := effectiveSectionPayload(project, terminalID, project.SectionVariantMap[terminalID])
	if err != nil {
		t.Fatalf("terminal payload: %v", err)
	}
	terminalSize, ok := payloadObjectField(terminalPayload, "size")
	if !ok {
		t.Fatalf("expected terminal size payload, got %#v", terminalPayload)
	}
	terminalWidth, isAuto, present, err := payloadAutoLayoutSizeValue(terminalSize, "width")
	if err != nil {
		t.Fatalf("parse terminal width: %v", err)
	}
	if !present || isAuto {
		t.Fatalf("expected concrete terminal width, got %#v", terminalSize)
	}
	if terminalWidth != 640.0 {
		t.Fatalf("expected terminal width 640 to match parent code width, got %v", terminalWidth)
	}
	terminalHeight, isAuto, present, err := payloadAutoLayoutSizeValue(terminalSize, "height")
	if err != nil {
		t.Fatalf("parse terminal height: %v", err)
	}
	if !present || isAuto {
		t.Fatalf("expected concrete terminal height, got %#v", terminalSize)
	}
	if terminalHeight <= 0 {
		t.Fatalf("expected positive terminal height, got %v", terminalHeight)
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

func TestDocumentValidateAttachedTerminalForVariantUsesSpecifiedVariant(t *testing.T) {
	t.Parallel()

	document := newRunGraphVariantTestDocument()
	if _, err := document.EnsureCodeSectionAttachedTerminalForVariant(
		"project-alpha",
		"code-section",
		"code-bash-variant",
		newRunGraphTerminalSeed("bash-terminal"),
	); err != nil {
		t.Fatalf("ensure attached terminal for variant: %v", err)
	}

	valid, err := document.ValidateAttachedTerminal("project-alpha", "code-section", "bash-terminal")
	if err != nil {
		t.Fatalf("validate attached terminal against active variant: %v", err)
	}
	if valid {
		t.Fatal("did not expect inactive-variant terminal to validate against the active variant")
	}

	valid, err = document.ValidateAttachedTerminalForVariant("project-alpha", "code-section", "code-bash-variant", "bash-terminal")
	if err != nil {
		t.Fatalf("validate attached terminal for variant: %v", err)
	}
	if !valid {
		t.Fatal("expected inactive-variant terminal to validate against the specified variant")
	}
}

func TestRuntimeEnsureCodeSectionAttachedTerminalForVariantCreatesEmbeddedTerminalOnInactiveVariant(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newRunGraphVariantTestDocument())

	snapshot, terminalID, err := runtime.EnsureCodeSectionAttachedTerminalForVariant(
		"project-alpha",
		"code-section",
		"code-bash-variant",
		newRunGraphTerminalSeed("bash-terminal"),
	)
	if err != nil {
		t.Fatalf("ensure attached terminal for inactive variant: %v", err)
	}
	if terminalID != "bash-terminal" {
		t.Fatalf("expected bash-terminal id, got %q", terminalID)
	}

	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["code-section"]; got != "code-python-variant" {
		t.Fatalf("expected active section variant to stay code-python-variant, got %q", got)
	}

	_, _, pythonImpl, err := project.ResolveSectionWithVariant("code-section", "code-python-variant")
	if err != nil {
		t.Fatalf("resolve python variant: %v", err)
	}
	if pythonImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("did not expect active python variant to gain an attached terminal, got %q", pythonImpl.Code.AttachedTerminalSectionID)
	}

	_, _, bashImpl, err := project.ResolveSectionWithVariant("code-section", "code-bash-variant")
	if err != nil {
		t.Fatalf("resolve bash variant: %v", err)
	}
	if bashImpl.Code.AttachedTerminalSectionID != terminalID {
		t.Fatalf("expected bash variant attached terminal %q, got %q", terminalID, bashImpl.Code.AttachedTerminalSectionID)
	}
	if len(bashImpl.Code.Children) != 1 || bashImpl.Code.Children[0] != terminalID {
		t.Fatalf("expected bash variant child terminal [%q], got %#v", terminalID, bashImpl.Code.Children)
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
	if _, ok := project.TopLevelSections[terminalID]; !ok {
		t.Fatalf("expected temporary terminal layout in top-level sections, got %#v", project.TopLevelSections)
	}
	activeViewMode := project.ViewModes[project.ActiveViewModeID]
	if !activeViewMode.VisibilityBySectionID[terminalID] {
		t.Fatalf("expected temporary terminal visibility in active view mode, got %#v", activeViewMode.VisibilityBySectionID)
	}
	if _, ok := activeViewMode.TopLevelSections[terminalID]; !ok {
		t.Fatalf("expected temporary terminal layout in active view mode, got %#v", activeViewMode.TopLevelSections)
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

func newRunGraphVariantTestDocument() Document {
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
					"code-section": "code-python-variant",
				},
				Sections: map[string]Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Code Section",
						VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
						DefaultVariantID: "code-python-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"code-bash-variant": {
						ID:     "code-bash-variant",
						ImplID: "code-bash-impl",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"code-python-impl": {
						ID:   "code-python-impl",
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
							Binding: &CodeFileBinding{
								Path:       "code/run.py",
								AccessMode: CodeFileAccessModeReadWrite,
							},
						},
					},
					"code-bash-impl": {
						ID:   "code-bash-impl",
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language: CodeLanguageBash,
							Binding: &CodeFileBinding{
								Path:       "code/run.sh",
								AccessMode: CodeFileAccessModeReadWrite,
							},
						},
					},
				},
			},
		},
	}
}

func newGeneratedRunGraphTestDocument() Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{Language: string(CodeLanguagePython)},
				},
				GeneratedCodeBinding: &CodeFileBinding{
					Path:       "code/generated.py",
					AccessMode: CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &CodeFileBinding{
					Path:       "code/setta_gen_meta.py",
					AccessMode: CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
					"gen-python-section",
					"gen-plugin-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":       "code-variant",
					"gen-python-section": "gen-python-variant",
					"gen-plugin-section": "gen-plugin-variant",
				},
				Sections: map[string]Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Code Section",
						VariantIDs:       []string{"code-variant"},
						DefaultVariantID: "code-variant",
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
				SectionVariants: map[string]SectionVariant{
					"code-variant": {
						ID:     "code-variant",
						ImplID: "code-impl",
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
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: SectionKindGenerated,
						Generated: &GeneratedSectionImpl{
							Kind: GeneratedSectionKindPythonCode,
						},
					},
					"gen-plugin-impl": {
						ID:   "gen-plugin-impl",
						Kind: SectionKindGenerated,
						Generated: &GeneratedSectionImpl{
							Kind: GeneratedSectionKindPlugin,
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
