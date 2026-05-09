package externalagents

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
)

func TestBuildClaudeStartPayloadUsesLatestUserPrompt(t *testing.T) {
	t.Parallel()

	payload := buildClaudeStartPayload(StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "system-1",
					"role": "system",
					"content": []any{
						map[string]any{"type": "text", "text": "System prompt"},
					},
				},
				map[string]any{
					"id":   "assistant-1",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Earlier reply"},
					},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Latest request"},
					},
				},
			},
			"systemPrompt": "System prompt",
		}, time.Date(2026, 3, 9, 13, 35, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "system-1",
					"role": "system",
					"content": []any{
						map[string]any{"type": "text", "text": "System prompt"},
					},
				},
				map[string]any{
					"id":   "assistant-1",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Earlier reply"},
					},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Latest request"},
					},
				},
			},
			"systemPrompt": "System prompt",
		},
	}, "/tmp/workspace", map[string]string{})

	prompt := stringValue(payload["prompt"])
	if prompt != "Latest request\n" {
		t.Fatalf("expected latest user prompt with trailing newline, got %q", prompt)
	}
	if strings.Contains(prompt, "System prompt") || strings.Contains(prompt, "Earlier reply") {
		t.Fatalf("expected prompt to exclude system and assistant text, got %q", prompt)
	}
}

func TestBuildClaudeStartPayloadOmitsMaxTurnsWhenUnspecified(t *testing.T) {
	t.Parallel()

	payload := buildClaudeStartPayload(StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello"},
					},
				},
			},
		}, time.Date(2026, 3, 9, 13, 36, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{},
	}, "/tmp/workspace", map[string]string{})

	if _, ok := payload["maxTurns"]; ok {
		t.Fatalf("expected maxTurns to be omitted when unspecified, got %#v", payload["maxTurns"])
	}
}

func TestBuildClaudeStartPayloadHonorsExplicitMaxTurns(t *testing.T) {
	t.Parallel()

	payload := buildClaudeStartPayload(StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello"},
					},
				},
			},
		}, time.Date(2026, 3, 9, 13, 37, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{
			"maxTurns": 7,
		},
	}, "/tmp/workspace", map[string]string{})

	if got, ok := payload["maxTurns"].(int); !ok || got != 7 {
		t.Fatalf("expected explicit maxTurns=7, got %#v", payload["maxTurns"])
	}
}

func TestBuildClaudeStartPayloadPrefersExplicitApprovalPolicyOverride(t *testing.T) {
	t.Parallel()

	approvalPolicy := "default"
	request := StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Use the runtime override"},
					},
				},
			},
		}, time.Date(2026, 3, 9, 13, 35, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType:       externalagentconfigs.ToolTypeClaudeCode,
			RunMode:        externalagentconfigs.RunModeSDK,
			ApprovalPolicy: &approvalPolicy,
		},
		Inputs: map[string]any{
			"approvalPolicy": "bypassPermissions",
		},
	}

	payload := buildClaudeStartPayload(request, "/tmp/workspace", map[string]string{})

	if got := stringValue(payload["permissionMode"]); got != "bypassPermissions" {
		t.Fatalf("expected runtime approval override to win, got %#v", payload["permissionMode"])
	}
	if got := stringValue(payload["decisionPolicy"]); got != "allow" {
		t.Fatalf("expected decision policy to reflect runtime override, got %#v", payload["decisionPolicy"])
	}
	if got := strings.TrimSpace(derefOptionalString(request.ExternalConfig.ApprovalPolicy)); got != "default" {
		t.Fatalf("expected external config approval policy to remain unchanged, got %q", got)
	}
}

func TestEnsureClaudeMCPConfigIncludesAuthAndAgenticHeaders(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 19, 18, 0, 0, 0, time.UTC)
	sectionID := "section-alpha"
	request := &StartRequest{
		Run:             agentruns.Run{ID: "run-alpha"},
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
		Inputs: map[string]any{
			"frontendAffinityToken": "frontend-alpha",
			"allowUnscoped":         true,
		},
	}
	executor := &ClaudeExecutor{
		settaServerURL:     "http://127.0.0.1:8000/mcp",
		currentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("session-secret")},
		authCookieBaseName: auth.DefaultAuthCookieName,
		timeNow: func() time.Time {
			return now
		},
	}

	cleanupDir, err := executor.ensureClaudeMCPConfig(request)
	if err != nil {
		t.Fatalf("ensure claude mcp config: %v", err)
	}
	defer func() {
		if strings.TrimSpace(cleanupDir) != "" {
			_ = os.RemoveAll(cleanupDir)
		}
	}()

	configPath := strings.TrimSpace(stringValue(request.Inputs["mcpConfig"]))
	if filepath.Base(configPath) != claudeMCPConfigName {
		t.Fatalf("expected generated mcp config path %q, got %q", claudeMCPConfigName, configPath)
	}
	headers := readClaudeMCPConfigHeaders(t, configPath)
	assertClaudeMCPConfigHeaders(t, headers)
}

