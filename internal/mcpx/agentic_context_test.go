package mcpx

import (
	"encoding/json"
	"net/http"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/tools"
)

func TestCheckAgenticScopeMapsCodeObjIDsToSections(t *testing.T) {
	t.Parallel()

	view := mustTargetResolutionProjectView(t)
	scope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve agentic scope: %v", err)
	}

	result, err := checkAgenticScope(tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessTypeWrite,
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeCodeObject: {"codeObjId"},
		},
	}, scope, map[string]any{"codeObjId": "param-1"}, &view)
	if err != nil {
		t.Fatalf("check agentic scope: %v", err)
	}

	if !result.Allowed {
		t.Fatalf("expected mapped code object to be allowed, got %#v", result)
	}
	if len(result.TargetSectionIDs) != 1 || result.TargetSectionIDs[0] != "params-section" {
		t.Fatalf("expected params-section target, got %#v", result.TargetSectionIDs)
	}
}

func TestCheckAgenticScopeReportsUnmappedCodeObjIDs(t *testing.T) {
	t.Parallel()

	view := mustTargetResolutionProjectView(t)
	scope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve agentic scope: %v", err)
	}

	result, err := checkAgenticScope(tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessTypeWrite,
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeCodeObject: {"codeObjId"},
		},
	}, scope, map[string]any{"codeObjId": "missing-code-obj"}, &view)
	if err != nil {
		t.Fatalf("check agentic scope: %v", err)
	}

	if result.Allowed {
		t.Fatalf("expected unmapped code object to fail, got %#v", result)
	}
	if result.Reason != "unmapped_code_obj" {
		t.Fatalf("expected unmapped_code_obj reason, got %q", result.Reason)
	}
	if len(result.UnmappedCodeObjIDs) != 1 || result.UnmappedCodeObjIDs[0] != "missing-code-obj" {
		t.Fatalf("unexpected unmapped code object ids %#v", result.UnmappedCodeObjIDs)
	}
}

func TestCheckAgenticScopeUsesDefaultTargetSingletonSection(t *testing.T) {
	t.Parallel()

	view := mustTargetResolutionProjectView(t)
	allowedScope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve allowed scope: %v", err)
	}
	deniedScope, err := resolveAgenticScope(view, "other-chat-section", false)
	if err != nil {
		t.Fatalf("resolve denied scope: %v", err)
	}

	metadata := tools.Metadata{
		Kind:                          tools.KindDiscoverable,
		AccessType:                    tools.AccessTypeWrite,
		DefaultTargetSingletonSection: "GenPythonCode",
	}

	allowedResult, err := checkAgenticScope(metadata, allowedScope, map[string]any{"projectConfigId": "project-alpha"}, &view)
	if err != nil {
		t.Fatalf("check allowed singleton scope: %v", err)
	}
	if !allowedResult.Allowed {
		t.Fatalf("expected singleton target to be allowed, got %#v", allowedResult)
	}
	if len(allowedResult.TargetSectionIDs) != 1 || allowedResult.TargetSectionIDs[0] != "gen-section" {
		t.Fatalf("expected singleton target gen-section, got %#v", allowedResult.TargetSectionIDs)
	}

	deniedResult, err := checkAgenticScope(metadata, deniedScope, map[string]any{"projectConfigId": "project-alpha"}, &view)
	if err != nil {
		t.Fatalf("check denied singleton scope: %v", err)
	}
	if deniedResult.Allowed {
		t.Fatalf("expected singleton target to be blocked, got %#v", deniedResult)
	}
	if deniedResult.Reason != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %q", deniedResult.Reason)
	}
	if len(deniedResult.BlockedSectionIDs) != 1 || deniedResult.BlockedSectionIDs[0] != "gen-section" {
		t.Fatalf("expected blocked singleton target gen-section, got %#v", deniedResult.BlockedSectionIDs)
	}
}

