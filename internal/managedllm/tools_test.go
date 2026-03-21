package managedllm

import (
	"reflect"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
)

func TestRequiredInternalToolNamesAddsCompletionStatusToolWhenEnabled(t *testing.T) {
	t.Parallel()

	got := requiredInternalToolNames(true)
	want := []string{mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "report_completion_status")}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected required tool names %#v", got)
	}
}

func TestRequiredInternalToolNamesOmitsCompletionStatusToolWhenDisabled(t *testing.T) {
	t.Parallel()

	if got := requiredInternalToolNames(false); got != nil {
		t.Fatalf("expected no required tool names when completion guard is disabled, got %#v", got)
	}
}

func TestIsSupportedCompletionStatusToolNameRequiresDefaultServerWhenEnabled(t *testing.T) {
	t.Parallel()

	if !isSupportedCompletionStatusToolName("setta__report_completion_status", true) {
		t.Fatal("expected default completion status tool to be allowed")
	}
	if isSupportedCompletionStatusToolName("remote__report_completion_status", true) {
		t.Fatal("expected non-default completion status tool to be rejected")
	}
	if isSupportedCompletionStatusToolName("setta__report_completion_status", false) {
		t.Fatal("expected default completion status tool to be omitted when the guard is disabled")
	}
	if !isSupportedCompletionStatusToolName("remote__report_completion_status", false) {
		t.Fatal("expected completion status tool restrictions to relax when disabled")
	}
}

func TestIsToolAllowedRejectsNonDefaultCompletionStatusToolEvenWhenAllowlisted(t *testing.T) {
	t.Parallel()

	allowlist := &toolAllowlist{
		toolBasenames: map[string]struct{}{
			"report_completion_status": {},
		},
	}
	if isToolAllowed("remote__report_completion_status", allowlist, true) {
		t.Fatal("expected non-default completion status tool to be rejected")
	}
	if !isToolAllowed("setta__report_completion_status", allowlist, true) {
		t.Fatal("expected default completion status tool to remain allowed")
	}
}

func TestBuildToolRequestMetaIncludesRunContextForWorkflowSignalTool(t *testing.T) {
	t.Parallel()

	sectionID := "section-chat"
	meta := buildToolRequestMeta(agentruns.ExecutionRequest{
		Run:             agentruns.Run{ID: "run-child"},
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
		Inputs: map[string]any{
			"frontendAffinityToken": "frontend-1",
			"shareSessionId":        "share-session-1",
		},
	}, mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "report_state_machine_signal"))

	if meta["projectConfigId"] != "project-alpha" {
		t.Fatalf("expected projectConfigId project-alpha, got %#v", meta["projectConfigId"])
	}
	if meta["chatId"] != "chat-alpha" {
		t.Fatalf("expected chatId chat-alpha, got %#v", meta["chatId"])
	}
	if meta["runId"] != "run-child" {
		t.Fatalf("expected runId run-child, got %#v", meta["runId"])
	}
	if meta["shareSessionId"] != "share-session-1" {
		t.Fatalf("expected shareSessionId share-session-1, got %#v", meta["shareSessionId"])
	}
	if _, ok := meta["sectionId"]; ok {
		t.Fatalf("expected workflow signal tool to omit sectionId for structural access, got %#v", meta["sectionId"])
	}
	if meta["frontendAffinityToken"] != "frontend-1" {
		t.Fatalf("expected frontendAffinityToken frontend-1, got %#v", meta["frontendAffinityToken"])
	}
	if meta["allowUnscoped"] != true {
		t.Fatalf("expected allowUnscoped true for internal workflow signal tool, got %#v", meta["allowUnscoped"])
	}
}

func TestBuildToolRequestMetaKeepsSectionContextForRegularInternalTools(t *testing.T) {
	t.Parallel()

	sectionID := "section-chat"
	meta := buildToolRequestMeta(agentruns.ExecutionRequest{
		Run:             agentruns.Run{ID: "run-child"},
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
	}, mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "set_code"))

	if meta["sectionId"] != "section-chat" {
		t.Fatalf("expected sectionId section-chat, got %#v", meta["sectionId"])
	}
	if _, ok := meta["allowUnscoped"]; ok {
		t.Fatalf("expected regular internal tool to omit allowUnscoped, got %#v", meta["allowUnscoped"])
	}
}

func TestBuildToolRequestMetaSkipsExternalNamespacedTools(t *testing.T) {
	t.Parallel()

	meta := buildToolRequestMeta(agentruns.ExecutionRequest{
		Run:             agentruns.Run{ID: "run-child"},
		ProjectConfigID: "project-alpha",
	}, "remote__tool")
	if meta != nil {
		t.Fatalf("expected nil meta for external tool, got %#v", meta)
	}
}
