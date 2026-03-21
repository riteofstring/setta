package mcpx

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"setta/internal/modes"
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

func TestResolveAgenticScopeKeepsUnscopedAccessWhenSectionContextIsPresent(t *testing.T) {
	t.Parallel()

	view := mustTargetResolutionProjectView(t)
	scope, err := resolveAgenticScope(view, "chat-section", true)
	if err != nil {
		t.Fatalf("resolve agentic scope: %v", err)
	}

	if !scope.StructuralAllowed {
		t.Fatal("expected allowUnscoped scope to keep structural access")
	}
	if _, ok := scope.WriteSectionIDs["other-section"]; !ok {
		t.Fatalf("expected allowUnscoped scope to include all writable sections, got %#v", scope.WriteSectionIDs)
	}
	if _, ok := scope.ContextSectionIDs["chat-section"]; !ok {
		t.Fatalf("expected allowUnscoped scope to retain context section coverage, got %#v", scope.ContextSectionIDs)
	}
	if len(scope.PeerChatSectionIDs) != 0 {
		t.Fatalf("expected allowUnscoped scope to keep peer chat scope empty, got %#v", scope.PeerChatSectionIDs)
	}
}

func TestResolveAgenticScopeFollowsOutgoingEdgesOnly(t *testing.T) {
	t.Parallel()

	view := mustScopeParityProjectView(t)
	scope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve scoped agentic scope: %v", err)
	}

	if len(scope.ReadSectionIDs) != 1 || !containsStringSet(scope.ReadSectionIDs, "allowed-section") {
		t.Fatalf("expected only outgoing writable section in read scope, got %#v", scope.ReadSectionIDs)
	}
	if len(scope.WriteSectionIDs) != 1 || !containsStringSet(scope.WriteSectionIDs, "allowed-section") {
		t.Fatalf("expected only outgoing writable section in write scope, got %#v", scope.WriteSectionIDs)
	}
	if len(scope.ContextSectionIDs) != 1 || !containsStringSet(scope.ContextSectionIDs, "allowed-section") {
		t.Fatalf("expected only outgoing writable section in context scope, got %#v", scope.ContextSectionIDs)
	}
	if len(scope.PeerChatSectionIDs) != 1 || !containsStringSet(scope.PeerChatSectionIDs, "peer-chat-section") {
		t.Fatalf("expected only outgoing peer chat target in peer scope, got %#v", scope.PeerChatSectionIDs)
	}
	if containsStringSet(scope.ReadSectionIDs, "incoming-section") || containsStringSet(scope.ContextSectionIDs, "incoming-section") {
		t.Fatalf("did not expect incoming section edge to grant scope, got read=%#v context=%#v", scope.ReadSectionIDs, scope.ContextSectionIDs)
	}
	if containsStringSet(scope.PeerChatSectionIDs, "incoming-chat-section") {
		t.Fatalf("did not expect incoming peer chat edge to grant peer scope, got %#v", scope.PeerChatSectionIDs)
	}

	projectScope, err := resolveAgenticScope(view, "", true)
	if err != nil {
		t.Fatalf("resolve unscoped project scope: %v", err)
	}
	if !projectScope.StructuralAllowed {
		t.Fatal("expected unscoped project scope to allow structural access")
	}
	if !containsStringSet(projectScope.ReadSectionIDs, "incoming-section") || !containsStringSet(projectScope.ReadSectionIDs, "peer-chat-section") {
		t.Fatalf("expected unscoped project scope to include all sections, got %#v", projectScope.ReadSectionIDs)
	}
	if len(projectScope.PeerChatSectionIDs) != 0 {
		t.Fatalf("expected unscoped project scope to keep peer chat scope empty, got %#v", projectScope.PeerChatSectionIDs)
	}

	deniedProjectScope, err := resolveAgenticScope(view, "", false)
	if err != nil {
		t.Fatalf("resolve denied project scope: %v", err)
	}
	if deniedProjectScope.StructuralAllowed || len(deniedProjectScope.ReadSectionIDs) != 0 || len(deniedProjectScope.WriteSectionIDs) != 0 || len(deniedProjectScope.ContextSectionIDs) != 0 || len(deniedProjectScope.PeerChatSectionIDs) != 0 {
		t.Fatalf("expected denied project scope to be empty, got %#v", deniedProjectScope)
	}
}