func TestResolveAgenticContextIncludesRunIDFromMetaAndHeaders(t *testing.T) {
	t.Parallel()

	headers := http.Header{}
	headers.Set(AgenticContextSectionIDHeader, "section-chat")
	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId": "project-alpha",
				"chatId":          "chat-alpha",
				"runId":           "run-child",
			},
			Headers: headers,
		},
		nil,
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.RunID != "run-child" {
		t.Fatalf("expected runId run-child, got %q", resolved.RunID)
	}
	if resolved.SectionID != "section-chat" {
		t.Fatalf("expected sectionId section-chat, got %q", resolved.SectionID)
	}
}

func TestResolveAgenticContextFallsBackToSessionRunID(t *testing.T) {
	t.Parallel()

	resolved, err := resolveAgenticContext(ToolRequestContext{}, &AgenticContext{
		ProjectConfigID: "project-alpha",
		RunID:           "run-child",
	})
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.RunID != "run-child" {
		t.Fatalf("expected session runId run-child, got %q", resolved.RunID)
	}
}

func mustTargetResolutionProjectView(t *testing.T) projectview.SingleConfig {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"chat-section":       "chat-variant",
					"params-section":     "params-variant",
					"gen-section":        "gen-variant",
					"other-chat-section": "other-chat-variant",
					"other-section":      "other-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{ID: "edge-params", SourceSectionID: "chat-section", TargetSectionID: "params-section", Kind: agenticEdgeKindChatSection},
					{ID: "edge-gen", SourceSectionID: "chat-section", TargetSectionID: "gen-section", Kind: agenticEdgeKindChatSection},
					{ID: "edge-other", SourceSectionID: "other-chat-section", TargetSectionID: "other-section", Kind: agenticEdgeKindChatSection},
				},
				Sections: map[string]projectstate.Section{
					"chat-section":       {ID: "chat-section", Name: "Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
					"params-section":     {ID: "params-section", Name: "Params", VariantIDs: []string{"params-variant"}, DefaultVariantID: "params-variant"},
					"gen-section":        {ID: "gen-section", Name: "Gen", VariantIDs: []string{"gen-variant"}, DefaultVariantID: "gen-variant"},
					"other-chat-section": {ID: "other-chat-section", Name: "Other Chat", VariantIDs: []string{"other-chat-variant"}, DefaultVariantID: "other-chat-variant"},
					"other-section":      {ID: "other-section", Name: "Other", VariantIDs: []string{"other-variant"}, DefaultVariantID: "other-variant"},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":       {ID: "chat-variant", ImplID: "chat-impl"},
					"params-variant":     {ID: "params-variant", ImplID: "params-impl"},
					"gen-variant":        {ID: "gen-variant", ImplID: "gen-impl"},
					"other-chat-variant": {ID: "other-chat-variant", ImplID: "other-chat-impl"},
					"other-variant":      {ID: "other-variant", ImplID: "other-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl":       {ID: "chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"})},
					"params-impl":     {ID: "params-impl", Kind: projectstate.SectionKind("dict"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "params-impl", "type": "Dict", "codeObjVariantMap": map[string]string{"param-1": "param-1-variant"}})},
					"gen-impl":        {ID: "gen-impl", Kind: projectstate.SectionKindCode, Code: &projectstate.CodeSectionImpl{Language: projectstate.CodeLanguagePython}, Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "gen-impl", "type": "GenPythonCode", "code": "", "children": []any{}})},
					"other-chat-impl": {ID: "other-chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "other-chat-impl", "type": "Chat"})},
					"other-impl":      {ID: "other-impl", Kind: projectstate.SectionKind("dict"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "other-impl", "type": "Dict"})},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"param-1": {ID: "param-1", Name: "param_1", VariantIDs: []string{"param-1-variant"}, DefaultVariantID: "param-1-variant"},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"param-1-variant": {ID: "param-1-variant", ImplID: "param-1-impl"},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"param-1-impl": {ID: "param-1-impl", Type: "TextParam", Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "param-1-impl", "type": "TextParam", "value": "1"})},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize target-resolution project: %v", err)
	}

	view, err := projectview.SingleConfigByProjectID(document, "project-alpha")
	if err != nil {
		t.Fatalf("single config by project id: %v", err)
	}
	return view
}

func mustTargetResolutionRawJSON(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal target-resolution raw json: %v", err)
	}
	return encoded
}
