package app

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"setta/internal/boundcode"
	"setta/internal/projectstate"
)

type stubBoundSectionSynchronizer struct {
	calls  []projectstate.WatchCodeBoundSection
	synced bool
}

func (s *stubBoundSectionSynchronizer) SyncWatchCodeBoundSection(
	_ context.Context,
	section projectstate.WatchCodeBoundSection,
) error {
	s.calls = append(s.calls, section)
	s.synced = true
	return nil
}

type orderingCallableSignatureResolver struct {
	syncer    *stubBoundSectionSynchronizer
	callCount int
}

func (s *orderingCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	s.callCount++
	if s.syncer == nil || !s.syncer.synced {
		return projectstate.CallableSignatureResult{}, false, fmt.Errorf("signature resolver ran before bound section LSP sync")
	}
	return projectstate.CallableSignatureResult{
		Status: projectstate.SignatureHelpStatusMatched,
		Params: []projectstate.CallableParamProposal{
			{Name: "value", PassingStyle: "POSITIONAL_ONLY"},
			{Name: "extra", PassingStyle: "POSITIONAL_ONLY"},
		},
	}, true, nil
}

// External bound-file reloads must reuse the same LSP-before-Watch-Code path as
// inline edits so signature refetch sees the newly synced source of truth.
func TestCodeUpdateServiceReloadBoundCodeFileSyncsLSPBeforeWatchCodeApply(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	project := watchCodeBoundReloadProject(t)

	if _, err := project.ApplyWatchCodeBoundSectionUpdate(
		context.Background(),
		"section-main",
		workspaceRoot,
		nil,
	); err != nil {
		t.Fatalf("seed watch code bound section update: %v", err)
	}
	initialSignatureHash := project.WatchCodeRegistry["pkg.bound.watched:function"].SignatureHash

	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	syncer := &stubBoundSectionSynchronizer{}
	resolver := &orderingCallableSignatureResolver{syncer: syncer}
	service, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:       runtime,
		LSPSync:            syncer,
		CallableSignatures: resolver,
		WorkspaceRoot:      workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new code update service: %v", err)
	}

	updatedSource := "def watched(value, extra):\n    return value + extra\n"
	if err := service.ReloadBoundCodeFile(context.Background(), updatedSource, []boundcode.Binding{
		{ProjectID: "project-alpha", SectionID: "section-main"},
	}); err != nil {
		t.Fatalf("reload bound code file: %v", err)
	}

	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}
	if len(syncer.calls) != 1 {
		t.Fatalf("expected one LSP sync call, got %#v", syncer.calls)
	}
	if syncer.calls[0].Code != updatedSource {
		t.Fatalf("expected synced source %q, got %q", updatedSource, syncer.calls[0].Code)
	}

	snapshot := runtime.Snapshot()
	updatedProject := snapshot.Document.Projects["project-alpha"]
	entry := updatedProject.WatchCodeRegistry["pkg.bound.watched:function"]
	if entry.SignatureHash == initialSignatureHash {
		t.Fatalf("expected updated watch code signature hash, got %#v", entry)
	}

	boundSection, ok, err := updatedProject.ResolveWatchCodeBoundSection("section-main", workspaceRoot)
	if err != nil {
		t.Fatalf("resolve updated bound section: %v", err)
	}
	if !ok {
		t.Fatal("expected updated bound section to stay watch-code eligible")
	}
	if boundSection.Code != updatedSource {
		t.Fatalf("expected updated bound section source %q, got %q", updatedSource, boundSection.Code)
	}
}

func watchCodeBoundReloadProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		WatchCodeEnabled: true,
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  json.RawMessage(`{"language":"python"}`),
			},
		},
		SectionVariantMap: map[string]string{
			"section-main": "variant-main",
		},
		Sections: map[string]projectstate.Section{
			"section-main": {
				ID:               "section-main",
				Name:             "Main",
				VariantIDs:       []string{"variant-main"},
				DefaultVariantID: "variant-main",
				UnsharedKeys:     []string{"code"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"variant-main": {
				ID:               "variant-main",
				ImplID:           "impl-main",
				NonPresetImplIDs: []string{"impl-main"},
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"impl-main": {
				ID:   "impl-main",
				Kind: projectstate.SectionKindCode,
				Payload: projectstate.RawJSON(`{
					"id":"impl-main",
					"type":"Code",
					"code":"def watched(value):\n    return value\n",
					"codeLanguage":"python",
					"children":[]
				}`),
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Binding: &projectstate.CodeFileBinding{
						Path:       "pkg/bound.py",
						AccessMode: projectstate.CodeFileAccessModeReadWrite,
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize watch code bound reload project: %v", err)
	}
	return project
}
