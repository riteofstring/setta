package managedllm

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"setta/internal/agentprofiles"
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

func TestNormalizeToolAllowlistParsesNamesServersAndRequiredCompletionStatus(t *testing.T) {
	t.Parallel()

	allowlist, err := normalizeToolAllowlist(agentruns.ExecutionRequest{
		MCPServerIDs:           []string{"server-a", "server-b"},
		CompletionGuardEnabled: true,
		Profile: agentprofiles.Profile{
			ToolAllowlist: []string{"server-a__tool.alpha", "server-b", "tool.beta"},
		},
	})
	if err != nil {
		t.Fatalf("normalize tool allowlist: %v", err)
	}
	if allowlist == nil {
		t.Fatal("expected normalized allowlist")
	}

	if _, ok := allowlist.toolNames["server-a__tool.alpha"]; !ok {
		t.Fatalf("expected namespaced tool entry, got %#v", allowlist.toolNames)
	}
	if _, ok := allowlist.toolNames[mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "report_completion_status")]; !ok {
		t.Fatalf("expected required completion tool entry, got %#v", allowlist.toolNames)
	}
	if _, ok := allowlist.toolBasenames["tool.beta"]; !ok {
		t.Fatalf("expected basename allowlist entry, got %#v", allowlist.toolBasenames)
	}
	if _, ok := allowlist.serverIDs["server-a"]; !ok {
		t.Fatalf("expected server-a in server allowlist, got %#v", allowlist.serverIDs)
	}
	if _, ok := allowlist.serverIDs["server-b"]; !ok {
		t.Fatalf("expected server-b in server allowlist, got %#v", allowlist.serverIDs)
	}
	if _, ok := allowlist.serverIDs[mcpx.DefaultServerID]; ok {
		t.Fatalf("did not expect default server id to be forced into unavailable servers, got %#v", allowlist.serverIDs)
	}
}

func TestNormalizeToolAllowlistOmitsRequiredCompletionStatusWhenDisabled(t *testing.T) {
	t.Parallel()

	allowlist, err := normalizeToolAllowlist(agentruns.ExecutionRequest{
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: false,
		Profile: agentprofiles.Profile{
			ToolAllowlist: []string{"setta__getProjectState"},
		},
	})
	if err != nil {
		t.Fatalf("normalize tool allowlist: %v", err)
	}
	if allowlist == nil {
		t.Fatal("expected normalized allowlist")
	}
	if _, ok := allowlist.toolNames[mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "report_completion_status")]; ok {
		t.Fatalf("did not expect required completion tool when disabled, got %#v", allowlist.toolNames)
	}
}

func TestNormalizeToolAllowlistRejectsUnknownServer(t *testing.T) {
	t.Parallel()

	allowlist, err := normalizeToolAllowlist(agentruns.ExecutionRequest{
		MCPServerIDs:           []string{"server-a"},
		CompletionGuardEnabled: true,
		Profile: agentprofiles.Profile{
			ToolAllowlist: []string{"unknown__tool.alpha"},
		},
	})
	if err == nil {
		t.Fatalf("expected unknown-server error, got allowlist=%#v", allowlist)
	}
	if err.Error() != "managed llm tools are not supported: unavailable MCP server \"unknown\" in toolAllowlist" {
		t.Fatalf("unexpected unknown-server error %q", err.Error())
	}
}

func TestIsToolAllowedAllowsNonDefaultCompletionStatusWhenGuardDisabled(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		allowlist []string
	}{
		{
			name:      "namespaced tool entry",
			allowlist: []string{"other__report_completion_status"},
		},
		{
			name:      "server entry",
			allowlist: []string{"other"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			allowlist, err := normalizeToolAllowlist(agentruns.ExecutionRequest{
				MCPServerIDs:           []string{"other"},
				CompletionGuardEnabled: false,
				Profile: agentprofiles.Profile{
					ToolAllowlist: testCase.allowlist,
				},
			})
			if err != nil {
				t.Fatalf("normalize tool allowlist: %v", err)
			}
			if allowlist == nil {
				t.Fatal("expected normalized allowlist")
			}
			if !isToolAllowed("other__report_completion_status", allowlist, false) {
				t.Fatalf("expected non-default completion status tool to remain allowed, allowlist=%#v", allowlist)
			}
		})
	}
}

