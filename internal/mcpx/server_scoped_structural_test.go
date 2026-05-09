package mcpx

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerSetCodeRejectsReadOnlyCodeSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustSetTestCodeSectionReadOnly(t, projectRuntime, "project-alpha", "allowed-section")
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "print('blocked by readonly')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly set_code call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "allowed-section"` {
		t.Fatalf("unexpected readonly set_code message %#v", payload["message"])
	}
}

func TestServerFormatCodeRejectsReadOnlyCodeSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CodeUpdates: testCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "allowed-section")
			},
		},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly format_code call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "allowed-section"` {
		t.Fatalf("unexpected readonly format_code message %#v", payload["message"])
	}
}

func TestServerSetSectionNameRejectsInvalidNames(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "bad/name",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name invalid: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_name call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Section name cannot include path separators." {
		t.Fatalf("unexpected invalid section-name message %#v", payload["message"])
	}
}

func TestServerCreateTopLevelSectionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "Dict",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked create_top_level_section call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerDeleteSectionsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked delete_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerCreateNewSectionVariantRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked create_new_section_variant call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerCreateTopLevelSectionAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}
	beforeCodeObjIDs := map[string]struct{}{}
	for codeObjID := range beforeProject.CodeObjs {
		beforeCodeObjIDs[codeObjID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId":    "11",
			"implType":           "MetaControl",
			"controlCodeObjType": "TextParam",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_top_level_section success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	tempSectionID, ok := payload["sectionId"].(string)
	if !ok || strings.TrimSpace(tempSectionID) == "" {
		t.Fatalf("expected translated sectionId string, got %#v", payload["sectionId"])
	}
	tempParamID, ok := payload["metaControlParamId"].(string)
	if !ok || strings.TrimSpace(tempParamID) == "" {
		t.Fatalf("expected translated metaControlParamId string, got %#v", payload["metaControlParamId"])
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after structural create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	var canonicalParamID string
	for codeObjID := range afterProject.CodeObjs {
		if _, existed := beforeCodeObjIDs[codeObjID]; !existed {
			canonicalParamID = codeObjID
			break
		}
	}
	if canonicalParamID == "" {
		t.Fatalf("expected one new canonical code-object id, got %#v", afterProject.CodeObjs)
	}
	if tempSectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	if tempParamID == canonicalParamID {
		t.Fatalf("expected translated code-object id to differ from canonical %q", canonicalParamID)
	}
	if _, ok := afterProject.Sections[tempSectionID]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", tempSectionID)
	}
	if _, ok := afterProject.CodeObjs[tempParamID]; ok {
		t.Fatalf("did not expect translated code-object id %q to be a canonical project key", tempParamID)
	}
}

func TestServerCreateChildSectionsAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_child_sections",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"parentId":        "14",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated child section id, got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after child create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := afterProject.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != canonicalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", canonicalSectionID, children)
	}
}

func TestServerSetCodeSectionAttachedTerminalRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalSectionID := mustSeedScopedTestTopLevelTerminal(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_attached_terminal",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"terminalSectionId": terminalSectionID,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_attached_terminal blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_code_section_attached_terminal call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetCodeSectionAttachedTerminalAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalSectionID := mustSeedScopedTestTopLevelTerminal(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		terminalSectionID: "91",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_code_section_attached_terminal",
		Arguments: map[string]any{
			"projectConfigId":   "11",
			"sectionId":         "14",
			"terminalSectionId": "91",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_section_attached_terminal: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_code_section_attached_terminal success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_section_attached_terminal: %v", err)
	}
	_, _, codeImpl, err := project.ResolveSection("allowed-section")
	if err != nil {
		t.Fatalf("resolve allowed section after attach: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal %q, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}

	terminalSection, _, _, err := project.ResolveSection(terminalSectionID)
	if err != nil {
		t.Fatalf("resolve attached terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected attached terminal parent allowed-section, got %q", terminalSection.ParentSectionID)
	}
	if project.HasTopLevelSection(terminalSectionID) {
		t.Fatalf("did not expect attached terminal %q to remain top-level", terminalSectionID)
	}

	parentPayload := mustDecodedProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != terminalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", terminalSectionID, children)
	}
}

func TestServerSetSectionSizesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_sizes",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionSizes": map[string]any{
				"allowed-section": map[string]any{"width": 480.0, "height": 220.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_sizes blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_section_sizes call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetSectionSizesAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_section_sizes",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionSizes": map[string]any{
				"14": map[string]any{"width": 480.0, "height": 220.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_sizes: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_sizes success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_sizes: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	size := mustStructuredMap(t, payload["size"])
	if size["width"] != 480.0 || size["height"] != 220.0 {
		t.Fatalf("expected normalized size {480 220}, got %#v", size)
	}
}

func TestServerSetGroupOverflowModeRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "group-section",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call set_group_overflow_mode blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_group_overflow_mode call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "group-section" {
		t.Fatalf("expected blockedSectionIds [group-section], got %#v", ids)
	}
}

func TestServerSetGroupOverflowModeAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "41",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_group_overflow_mode: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_group_overflow_mode success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_group_overflow_mode: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["group-section"].SharedModifier), "overflowMode") {
		t.Fatal("expected group-section overflowMode=true after mutation")
	}
}

func TestServerSetGroupOverflowModeRejectsNonGroupSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_group_overflow_mode: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_group_overflow_mode call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(strings.ToLower(message), "group section") {
		t.Fatalf("expected group-section requirement message, got %#v", payload["message"])
	}
}

func TestServerCreateChildSectionsViaIncrementerAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before incrementer child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_child_sections_via_incrementer",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"calledBy":        "14",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections_via_incrementer allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections_via_incrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated incrementer child section id, got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after incrementer child create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated incrementer child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated incrementer child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := afterProject.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != canonicalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", canonicalSectionID, children)
	}
}

func TestServerDeleteSectionsAllowsUnscopedStructuralCallsAndTranslatesIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"allowed-params-section": "20",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"20"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || sectionIDs[0] != "20" {
		t.Fatalf("expected translated deleted section ids [20], got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_sections: %v", err)
	}
	if _, ok := afterProject.Sections["allowed-params-section"]; ok {
		t.Fatalf("expected allowed-params-section to be removed, got %#v", afterProject.Sections)
	}
	if _, ok := afterProject.CodeObjs["allowed-param"]; ok {
		t.Fatalf("expected allowed-param to be pruned, got %#v", afterProject.CodeObjs)
	}
}

func TestServerDeleteChildSectionsViaDecrementerAllowsUnscopedStructuralCallsAndTranslatesIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	canonicalChildID := mustSeedScopedTestChildSection(t, projectRuntime, "allowed-section")
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "delete_child_sections_via_decrementer",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"calledBy":        "14",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call delete_child_sections_via_decrementer allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_child_sections_via_decrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated deleted child section id, got %#v", sectionIDs)
	}
	if sectionIDs[0] == canonicalChildID {
		t.Fatalf("expected translated deleted child id to differ from canonical %q", canonicalChildID)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_child_sections_via_decrementer: %v", err)
	}
	if _, ok := afterProject.Sections[canonicalChildID]; ok {
		t.Fatalf("expected %q to be removed, got %#v", canonicalChildID, afterProject.Sections)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated deleted child id %q to be a canonical project key", sectionIDs[0])
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 0 {
		t.Fatalf("expected allowed-section children to be empty after decrementer delete, got %#v", children)
	}
}

func TestServerCreateNewSectionVariantAllowsUnscopedStructuralCallsAndTranslatesVariantIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"allowed-params-section": "20",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before create_new_section_variant: %v", err)
	}
	beforeVariantIDs := append([]string(nil), beforeProject.Sections["allowed-params-section"].VariantIDs...)

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_new_section_variant success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	tempVariantID, ok := payload["variantId"].(string)
	if !ok || strings.TrimSpace(tempVariantID) == "" {
		t.Fatalf("expected translated variantId string, got %#v", payload["variantId"])
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after create_new_section_variant: %v", err)
	}
	afterVariantIDs := afterProject.Sections["allowed-params-section"].VariantIDs
	if len(afterVariantIDs) != len(beforeVariantIDs)+1 {
		t.Fatalf("expected one new section variant, got before=%#v after=%#v", beforeVariantIDs, afterVariantIDs)
	}
	var canonicalVariantID string
	for _, variantID := range afterVariantIDs {
		if !containsString(beforeVariantIDs, variantID) {
			canonicalVariantID = variantID
			break
		}
	}
	if canonicalVariantID == "" {
		t.Fatalf("expected one new canonical section variant id, got %#v", afterVariantIDs)
	}
	if tempVariantID == canonicalVariantID {
		t.Fatalf("expected translated variant id to differ from canonical %q", canonicalVariantID)
	}
	if _, ok := afterProject.SectionVariants[tempVariantID]; ok {
		t.Fatalf("did not expect translated variant id %q to be a canonical project key", tempVariantID)
	}
	if got := afterProject.SectionVariantMap["allowed-params-section"]; got != canonicalVariantID {
		t.Fatalf("expected active allowed-params-section variant %q, got %q", canonicalVariantID, got)
	}
	if len(afterProject.CodeObjs["allowed-param"].VariantIDs) != 2 {
		t.Fatalf("expected allowed-param to gain one code-object variant, got %#v", afterProject.CodeObjs["allowed-param"].VariantIDs)
	}
}

func TestServerSetSectionVariantRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "allowed-variant-alt",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_variant success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section active variant to be updated, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"variantId":       "blocked-variant",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_variant call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetSectionVariantAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"variantId":       "30",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_variant success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected translated section variant update, got %q", got)
	}
}

func TestServerSetSectionVariantRejectsVariantOutsideSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "peer-chat-variant",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_variant: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_variant call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section variant must belong to the section") {
		t.Fatalf("expected section variant membership message, got %#v", payload["message"])
	}
}

func TestServerSetDefaultSectionVariantRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "allowed-variant-alt",
		},
	})
	if err != nil {
		t.Fatalf("call set_default_section_variant allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_default_section_variant success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section default variant to be updated, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"variantId":       "blocked-variant",
		},
	})
	if err != nil {
		t.Fatalf("call set_default_section_variant blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_default_section_variant call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetDefaultSectionVariantAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"variantId":       "30",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_default_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_default_section_variant success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected translated default section variant update, got %q", got)
	}
}

func TestServerSetSectionVariantSortOrderRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"orderedVariantIds": []string{"allowed-variant-alt", "allowed-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant_sort_order allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_variant_sort_order success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "blocked-section",
			"orderedVariantIds": []string{"blocked-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant_sort_order blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_variant_sort_order call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetSectionVariantSortOrderAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant":     "16",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":   "11",
			"sectionId":         "14",
			"orderedVariantIds": []string{"30", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_variant_sort_order: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_variant_sort_order success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected translated reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}
}

func TestServerSetSectionVariantSortOrderRejectsDuplicateVariantIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"orderedVariantIds": []string{"allowed-variant", "allowed-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_variant_sort_order: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_variant_sort_order call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "orderedVariantIds must not contain duplicate variant IDs.") {
		t.Fatalf("expected duplicate orderedVariantIds message, got %#v", payload["message"])
	}
}

func TestServerSetTypeErrorIgnoreRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"paramInfoId":      "allowed-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_type_error_ignore success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_type_error_ignore: %v", err)
	}
	ignoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after update: %v", err)
	}
	if !ignoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param ignore state, got %#v", ignoreState)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "blocked-params-section",
			"paramInfoId":      "blocked-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_type_error_ignore call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
}

func TestServerSetCodeObjectNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v2",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code_obj_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "blocked-param",
			"name":            "blocked-name",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code_obj_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetCodeObjectNameReturnsInvalidArgumentsForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "bad\nname",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name invalid name: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_code_obj_name call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Param name cannot include control characters." {
		t.Fatalf("expected control-character validation message, got %#v", payload["message"])
	}
}

func TestServerSetCodeObjectDisplayNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"displayName":     "Height",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code_obj_display_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "blocked-param",
			"displayName":     "Blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code_obj_display_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerProjectStateSummaryCanUsePerCallMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary with meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected summary success via request meta, got %#v", result.StructuredContent)
	}
	assertSummaryPayload(t, result.StructuredContent)
}

func TestServerSetAgenticContextPersistsSessionScopeForLaterToolCalls(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	requestContext := ToolRequestContext{SessionKey: "session-alpha"}
	result, err := server.InvokeTool(context.Background(), "set_agentic_context", map[string]any{
		"projectConfigId":       "project-alpha",
		"chatId":                "chat-1",
		"sectionId":             "chat-section",
		"runId":                 "run-child",
		"frontendAffinityToken": "frontend-1",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	stored := server.sessionAgenticContext(requestContext.SessionKey)
	if stored == nil {
		t.Fatal("expected session agentic context to be stored")
	}
	if stored.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected stored projectConfigId project-alpha, got %q", stored.ProjectConfigID)
	}
	if stored.ChatID != "chat-1" {
		t.Fatalf("expected stored chatId chat-1, got %q", stored.ChatID)
	}
	if stored.SectionID != "chat-section" {
		t.Fatalf("expected stored sectionId chat-section, got %q", stored.SectionID)
	}
	if stored.RunID != "run-child" {
		t.Fatalf("expected stored runId run-child, got %q", stored.RunID)
	}
	if stored.FrontendAffinityToken != "frontend-1" {
		t.Fatalf("expected stored frontend affinity frontend-1, got %q", stored.FrontendAffinityToken)
	}

	summaryResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke get_latest_project_state_summary after set_agentic_context: %v", err)
	}
	if summaryResult.IsError {
		t.Fatalf("expected session-scoped project summary success, got %#v", summaryResult.StructuredContent)
	}
	assertSummaryPayload(t, summaryResult.StructuredContent)
}

func TestServerScopedReadToolsRecomputeScopeAfterEdgeMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	requestContext := ToolRequestContext{SessionKey: "session-scope-refresh"}
	setContextResult, err := server.InvokeTool(context.Background(), "set_agentic_context", map[string]any{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	firstResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke first get_latest_project_state_summary: %v", err)
	}
	if firstResult.IsError {
		t.Fatalf("expected first project summary success, got %#v", firstResult.StructuredContent)
	}
	firstSummary := mustStructuredMap(t, firstResult.StructuredContent)
	firstProjectConfig := mustStructuredMap(t, firstSummary["projectConfig"])
	firstSectionVariantMap := mustStructuredMap(t, firstProjectConfig["sectionVariantMap"])
	if _, ok := firstSectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section before edge mutation, got %#v", firstSectionVariantMap)
	}

	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
			ID:              "edge-unblocked",
			SourceSectionID: "chat-section",
			TargetSectionID: "blocked-section",
			Kind:            "chat_section",
		})
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate agentic edges: %v", err)
	}

	secondResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke second get_latest_project_state_summary: %v", err)
	}
	if secondResult.IsError {
		t.Fatalf("expected second project summary success, got %#v", secondResult.StructuredContent)
	}
	secondSummary := mustStructuredMap(t, secondResult.StructuredContent)
	secondProjectConfig := mustStructuredMap(t, secondSummary["projectConfig"])
	secondSectionVariantMap := mustStructuredMap(t, secondProjectConfig["sectionVariantMap"])
	if _, ok := secondSectionVariantMap["blocked-section"]; !ok {
		t.Fatalf("expected blocked-section after edge mutation, got %#v", secondSectionVariantMap)
	}
}

func TestServerScopedReadToolsCanUseHeaderContextAndTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-section":          "14",
		"peer-chat-section":        "15",
		"blocked-section":          "16",
		"allowed-variant":          "17",
		"peer-chat-variant":        "18",
		"blocked-variant":          "19",
		"allowed-params-section":   "20",
		"allowed-params-variant":   "21",
		"edge-context":             "22",
		"edge-peer":                "23",
		"allowed-callable-section": "24",
		"allowed-callable-variant": "25",
	})

	server, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	headers := http.Header{}
	headers.Set(AgenticContextProjectConfigIDHeader, "11")
	headers.Set(AgenticContextChatIDHeader, "12")
	headers.Set(AgenticContextSectionIDHeader, "13")
	requestContext := ToolRequestContext{Headers: headers}

	result, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id project summary: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected header-scoped temp-id summary success, got %#v", result.StructuredContent)
	}

	summary := mustStructuredMap(t, result.StructuredContent)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["14"]; !ok {
		t.Fatalf("expected translated allowed-section key 14, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["15"]; !ok {
		t.Fatalf("expected translated peer-chat-section key 15, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["20"]; !ok {
		t.Fatalf("expected translated allowed-params-section key 20, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["24"]; !ok {
		t.Fatalf("expected translated allowed-callable-section key 24, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["16"]; ok {
		t.Fatalf("did not expect blocked-section key 16 in scoped summary, got %#v", sectionVariantMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	sectionIDs := make([]string, 0, len(sections))
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected translated sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	if len(sectionIDs) != 4 || sectionIDs[0] != "14" || sectionIDs[1] != "15" || sectionIDs[2] != "20" || sectionIDs[3] != "24" {
		t.Fatalf("unexpected translated section ids %#v", sectionIDs)
	}

	diagnosticsResult, err := server.InvokeTool(context.Background(), "get_latest_lsp_diagnostics", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id lsp diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected header-scoped temp-id diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	diagnosticsPayload := mustStructuredMap(t, diagnosticsResult.StructuredContent)
	codeSections := mustStructuredMap(t, diagnosticsPayload["codeSections"])
	if _, ok := codeSections["14"]; !ok {
		t.Fatalf("expected translated allowed-section diagnostics key 14, got %#v", codeSections)
	}
	if _, ok := codeSections["15"]; ok {
		t.Fatalf("did not expect peer-chat-section diagnostics key 15, got %#v", codeSections)
	}
	genCode := mustStructuredMap(t, diagnosticsPayload["genCode"])
	genErrors := mustStructuredMap(t, genCode["errors"])
	if _, ok := genErrors["14"]; !ok {
		t.Fatalf("expected translated allowed-section gen diagnostics key 14, got %#v", genErrors)
	}
	if unmapped := mustStructuredList(t, diagnosticsPayload["unmappedGenCode"]); len(unmapped) != 0 {
		t.Fatalf("expected scoped diagnostics to drop unmapped gen code, got %#v", unmapped)
	}
}