func readClaudeMCPConfigHeaders(t *testing.T, configPath string) map[string]any {
	t.Helper()

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read generated claude mcp config: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode generated claude mcp config: %v", err)
	}
	rawServers, ok := payload["mcpServers"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated mcpServers map, got %#v", payload["mcpServers"])
	}
	settaServer, ok := rawServers[mcpx.DefaultServerID].(map[string]any)
	if !ok {
		t.Fatalf("expected generated setta server entry, got %#v", rawServers)
	}
	headers, ok := settaServer["headers"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated setta headers, got %#v", settaServer["headers"])
	}
	return headers
}

func assertClaudeMCPConfigHeaders(t *testing.T, headers map[string]any) {
	t.Helper()

	cookieName, err := auth.CookieName(auth.DefaultAuthCookieName, "session-1")
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}
	cookie := strings.TrimSpace(stringValue(headers["Cookie"]))
	if !strings.HasPrefix(cookie, cookieName+"=") {
		t.Fatalf("expected generated auth cookie header to start with %q, got %q", cookieName+"=", cookie)
	}
	if got := stringValue(headers[mcpx.AgenticContextProjectConfigIDHeader]); got != "project-alpha" {
		t.Fatalf("expected project-config header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextChatIDHeader]); got != "chat-alpha" {
		t.Fatalf("expected chat header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextRunIDHeader]); got != "run-alpha" {
		t.Fatalf("expected run header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextSectionIDHeader]); got != "section-alpha" {
		t.Fatalf("expected section header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextFrontendAffinityHeader]); got != "frontend-alpha" {
		t.Fatalf("expected frontend-affinity header, got %#v", headers)
	}
	if got := stringValue(headers[mcpx.AgenticContextAllowUnscopedHeader]); got != "true" {
		t.Fatalf("expected allow-unscoped header, got %#v", headers)
	}
}

func TestBuildClaudeStartPayloadAllowedToolsPrefersExplicitInputThenProfileAllowlist(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name       string
		inputTools any
		profile    *agentprofiles.Profile
		want       []string
	}{
		{
			name:       "explicit input wins",
			inputTools: []any{"tool.explicit", " tool.trimmed ", 123, ""},
			profile: &agentprofiles.Profile{
				ToolAllowlist: []string{"tool.profile"},
			},
			want: []string{"tool.explicit", "tool.trimmed"},
		},
		{
			name:       "string slices are trimmed",
			inputTools: []string{" tool.slice ", "", "tool.second"},
			want:       []string{"tool.slice", "tool.second"},
		},
		{
			name: "profile allowlist is fallback",
			profile: &agentprofiles.Profile{
				ToolAllowlist: []string{"tool.profile", "tool.second"},
			},
			want: []string{"tool.profile", "tool.second"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			inputs := map[string]any{}
			if testCase.inputTools != nil {
				inputs["allowedTools"] = testCase.inputTools
			}
			payload := buildClaudeStartPayload(StartRequest{
				Run: agentruns.NewRun(nil, map[string]any{
					"messages": []any{
						map[string]any{
							"id":   "user-1",
							"role": "user",
							"content": []any{
								map[string]any{"type": "text", "text": "Hello"},
							},
						},
					},
				}, time.Date(2026, 3, 9, 13, 30, 0, 0, time.UTC)),
				ExternalConfig: externalagentconfigs.Config{
					ToolType: externalagentconfigs.ToolTypeClaudeCode,
					RunMode:  externalagentconfigs.RunModeSDK,
				},
				Profile: testCase.profile,
				Inputs:  inputs,
			}, "/tmp/workspace", map[string]string{})

			rawAllowedTools, ok := payload["allowedTools"].([]string)
			if !ok {
				t.Fatalf("expected allowedTools payload, got %#v", payload["allowedTools"])
			}
			if strings.Join(rawAllowedTools, ",") != strings.Join(testCase.want, ",") {
				t.Fatalf("expected allowedTools %v, got %#v", testCase.want, rawAllowedTools)
			}
		})
	}
}

func TestBuildClaudeStartPayloadThinkingBudgetBranches(t *testing.T) {
	t.Parallel()

	newRequest := func(inputs map[string]any) StartRequest {
		return StartRequest{
			Run: agentruns.NewRun(nil, map[string]any{
				"messages": []any{
					map[string]any{
						"id":   "user-1",
						"role": "user",
						"content": []any{
							map[string]any{"type": "text", "text": "Hello"},
						},
					},
				},
			}, time.Date(2026, 3, 9, 13, 30, 0, 0, time.UTC)),
			ExternalConfig: externalagentconfigs.Config{
				ToolType: externalagentconfigs.ToolTypeClaudeCode,
				RunMode:  externalagentconfigs.RunModeSDK,
			},
			Inputs: inputs,
		}
	}

	testCases := []struct {
		name    string
		inputs  map[string]any
		want    int
		wantSet bool
	}{
		{
			name:    "boolean thinking enables the default budget",
			inputs:  map[string]any{"thinking": true},
			want:    claudeDefaultThinkingBudget,
			wantSet: true,
		},
		{
			name:    "explicit false suppresses top level fallback",
			inputs:  map[string]any{"thinking": false, "thinkingBudgetTokens": 2048},
			wantSet: false,
		},
		{
			name:    "thinking map budget wins",
			inputs:  map[string]any{"thinking": map[string]any{"budget_tokens": "1536"}, "thinkingBudgetTokens": 2048},
			want:    1536,
			wantSet: true,
		},
		{
			name:    "enabled thinking map uses the default budget",
			inputs:  map[string]any{"thinking": map[string]any{"type": "enabled"}},
			want:    claudeDefaultThinkingBudget,
			wantSet: true,
		},
		{
			name:    "unrecognized thinking map falls back to top level budget",
			inputs:  map[string]any{"thinking": map[string]any{"type": "custom"}, "thinkingBudgetTokens": 2048},
			want:    2048,
			wantSet: true,
		},
		{
			name:    "disabled thinking string suppresses fallback",
			inputs:  map[string]any{"thinking": "disabled", "thinking_budget_tokens": 2048},
			wantSet: false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			payload := buildClaudeStartPayload(newRequest(testCase.inputs), "/tmp/workspace", map[string]string{})
			rawValue, ok := payload["maxThinkingTokens"]
			if !testCase.wantSet {
				if ok {
					t.Fatalf("expected maxThinkingTokens to be omitted, got %#v", rawValue)
				}
				return
			}
			if !ok {
				t.Fatalf("expected maxThinkingTokens to be set, payload=%#v", payload)
			}
			if got, ok := rawValue.(int); !ok || got != testCase.want {
				t.Fatalf("expected maxThinkingTokens=%d, got %#v", testCase.want, rawValue)
			}
		})
	}
}

func TestResolveClaudeSettingsPathUsesManagedModeSpecificFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	localPath := externalagentconfigs.ResolveClaudeSettingsPath(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeManagedLocal,
	}, root)
	if want := filepath.Join(root, ".claude", "settings.local.json"); localPath != want {
		t.Fatalf("expected managed-local settings path %q, got %q", want, localPath)
	}

	projectPath := externalagentconfigs.ResolveClaudeSettingsPath(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeManagedProject,
	}, root)
	if want := filepath.Join(root, ".claude", "settings.json"); projectPath != want {
		t.Fatalf("expected managed-project settings path %q, got %q", want, projectPath)
	}

	readOnlyPath := externalagentconfigs.ResolveClaudeSettingsPath(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}, root)
	if readOnlyPath != "" {
		t.Fatalf("expected read-only settings mode to skip path resolution, got %q", readOnlyPath)
	}
}

