package managedllm

import (
	"testing"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
)

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