func TestCheckAgenticScopePeerChatTargetsDoNotExpandReadScope(t *testing.T) {
	t.Parallel()

	view := mustScopeParityProjectView(t)
	scope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve agentic scope: %v", err)
	}

	readResult, err := checkAgenticScope(tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessTypeRead,
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeSection: {"sectionId"},
		},
	}, scope, map[string]any{"sectionId": "peer-chat-section"}, &view)
	if err != nil {
		t.Fatalf("check peer chat as read target: %v", err)
	}
	if readResult.Allowed {
		t.Fatalf("expected peer chat target to stay out of read scope, got %#v", readResult)
	}
	if readResult.Reason != "out_of_scope" {
		t.Fatalf("expected out_of_scope for peer chat read target, got %q", readResult.Reason)
	}
	if len(readResult.BlockedSectionIDs) != 1 || readResult.BlockedSectionIDs[0] != "peer-chat-section" {
		t.Fatalf("expected blocked peer chat target, got %#v", readResult.BlockedSectionIDs)
	}

	peerAllowed, err := checkAgenticScope(tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessType(accessTypePeerChat),
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeSection: {"targetSectionId"},
		},
	}, scope, map[string]any{"targetSectionId": "peer-chat-section"}, &view)
	if err != nil {
		t.Fatalf("check allowed peer chat target: %v", err)
	}
	if !peerAllowed.Allowed {
		t.Fatalf("expected outgoing peer chat target to be allowed, got %#v", peerAllowed)
	}
	if len(peerAllowed.TargetSectionIDs) != 1 || peerAllowed.TargetSectionIDs[0] != "peer-chat-section" {
		t.Fatalf("expected peer chat target section, got %#v", peerAllowed.TargetSectionIDs)
	}

	peerDenied, err := checkAgenticScope(tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessType(accessTypePeerChat),
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeSection: {"targetSectionId"},
		},
	}, scope, map[string]any{"targetSectionId": "allowed-section"}, &view)
	if err != nil {
		t.Fatalf("check denied peer chat target: %v", err)
	}
	if peerDenied.Allowed {
		t.Fatalf("expected non-chat target to be blocked for peer chat access, got %#v", peerDenied)
	}
	if len(peerDenied.BlockedSectionIDs) != 1 || peerDenied.BlockedSectionIDs[0] != "allowed-section" {
		t.Fatalf("expected blocked non-peer target, got %#v", peerDenied.BlockedSectionIDs)
	}
}