func TestPrepareClaudeSettingsPreservesUserKeysForManagedProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	settingsPath := filepath.Join(root, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatalf("mkdir claude settings dir: %v", err)
	}
	writeExistingManagedProjectClaudeSettings(t, settingsPath)

	executor := &ClaudeExecutor{workspaceRoot: root}
	if err := executor.prepareClaudeSettings(externalagentconfigs.Config{
		ToolType:                externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode:            externalagentconfigs.SettingsModeManagedProject,
		SettingsAllowSettaEdits: true,
		SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
			Claude: &externalagentconfigs.ClaudeSettingsManaged{
				Permissions: &externalagentconfigs.ClaudeSettingsPermissions{
					Allow: []string{"New"},
					Ask:   []string{},
					Deny:  []string{},
				},
			},
		},
	}); err != nil {
		t.Fatalf("prepare claude settings: %v", err)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read claude settings: %v", err)
	}
	assertManagedProjectClaudeSettings(t, content)
}

func writeExistingManagedProjectClaudeSettings(t *testing.T, settingsPath string) {
	t.Helper()

	existingPayload, err := json.MarshalIndent(map[string]any{
		"userSetting": map[string]any{"foo": "bar"},
		"permissions": map[string]any{"allow": []string{"Old"}},
	}, "", "  ")
	if err != nil {
		t.Fatalf("encode existing claude settings: %v", err)
	}
	existingPayload = append(existingPayload, '\n')
	if err := os.WriteFile(settingsPath, existingPayload, 0o644); err != nil {
		t.Fatalf("write existing claude settings: %v", err)
	}
}

func assertManagedProjectClaudeSettings(t *testing.T, content []byte) {
	t.Helper()

	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode claude settings: %v", err)
	}
	if got, ok := payload["userSetting"].(map[string]any); !ok || got["foo"] != "bar" {
		t.Fatalf("expected user keys to be preserved, got %#v", payload)
	}
	permissions, ok := payload["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("expected managed permissions block, got %#v", payload)
	}
	allow, ok := permissions["allow"].([]any)
	if !ok || len(allow) != 1 || stringValue(allow[0]) != "New" {
		t.Fatalf("expected managed permissions to overwrite allow list, got %#v", permissions)
	}
}