func TestBuildToolDefinitionsKeepsDefaultCompletionStatusWhenAllowlistNarrowsServerIDs(t *testing.T) {
	t.Parallel()

	payload, _, allowlist, err := buildToolDefinitions(agentruns.ExecutionRequest{
		MCPServerIDs:           []string{"other", mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		Profile: agentprofiles.Profile{
			ToolAllowlist: []string{"other__tool_alpha"},
		},
	}, &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"other__tool_alpha": {
				ServerID:       "other",
				NamespacedName: "other__tool_alpha",
				RemoteName:     "tool_alpha",
				InputSchema:    map[string]any{},
			},
			"setta__report_completion_status": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__report_completion_status",
				RemoteName:     "report_completion_status",
				InputSchema:    map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("build tool definitions: %v", err)
	}
	if allowlist == nil {
		t.Fatal("expected normalized allowlist")
	}

	got := toolNamesFromPayload(payload)
	want := []string{"other__tool_alpha", "setta__report_completion_status"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected tool names %#v", got)
	}
}

func TestBuildToolDefinitionsFiltersNonDefaultCompletionStatusWithoutAllowlist(t *testing.T) {
	t.Parallel()

	payload, _, _, err := buildToolDefinitions(agentruns.ExecutionRequest{
		MCPServerIDs:           []string{"other", mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
	}, &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"other__report_completion_status": {
				ServerID:       "other",
				NamespacedName: "other__report_completion_status",
				RemoteName:     "report_completion_status",
				InputSchema:    map[string]any{},
			},
			"other__tool_alpha": {
				ServerID:       "other",
				NamespacedName: "other__tool_alpha",
				RemoteName:     "tool_alpha",
				InputSchema:    map[string]any{},
			},
			"setta__report_completion_status": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__report_completion_status",
				RemoteName:     "report_completion_status",
				InputSchema:    map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("build tool definitions: %v", err)
	}

	got := toolNamesFromPayload(payload)
	want := []string{"other__tool_alpha", "setta__report_completion_status"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected tool names %#v", got)
	}
}

func TestBuildToolDefinitionsKeepsCompletionStatusToolForScopedRun(t *testing.T) {
	t.Parallel()

	sectionID := "section-chat"
	payload, _, _, err := buildToolDefinitions(agentruns.ExecutionRequest{
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		SectionID:              &sectionID,
	}, &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__report_completion_status": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__report_completion_status",
				RemoteName:     "report_completion_status",
				InputSchema:    map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("build tool definitions: %v", err)
	}

	got := toolNamesFromPayload(payload)
	want := []string{"setta__report_completion_status"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected tool names %#v", got)
	}
}

func TestBuildToolDefinitionsFailsClosedWhenCompletionStatusToolMissing(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		request agentruns.ExecutionRequest
		tools   ToolClient
	}{
		{
			name: "missing tool payload",
			request: agentruns.ExecutionRequest{
				MCPServerIDs:           nil,
				CompletionGuardEnabled: true,
			},
			tools: &stubToolClient{},
		},
		{
			name: "wrong completion tool namespace",
			request: agentruns.ExecutionRequest{
				MCPServerIDs:           []string{"other"},
				CompletionGuardEnabled: true,
			},
			tools: &stubToolClient{
				discoverableTools: map[string]mcpx.ToolDescriptor{
					"other__report_completion_status": {
						ServerID:       "other",
						NamespacedName: "other__report_completion_status",
						RemoteName:     "report_completion_status",
						InputSchema:    map[string]any{},
					},
				},
			},
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			_, _, _, err := buildToolDefinitions(testCase.request, testCase.tools)
			if err == nil {
				t.Fatal("expected missing completion-status tool error")
			}
			if !errors.Is(err, ErrToolsUnsupported) {
				t.Fatalf("expected ErrToolsUnsupported, got %v", err)
			}
			if !strings.Contains(err.Error(), "Completion guard is enabled") {
				t.Fatalf("expected completion guard error message, got %q", err.Error())
			}
			if !strings.Contains(err.Error(), "report_completion_status") {
				t.Fatalf("expected completion tool name in error, got %q", err.Error())
			}
			visibleErr, ok := err.(interface{ AssistantFailureMessage() string })
			if !ok {
				t.Fatalf("expected assistant failure message carrier, got %T", err)
			}
			if !strings.Contains(visibleErr.AssistantFailureMessage(), "report_completion_status") {
				t.Fatalf("expected assistant failure message to mention completion tool, got %q", visibleErr.AssistantFailureMessage())
			}
		})
	}
}

func toolNamesFromPayload(payload []map[string]any) []string {
	names := make([]string, 0, len(payload))
	for _, tool := range payload {
		function, ok := tool["function"].(map[string]any)
		if !ok {
			continue
		}
		name, ok := function["name"].(string)
		if !ok {
			continue
		}
		names = append(names, name)
	}
	return names
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