func TestResolveAgenticScopeRecomputesAfterEdgeEdits(t *testing.T) {
	t.Parallel()

	view := mustScopeParityProjectView(t)
	view.ProjectConfig.AgenticEdges = []projectstate.AgenticEdge{
		{ID: "edge-outgoing", SourceSectionID: "chat-section", TargetSectionID: "allowed-section", Kind: agenticEdgeKindChatSection},
		{ID: "edge-incoming-section", SourceSectionID: "incoming-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindSectionChat},
		{ID: "edge-incoming-peer", SourceSectionID: "incoming-chat-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindChatChat},
	}

	initialScope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve initial scope: %v", err)
	}
	if len(initialScope.ReadSectionIDs) != 1 || !containsStringSet(initialScope.ReadSectionIDs, "allowed-section") {
		t.Fatalf("expected initial outgoing target only, got %#v", initialScope.ReadSectionIDs)
	}
	if len(initialScope.PeerChatSectionIDs) != 0 {
		t.Fatalf("expected no outgoing peer chats initially, got %#v", initialScope.PeerChatSectionIDs)
	}

	view.ProjectConfig.AgenticEdges = []projectstate.AgenticEdge{
		{ID: "edge-outgoing", SourceSectionID: "chat-section", TargetSectionID: "second-section", Kind: agenticEdgeKindChatSection},
		{ID: "edge-peer", SourceSectionID: "chat-section", TargetSectionID: "peer-chat-section", Kind: agenticEdgeKindChatChat},
		{ID: "edge-incoming-section", SourceSectionID: "incoming-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindSectionChat},
		{ID: "edge-incoming-peer", SourceSectionID: "incoming-chat-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindChatChat},
	}

	updatedScope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve updated scope: %v", err)
	}
	if len(updatedScope.ReadSectionIDs) != 1 || !containsStringSet(updatedScope.ReadSectionIDs, "second-section") {
		t.Fatalf("expected updated outgoing target only, got %#v", updatedScope.ReadSectionIDs)
	}
	if len(updatedScope.WriteSectionIDs) != 1 || !containsStringSet(updatedScope.WriteSectionIDs, "second-section") {
		t.Fatalf("expected updated write target only, got %#v", updatedScope.WriteSectionIDs)
	}
	if len(updatedScope.ContextSectionIDs) != 1 || !containsStringSet(updatedScope.ContextSectionIDs, "second-section") {
		t.Fatalf("expected updated context target only, got %#v", updatedScope.ContextSectionIDs)
	}
	if len(updatedScope.PeerChatSectionIDs) != 1 || !containsStringSet(updatedScope.PeerChatSectionIDs, "peer-chat-section") {
		t.Fatalf("expected outgoing peer chat after edit, got %#v", updatedScope.PeerChatSectionIDs)
	}

	view.ProjectConfig.AgenticEdges = []projectstate.AgenticEdge{
		{ID: "edge-incoming-section", SourceSectionID: "incoming-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindSectionChat},
		{ID: "edge-incoming-peer", SourceSectionID: "incoming-chat-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindChatChat},
	}

	clearedScope, err := resolveAgenticScope(view, "chat-section", false)
	if err != nil {
		t.Fatalf("resolve cleared scope: %v", err)
	}
	if len(clearedScope.ReadSectionIDs) != 0 || len(clearedScope.WriteSectionIDs) != 0 || len(clearedScope.ContextSectionIDs) != 0 || len(clearedScope.PeerChatSectionIDs) != 0 {
		t.Fatalf("expected cleared scope after removing outgoing edges, got %#v", clearedScope)
	}
}

func TestBuildMissingEdgeHintsUsesCorrectKindAndDirection(t *testing.T) {
	t.Parallel()

	view := mustTargetResolutionProjectView(t)

	readSectionHints := buildMissingEdgeHints("chat-section", []string{"params-section"}, string(tools.AccessTypeRead), &view)
	if len(readSectionHints) != 1 || readSectionHints[0] != (scopeViolationMissingEdge{
		SourceSectionID: "chat-section",
		TargetSectionID: "params-section",
		Kind:            agenticEdgeKindChatSection,
	}) {
		t.Fatalf("unexpected read section hints %#v", readSectionHints)
	}

	writeSectionHints := buildMissingEdgeHints("chat-section", []string{"gen-section"}, string(tools.AccessTypeWrite), &view)
	if len(writeSectionHints) != 1 || writeSectionHints[0] != (scopeViolationMissingEdge{
		SourceSectionID: "chat-section",
		TargetSectionID: "gen-section",
		Kind:            agenticEdgeKindChatSection,
	}) {
		t.Fatalf("unexpected write section hints %#v", writeSectionHints)
	}

	readChatHints := buildMissingEdgeHints("chat-section", []string{"other-chat-section"}, string(tools.AccessTypeRead), &view)
	if len(readChatHints) != 1 || readChatHints[0] != (scopeViolationMissingEdge{
		SourceSectionID: "chat-section",
		TargetSectionID: "other-chat-section",
		Kind:            agenticEdgeKindChatSection,
	}) {
		t.Fatalf("unexpected read chat hints %#v", readChatHints)
	}

	peerChatHints := buildMissingEdgeHints("chat-section", []string{"other-chat-section"}, "peer_chat", &view)
	if len(peerChatHints) != 1 || peerChatHints[0] != (scopeViolationMissingEdge{
		SourceSectionID: "chat-section",
		TargetSectionID: "other-chat-section",
		Kind:            agenticEdgeKindChatChat,
	}) {
		t.Fatalf("unexpected peer chat hints %#v", peerChatHints)
	}

	if hints := buildMissingEdgeHints("", []string{"params-section"}, string(tools.AccessTypeRead), &view); len(hints) != 0 {
		t.Fatalf("expected no hints without chat section id, got %#v", hints)
	}
}

func TestBuildScopeViolationErrorSortsPayloadAndProvidesActionableMissingContext(t *testing.T) {
	t.Parallel()

	sortedErr := buildScopeViolationError(
		"set_section_name",
		"out_of_scope",
		[]string{"b", "a"},
		[]string{"b", "a"},
		[]string{"d", "c"},
		[]scopeViolationMissingEdge{{
			SourceSectionID: "section-1",
			TargetSectionID: "a",
			Kind:            agenticEdgeKindChatSection,
		}},
	)
	typed, ok := sortedErr.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", sortedErr)
	}
	if values, ok := typed.data["blockedSectionIds"].([]string); !ok || len(values) != 2 || values[0] != "a" || values[1] != "b" {
		t.Fatalf("expected sorted blockedSectionIds, got %#v", typed.data["blockedSectionIds"])
	}
	if values, ok := typed.data["targetSectionIds"].([]string); !ok || len(values) != 2 || values[0] != "a" || values[1] != "b" {
		t.Fatalf("expected sorted targetSectionIds, got %#v", typed.data["targetSectionIds"])
	}
	if values, ok := typed.data["unmappedCodeObjIds"].([]string); !ok || len(values) != 2 || values[0] != "c" || values[1] != "d" {
		t.Fatalf("expected sorted unmappedCodeObjIds, got %#v", typed.data["unmappedCodeObjIds"])
	}
	var missingEdges []scopeViolationMissingEdge
	encodedMissingEdges, err := json.Marshal(typed.data["missingEdgesCanonical"])
	if err != nil {
		t.Fatalf("marshal missingEdgesCanonical: %v", err)
	}
	if err := json.Unmarshal(encodedMissingEdges, &missingEdges); err != nil {
		t.Fatalf("decode missingEdgesCanonical: %v", err)
	}
	if len(missingEdges) != 1 || missingEdges[0] != (scopeViolationMissingEdge{
		SourceSectionID: "section-1",
		TargetSectionID: "a",
		Kind:            agenticEdgeKindChatSection,
	}) {
		t.Fatalf("unexpected missingEdgesCanonical %#v", missingEdges)
	}
	if !strings.Contains(typed.message, "blockedSectionIds/targetSectionIds") {
		t.Fatalf("expected blocked payload guidance in message, got %q", typed.message)
	}
	if strings.Contains(typed.message, "blocked=[") {
		t.Fatalf("expected structured payload message without raw blocked list, got %q", typed.message)
	}

	missingContextErr := buildScopeViolationError(
		"get_latest_project_state_summary",
		"missing_context",
		nil,
		nil,
		nil,
		nil,
	)
	missingContextTyped, ok := missingContextErr.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", missingContextErr)
	}
	if !strings.Contains(missingContextTyped.message, "missing agentic context") {
		t.Fatalf("expected missing agentic context message, got %q", missingContextTyped.message)
	}
	if !strings.Contains(missingContextTyped.message, "projectConfigId") {
		t.Fatalf("expected missing_context guidance to mention projectConfigId, got %q", missingContextTyped.message)
	}
	if !strings.Contains(missingContextTyped.message, "set_agentic_context") {
		t.Fatalf("expected missing_context guidance to mention set_agentic_context, got %q", missingContextTyped.message)
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

func TestResolveAgenticContextIncludesProjectConfigIDFromMetaWhenSessionMissing(t *testing.T) {
	t.Parallel()

	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId": "project-from-meta",
			},
		},
		nil,
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.ProjectConfigID != "project-from-meta" {
		t.Fatalf("expected projectConfigId project-from-meta, got %q", resolved.ProjectConfigID)
	}
}

func TestResolveAgenticContextPrefersSessionProjectShareChatRunAndSectionOverRequestMetaAndHeaders(t *testing.T) {
	t.Parallel()

	headers := http.Header{}
	headers.Set(AgenticContextProjectConfigIDHeader, "project-from-header")
	headers.Set(modes.ShareSessionHeaderName, "share-from-header")
	headers.Set(AgenticContextChatIDHeader, "chat-from-header")
	headers.Set(AgenticContextRunIDHeader, "run-from-header")
	headers.Set(AgenticContextSectionIDHeader, "section-from-header")

	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId": "project-from-meta",
				"shareSessionId":  "share-from-meta",
				"chatId":          "chat-from-meta",
				"runId":           "run-from-meta",
				"sectionId":       "section-from-meta",
			},
			Headers: headers,
		},
		&AgenticContext{
			ProjectConfigID: "project-from-session",
			ShareSessionID:  "share-from-session",
			ChatID:          "chat-from-session",
			RunID:           "run-from-session",
			SectionID:       "section-from-session",
		},
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.ProjectConfigID != "project-from-session" {
		t.Fatalf("expected session projectConfigId, got %q", resolved.ProjectConfigID)
	}
	if resolved.ShareSessionID != "share-from-session" {
		t.Fatalf("expected session shareSessionId, got %q", resolved.ShareSessionID)
	}
	if resolved.ChatID != "chat-from-session" {
		t.Fatalf("expected session chatId, got %q", resolved.ChatID)
	}
	if resolved.RunID != "run-from-session" {
		t.Fatalf("expected session runId, got %q", resolved.RunID)
	}
	if resolved.SectionID != "section-from-session" {
		t.Fatalf("expected session sectionId, got %q", resolved.SectionID)
	}
}