func TestPrepareClaudeSettingsWritesManagedLocalPermissions(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	executor := &ClaudeExecutor{workspaceRoot: root}
	if err := executor.prepareClaudeSettings(externalagentconfigs.Config{
		ToolType:                externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: true,
		SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
			Claude: &externalagentconfigs.ClaudeSettingsManaged{
				Permissions: &externalagentconfigs.ClaudeSettingsPermissions{
					Ask: []string{"Bash(rm:*)"},
				},
			},
		},
	}); err != nil {
		t.Fatalf("prepare managed-local claude settings: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(root, ".claude", "settings.local.json"))
	if err != nil {
		t.Fatalf("read managed-local claude settings: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode managed-local claude settings: %v", err)
	}
	permissions, ok := payload["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("expected managed permissions block, got %#v", payload)
	}
	ask, ok := permissions["ask"].([]any)
	if !ok || len(ask) != 1 || stringValue(ask[0]) != "Bash(rm:*)" {
		t.Fatalf("expected managed ask rules to be written, got %#v", permissions)
	}
}

func TestPrepareClaudeSettingsWritesDefaultAllowRules(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	executor := &ClaudeExecutor{workspaceRoot: root}
	if err := executor.prepareClaudeSettings(externalagentconfigs.Config{
		ToolType:                externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: true,
		SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
			Claude: &externalagentconfigs.ClaudeSettingsManaged{
				Permissions: &externalagentconfigs.ClaudeSettingsPermissions{
					Allow: []string{"mcp__setta__*"},
					Ask: []string{
						"Bash(rm:*)",
						"Bash(sudo:*)",
						"Bash(chmod:*)",
						"Bash(chown:*)",
						"Bash(git push:*)",
						"Bash(git reset:*)",
						"Bash(git clean:*)",
						"Bash(dd:*)",
						"Bash(mkfs:*)",
						"Bash(diskutil:*)",
					},
					Deny: []string{},
				},
			},
		},
	}); err != nil {
		t.Fatalf("prepare default claude settings: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(root, ".claude", "settings.local.json"))
	if err != nil {
		t.Fatalf("read default claude settings: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode default claude settings: %v", err)
	}
	permissions, ok := payload["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("expected managed permissions block, got %#v", payload)
	}
	allow, ok := permissions["allow"].([]any)
	if !ok || len(allow) != 1 || stringValue(allow[0]) != "mcp__setta__*" {
		t.Fatalf("expected default allow rules, got %#v", permissions)
	}
}

func TestPrepareClaudeSettingsReadOnlySkipsWrites(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	executor := &ClaudeExecutor{workspaceRoot: root}
	if err := executor.prepareClaudeSettings(externalagentconfigs.Config{
		ToolType:     externalagentconfigs.ToolTypeClaudeCode,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}); err != nil {
		t.Fatalf("prepare read-only claude settings: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".claude")); !os.IsNotExist(err) {
		t.Fatalf("expected read-only settings mode to skip writes, stat err=%v", err)
	}
}

type claudeExecutorFixture struct {
	root     string
	config   externalagentconfigs.Config
	executor *ClaudeExecutor
	send     *SendService
	runtime  *Runtime
	runs     *agentruns.RunStore
	engineID string
}

type claudeExecutorFixtureStores struct {
	engines  *agentruns.EngineStore
	configs  *externalagentconfigs.Store
	runs     *agentruns.RunStore
	profiles *agentprofiles.Store
}

func newClaudeExecutorFixture(t *testing.T, scenario string) claudeExecutorFixture {
	t.Helper()

	root := t.TempDir()
	pythonCommand := writeClaudeFixtureCommand(t, scenario)
	sidecarPath := filepath.Join(t.TempDir(), "claude-sidecar.py")
	if err := os.WriteFile(sidecarPath, []byte("# fixture sidecar placeholder\n"), 0o644); err != nil {
		t.Fatalf("write claude sidecar placeholder: %v", err)
	}

	stores := newClaudeExecutorFixtureStores(t, root)
	projectRuntime := openClaudeExecutorFixtureProjectRuntime(t)
	configID := "external-config"
	approvalPolicy := "default"
	config := externalagentconfigs.Config{
		ID:                      configID,
		Name:                    "Claude fixture",
		ToolType:                externalagentconfigs.ToolTypeClaudeCode,
		RunMode:                 externalagentconfigs.RunModeSDK,
		ApprovalPolicy:          &approvalPolicy,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: true,
		WorkingDirStrategy:      externalagentconfigs.WorkingDirStrategyProjectRoot,
		SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
			Claude: &externalagentconfigs.ClaudeSettingsManaged{
				Permissions: &externalagentconfigs.ClaudeSettingsPermissions{
					Allow: []string{"Read"},
					Ask:   []string{"Bash"},
					Deny:  []string{},
				},
			},
		},
	}
	if err := stores.configs.Write([]externalagentconfigs.Config{config}); err != nil {
		t.Fatalf("write external configs: %v", err)
	}
	engineID := "engine-external"
	if err := stores.engines.Write([]agentruns.EngineConfig{
		{
			ID:                    engineID,
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &configID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	now := time.Date(2026, 3, 9, 13, 0, 0, 0, time.UTC)
	runtime := newClaudeExecutorFixtureRuntime(t, stores.runs, now)
	claudeExecutor := newClaudeExecutorFixtureExecutor(t, stores.runs, runtime, root, pythonCommand, sidecarPath, now)
	send := newClaudeExecutorFixtureSendService(t, projectRuntime, stores, runtime, claudeExecutor, now)

	return claudeExecutorFixture{
		root:     root,
		config:   config,
		executor: claudeExecutor,
		send:     send,
		runtime:  runtime,
		runs:     stores.runs,
		engineID: engineID,
	}
}

func newClaudeExecutorFixtureStores(t *testing.T, root string) claudeExecutorFixtureStores {
	t.Helper()

	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	configs, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external config store: %v", err)
	}
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	return claudeExecutorFixtureStores{
		engines:  engines,
		configs:  configs,
		runs:     runs,
		profiles: profiles,
	}
}

func openClaudeExecutorFixtureProjectRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	return projectRuntime
}

func newClaudeExecutorFixtureRuntime(t *testing.T, runs *agentruns.RunStore, now time.Time) *Runtime {
	t.Helper()

	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	return runtime
}

func newClaudeExecutorFixtureExecutor(
	t *testing.T,
	runs *agentruns.RunStore,
	runtime *Runtime,
	root string,
	pythonCommand string,
	sidecarPath string,
	now time.Time,
) *ClaudeExecutor {
	t.Helper()

	claudeExecutor, err := NewClaudeExecutor(ClaudeExecutorOptions{
		Runs:               runs,
		Runtime:            runtime,
		WorkspaceRoot:      root,
		SettaServerURL:     mcpx.BuildSettaServerURL("127.0.0.1", 8000),
		CurrentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("fixture-secret")},
		AuthCookieBaseName: auth.DefaultAuthCookieName,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
		PythonCommand:      pythonCommand,
		SidecarPath:        sidecarPath,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new claude executor: %v", err)
	}
	return claudeExecutor
}

func newClaudeExecutorFixtureSendService(
	t *testing.T,
	projectRuntime *projectstate.Runtime,
	stores claudeExecutorFixtureStores,
	runtime *Runtime,
	claudeExecutor *ClaudeExecutor,
	now time.Time,
) *SendService {
	t.Helper()

	send, err := NewSendService(SendServiceOptions{
		ProjectState: projectRuntime,
		Engines:      stores.engines,
		Runs:         stores.runs,
		Profiles:     stores.profiles,
		Configs:      stores.configs,
		Runtime:      runtime,
		Preflight: stubPreflightChecker{
			status: externalagentconfigs.Status{
				ConfigID:  "external-config",
				Name:      "Claude fixture",
				ToolType:  externalagentconfigs.ToolTypeClaudeCode,
				RunMode:   externalagentconfigs.RunModeSDK,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
		Executor: NewMultiExecutor(MultiExecutorOptions{
			Claude: claudeExecutor,
		}),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}
	return send
}

func (f claudeExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
	t.Helper()

	deadline := time.Now().Add(executorFixtureTerminalTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run %s: %v", runID, err)
		}
		if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s to reach a terminal state", runID)
	return agentruns.Run{}
}

func (f claudeExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureCleanupTimeout)
	for time.Now().Before(deadline) {
		liveState, err := f.runtime.GetLiveChatState(runID)
		if err != nil {
			t.Fatalf("get live state during cleanup wait: %v", err)
		}
		if liveState == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live state cleanup on %s", runID)
}

func (f claudeExecutorFixture) waitForApproval(t *testing.T, runID string, approvalID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for approval: %v", err)
		}
		if approvalMessagePresent(run, approvalID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for approval %s", approvalID)
}

func (f claudeExecutorFixture) waitForQuestion(t *testing.T, runID string, toolCallID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for question: %v", err)
		}
		if questionToolCallPresent(run, toolCallID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for question %s", toolCallID)
}

func questionToolCallPresent(run agentruns.Run, toolCallID string) bool {
	rawMessages, ok := run.Outputs["messages"].([]any)
	if !ok {
		return false
	}
	for _, rawMessage := range rawMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		rawToolCalls, ok := message["tool_calls"].([]any)
		if !ok {
			continue
		}
		for _, rawToolCall := range rawToolCalls {
			toolCall, ok := rawToolCall.(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(stringValue(toolCall["id"])) == toolCallID {
				return true
			}
		}
	}
	return false
}

func writeClaudeFixtureCommand(t *testing.T, scenario string) string {
	t.Helper()

	commandPath := filepath.Join(t.TempDir(), "claude-fixture.sh")
	content := fmt.Sprintf("#!/bin/sh\nSETTA_CLAUDE_FIXTURE=1 SETTA_CLAUDE_FIXTURE_SCENARIO=%s exec %q -test.run '^TestClaudeFixtureProcess$' -- \"$@\"\n", scenario, os.Args[0])
	if err := os.WriteFile(commandPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write claude fixture command: %v", err)
	}
	return commandPath
}

func TestClaudeFixtureProcess(t *testing.T) {
	if os.Getenv("SETTA_CLAUDE_FIXTURE") != "1" {
		return
	}
	if err := runClaudeFixtureProcess(os.Getenv("SETTA_CLAUDE_FIXTURE_SCENARIO")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	os.Exit(0)
}

func runClaudeFixtureProcess(scenario string) error {
	reader := bufio.NewScanner(os.Stdin)
	reader.Buffer(make([]byte, 0, 16*1024), claudeStdoutBufferSize)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()
	fixture := &claudeFixtureProcess{scenario: scenario, reader: reader, writer: writer}

	startPayload, err := fixture.readPayload()
	if err != nil {
		return err
	}
	if strings.TrimSpace(stringValue(startPayload["type"])) != "start" {
		return fmt.Errorf("expected start payload, got %#v", startPayload)
	}

	handler, ok := claudeFixtureScenarioHandlers[scenario]
	if !ok {
		handler = handleClaudeFixtureDefault
	}
	return handler(fixture, startPayload)
}

type claudeFixtureProcess struct {
	scenario string
	reader   *bufio.Scanner
	writer   *bufio.Writer
}

func (f *claudeFixtureProcess) readPayload() (map[string]any, error) {
	for f.reader.Scan() {
		line := strings.TrimSpace(f.reader.Text())
		if line == "" {
			continue
		}
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			return nil, fmt.Errorf("decode fixture payload: %w", err)
		}
		return payload, nil
	}
	if err := f.reader.Err(); err != nil {
		return nil, err
	}
	return nil, io.EOF
}

func (f *claudeFixtureProcess) emit(payload map[string]any) error {
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := f.writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return f.writer.Flush()
}

func (f *claudeFixtureProcess) emitResult(sessionID string, usage map[string]any) error {
	return f.emit(map[string]any{
		"type":      "result",
		"sessionId": sessionID,
		"isError":   false,
		"result":    "ok",
		"usage":     usage,
	})
}

var claudeFixtureScenarioHandlers = map[string]func(*claudeFixtureProcess, map[string]any) error{
	"delayed_complete":           handleClaudeFixtureDelayedComplete,
	"generated_mcp_config":       handleClaudeFixtureGeneratedMCPConfig,
	"env_echo":                   handleClaudeFixtureEnvEcho,
	"approval":                   handleClaudeFixtureApproval,
	"question":                   handleClaudeFixtureQuestion,
	"question_multiple":          handleClaudeFixtureMultipleQuestions,
	"tool_result_and_mcp_status": handleClaudeFixtureToolResultAndMCPStatus,
	"thinking_usage":             handleClaudeFixtureThinkingUsage,
}

func handleClaudeFixtureDelayedComplete(f *claudeFixtureProcess, _ map[string]any) error {
	time.Sleep(150 * time.Millisecond)
	if err := emitClaudeAssistantTurn(f.emit, "session-delayed", "assistant-delayed", "Hello from Claude after delay"); err != nil {
		return err
	}
	return f.emitResult("session-delayed", map[string]any{"input_tokens": 12, "output_tokens": 8})
}

func handleClaudeFixtureGeneratedMCPConfig(f *claudeFixtureProcess, startPayload map[string]any) error {
	configPath := strings.TrimSpace(stringValue(startPayload["mcpConfigPath"]))
	if err := validateClaudeGeneratedMCPConfig(configPath, startPayload); err != nil {
		return err
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-generated-mcp", "assistant-generated-mcp", configPath); err != nil {
		return err
	}
	return f.emitResult("session-generated-mcp", map[string]any{"input_tokens": 5, "output_tokens": 3})
}

func validateClaudeGeneratedMCPConfig(configPath string, startPayload map[string]any) error {
	if configPath == "" {
		return fmt.Errorf("expected generated mcpConfigPath, got %#v", startPayload)
	}
	if filepath.Base(configPath) != claudeMCPConfigName {
		return fmt.Errorf("expected generated mcpConfigPath basename %q, got %q", claudeMCPConfigName, filepath.Base(configPath))
	}
	content, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read generated claude mcp config: %w", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		return fmt.Errorf("decode generated claude mcp config: %w", err)
	}
	return validateClaudeGeneratedMCPConfigPayload(payload)
}

func validateClaudeGeneratedMCPConfigPayload(payload map[string]any) error {
	rawServers, ok := payload["mcpServers"].(map[string]any)
	if !ok {
		return fmt.Errorf("expected generated mcpServers map, got %#v", payload["mcpServers"])
	}
	settaServer, ok := rawServers[mcpx.DefaultServerID].(map[string]any)
	if !ok {
		return fmt.Errorf("expected generated setta mcp server entry, got %#v", rawServers)
	}
	if got := strings.TrimSpace(stringValue(settaServer["type"])); got != "streamable_http" {
		return fmt.Errorf("expected generated setta transport streamable_http, got %#v", settaServer)
	}
	if got := strings.TrimSpace(stringValue(settaServer["url"])); got != "http://127.0.0.1:8000/mcp" {
		return fmt.Errorf("expected generated setta url, got %#v", settaServer)
	}
	return nil
}

func handleClaudeFixtureEnvEcho(f *claudeFixtureProcess, startPayload map[string]any) error {
	rawEnv, ok := startPayload["env"].(map[string]any)
	if !ok {
		return fmt.Errorf("expected env payload, got %#v", startPayload["env"])
	}
	if err := validateClaudeFixtureEnv(rawEnv); err != nil {
		return err
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-env", "assistant-env", "Env handoff ok"); err != nil {
		return err
	}
	return f.emitResult("session-env", map[string]any{"input_tokens": 4, "output_tokens": 3})
}

func validateClaudeFixtureEnv(rawEnv map[string]any) error {
	expected := map[string]string{
		"PROCESS_KEY":    "process-secret",
		"WHITESPACE_KEY": "managed-fallback",
		"PLAIN_KEY":      "plain-dot-env-value",
	}
	for key, value := range expected {
		if got := strings.TrimSpace(stringValue(rawEnv[key])); got != value {
			return fmt.Errorf("expected %s=%q, got %#v", key, value, rawEnv[key])
		}
	}
	if _, ok := rawEnv["MISSING_KEY"]; ok {
		return fmt.Errorf("expected missing key to stay excluded, got %#v", rawEnv["MISSING_KEY"])
	}
	return nil
}

func handleClaudeFixtureApproval(f *claudeFixtureProcess, _ map[string]any) error {
	if err := f.emit(map[string]any{
		"type":       "approval_request",
		"approvalId": "approval-1",
		"toolName":   "Bash",
		"toolType":   "command",
		"input":      map[string]any{"command": "echo approval"},
	}); err != nil {
		return err
	}
	payload, err := f.readPayload()
	if err != nil {
		return err
	}
	if err := validateClaudeApprovalResponse(payload); err != nil {
		return err
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-approval", "assistant-approval", "Approval granted"); err != nil {
		return err
	}
	return f.emitResult("session-approval", map[string]any{"input_tokens": 6, "output_tokens": 4})
}

func validateClaudeApprovalResponse(payload map[string]any) error {
	if strings.TrimSpace(stringValue(payload["type"])) != "approval_response" {
		return fmt.Errorf("expected approval_response, got %#v", payload)
	}
	if strings.TrimSpace(stringValue(payload["approvalId"])) != "approval-1" || payload["approved"] != true {
		return fmt.Errorf("unexpected approval response %#v", payload)
	}
	return nil
}

func handleClaudeFixtureQuestion(f *claudeFixtureProcess, _ map[string]any) error {
	questions := []any{map[string]any{"question": "Language", "type": "text"}}
	if err := emitClaudeQuestionPrompt(f, "session-question", "assistant-question", questions); err != nil {
		return err
	}
	payload, err := f.readPayload()
	if err != nil {
		return err
	}
	if err := validateClaudeQuestionResponse(payload, false); err != nil {
		return err
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-question", "assistant-follow-up", "Chosen: Go"); err != nil {
		return err
	}
	return f.emitResult("session-question", map[string]any{"input_tokens": 7, "output_tokens": 5})
}

func handleClaudeFixtureMultipleQuestions(f *claudeFixtureProcess, _ map[string]any) error {
	questions := []any{
		map[string]any{"question": "Choose a language", "type": "text"},
		map[string]any{"question": "Choose a target", "type": "text"},
	}
	if err := emitClaudeQuestionPrompt(f, "session-question-multi", "assistant-question-multi", questions); err != nil {
		return err
	}
	payload, err := f.readPayload()
	if err != nil {
		return err
	}
	if err := validateClaudeQuestionResponse(payload, true); err != nil {
		return err
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-question-multi", "assistant-follow-up-multi", "Chosen: Python CLI"); err != nil {
		return err
	}
	return f.emitResult("session-question-multi", map[string]any{"input_tokens": 8, "output_tokens": 6})
}

func emitClaudeQuestionPrompt(f *claudeFixtureProcess, sessionID string, messageID string, questions []any) error {
	for _, payload := range []map[string]any{
		{
			"type":       "approval_request",
			"approvalId": "approval-1",
			"toolName":   askUserQuestionToolName,
			"toolType":   "question",
			"input":      map[string]any{"questions": questions},
		},
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": messageID, "content": []any{}},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type":  "content_block_start",
				"index": 0,
				"content_block": map[string]any{
					"type":  "tool_use",
					"id":    "question-1",
					"name":  askUserQuestionToolName,
					"input": map[string]any{"questions": questions},
				},
			},
		},
	} {
		if err := f.emit(payload); err != nil {
			return err
		}
	}
	return nil
}

func validateClaudeQuestionResponse(payload map[string]any, expectAnswers bool) error {
	if strings.TrimSpace(stringValue(payload["type"])) != "tool_response" {
		return fmt.Errorf("expected tool_response, got %#v", payload)
	}
	if strings.TrimSpace(stringValue(payload["toolCallId"])) != "approval-1" {
		return fmt.Errorf("expected question response to use approval id, got %#v", payload)
	}
	if !expectAnswers {
		return nil
	}
	answers, ok := mapValue(payload["answers"])
	if !ok || stringValue(answers["Choose a language"]) != "Python" || stringValue(answers["Choose a target"]) != "CLI" {
		return fmt.Errorf("unexpected multi-question answers %#v", payload)
	}
	return nil
}

func handleClaudeFixtureToolResultAndMCPStatus(f *claudeFixtureProcess, _ map[string]any) error {
	for _, payload := range []map[string]any{
		{
			"type":      "stream_event",
			"sessionId": "session-tool-result",
			"event": map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": "assistant-tool-1", "content": []any{}},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-tool-result",
			"event": map[string]any{
				"type":  "content_block_start",
				"index": 0,
				"content_block": map[string]any{
					"type": "tool_use",
					"id":   "toolu-1",
					"name": "Bash",
					"input": map[string]any{
						"command": "ls",
					},
				},
			},
		},
		{
			"type":      "system_message",
			"sessionId": "session-tool-result",
			"message": map[string]any{
				"subtype": "mcp_status",
				"mcp_servers": []any{
					map[string]any{
						"serverId":  "filesystem",
						"status":    "failed",
						"transport": "stdio",
						"command":   "npx @modelcontextprotocol/server-filesystem .",
						"error":     "spawn failed",
					},
				},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-tool-result",
			"event": map[string]any{
				"type":  "content_block_stop",
				"index": 0,
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-tool-result",
			"event": map[string]any{
				"type":  "content_block_start",
				"index": 1,
				"content_block": map[string]any{
					"type":        "tool_result",
					"tool_use_id": "toolu-1",
					"content":     []any{map[string]any{"type": "text", "text": "ok"}},
				},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-tool-result",
			"event": map[string]any{
				"type":  "content_block_stop",
				"index": 1,
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-tool-result",
			"event": map[string]any{
				"type": "message_stop",
			},
		},
	} {
		if err := f.emit(payload); err != nil {
			return err
		}
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-tool-result", "assistant-tool-summary", "Tool completed."); err != nil {
		return err
	}
	return f.emitResult("session-tool-result", map[string]any{"input_tokens": 9, "output_tokens": 6})
}

func handleClaudeFixtureThinkingUsage(f *claudeFixtureProcess, _ map[string]any) error {
	for _, payload := range []map[string]any{
		{
			"type":      "stream_event",
			"sessionId": "session-thinking",
			"event": map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": "assistant-thinking", "content": []any{}},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-thinking",
			"event": map[string]any{
				"type":  "content_block_start",
				"index": 0,
				"content_block": map[string]any{
					"type":      "thinking",
					"thinking":  "Plan carefully.",
					"summary":   "Plan summary",
					"signature": "sig-think",
				},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": "session-thinking",
			"event": map[string]any{
				"type": "message_stop",
			},
		},
	} {
		if err := f.emit(payload); err != nil {
			return err
		}
	}
	if err := emitClaudeAssistantTurn(f.emit, "session-thinking", "assistant-thinking-answer", "42"); err != nil {
		return err
	}
	return f.emitResult("session-thinking", map[string]any{
		"promptTokens":        11,
		"completionTokens":    2,
		"totalTokens":         13,
		"contextWindowTokens": 4096,
	})
}

func handleClaudeFixtureDefault(f *claudeFixtureProcess, _ map[string]any) error {
	if err := emitClaudeAssistantTurn(f.emit, "session-complete", "assistant-1", "Hello from Claude"); err != nil {
		return err
	}
	return f.emitResult("session-complete", map[string]any{"input_tokens": 12, "output_tokens": 8})
}

func emitClaudeAssistantTurn(
	emit func(map[string]any) error,
	sessionID string,
	messageID string,
	text string,
) error {
	payloads := []map[string]any{
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type":    "message_start",
				"message": map[string]any{"id": messageID, "content": []any{}},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type":  "content_block_start",
				"index": 0,
				"content_block": map[string]any{
					"type": "text",
					"text": text,
				},
			},
		},
		{
			"type":      "stream_event",
			"sessionId": sessionID,
			"event": map[string]any{
				"type": "message_stop",
			},
		},
	}
	for _, payload := range payloads {
		if err := emit(payload); err != nil {
			return err
		}
	}
	return nil
}

func newClaudeParserTestFixture(t *testing.T) (*ClaudeExecutor, *claudeEventParser, StartRequest, *ChatState) {
	t.Helper()

	_, runtime := buildRuntimeFixture(t)
	request := StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{},
		}, time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)),
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}
	return &ClaudeExecutor{}, newClaudeEventParser(runtime, request), request, &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
}

func newActiveClaudeParserTestFixture(t *testing.T) (*agentruns.RunStore, *Runtime, *ClaudeExecutor, *claudeEventParser, StartRequest, *ChatState) {
	t.Helper()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-claude-parser", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate parser run: %v", err)
	}
	sectionID := "section-alpha"
	request := StartRequest{
		Run:             run,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
	}
	executor := &ClaudeExecutor{
		runs:    store,
		runtime: runtime,
		timeNow: func() time.Time { return time.Date(2026, 3, 20, 10, 5, 0, 0, time.UTC) },
	}
	return store, runtime, executor, newClaudeEventParser(runtime, request), request, &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
}

func assistantMessageForTest(t *testing.T, state *ChatState, messageID string) map[string]any {
	t.Helper()

	for _, message := range state.Messages {
		if stringValue(message["id"]) != messageID {
			continue
		}
		return cloneAnyMap(message)
	}
	t.Fatalf("expected assistant message %q in %#v", messageID, state.Messages)
	return nil
}

func floatValueForTest(raw any) float64 {
	switch value := raw.(type) {
	case float64:
		return value
	case int:
		return float64(value)
	case int64:
		return float64(value)
	default:
		return 0
	}
}
