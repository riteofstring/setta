package mcpx

import (
	"context"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerSetSectionNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "Allowed Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"name":            "Blocked Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	missingEdgesCanonical := mustStructuredList(t, blockedPayload["missingEdgesCanonical"])
	if len(missingEdgesCanonical) != 1 {
		t.Fatalf("expected one canonical missing edge, got %#v", missingEdgesCanonical)
	}
	missingEdgeCanonical := mustStructuredMap(t, missingEdgesCanonical[0])
	if missingEdgeCanonical["sourceSectionId"] != "chat-section" ||
		missingEdgeCanonical["targetSectionId"] != "blocked-section" ||
		missingEdgeCanonical["kind"] != agenticEdgeKindChatSection {
		t.Fatalf("unexpected canonical missing edge %#v", missingEdgeCanonical)
	}
}

func TestServerSetSectionTagColorRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_tag_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"tagColor":        "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_tag_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionTagColorClearsNull(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	tagColor := "#123456"
	if _, err := projectRuntime.SetSectionTagColor(context.Background(), "project-alpha", "allowed-section", &tagColor); err != nil {
		t.Fatalf("seed tag color: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        nil,
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color clear: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected tag-color clear success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after clearing tag color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	got, ok := allowedPayload["tagColor"]
	if !ok || got != nil {
		t.Fatalf("expected allowed-section tagColor to clear to null, got %#v", allowedPayload["tagColor"])
	}
}

func TestServerSetSectionTagColorFailsClosedForUnknownSectionTarget(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call missing-target set_section_tag_color: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-target set_section_tag_color call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected blockedSectionIds [missing-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected targetSectionIds [missing-section], got %#v", ids)
	}
}

func TestServerSetSectionStyleColorRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_style_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"styleColor":      "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_style_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionStyleColorClearsNull(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	styleColor := "#654321"
	if _, err := projectRuntime.SetSectionStyleColor(context.Background(), "project-alpha", "allowed-section", &styleColor); err != nil {
		t.Fatalf("seed style color: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      nil,
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color clear: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected style-color clear success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after clearing style color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	got, ok := allowedPayload["styleColor"]
	if !ok || got != nil {
		t.Fatalf("expected allowed-section styleColor to clear to null, got %#v", allowedPayload["styleColor"])
	}
}

func TestServerSetSectionStyleColorFailsClosedForUnknownSectionTarget(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call missing-target set_section_style_color: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-target set_section_style_color call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected blockedSectionIds [missing-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected targetSectionIds [missing-section], got %#v", ids)
	}
}

func TestServerSetSectionParamFilterRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramFilter":     "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_param_filter success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramFilter":     "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_param_filter call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}