func TestResolveAgenticContextIncludesShareSessionIDFromMeta(t *testing.T) {
	t.Parallel()

	headers := http.Header{}
	headers.Set(modes.ShareSessionHeaderName, "header-session")
	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId": "project-alpha",
				"shareSessionId":  "meta-session",
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
	if resolved.ShareSessionID != "meta-session" {
		t.Fatalf("expected shareSessionId meta-session, got %q", resolved.ShareSessionID)
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

func TestResolveAgenticContextFallsBackToSessionShareSessionID(t *testing.T) {
	t.Parallel()

	resolved, err := resolveAgenticContext(ToolRequestContext{}, &AgenticContext{
		ProjectConfigID: "project-alpha",
		ShareSessionID:  "share-session-1",
	})
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.ShareSessionID != "share-session-1" {
		t.Fatalf("expected session shareSessionId share-session-1, got %q", resolved.ShareSessionID)
	}
}

func TestResolveAgenticContextUsesRequestFrontendAffinityTokenWhenSessionAffinityMissing(t *testing.T) {
	t.Parallel()

	headers := http.Header{}
	headers.Set(AgenticContextFrontendAffinityHeader, "frontend-from-header")
	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId":       "project-alpha",
				"frontendAffinityToken": "frontend-from-request",
			},
			Headers: headers,
		},
		&AgenticContext{ProjectConfigID: "project-alpha"},
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token, got %q", resolved.FrontendAffinityToken)
	}
}

func TestResolveAgenticContextPrefersSessionFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId":       "project-alpha",
				"frontendAffinityToken": "frontend-from-request",
			},
		},
		&AgenticContext{
			ProjectConfigID:       "project-alpha",
			FrontendAffinityToken: "frontend-from-session",
		},
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.FrontendAffinityToken != "frontend-from-session" {
		t.Fatalf("expected session frontend affinity token, got %q", resolved.FrontendAffinityToken)
	}
}

func TestResolveAgenticContextIgnoresMalformedMetaFrontendAffinityTokenWhenSessionAffinityExists(t *testing.T) {
	t.Parallel()

	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId":       "project-alpha",
				"frontendAffinityToken": []any{"frontend-from-request"},
			},
		},
		&AgenticContext{
			ProjectConfigID:       "project-alpha",
			FrontendAffinityToken: "frontend-from-session",
		},
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.FrontendAffinityToken != "frontend-from-session" {
		t.Fatalf("expected session frontend affinity token, got %q", resolved.FrontendAffinityToken)
	}
}

func TestResolveAgenticContextIgnoresBlankMetaFrontendAffinityTokenWithoutSessionAffinity(t *testing.T) {
	t.Parallel()

	resolved, err := resolveAgenticContext(
		ToolRequestContext{
			Meta: map[string]any{
				"projectConfigId":       "project-alpha",
				"frontendAffinityToken": "   ",
			},
		},
		nil,
	)
	if err != nil {
		t.Fatalf("resolve agentic context: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected resolved agentic context")
	}
	if resolved.FrontendAffinityToken != "" {
		t.Fatalf("expected blank frontend affinity token to be ignored, got %q", resolved.FrontendAffinityToken)
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

func mustScopeParityProjectView(t *testing.T) projectview.SingleConfig {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"chat-section":          "chat-variant",
					"peer-chat-section":     "peer-chat-variant",
					"incoming-chat-section": "incoming-chat-variant",
					"allowed-section":       "allowed-variant",
					"incoming-section":      "incoming-variant",
					"second-section":        "second-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{ID: "edge-outgoing", SourceSectionID: "chat-section", TargetSectionID: "allowed-section", Kind: agenticEdgeKindChatSection},
					{ID: "edge-peer", SourceSectionID: "chat-section", TargetSectionID: "peer-chat-section", Kind: agenticEdgeKindChatChat},
					{ID: "edge-incoming-section", SourceSectionID: "incoming-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindSectionChat},
					{ID: "edge-incoming-peer", SourceSectionID: "incoming-chat-section", TargetSectionID: "chat-section", Kind: agenticEdgeKindChatChat},
				},
				Sections: map[string]projectstate.Section{
					"chat-section":          {ID: "chat-section", Name: "Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
					"peer-chat-section":     {ID: "peer-chat-section", Name: "Peer Chat", VariantIDs: []string{"peer-chat-variant"}, DefaultVariantID: "peer-chat-variant"},
					"incoming-chat-section": {ID: "incoming-chat-section", Name: "Incoming Chat", VariantIDs: []string{"incoming-chat-variant"}, DefaultVariantID: "incoming-chat-variant"},
					"allowed-section":       {ID: "allowed-section", Name: "Allowed", VariantIDs: []string{"allowed-variant"}, DefaultVariantID: "allowed-variant"},
					"incoming-section":      {ID: "incoming-section", Name: "Incoming", VariantIDs: []string{"incoming-variant"}, DefaultVariantID: "incoming-variant"},
					"second-section":        {ID: "second-section", Name: "Second", VariantIDs: []string{"second-variant"}, DefaultVariantID: "second-variant"},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":          {ID: "chat-variant", ImplID: "chat-impl"},
					"peer-chat-variant":     {ID: "peer-chat-variant", ImplID: "peer-chat-impl"},
					"incoming-chat-variant": {ID: "incoming-chat-variant", ImplID: "incoming-chat-impl"},
					"allowed-variant":       {ID: "allowed-variant", ImplID: "allowed-impl"},
					"incoming-variant":      {ID: "incoming-variant", ImplID: "incoming-impl"},
					"second-variant":        {ID: "second-variant", ImplID: "second-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl":          {ID: "chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"})},
					"peer-chat-impl":     {ID: "peer-chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"})},
					"incoming-chat-impl": {ID: "incoming-chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "incoming-chat-impl", "type": "Chat"})},
					"allowed-impl":       {ID: "allowed-impl", Kind: projectstate.SectionKind("dict"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "allowed-impl", "type": "Dict"})},
					"incoming-impl":      {ID: "incoming-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "incoming-impl", "type": "TextBlock"})},
					"second-impl":        {ID: "second-impl", Kind: projectstate.SectionKind("dict"), Payload: mustTargetResolutionRawJSON(t, map[string]any{"id": "second-impl", "type": "Dict"})},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize scope parity project: %v", err)
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

func containsStringSet(values map[string]struct{}, want string) bool {
	_, ok := values[want]
	return ok
}
