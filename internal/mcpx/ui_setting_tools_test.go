package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/agentprofiles"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/uisettings"
)

type uiSettingDriftProjectState struct {
	*projectstate.Runtime
}

type expectedOldValueRecordingProjectState struct {
	*projectstate.Runtime
	observedShowParamExpectedOldValues []*bool
}

type concurrentCoreSettingProjectState struct {
	*projectstate.Runtime
	beforeCompareProjectName          func(context.Context, string, string, *string) error
	beforeComparePythonCodegenEnabled func(context.Context, string, bool, *bool) error
}

type concurrentWritePluginMutationService struct {
	*plugins.Service
	beforeWriteConfig func(context.Context, plugins.ConfigWriteOptions) error
}

func (s *concurrentWritePluginMutationService) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	if s.beforeWriteConfig != nil {
		hook := s.beforeWriteConfig
		s.beforeWriteConfig = nil
		if err := hook(ctx, options); err != nil {
			return plugins.PluginConfigWriteResponse{}, err
		}
	}
	return s.Service.WriteConfig(ctx, options)
}

type runtimeOverridePluginMutationService struct {
	*plugins.Service
	mutateRuntime func(plugins.PluginRuntimeResponse) plugins.PluginRuntimeResponse
}

func (s *runtimeOverridePluginMutationService) Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	response, err := s.Service.Runtime(options)
	if err != nil {
		return plugins.PluginRuntimeResponse{}, err
	}
	if s.mutateRuntime != nil {
		response = s.mutateRuntime(response)
	}
	return response, nil
}

type recordingRevealService struct {
	input  uisettings.RevealInput
	result uisettings.RevealResult
	err    error
}

type stubUISettingRevealTransport struct {
	registry *realtime.Registry
	sendJSON func(context.Context, any, string) (bool, error)
}

func (s *stubUISettingRevealTransport) Registry() *realtime.Registry {
	return s.registry
}

func (s *stubUISettingRevealTransport) SendJSON(ctx context.Context, message any, connectionID string) (bool, error) {
	if s.sendJSON != nil {
		return s.sendJSON(ctx, message, connectionID)
	}
	return true, nil
}

func setUISettingAgenticContext(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId": projectConfigID,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func setUISettingAgenticContextWithShareSession(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId": projectConfigID,
		"shareSessionId":  shareSessionID,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	frontendAffinityToken string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId":       projectConfigID,
		"shareSessionId":        shareSessionID,
		"frontendAffinityToken": frontendAffinityToken,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func mustCloneScopedTestProject(t *testing.T, runtime *projectstate.Runtime, projectID string, sourceProjectID string) {
	t.Helper()

	_, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		source, err := document.ProjectByID(sourceProjectID)
		if err != nil {
			return document, err
		}
		cloned := source
		cloned.ID = projectID
		cloned.Name = fmt.Sprintf("%s clone", source.Name)
		document.Projects[projectID] = cloned
		return document, nil
	})
	if err != nil {
		t.Fatalf("clone scoped test project %q from %q: %v", projectID, sourceProjectID, err)
	}
}

func (s uiSettingDriftProjectState) CompareAndSetShowParamDisplayNames(
	ctx context.Context,
	projectID string,
	show bool,
	expectedOldValue *bool,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	snapshot, result, err := s.Runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expectedOldValue)
	if err != nil {
		return snapshot, result, err
	}
	result.OldValue = !result.OldValue
	return snapshot, result, nil
}

func (s *expectedOldValueRecordingProjectState) CompareAndSetShowParamDisplayNames(
	ctx context.Context,
	projectID string,
	show bool,
	expectedOldValue *bool,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	if expectedOldValue == nil {
		s.observedShowParamExpectedOldValues = append(s.observedShowParamExpectedOldValues, nil)
	} else {
		recorded := *expectedOldValue
		s.observedShowParamExpectedOldValues = append(s.observedShowParamExpectedOldValues, &recorded)
	}
	return s.Runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expectedOldValue)
}

func (s *concurrentCoreSettingProjectState) CompareAndSetProjectName(
	ctx context.Context,
	projectID string,
	name string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	if s.beforeCompareProjectName != nil {
		hook := s.beforeCompareProjectName
		s.beforeCompareProjectName = nil
		if err := hook(ctx, projectID, name, expectedOldValue); err != nil {
			return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
		}
	}
	return s.Runtime.CompareAndSetProjectName(ctx, projectID, name, expectedOldValue)
}

func (s *concurrentCoreSettingProjectState) CompareAndSetPythonCodegenEnabled(
	ctx context.Context,
	projectID string,
	enabled bool,
	expectedOldValue *bool,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	if s.beforeComparePythonCodegenEnabled != nil {
		hook := s.beforeComparePythonCodegenEnabled
		s.beforeComparePythonCodegenEnabled = nil
		if err := hook(ctx, projectID, enabled, expectedOldValue); err != nil {
			return projectstate.Snapshot{}, projectstate.CompareAndSetResult[bool]{}, err
		}
	}
	return s.Runtime.CompareAndSetPythonCodegenEnabled(
		ctx,
		projectID,
		enabled,
		expectedOldValue,
		validator,
		pythonReconciler,
	)
}

func (s *recordingRevealService) Reveal(_ context.Context, input uisettings.RevealInput) (uisettings.RevealResult, error) {
	s.input = input
	return s.result, s.err
}

func openProjectAISettingLLMService(t *testing.T, root string, apiKeys map[string]string) *llmconfig.Service {
	t.Helper()

	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := llmconfig.NewService(llmconfig.ServiceOptions{
		ConfigPath:         llmconfig.Path(root),
		ManagedAPIKeysPath: llmconfig.ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new llm service: %v", err)
	}
	if _, status := service.SaveManagedAPIKeys(apiKeys, 0); status != llmconfig.ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("seed managed api keys: %s", status)
	}
	return service
}

func mustStructuredInteger(t *testing.T, value any) int {
	t.Helper()

	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	default:
		t.Fatalf("expected integer value, got %#v", value)
		return 0
	}
}

func TestServerUISettingToolsExposeScopedSingletonMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	expected := map[string]tools.AccessType{
		"search_ui_settings":   tools.AccessTypeRead,
		"get_ui_setting_value": tools.AccessTypeRead,
		"reveal_ui_setting":    tools.AccessTypeRead,
		"set_ui_setting_value": tools.AccessTypeWrite,
	}
	for _, tool := range toolsResult.Tools {
		accessType, ok := expected[tool.Name]
		if !ok {
			continue
		}
		meta := mustStructuredMap(t, tool.Meta[toolMetaNamespace])
		if meta["accessType"] != string(accessType) {
			t.Fatalf("expected %s access type for %s, got %#v", accessType, tool.Name, meta["accessType"])
		}
		if meta["defaultTargetSingletonSection"] != "GlobalVariables" {
			t.Fatalf("expected GlobalVariables singleton target for %s, got %#v", tool.Name, meta["defaultTargetSingletonSection"])
		}
		if tool.Name == "set_ui_setting_value" {
			inputSchema := mustStructuredMap(t, tool.InputSchema)
			inputProperties := mustStructuredMap(t, inputSchema["properties"])
			if _, ok := inputProperties["expectedOldValue"]; !ok {
				t.Fatalf("expected set_ui_setting_value schema to expose expectedOldValue, got %#v", inputProperties)
			}
		}
	}
}

func TestServerProjectAIUISettingsAreDiscoverableRevealableAndReadOnly(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	projectRuntime := openScopedTestProjectRuntime(t)

	profileStore, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	if err := profileStore.Write([]agentprofiles.Profile{
		{ID: "profile-alpha", Name: "Alpha"},
		{ID: "profile-beta", Name: "Beta"},
		{ID: "profile-gamma", Name: "Gamma"},
	}); err != nil {
		t.Fatalf("seed agent profiles: %v", err)
	}

	templateStore, err := prompttemplates.NewStore(root)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	for _, template := range []prompttemplates.Template{
		{ID: "template-alpha", Name: "Alpha", Template: "alpha"},
		{ID: "template-beta", Name: "Beta", Template: "beta"},
		{ID: "template-gamma", Name: "Gamma", Template: "gamma"},
		{ID: "template-delta", Name: "Delta", Template: "delta"},
	} {
		if err := templateStore.Save(template); err != nil {
			t.Fatalf("seed prompt template %s: %v", template.ID, err)
		}
	}

	externalConfigStore, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external agent config store: %v", err)
	}
	if err := externalConfigStore.Write([]externalagentconfigs.Config{
		{
			ID:       "external-codex",
			Name:     "Codex",
			ToolType: externalagentconfigs.ToolTypeCodex,
			RunMode:  externalagentconfigs.RunModeAppServer,
		},
	}); err != nil {
		t.Fatalf("seed external agent configs: %v", err)
	}

	llmService := openProjectAISettingLLMService(t, root, map[string]string{
		"OPENAI_API_KEY":    "openai-secret",
		"ANTHROPIC_API_KEY": "anthropic-secret",
	})

	expectations := map[string]struct {
		query           string
		expectedCount   int
		accordionItemID string
	}{
		"core.project_ai_settings.llm_api_keys": {
			query:           "llm api keys",
			expectedCount:   2,
			accordionItemID: "project-ai-settings-llm-api-keys",
		},
		"core.project_ai_settings.agent_profiles": {
			query:           "agent profiles",
			expectedCount:   3,
			accordionItemID: "project-ai-settings-agent-profiles",
		},
		"core.project_ai_settings.prompt_templates": {
			query:           "prompt templates",
			expectedCount:   4,
			accordionItemID: "project-ai-settings-prompt-templates",
		},
		"core.project_ai_settings.external_agents": {
			query:           "external agents",
			expectedCount:   1,
			accordionItemID: "project-ai-settings-external-agents",
		},
	}

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	results := realtime.NewUISettingRevealResultHub()
	transport := &stubUISettingRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		revealMessage, ok := message.(realtime.UISettingRevealMessage)
		if !ok {
			t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
		}
		if revealMessage.Content.ActiveSectionID != nil {
			t.Fatalf("expected left-pane project-ai reveal without activeSectionId, got %#v", revealMessage.Content.ActiveSectionID)
		}
		if len(revealMessage.Content.Reveals) != 1 {
			t.Fatalf("expected one reveal target, got %#v", revealMessage.Content.Reveals)
		}
		target := revealMessage.Content.Reveals[0]
		expectation, ok := expectations[target.SettingID]
		if !ok {
			t.Fatalf("unexpected reveal target setting id %q", target.SettingID)
		}
		if target.OverviewTabKey == nil || *target.OverviewTabKey != "ProjectAISettings" {
			t.Fatalf("expected ProjectAISettings overview tab, got %#v", target.OverviewTabKey)
		}
		if len(target.RevealActivationSteps) != 1 {
			t.Fatalf("expected one reveal activation step, got %#v", target.RevealActivationSteps)
		}
		if target.RevealActivationSteps[0].Type != string(uisettings.RevealActivationProjectAIAccordion) {
			t.Fatalf("expected project-ai accordion activation step, got %#v", target.RevealActivationSteps[0])
		}
		if target.RevealActivationSteps[0].ItemValue != expectation.accordionItemID {
			t.Fatalf("expected accordion item %q, got %#v", expectation.accordionItemID, target.RevealActivationSteps[0].ItemValue)
		}
		if !results.Resolve(realtime.UISettingRevealResultContent{
			ProjectConfigID: "project-alpha",
			RequestID:       revealMessage.Content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID: target.SettingID,
					Status:    "revealed",
				},
			},
		}, connectionID) {
			t.Fatal("expected reveal result resolution to succeed")
		}
		return true, nil
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: transport,
		Results:   results,
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, root, projectRuntime, ServerOptions{
		WorkspaceRoot:        root,
		ProjectState:         projectRuntime,
		AgentProfiles:        profileStore,
		PromptTemplates:      templateStore,
		ExternalAgentConfigs: externalConfigStore,
		LLMAPIKeys:           llmService,
		UISettingReveals:     revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	for settingID, expectation := range expectations {
		searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "search_ui_settings",
			Arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"query":           expectation.query,
				"sourceFilter":    "core",
			},
		})
		if err != nil {
			t.Fatalf("call search_ui_settings for %s: %v", settingID, err)
		}
		if searchResult.IsError {
			t.Fatalf("expected search_ui_settings success for %s, got %#v", settingID, searchResult.StructuredContent)
		}
		searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
		searchEntries := mustStructuredList(t, searchPayload["results"])
		found := false
		for _, rawEntry := range searchEntries {
			entry := mustStructuredMap(t, rawEntry)
			if entry["settingId"] == settingID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected search results for %s to include %s, got %#v", expectation.query, settingID, searchEntries)
		}

		getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "get_ui_setting_value",
			Arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       settingID,
			},
		})
		if err != nil {
			t.Fatalf("call get_ui_setting_value for %s: %v", settingID, err)
		}
		if getResult.IsError {
			t.Fatalf("expected get_ui_setting_value success for %s, got %#v", settingID, getResult.StructuredContent)
		}
		getPayload := mustStructuredMap(t, getResult.StructuredContent)
		if got := mustStructuredInteger(t, getPayload["value"]); got != expectation.expectedCount {
			t.Fatalf("expected %s count %d, got %d", settingID, expectation.expectedCount, got)
		}
		settingPayload := mustStructuredMap(t, getPayload["setting"])
		if settingPayload["mutability"] != string(uisettings.MutabilityReadOnly) {
			t.Fatalf("expected %s mutability readOnly, got %#v", settingID, settingPayload["mutability"])
		}
		locationPayload := mustStructuredMap(t, settingPayload["location"])
		if locationPayload["overviewTabKey"] != "ProjectAISettings" {
			t.Fatalf("expected %s overviewTabKey ProjectAISettings, got %#v", settingID, locationPayload["overviewTabKey"])
		}

		setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "set_ui_setting_value",
			Arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       settingID,
				"value":           0,
			},
		})
		if err != nil {
			t.Fatalf("call set_ui_setting_value for %s: %v", settingID, err)
		}
		if setResult.IsError {
			t.Fatalf("expected structured set_ui_setting_value failure for %s, got %#v", settingID, setResult.StructuredContent)
		}
		setPayload := mustStructuredMap(t, setResult.StructuredContent)
		errorPayload := mustStructuredMap(t, setPayload["error"])
		if errorPayload["code"] != string(uisettings.ErrorCodeSettingReadOnly) {
			t.Fatalf("expected read-only error code for %s, got %#v", settingID, errorPayload["code"])
		}

		revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "reveal_ui_setting",
			Arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       settingID,
			},
		})
		if err != nil {
			t.Fatalf("call reveal_ui_setting for %s: %v", settingID, err)
		}
		if revealResult.IsError {
			t.Fatalf("expected reveal_ui_setting success for %s, got %#v", settingID, revealResult.StructuredContent)
		}
		revealPayload := mustStructuredMap(t, revealResult.StructuredContent)
		if got := mustStructuredInteger(t, revealPayload["emittedRevealCount"]); got != 1 {
			t.Fatalf("expected emittedRevealCount=1 for %s, got %d", settingID, got)
		}
		statuses := mustStructuredList(t, revealPayload["statuses"])
		if len(statuses) != 1 {
			t.Fatalf("expected one reveal status for %s, got %#v", settingID, statuses)
		}
		status := mustStructuredMap(t, statuses[0])
		if status["status"] != "revealed" {
			t.Fatalf("expected revealed status for %s, got %#v", settingID, status["status"])
		}
		target := mustStructuredMap(t, status["target"])
		if target["overviewTabKey"] != "ProjectAISettings" {
			t.Fatalf("expected ProjectAISettings reveal target for %s, got %#v", settingID, target["overviewTabKey"])
		}
		steps := mustStructuredList(t, target["revealActivationSteps"])
		if len(steps) != 1 {
			t.Fatalf("expected one reveal activation step for %s, got %#v", settingID, steps)
		}
		step := mustStructuredMap(t, steps[0])
		if step["type"] != string(uisettings.RevealActivationProjectAIAccordion) {
			t.Fatalf("expected project-ai activation step for %s, got %#v", settingID, step["type"])
		}
		if step["itemValue"] != expectation.accordionItemID {
			t.Fatalf("expected activation item %q for %s, got %#v", expectation.accordionItemID, settingID, step["itemValue"])
		}
	}
}

func TestServerRevealUISettingReturnsStructuredPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-1",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
					Target: &realtime.UISettingRevealTarget{
						SettingID:       "core.project.show_param_display_names",
						Side:            "right",
						UIEditorTabName: testStringPointer("QuickInfoConfig"),
						Strategy:        "dom_anchor",
						AnchorID:        testStringPointer("core.project.show_param_display_names"),
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "project-alpha",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["requestId"] != "request-1" {
		t.Fatalf("expected requestId=request-1, got %#v", payload["requestId"])
	}
	if payload["emittedRevealCount"] != float64(1) && payload["emittedRevealCount"] != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %#v", payload["emittedRevealCount"])
	}
	statuses := mustStructuredList(t, payload["statuses"])
	if len(statuses) != 1 {
		t.Fatalf("expected one reveal status, got %#v", statuses)
	}
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "revealed" {
		t.Fatalf("expected revealed status, got %#v", status["status"])
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SettingID != "core.project.show_param_display_names" {
		t.Fatalf("expected setting id to be forwarded, got %q", revealService.input.SettingID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section id to be forwarded, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected context section id chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.ChatID != "chat-1" {
		t.Fatalf("expected chat-1 chat context, got %q", revealService.input.ChatID)
	}
	if revealService.input.ProjectView == nil {
		t.Fatal("expected project view to be forwarded to reveal service")
	}
	if revealService.input.Registry == nil {
		t.Fatal("expected scoped registry to be forwarded to reveal service")
	}
}

func TestServerRevealUISettingFailsClosedWhenRevealRuntimeUnavailable(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting without runtime: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected reveal_ui_setting without runtime to fail")
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "internal_error" {
		t.Fatalf("expected internal_error code, got %#v", payload["code"])
	}
	if payload["message"] != "UI setting reveal runtime is unavailable." {
		t.Fatalf("expected unavailable message, got %#v", payload["message"])
	}
}

func TestServerRevealUISettingUsesRequestMetaProjectAndSectionWhenSessionMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-meta-project",
			ProjectConfigID:    "project-beta",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-beta",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with request-meta project/section context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting with request-meta project/section context success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-beta" {
		t.Fatalf("expected request-meta projectConfigId project-beta, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected request-meta sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section override allowed-callable-section, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerRevealUISettingDefaultsProjectAndSectionFromAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-agentic-project",
			ProjectConfigID:    "project-beta",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-beta", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"settingId":  "core.project.show_param_display_names",
			"durationMs": 1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with agentic-context defaults: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting with agentic-context defaults success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-beta" {
		t.Fatalf("expected agentic-context projectConfigId project-beta, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected agentic-context sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "" {
		t.Fatalf("expected no explicit section override, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerRevealUISettingForwardsShareSessionID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected test failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerRevealUISettingPrefersSessionShareSessionIDOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"shareSessionId": "share-session-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with conflicting shareSessionId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-from-context" {
		t.Fatalf("expected session shareSessionID, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerRevealUISettingIgnoresRequestMetaShareSessionIDWithoutSessionShareScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"shareSessionId":        "share-session-from-request",
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with request shareSessionId: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "" {
		t.Fatalf("expected request shareSessionId to be ignored, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token to be preserved, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopeKeepsRequestMetaFrontendAffinityWhenSessionAffinityMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call share-scope reveal_ui_setting with request frontend affinity: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token in share scope, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopePrefersAgenticFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		"frontend-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingPrefersSessionSectionContextOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"sectionId": "missing-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with conflicting sectionId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected session sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
}

func TestServerRevealUISettingShareScopeIgnoresMalformedMetaFrontendAffinityWhenAgenticAffinityExists(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		"frontend-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": []any{"frontend-from-request"},
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopeIgnoresMalformedMetaFrontendAffinityWhenSessionAffinityMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": []any{"frontend-from-request"},
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "" {
		t.Fatalf("expected malformed request frontend affinity token to be ignored, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerSearchUISettingsReturnsRankedWatchCodePluginResults(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch toggle",
			"limit":           3,
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 {
		t.Fatal("expected ranked UI setting results")
	}
	first := mustStructuredMap(t, results[0])
	if first["settingId"] != "plugin::setta-fixture-watch-code-provider::enabled" {
		t.Fatalf("expected top result plugin::setta-fixture-watch-code-provider::enabled, got %#v", first)
	}
	if first["source"] != "plugin" {
		t.Fatalf("expected plugin-sourced watch-code setting, got %#v", first)
	}

	coreOnly, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch toggle",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core-only search_ui_settings: %v", err)
	}
	if coreOnly.IsError {
		t.Fatalf("expected core-only search_ui_settings success, got %#v", coreOnly.StructuredContent)
	}
	corePayload := mustStructuredMap(t, coreOnly.StructuredContent)
	for _, rawResult := range mustStructuredList(t, corePayload["results"]) {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-watch-code-provider::enabled" {
			t.Fatalf("expected no core watch-code UI setting results, got %#v", corePayload["results"])
		}
	}
}

func TestServerSearchUISettingsRejectsBlankQuery(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "   ",
		},
	})
	if err != nil {
		t.Fatalf("call blank search_ui_settings: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected blank search_ui_settings to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "query must not be empty" {
		t.Fatalf("expected blank-query message, got %#v", payload["message"])
	}
}

func TestServerGetUISettingValueRejectsMalformedProjectConfigIDMetaWithoutFallbackToArgument(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": 123,
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with malformed projectConfigId meta: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected malformed projectConfigId meta to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "projectConfigId metadata must be a string" {
		t.Fatalf("expected malformed projectConfigId meta message, got %#v", payload["message"])
	}
}

func TestServerGetUISettingValueRejectsMalformedAllowUnscopedMetaWithoutFallbackToProjectArgument(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   "sometimes",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with malformed allowUnscoped meta: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected malformed allowUnscoped meta to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "allowUnscoped metadata must be true or false" {
		t.Fatalf("expected malformed allowUnscoped meta message, got %#v", payload["message"])
	}
}

func TestServerUISettingToolsDefaultProjectConfigIDFromAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"query": "watch toggle",
			"limit": 3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings without projectConfigId: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings without projectConfigId success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 || mustStructuredMap(t, searchResults[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::enabled" {
		t.Fatalf("expected watch-code search result without projectConfigId, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value without projectConfigId: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value without projectConfigId success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.show_param_display_names",
			"value":     true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without projectConfigId: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected set_ui_setting_value without projectConfigId success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", setPayload["changed"])
	}
}

func TestServerUISettingToolsPreferSessionProjectConfigIDOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Meta: sdkmcp.Meta{
			"projectConfigId": "missing-project",
		},
		Arguments: map[string]any{
			"query": "watch toggle",
			"limit": 3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings with conflicting projectConfigId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected session projectConfigId to stay authoritative, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 || mustStructuredMap(t, results[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::enabled" {
		t.Fatalf("expected watch-code search result, got %#v", results)
	}
}

func TestServerUISettingToolsRejectProjectArgumentMismatchingAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	testCases := []struct {
		name          string
		toolName      string
		arguments     map[string]any
		revealService *recordingRevealService
	}{
		{
			name:     "search",
			toolName: "search_ui_settings",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"query":           "watch code",
			},
		},
		{
			name:     "get",
			toolName: "get_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
			},
		},
		{
			name:     "set",
			toolName: "set_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
				"value":           true,
			},
		},
		{
			name:     "reveal",
			toolName: "reveal_ui_setting",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "core.project.show_param_display_names",
			},
			revealService: &recordingRevealService{
				result: uisettings.RevealResult{
					RequestID:       "unexpected",
					ProjectConfigID: "project-alpha",
					Statuses: []uisettings.RevealStatus{
						{SettingID: "core.project.show_param_display_names", Status: "revealed"},
					},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
				WorkspaceRoot:    t.TempDir(),
				ProjectState:     projectRuntime,
				UISettingReveals: tc.revealService,
			})
			defer clientSession.Close()

			setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

			beforeSnapshot := projectRuntime.Snapshot()
			if _, err := beforeSnapshot.Document.ProjectByID("project-alpha"); err != nil {
				t.Fatalf("project-alpha before mismatched UI-setting call: %v", err)
			}
			if _, err := beforeSnapshot.Document.ProjectByID("project-beta"); err != nil {
				t.Fatalf("project-beta before mismatched UI-setting call: %v", err)
			}
			beforeAlpha := readScopedTestWatchCodeProjectData(t, beforeSnapshot.Document, "project-alpha")
			beforeBeta := readScopedTestWatchCodeProjectData(t, beforeSnapshot.Document, "project-beta")

			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.arguments,
			})
			if err != nil {
				t.Fatalf("call %s with mismatched projectConfigId: %v", tc.toolName, err)
			}
			if !result.IsError {
				t.Fatalf("expected %s with mismatched projectConfigId to fail, got %#v", tc.toolName, result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			message, _ := payload["message"].(string)
			if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
				t.Fatalf("expected project mismatch message, got %#v", payload["message"])
			}

			afterSnapshot := projectRuntime.Snapshot()
			if _, err := afterSnapshot.Document.ProjectByID("project-alpha"); err != nil {
				t.Fatalf("project-alpha after mismatched UI-setting call: %v", err)
			}
			if _, err := afterSnapshot.Document.ProjectByID("project-beta"); err != nil {
				t.Fatalf("project-beta after mismatched UI-setting call: %v", err)
			}
			afterAlpha := readScopedTestWatchCodeProjectData(t, afterSnapshot.Document, "project-alpha")
			afterBeta := readScopedTestWatchCodeProjectData(t, afterSnapshot.Document, "project-beta")
			if beforeAlpha.Enabled != afterAlpha.Enabled {
				t.Fatalf("expected project-alpha watchCodeEnabled to remain unchanged, before=%v after=%v", beforeAlpha.Enabled, afterAlpha.Enabled)
			}
			if beforeBeta.Enabled != afterBeta.Enabled {
				t.Fatalf("expected project-beta watchCodeEnabled to remain unchanged, before=%v after=%v", beforeBeta.Enabled, afterBeta.Enabled)
			}
			if tc.revealService != nil && tc.revealService.input.ProjectConfigID != "" {
				t.Fatalf("expected reveal service not to be invoked on project mismatch, got %#v", tc.revealService.input)
			}
		})
	}
}

func TestServerGetUISettingValueRejectsProjectArgumentMismatchInShareSession(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-beta",
			"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with mismatched share-session projectConfigId: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected get_ui_setting_value with mismatched share-session projectConfigId to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
		t.Fatalf("expected project mismatch message, got %#v", payload["message"])
	}
}

func TestServerUISettingToolsRoundTripProjectNameAndPythonCodegenEnabled(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "project name",
			"limit":           5,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings for project name: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 || mustStructuredMap(t, searchResults[0])["settingId"] != "core.project.name" {
		t.Fatalf("expected project-name search result, got %#v", searchResults)
	}

	projectNameResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for project name: %v", err)
	}
	if projectNameResult.IsError {
		t.Fatalf("expected project name read success, got %#v", projectNameResult.StructuredContent)
	}
	projectNamePayload := mustStructuredMap(t, projectNameResult.StructuredContent)
	if projectNamePayload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", projectNamePayload["value"])
	}

	setProjectNameResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
			"value":           "Renamed Project",
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for project name: %v", err)
	}
	if setProjectNameResult.IsError {
		t.Fatalf("expected project name write success, got %#v", setProjectNameResult.StructuredContent)
	}
	setProjectNamePayload := mustStructuredMap(t, setProjectNameResult.StructuredContent)
	if setProjectNamePayload["changed"] != true {
		t.Fatalf("expected project name changed=true, got %#v", setProjectNamePayload["changed"])
	}

	pythonCodegenResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for python codegen enabled: %v", err)
	}
	if pythonCodegenResult.IsError {
		t.Fatalf("expected python codegen read success, got %#v", pythonCodegenResult.StructuredContent)
	}
	pythonCodegenPayload := mustStructuredMap(t, pythonCodegenResult.StructuredContent)
	if pythonCodegenPayload["value"] != false {
		t.Fatalf("expected python codegen disabled, got %#v", pythonCodegenPayload["value"])
	}

	setPythonCodegenResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for python codegen enabled: %v", err)
	}
	if setPythonCodegenResult.IsError {
		t.Fatalf("expected python codegen write success, got %#v", setPythonCodegenResult.StructuredContent)
	}
	setPythonCodegenPayload := mustStructuredMap(t, setPythonCodegenResult.StructuredContent)
	if setPythonCodegenPayload["changed"] != true {
		t.Fatalf("expected python codegen changed=true, got %#v", setPythonCodegenPayload["changed"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after UI setting writes: %v", err)
	}
	if project.Name != "Renamed Project" {
		t.Fatalf("expected persisted project name Renamed Project, got %#v", project.Name)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected python codegen target to be enabled after UI setting write")
	}
}

func TestServerUISettingToolsRejectMissingScopedProjectContextWhenProjectIDOmitted(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value without scoped project context: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing scoped project context to return structured tool error")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", payload["reason"])
	}
}

func TestServerGetUISettingValueReturnsStructuredPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	setting := mustStructuredMap(t, payload["setting"])
	if setting["settingId"] != "core.project.name" {
		t.Fatalf("expected core.project.name summary, got %#v", setting)
	}
	if payload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", payload["value"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}
}

func TestServerSetUISettingValueWritesAndValidates(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	if payload["oldValue"] != false {
		t.Fatalf("expected oldValue=false, got %#v", payload["oldValue"])
	}
	if payload["newValue"] != true {
		t.Fatalf("expected newValue=true, got %#v", payload["newValue"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected showParamDisplayNames to be persisted")
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
			"value": []any{
				map[string]any{
					"path":      "./backend",
					"recursive": "nope",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured invalid set_ui_setting_value failure, got %#v", invalidResult.StructuredContent)
	}

	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	errorPayload := mustStructuredMap(t, invalidPayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type error code, got %#v", errorPayload["code"])
	}
}

func TestServerSetUISettingValueRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	initialResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value before invalid watch folders write: %v", err)
	}
	if initialResult.IsError {
		t.Fatalf("expected initial get_ui_setting_value success, got %#v", initialResult.StructuredContent)
	}
	initialPayload := mustStructuredMap(t, initialResult.StructuredContent)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
			"value": []any{
				map[string]any{
					"path":      "./backend",
					"recursive": true,
					"extra":     "not-allowed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with unsupported watch folder properties: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured unsupported-property failure, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != false {
		t.Fatalf("expected changed=false, got %#v", payload["changed"])
	}
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "unsupported properties") {
		t.Fatalf("expected unsupported-properties message, got %#v", errorPayload["message"])
	}

	unchangedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after invalid watch folders write: %v", err)
	}
	if unchangedResult.IsError {
		t.Fatalf("expected unchanged get_ui_setting_value success, got %#v", unchangedResult.StructuredContent)
	}
	unchangedPayload := mustStructuredMap(t, unchangedResult.StructuredContent)
	if !reflect.DeepEqual(unchangedPayload["value"], initialPayload["value"]) {
		t.Fatalf("expected watch code folders to remain unchanged, got before=%#v after=%#v", initialPayload["value"], unchangedPayload["value"])
	}
}

func TestServerSetUISettingValueDefaultsProjectConfigIDFromShareScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "share-request",
			ProjectConfigID:    "project-alpha",
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::enabled",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		"frontend-from-context",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"settingId":      "plugin::setta-fixture-watch-code-provider::enabled",
			"value":          true,
			"revealAfterSet": true,
		},
	})
	if err != nil {
		t.Fatalf("call share-scope set_ui_setting_value without projectConfigId: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope set_ui_setting_value without projectConfigId success, got %#v", result.StructuredContent)
	}
	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected projectConfigID project-alpha, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerSetUISettingValueForwardsExpectedOldValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	successResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "core.project.show_param_display_names",
			"value":            true,
			"expectedOldValue": false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with matching expectedOldValue: %v", err)
	}
	if successResult.IsError {
		t.Fatalf("expected set_ui_setting_value success with matching expectedOldValue, got %#v", successResult.StructuredContent)
	}

	successPayload := mustStructuredMap(t, successResult.StructuredContent)
	if successPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", successPayload["changed"])
	}

	staleResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "core.project.show_param_display_names",
			"value":            false,
			"expectedOldValue": false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with stale expectedOldValue: %v", err)
	}
	if staleResult.IsError {
		t.Fatalf("expected structured stale expectedOldValue failure, got %#v", staleResult.StructuredContent)
	}

	stalePayload := mustStructuredMap(t, staleResult.StructuredContent)
	errorPayload := mustStructuredMap(t, stalePayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
}

func TestServerSetUISettingValueSuppliesCurrentValueWhenExpectedOldValueOmitted(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	recordingState := &expectedOldValueRecordingProjectState{Runtime: projectRuntime}
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  recordingState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	firstResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without expectedOldValue for first write: %v", err)
	}
	if firstResult.IsError {
		t.Fatalf("expected first set_ui_setting_value success, got %#v", firstResult.StructuredContent)
	}

	secondResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without expectedOldValue for second write: %v", err)
	}
	if secondResult.IsError {
		t.Fatalf("expected second set_ui_setting_value success, got %#v", secondResult.StructuredContent)
	}

	if len(recordingState.observedShowParamExpectedOldValues) != 2 {
		t.Fatalf("expected two observed expectedOldValue calls, got %d", len(recordingState.observedShowParamExpectedOldValues))
	}
	if recordingState.observedShowParamExpectedOldValues[0] == nil || *recordingState.observedShowParamExpectedOldValues[0] != false {
		t.Fatalf("expected first omitted expectedOldValue to use current false value, got %#v", recordingState.observedShowParamExpectedOldValues[0])
	}
	if recordingState.observedShowParamExpectedOldValues[1] == nil || *recordingState.observedShowParamExpectedOldValues[1] != true {
		t.Fatalf("expected second omitted expectedOldValue to use refreshed true value, got %#v", recordingState.observedShowParamExpectedOldValues[1])
	}
}

func TestServerSetUISettingValueRejectsStaleProjectNamePreconditionWithoutClobber(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	projectState := &concurrentCoreSettingProjectState{Runtime: projectRuntime}
	projectState.beforeCompareProjectName = func(ctx context.Context, projectID string, _ string, _ *string) error {
		_, err := projectRuntime.SetProjectName(ctx, projectID, "Alpha Concurrent")
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
			"value":           "Alpha",
		},
	})
	if err != nil {
		t.Fatalf("call stale project-name set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured stale project-name response, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", errorPayload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale project-name write: %v", err)
	}
	if project.Name != "Alpha Concurrent" {
		t.Fatalf("expected concurrent project name to remain, got %q", project.Name)
	}
}

func TestServerSetUISettingValueRejectsStalePythonCodegenPreconditionWithoutClobber(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	projectState := &concurrentCoreSettingProjectState{Runtime: projectRuntime}
	projectState.beforeComparePythonCodegenEnabled = func(ctx context.Context, projectID string, _ bool, _ *bool) error {
		_, err := projectRuntime.SetProjectCodegenTargets(
			ctx,
			projectID,
			[]projectstate.ProjectCodegenTarget{{Language: string(projectstate.CodeLanguagePython)}},
			nil,
			projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
				return nil
			}),
		)
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call stale python-codegen set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured stale python-codegen response, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", errorPayload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale python-codegen write: %v", err)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected concurrent python codegen value to remain enabled")
	}
}

func TestServerSetUISettingValueRevealAfterSetReturnsNestedRevealAndUsesMetaSectionContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-reveal-after-set",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
			"durationMs":      1500,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with revealAfterSet success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	if revealPayload["requestId"] != "request-reveal-after-set" {
		t.Fatalf("expected nested reveal request id, got %#v", revealPayload["requestId"])
	}
	if revealService.input.ContextSectionID != "allowed-callable-section" {
		t.Fatalf("expected request-meta section context to be reused, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "" {
		t.Fatalf("expected no explicit section override, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.DurationMS != 1500 {
		t.Fatalf("expected reveal duration 1500, got %d", revealService.input.DurationMS)
	}
}

func TestServerSetUISettingValueRevealAfterSetShareScopePrefersAgenticFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-reveal-after-set",
			ProjectConfigID:    "project-alpha",
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::enabled",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		"frontend-from-context",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::enabled",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call share-scope set_ui_setting_value with revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope set_ui_setting_value with revealAfterSet success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerSetUISettingValueRevealAfterSetPreservesWriteWhenRevealFails(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-reveal-failure",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected reveal failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet failure: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with revealAfterSet failure to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect top-level write error, got %#v", payload["error"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	statuses := mustStructuredList(t, revealPayload["statuses"])
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when nested reveal fails")
	}
}

func TestServerSetUISettingValueRevealAfterSetPreservesWriteWhenFrontendDispatchFails(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	transport := &stubUISettingRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, _ any, connectionID string) (bool, error) {
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		return false, nil
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: transport,
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with undeliverable revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with undeliverable revealAfterSet to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	statuses := mustStructuredList(t, revealPayload["statuses"])
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["message"] != "Selected frontend websocket became unavailable before reveal dispatch: frontend-1" {
		t.Fatalf("expected undeliverable dispatch message, got %#v", revealError["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after undeliverable reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when reveal dispatch fails before delivery")
	}
}

func TestServerSetUISettingValueRevealAfterSetNoFrontendDoesNotActivateSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: &stubUISettingRevealTransport{registry: realtime.NewRegistry(realtime.RegistryOptions{})},
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet and no frontend: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with no-frontend reveal failure to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	status := mustStructuredMap(t, mustStructuredList(t, revealPayload["statuses"])[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["message"] != "No connected frontend is available for UI setting reveal." {
		t.Fatalf("unexpected no-frontend reveal message, got %#v", revealError["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after no-frontend reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when no frontend is connected")
	}
	if len(project.ActiveIDs) != 0 {
		t.Fatalf("expected no active section mutation, got %#v", project.ActiveIDs)
	}
}

func TestServerSetUISettingValueRejectsWriterOldValueDrift(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  uiSettingDriftProjectState{Runtime: projectRuntime},
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call drift set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured drift failure, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
}

func TestServerUISettingToolsTrimSettingIDWhitespace(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-whitespace",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::enabled",
					Status:    "revealed",
					Target: &realtime.UISettingRevealTarget{
						SettingID:      "plugin::setta-fixture-watch-code-provider::enabled",
						Side:           "left",
						OverviewTabKey: testStringPointer("Overview"),
						Strategy:       "dom_anchor",
						AnchorID:       testStringPointer("plugin::setta-fixture-watch-code-provider::enabled"),
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	paddedSettingID := "  plugin::setta-fixture-watch-code-provider::enabled\t"

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
		},
	})
	if err != nil {
		t.Fatalf("call padded get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected padded get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected initial watch-code value false, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call padded set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected padded set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}

	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["changed"] != true {
		t.Fatalf("expected padded set_ui_setting_value to change state, got %#v", setPayload["changed"])
	}

	revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
			"durationMs":      1500,
		},
	})
	if err != nil {
		t.Fatalf("call padded reveal_ui_setting: %v", err)
	}
	if revealResult.IsError {
		t.Fatalf("expected padded reveal_ui_setting success, got %#v", revealResult.StructuredContent)
	}

	snapshot := projectRuntime.Snapshot()
	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after padded UI-setting writes: %v", err)
	}
	projectData := readScopedTestWatchCodeProjectData(t, snapshot.Document, project.ID)
	if !projectData.Enabled {
		t.Fatal("expected padded set_ui_setting_value to persist watch-code enabled=true")
	}
	if revealService.input.SettingID != "plugin::setta-fixture-watch-code-provider::enabled" {
		t.Fatalf("expected trimmed reveal setting id, got %q", revealService.input.SettingID)
	}
}

func TestServerUISettingToolsRejectWhitespaceOnlySettingID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	testCases := []struct {
		name      string
		toolName  string
		arguments map[string]any
	}{
		{
			name:     "get",
			toolName: "get_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
			},
		},
		{
			name:     "set",
			toolName: "set_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
				"value":           true,
			},
		},
		{
			name:     "reveal",
			toolName: "reveal_ui_setting",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.arguments,
			})
			if err != nil {
				t.Fatalf("call %s with blank setting id: %v", tc.toolName, err)
			}
			if !result.IsError {
				t.Fatalf("expected %s with blank setting id to fail, got %#v", tc.toolName, result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			if payload["message"] != "settingId must not be empty" {
				t.Fatalf("expected blank setting id message, got %#v", payload["message"])
			}
		})
	}
}

func TestServerUISettingToolsTranslateTemporaryProjectIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"chat-1":        "12",
		"chat-section":  "13",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "11", "12", "13", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call temporary get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected temporary get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call temporary set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected temporary set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temporary set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected temporary-id write to persist to canonical project")
	}
}

func TestServerRevealUISettingTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "14",
	})

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-temp",
			ProjectConfigID:    "project-alpha",
			DurationMS:         3000,
			EmittedRevealCount: 0,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "test failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		UISettingReveals:   revealService,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "11", "12", "13", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "11",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "14",
		},
	})
	if err != nil {
		t.Fatalf("call temporary reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temporary reveal_ui_setting success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected canonical section id, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerUISettingToolsSupportSchemaBackedPluginSettings(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "fixture label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected plugin search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 {
		t.Fatal("expected plugin UI setting search results")
	}
	firstResult := mustStructuredMap(t, searchResults[0])
	if firstResult["settingId"] != "plugin::setta-fixture-full::label" {
		t.Fatalf("expected plugin label search result, got %#v", firstResult)
	}
	if firstResult["source"] != "plugin" {
		t.Fatalf("expected plugin search result source, got %#v", firstResult["source"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for plugin label: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected plugin get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for plugin enabled: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected plugin set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected plugin write false -> true, got %#v", setPayload)
	}

	labelSetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for plugin label: %v", err)
	}
	if labelSetResult.IsError {
		t.Fatalf("expected plugin label set_ui_setting_value success, got %#v", labelSetResult.StructuredContent)
	}
	labelSetPayload := mustStructuredMap(t, labelSetResult.StructuredContent)
	if labelSetPayload["oldValue"] != "unset" || labelSetPayload["newValue"] != "updated" || labelSetPayload["changed"] != true {
		t.Fatalf("expected plugin label write unset -> updated, got %#v", labelSetPayload)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after write: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected plugin config enabled=true, got %#v", pluginEntry.Config.CurrentConfig)
	}
	if pluginEntry.Config.CurrentConfig["label"] != "updated" {
		t.Fatalf("expected plugin config label=updated, got %#v", pluginEntry.Config.CurrentConfig)
	}
}

func TestServerUISettingToolsReturnDefaultForMissingPluginConfigLeafFromRuntime(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, baseService := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := baseService.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	if _, err := baseService.WriteConfig(context.Background(), plugins.ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "configured",
		},
	}); err != nil {
		t.Fatalf("seed plugin config before runtime override: %v", err)
	}

	// The Go runtime keeps currentConfig typed as an object, but a runtime view can still omit a leaf.
	service := &runtimeOverridePluginMutationService{
		Service: baseService,
		mutateRuntime: func(response plugins.PluginRuntimeResponse) plugins.PluginRuntimeResponse {
			for index := range response.List.Plugins {
				if response.List.Plugins[index].PluginID != "setta-fixture-full" {
					continue
				}
				response.List.Plugins[index].Config.CurrentConfig = map[string]any{}
				response.List.Plugins[index].Config.CurrentConfigDigestSHA256 = nil
				return response
			}
			t.Fatalf("expected runtime override plugin entry, got %#v", response.List.Plugins)
			return response
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call missing-leaf plugin get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured missing-leaf plugin response, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["value"] != false {
		t.Fatalf("expected schema default false for missing plugin config leaf, got %#v", payload["value"])
	}

	runtimeResponse, err := baseService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after missing-leaf read: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected persisted plugin config to remain enabled=true, got %#v", pluginEntry.Config.CurrentConfig)
	}
}

func TestServerUISettingToolsSchemaBackedSameValueWriteIsNoOpWithoutPersistingPluginState(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	pluginStatePath := filepath.Join(roots.settaFilesRoot, "plugins_state.json")
	beforeStateInfo, err := os.Stat(pluginStatePath)
	if err != nil {
		t.Fatalf("stat plugin state before same-value write: %v", err)
	}
	beforeStateBytes, err := os.ReadFile(pluginStatePath)
	if err != nil {
		t.Fatalf("read plugin state before same-value write: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call same-value set_ui_setting_value for schema-backed plugin setting: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected same-value schema-backed plugin write success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != false || setPayload["changed"] != false {
		t.Fatalf("expected same-value schema-backed plugin write false -> false without change, got %#v", setPayload)
	}
	afterStateInfo, err := os.Stat(pluginStatePath)
	if err != nil {
		t.Fatalf("stat plugin state after same-value write: %v", err)
	}
	afterStateBytes, err := os.ReadFile(pluginStatePath)
	if err != nil {
		t.Fatalf("read plugin state after same-value write: %v", err)
	}
	if !beforeStateInfo.ModTime().Equal(afterStateInfo.ModTime()) {
		t.Fatalf("expected same-value schema-backed plugin write not to rewrite plugin state, before=%v after=%v", beforeStateInfo.ModTime(), afterStateInfo.ModTime())
	}
	if string(beforeStateBytes) != string(afterStateBytes) {
		t.Fatalf("expected same-value schema-backed plugin write to leave plugin state unchanged, before=%q after=%q", string(beforeStateBytes), string(afterStateBytes))
	}
}

func TestServerUISettingToolsRejectSchemaBackedPluginStalePreconditionWithoutClobberingNewerValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, baseService := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := baseService.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	service := &concurrentWritePluginMutationService{Service: baseService}
	service.beforeWriteConfig = func(ctx context.Context, _ plugins.ConfigWriteOptions) error {
		_, err := service.Service.WriteConfig(ctx, plugins.ConfigWriteOptions{
			PluginID: "setta-fixture-full",
			Config: map[string]any{
				"enabled": true,
				"label":   "updated-by-other-writer",
			},
		})
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call stale schema-backed set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured stale schema-backed plugin response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for stale schema-backed plugin write, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", setError["message"])
	}

	runtimeResponse, err := baseService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after stale schema-backed write: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected concurrent schema-backed plugin value to remain true, got %#v", pluginEntry.Config.CurrentConfig)
	}
	if pluginEntry.Config.CurrentConfig["label"] != "updated-by-other-writer" {
		t.Fatalf("expected concurrent schema-backed plugin label to remain updated-by-other-writer, got %#v", pluginEntry.Config.CurrentConfig)
	}
}

func TestServerUISettingToolsSupportBackendRegisteredPluginSettings(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "backend enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call backend-registered plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected backend-registered plugin search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 {
		t.Fatal("expected backend-registered plugin search results")
	}
	firstResult := mustStructuredMap(t, searchResults[0])
	if firstResult["settingId"] != "plugin::setta-fixture-full::backend_enabled" {
		t.Fatalf("expected backend-registered plugin search result, got %#v", firstResult)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected backend-registered plugin get success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected default backend-registered plugin value false, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected backend-registered plugin set success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected backend-registered plugin write false -> true, got %#v", setPayload)
	}

	updatedGetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call updated get_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if updatedGetResult.IsError {
		t.Fatalf("expected updated backend-registered plugin get success, got %#v", updatedGetResult.StructuredContent)
	}
	updatedGetPayload := mustStructuredMap(t, updatedGetResult.StructuredContent)
	if updatedGetPayload["value"] != true {
		t.Fatalf("expected updated backend-registered plugin value true, got %#v", updatedGetPayload["value"])
	}
}

func TestServerUISettingToolsRejectBackendRegisteredPluginStaleExpectedOldValueWithoutWrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}

	backendStatePath := filepath.Join(installResult.SourcePath, "backend_ui_setting_state.json")
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected backend state file to be absent before stale write, got %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "plugin::setta-fixture-full::backend_enabled",
			"value":            true,
			"expectedOldValue": true,
		},
	})
	if err != nil {
		t.Fatalf("call stale backend-registered set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured stale backend-registered response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for stale backend-registered plugin write, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", setError["message"])
	}
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected stale backend-registered plugin write not to invoke backend write handler, got %v", err)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after stale backend-registered write: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected backend-registered plugin get success after stale write, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected backend-registered plugin value to remain false after stale write, got %#v", getPayload["value"])
	}
}

func TestServerUISettingToolsBackendRegisteredReadTypeMismatchReturnsStructuredError(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureState(t, installResult.SourcePath, "invalid-string")

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call read-mismatch get_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured read-mismatch response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type for backend-registered read mismatch, got %#v", getError["code"])
	}
	message, ok := getError["message"].(string)
	if !ok || !strings.Contains(message, "returned an invalid value") {
		t.Fatalf("expected invalid-value read message, got %#v", getError["message"])
	}
}

func TestServerUISettingToolsRejectInvalidExistingValueBeforeBackendRegisteredWrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureState(t, installResult.SourcePath, "invalid-before-write")

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-existing-value set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured invalid-existing-value response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type for invalid existing backend value, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "pre-write oldValue read returned an invalid value") {
		t.Fatalf("expected invalid pre-write validation message, got %#v", setError["message"])
	}

	var state struct {
		Enabled any `json:"enabled"`
	}
	statePayload, err := os.ReadFile(filepath.Join(installResult.SourcePath, "backend_ui_setting_state.json"))
	if err != nil {
		t.Fatalf("read backend state after failed pre-write validation: %v", err)
	}
	if err := json.Unmarshal(statePayload, &state); err != nil {
		t.Fatalf("decode backend state after failed pre-write validation: %v", err)
	}
	if state.Enabled != "invalid-before-write" {
		t.Fatalf("expected invalid existing backend value to remain unchanged, got %#v", state.Enabled)
	}
}

func TestServerUISettingToolsBackendRegisteredSameValueWriteIsNoOpWithoutBackendWrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}

	backendStatePath := filepath.Join(installResult.SourcePath, "backend_ui_setting_state.json")
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected backend state file to be absent before same-value write, got %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call same-value set_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected same-value backend-registered plugin write success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != false || setPayload["changed"] != false {
		t.Fatalf("expected same-value backend-registered plugin write false -> false without change, got %#v", setPayload)
	}
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected same-value backend-registered plugin write not to invoke backend write handler, got %v", err)
	}
}

func TestServerUISettingToolsRollbackInvalidPostWriteBackendRegisteredPluginValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, true)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan invalid-post-write backend-registered plugin runtime: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-post-write set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured invalid-post-write response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for invalid post-write backend value, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "Rollback restored the previous value.") {
		t.Fatalf("expected rollback-restored message, got %#v", setError["message"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after rollback: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected backend-registered plugin get success after rollback, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected backend-registered plugin value to roll back to false, got %#v", getPayload["value"])
	}
}

func TestServerUISettingToolsReportRollbackFailureForInvalidPostWriteBackendRegisteredPluginValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGoWithBehavior(
		t,
		installResult.SourcePath,
		backendUISettingFixtureBehaviorRollbackWriteFailure,
	)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan rollback-failure backend-registered plugin runtime: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call rollback-failure set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured rollback-failure response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for rollback-failure backend value, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "Rollback failed:") {
		t.Fatalf("expected rollback-failed message, got %#v", setError["message"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after rollback failure: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured backend-registered plugin get response after rollback failure, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type after rollback failure leaves invalid backend value, got %#v", getError["code"])
	}
}

func TestServerUISettingToolsReturnSettingNotFoundForUnknownSettingOnActivePlugin(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call active plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected structured active-plugin search response, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	foundEnabled := false
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			foundEnabled = true
			break
		}
	}
	if !foundEnabled {
		t.Fatalf("expected active plugin setting in search results, got %#v", searchResults)
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::missing",
		},
	})
	if err != nil {
		t.Fatalf("call unknown active plugin get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured plugin missing-setting response, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeSettingNotFound) {
		t.Fatalf("expected setting_not_found for unknown active plugin setting, got %#v", errorPayload["code"])
	}
}

func TestServerUISettingToolsDisabledPluginRejectsReadWriteRevealAndHidesSearchResults(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	if _, err := service.Disable(context.Background(), plugins.EnableDisableOptions{
		PluginID: "setta-fixture-full",
	}); err != nil {
		t.Fatalf("disable full fixture plugin: %v", err)
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: &stubUISettingRevealTransport{registry: realtime.NewRegistry(realtime.RegistryOptions{})},
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:    roots.workspaceRoot,
		ProjectState:     projectRuntime,
		LSPDiagnostics:   openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations:  service,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected structured disabled plugin search response, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected disabled plugin setting to disappear from plugin search results, got %#v", searchResults)
		}
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured disabled plugin get response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin get, got %#v", getError["code"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured disabled plugin set response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin set, got %#v", setError["code"])
	}

	revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin reveal_ui_setting: %v", err)
	}
	if revealResult.IsError {
		t.Fatalf("expected structured disabled plugin reveal response, got %#v", revealResult.StructuredContent)
	}
	revealPayload := mustStructuredMap(t, revealResult.StructuredContent)
	if got := mustStructuredInteger(t, revealPayload["emittedRevealCount"]); got != 0 {
		t.Fatalf("expected emittedRevealCount=0 for disabled plugin reveal, got %d", got)
	}
	statuses := mustStructuredList(t, revealPayload["statuses"])
	if len(statuses) != 1 {
		t.Fatalf("expected one disabled plugin reveal status, got %#v", statuses)
	}
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected failed disabled plugin reveal status, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin reveal, got %#v", revealError["code"])
	}
}

func TestServerUISettingToolsKeepPendingRestartPluginSettingsAvailable(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	if installResult.State != plugins.PluginRuntimeStatePendingRestart || !installResult.RestartRequired {
		t.Fatalf("expected pending-restart install result, got %#v", installResult)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("load plugin runtime after pending-restart install: %v", err)
	}
	mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	mustFindPluginStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStatePendingRestart)

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call pending-restart plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected pending-restart plugin search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	foundEnabled := false
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			foundEnabled = true
			break
		}
	}
	if !foundEnabled {
		t.Fatalf("expected pending-restart plugin setting in search results, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call pending-restart plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected pending-restart plugin get success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default pending-restart plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call pending-restart plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected pending-restart plugin set success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected pending-restart plugin write false -> true, got %#v", setPayload)
	}
}

func TestServerUISettingToolsKeepShadowedPluginSettingsAvailableThroughEffectiveEntry(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	globalRoot := filepath.Join(roots.settaHome, "plugins", "setta-fixture-full")
	sourceRoot := filepath.Join(pluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", "full")
	if err := copyPluginFixtureDir(sourceRoot, globalRoot); err != nil {
		t.Fatalf("copy shadowed full fixture plugin: %v", err)
	}
	if err := rewritePluginManifest(globalRoot, func(payload map[string]any) {
		payload["version"] = "0.0.9"
		delete(payload, "backend")
	}); err != nil {
		t.Fatalf("rewrite shadowed full fixture plugin manifest: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after adding shadowed plugin: %v", err)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status after adding shadowed plugin: %v", err)
	}
	mustFindPluginStatusEntry(t, status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStateActive)
	shadowed := mustFindPluginStatusEntry(t, status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStateShadowed)
	workspacePluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-full")
	if shadowed.ShadowedBySourcePath == nil || *shadowed.ShadowedBySourcePath != workspacePluginRoot {
		t.Fatalf("expected shadowed plugin path %q, got %#v", workspacePluginRoot, shadowed.ShadowedBySourcePath)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call shadowed plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected shadowed plugin search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	foundLabel := false
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::label" {
			foundLabel = true
			break
		}
	}
	if !foundLabel {
		t.Fatalf("expected shadowed plugin setting in search results, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call shadowed plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected shadowed plugin get success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default shadowed plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call shadowed plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected shadowed plugin set success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected shadowed plugin write false -> true, got %#v", setPayload)
	}
}

func TestServerUISettingToolsSkipDuplicatePluginSettingIDsAndKeepUnknownSettingDistinct(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	schemaPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"content",
		"config",
		"schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	rawEntries, ok := schema["x-setta-ui-settings"].([]any)
	if !ok || len(rawEntries) == 0 {
		t.Fatalf("expected x-setta-ui-settings entries, got %#v", schema["x-setta-ui-settings"])
	}
	firstEntry, ok := rawEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first ui setting entry to be an object, got %#v", rawEntries[0])
	}
	duplicateEntry := make(map[string]any, len(firstEntry))
	for key, value := range firstEntry {
		duplicateEntry[key] = value
	}
	schema["x-setta-ui-settings"] = append(rawEntries, duplicateEntry)
	encodedSchema, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin schema: %v", err)
	}
	encodedSchema = append(encodedSchema, '\n')
	if err := os.WriteFile(schemaPath, encodedSchema, 0o644); err != nil {
		t.Fatalf("write plugin schema: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after duplicate setting injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call duplicate-setting search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected duplicate-setting search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	searchResultIDs := make([]string, 0, len(searchResults))
	for _, rawResult := range searchResults {
		searchResultIDs = append(searchResultIDs, mustStructuredMap(t, rawResult)["settingId"].(string))
	}
	for _, settingID := range searchResultIDs {
		if settingID == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected duplicated setting id to be omitted from search results, got %#v", searchResultIDs)
		}
	}
	foundLabel := false
	for _, settingID := range searchResultIDs {
		if settingID == "plugin::setta-fixture-full::label" {
			foundLabel = true
			break
		}
	}
	if !foundLabel {
		t.Fatalf("expected healthy plugin setting to remain searchable, got %#v", searchResultIDs)
	}

	knownInvalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call duplicated plugin setting get_ui_setting_value: %v", err)
	}
	if knownInvalidResult.IsError {
		t.Fatalf("expected structured duplicated-setting response, got %#v", knownInvalidResult.StructuredContent)
	}
	knownInvalidPayload := mustStructuredMap(t, knownInvalidResult.StructuredContent)
	knownInvalidError := mustStructuredMap(t, knownInvalidPayload["error"])
	if knownInvalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for duplicated plugin setting, got %#v", knownInvalidError["code"])
	}

	unknownResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::unknown_setting",
		},
	})
	if err != nil {
		t.Fatalf("call unknown plugin setting get_ui_setting_value: %v", err)
	}
	if unknownResult.IsError {
		t.Fatalf("expected structured unknown-setting response, got %#v", unknownResult.StructuredContent)
	}
	unknownPayload := mustStructuredMap(t, unknownResult.StructuredContent)
	unknownError := mustStructuredMap(t, unknownPayload["error"])
	if unknownError["code"] != string(uisettings.ErrorCodeSettingNotFound) {
		t.Fatalf("expected setting_not_found for unknown plugin setting, got %#v", unknownError["code"])
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForSchemaInvalidSettingAndKeepHealthySibling(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	schemaPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"content",
		"config",
		"schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	rawEntries, ok := schema["x-setta-ui-settings"].([]any)
	if !ok || len(rawEntries) == 0 {
		t.Fatalf("expected x-setta-ui-settings entries, got %#v", schema["x-setta-ui-settings"])
	}
	firstEntry, ok := rawEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first ui setting entry to be an object, got %#v", rawEntries[0])
	}
	firstEntry["defaultValue"] = "not-a-boolean-default"
	encodedSchema, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin schema: %v", err)
	}
	encodedSchema = append(encodedSchema, '\n')
	if err := os.WriteFile(schemaPath, encodedSchema, 0o644); err != nil {
		t.Fatalf("write plugin schema: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after invalid default injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	coreSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "project name",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core search_ui_settings with schema-invalid plugin setting: %v", err)
	}
	if coreSearchResult.IsError {
		t.Fatalf("expected core search_ui_settings success with schema-invalid plugin setting, got %#v", coreSearchResult.StructuredContent)
	}
	coreSearchPayload := mustStructuredMap(t, coreSearchResult.StructuredContent)
	coreSearchResults := mustStructuredList(t, coreSearchPayload["results"])
	foundCoreProjectName := false
	for _, rawResult := range coreSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "core.project.name" {
			foundCoreProjectName = true
			break
		}
	}
	if !foundCoreProjectName {
		t.Fatalf("expected core.project.name to remain searchable, got %#v", coreSearchResults)
	}

	pluginSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call plugin search_ui_settings with schema-invalid plugin setting: %v", err)
	}
	if pluginSearchResult.IsError {
		t.Fatalf("expected plugin search_ui_settings success with schema-invalid plugin setting, got %#v", pluginSearchResult.StructuredContent)
	}
	pluginSearchPayload := mustStructuredMap(t, pluginSearchResult.StructuredContent)
	pluginSearchResults := mustStructuredList(t, pluginSearchPayload["results"])
	for _, rawResult := range pluginSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected schema-invalid plugin setting to be omitted from search results, got %#v", pluginSearchResults)
		}
	}

	healthySearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call healthy plugin search_ui_settings with schema-invalid sibling: %v", err)
	}
	if healthySearchResult.IsError {
		t.Fatalf("expected healthy plugin search_ui_settings success, got %#v", healthySearchResult.StructuredContent)
	}
	healthySearchPayload := mustStructuredMap(t, healthySearchResult.StructuredContent)
	healthySearchResults := mustStructuredList(t, healthySearchPayload["results"])
	foundHealthyLabel := false
	for _, rawResult := range healthySearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::label" {
			foundHealthyLabel = true
			break
		}
	}
	if !foundHealthyLabel {
		t.Fatalf("expected healthy sibling plugin setting to remain searchable, got %#v", healthySearchResults)
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call schema-invalid plugin setting get_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured schema-invalid response, got %#v", invalidResult.StructuredContent)
	}
	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	invalidError := mustStructuredMap(t, invalidPayload["error"])
	if invalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for schema-invalid plugin setting, got %#v", invalidError["code"])
	}
	message, ok := invalidError["message"].(string)
	if !ok || !strings.Contains(message, "defaultValue is invalid") {
		t.Fatalf("expected invalid defaultValue message, got %#v", invalidError["message"])
	}

	healthyResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy sibling plugin get_ui_setting_value: %v", err)
	}
	if healthyResult.IsError {
		t.Fatalf("expected healthy sibling plugin setting success, got %#v", healthyResult.StructuredContent)
	}
	healthyPayload := mustStructuredMap(t, healthyResult.StructuredContent)
	if healthyPayload["value"] != "unset" {
		t.Fatalf("expected healthy sibling plugin setting to remain readable, got %#v", healthyPayload["value"])
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForBackendRegisteredSettingWithInvalidValueSchemaAndKeepHealthySibling(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingInvalidSchemaFixtureMainGo(t, installResult.SourcePath)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime after invalid valueSchema injection: %v", err)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("runtime after invalid backend ui setting schema injection: %v", err)
	}
	mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	mustFindPluginStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStatePendingRestart)

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	invalidSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "backend enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call invalid backend-registered plugin search_ui_settings: %v", err)
	}
	if invalidSearchResult.IsError {
		t.Fatalf("expected invalid backend-registered plugin search success, got %#v", invalidSearchResult.StructuredContent)
	}
	invalidSearchPayload := mustStructuredMap(t, invalidSearchResult.StructuredContent)
	invalidSearchResults := mustStructuredList(t, invalidSearchPayload["results"])
	for _, rawResult := range invalidSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::backend_enabled" {
			t.Fatalf("expected invalid backend-registered plugin setting to be omitted from search results, got %#v", invalidSearchResults)
		}
	}

	healthySearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "backend label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call healthy backend-registered plugin search_ui_settings: %v", err)
	}
	if healthySearchResult.IsError {
		t.Fatalf("expected healthy backend-registered plugin search success, got %#v", healthySearchResult.StructuredContent)
	}
	healthySearchPayload := mustStructuredMap(t, healthySearchResult.StructuredContent)
	healthySearchResults := mustStructuredList(t, healthySearchPayload["results"])
	foundHealthyLabel := false
	for _, rawResult := range healthySearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::backend_label" {
			foundHealthyLabel = true
			break
		}
	}
	if !foundHealthyLabel {
		t.Fatalf("expected healthy backend-registered plugin setting to remain searchable, got %#v", healthySearchResults)
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call invalid backend-registered plugin get_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured invalid backend-registered response, got %#v", invalidResult.StructuredContent)
	}
	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	invalidError := mustStructuredMap(t, invalidPayload["error"])
	if invalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for invalid backend-registered plugin setting, got %#v", invalidError["code"])
	}
	message, ok := invalidError["message"].(string)
	if !ok || !strings.Contains(message, "valueSchema type is invalid") {
		t.Fatalf("expected invalid valueSchema message, got %#v", invalidError["message"])
	}

	healthyResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy backend-registered plugin get_ui_setting_value: %v", err)
	}
	if healthyResult.IsError {
		t.Fatalf("expected healthy backend-registered plugin get success, got %#v", healthyResult.StructuredContent)
	}
	healthyPayload := mustStructuredMap(t, healthyResult.StructuredContent)
	if healthyPayload["value"] != "unset" {
		t.Fatalf("expected healthy backend-registered plugin setting to remain readable, got %#v", healthyPayload["value"])
	}
}

func TestServerUISettingToolsIsolateCrossSourceDuplicatePluginSettingIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSetting(t, installResult.SourcePath, "enabled", false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after cross-source duplicate injection: %v", err)
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: &stubUISettingRevealTransport{registry: realtime.NewRegistry(realtime.RegistryOptions{})},
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:    roots.workspaceRoot,
		ProjectState:     projectRuntime,
		LSPDiagnostics:   openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations:  service,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	coreSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "project name",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core search_ui_settings with cross-source duplicate plugin setting: %v", err)
	}
	if coreSearchResult.IsError {
		t.Fatalf("expected core search_ui_settings success with cross-source duplicate plugin setting, got %#v", coreSearchResult.StructuredContent)
	}
	coreSearchPayload := mustStructuredMap(t, coreSearchResult.StructuredContent)
	coreSearchResults := mustStructuredList(t, coreSearchPayload["results"])
	foundCoreProjectName := false
	for _, rawResult := range coreSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "core.project.name" {
			foundCoreProjectName = true
			break
		}
	}
	if !foundCoreProjectName {
		t.Fatalf("expected core.project.name to remain searchable, got %#v", coreSearchResults)
	}

	healthyGetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy sibling get_ui_setting_value with cross-source duplicate: %v", err)
	}
	if healthyGetResult.IsError {
		t.Fatalf("expected healthy sibling get_ui_setting_value success, got %#v", healthyGetResult.StructuredContent)
	}
	healthyGetPayload := mustStructuredMap(t, healthyGetResult.StructuredContent)
	if _, ok := healthyGetPayload["value"].(string); !ok {
		t.Fatalf("expected healthy sibling plugin setting value to remain string, got %#v", healthyGetPayload["value"])
	}

	conflictingGetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call conflicting get_ui_setting_value: %v", err)
	}
	if conflictingGetResult.IsError {
		t.Fatalf("expected structured conflicting get response, got %#v", conflictingGetResult.StructuredContent)
	}
	conflictingGetPayload := mustStructuredMap(t, conflictingGetResult.StructuredContent)
	conflictingGetError := mustStructuredMap(t, conflictingGetPayload["error"])
	if conflictingGetError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for cross-source duplicate get, got %#v", conflictingGetError["code"])
	}
	getMessage, ok := conflictingGetError["message"].(string)
	if !ok || !strings.Contains(getMessage, "declared in both schema and backend registration") {
		t.Fatalf("expected cross-source duplicate get message, got %#v", conflictingGetError["message"])
	}

	conflictingSetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call conflicting set_ui_setting_value: %v", err)
	}
	if conflictingSetResult.IsError {
		t.Fatalf("expected structured conflicting set response, got %#v", conflictingSetResult.StructuredContent)
	}
	conflictingSetPayload := mustStructuredMap(t, conflictingSetResult.StructuredContent)
	conflictingSetError := mustStructuredMap(t, conflictingSetPayload["error"])
	if conflictingSetError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for cross-source duplicate set, got %#v", conflictingSetError["code"])
	}

	conflictingRevealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call conflicting reveal_ui_setting: %v", err)
	}
	if conflictingRevealResult.IsError {
		t.Fatalf("expected structured conflicting reveal response, got %#v", conflictingRevealResult.StructuredContent)
	}
	conflictingRevealPayload := mustStructuredMap(t, conflictingRevealResult.StructuredContent)
	if got := mustStructuredInteger(t, conflictingRevealPayload["emittedRevealCount"]); got != 0 {
		t.Fatalf("expected emittedRevealCount=0 for cross-source duplicate reveal, got %d", got)
	}
	conflictingRevealStatuses := mustStructuredList(t, conflictingRevealPayload["statuses"])
	if len(conflictingRevealStatuses) != 1 {
		t.Fatalf("expected one cross-source duplicate reveal status, got %#v", conflictingRevealStatuses)
	}
	conflictingRevealStatus := mustStructuredMap(t, conflictingRevealStatuses[0])
	if conflictingRevealStatus["status"] != "failed" {
		t.Fatalf("expected failed cross-source duplicate reveal status, got %#v", conflictingRevealStatus["status"])
	}
	conflictingRevealError := mustStructuredMap(t, conflictingRevealStatus["error"])
	if conflictingRevealError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for cross-source duplicate reveal, got %#v", conflictingRevealError["code"])
	}
}

func TestServerUISettingToolsRejectPersistedCorruptPluginConfigRootWithoutRewrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	pluginsStatePath := filepath.Join(roots.settaFilesRoot, "plugins_state.json")
	pluginsStatePayload, err := os.ReadFile(pluginsStatePath)
	if err != nil {
		t.Fatalf("read plugins state: %v", err)
	}
	var pluginsState map[string]any
	if err := json.Unmarshal(pluginsStatePayload, &pluginsState); err != nil {
		t.Fatalf("decode plugins state: %v", err)
	}
	pluginsState["pluginConfigById"] = map[string]any{
		string(plugins.PluginScopeWorkspace) + ":setta-fixture-full": "invalid-root",
	}
	encodedState, err := json.MarshalIndent(pluginsState, "", "  ")
	if err != nil {
		t.Fatalf("encode plugins state: %v", err)
	}
	encodedState = append(encodedState, '\n')
	if err := os.WriteFile(pluginsStatePath, encodedState, 0o644); err != nil {
		t.Fatalf("write corrupt plugins state: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after corrupt config root injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call corrupt-root plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured corrupt-root get response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for corrupt-root get, got %#v", getError["code"])
	}
	if getError["message"] != "Plugin setta-fixture-full is unavailable (state=invalid)." {
		t.Fatalf("expected invalid-state message for corrupt-root get, got %#v", getError["message"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call corrupt-root plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured corrupt-root set response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for corrupt-root set, got %#v", setError["code"])
	}
	if setError["message"] != getError["message"] {
		t.Fatalf("expected corrupt-root get/set to share the same error, got get=%#v set=%#v", getError, setError)
	}

	persistedStatePayload, err := os.ReadFile(pluginsStatePath)
	if err != nil {
		t.Fatalf("read plugins state after failed write: %v", err)
	}
	var persistedState map[string]any
	if err := json.Unmarshal(persistedStatePayload, &persistedState); err != nil {
		t.Fatalf("decode plugins state after failed write: %v", err)
	}
	pluginConfigByID, ok := persistedState["pluginConfigById"].(map[string]any)
	if !ok {
		t.Fatalf("expected pluginConfigById object after failed write, got %#v", persistedState["pluginConfigById"])
	}
	if pluginConfigByID[string(plugins.PluginScopeWorkspace)+":setta-fixture-full"] != "invalid-root" {
		t.Fatalf("expected corrupt persisted root to remain unchanged, got %#v", pluginConfigByID)
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForReadWriteWhenRegisterPaneCapabilityNotEffective(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	manifestPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"setta.plugin.json",
	)
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	manifest["capabilities"] = []any{"registerSectionKinds", "registerCommand"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after capability edit: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call capability-gated get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured capability-gated read response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for capability-gated read, got %#v", getError["code"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call capability-gated set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured capability-gated write response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for capability-gated write, got %#v", setError["code"])
	}
}

func mustFindPluginListEntry(t *testing.T, entries []plugins.PluginListEntry, pluginID string) plugins.PluginListEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	t.Fatalf("expected plugin list entry for %s, got %#v", pluginID, entries)
	return plugins.PluginListEntry{}
}

func mustFindPluginStatusEntry(
	t *testing.T,
	entries []plugins.PluginStatusEntry,
	pluginID string,
	state plugins.PluginRuntimeState,
) plugins.PluginStatusEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.State == state {
			return entry
		}
	}
	t.Fatalf("expected plugin status entry for %s in state %s, got %#v", pluginID, state, entries)
	return plugins.PluginStatusEntry{}
}

func testStringPointer(value string) *string {
	return &value
}

type backendUISettingFixtureBehavior string

const (
	backendUISettingFixtureBehaviorNormal               backendUISettingFixtureBehavior = "normal"
	backendUISettingFixtureBehaviorInvalidPostWrite     backendUISettingFixtureBehavior = "invalid_post_write"
	backendUISettingFixtureBehaviorRollbackWriteFailure backendUISettingFixtureBehavior = "rollback_write_failure"
)

func writeScopedPluginBackendUISettingFixtureMainGo(t *testing.T, pluginRoot string, invalidPostWrite bool) {
	behavior := backendUISettingFixtureBehaviorNormal
	if invalidPostWrite {
		behavior = backendUISettingFixtureBehaviorInvalidPostWrite
	}
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
		t,
		pluginRoot,
		"backend_enabled",
		behavior,
	)
}

func writeScopedPluginBackendUISettingFixtureMainGoWithBehavior(t *testing.T, pluginRoot string, behavior backendUISettingFixtureBehavior) {
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
		t,
		pluginRoot,
		"backend_enabled",
		behavior,
	)
}

func writeScopedPluginBackendUISettingFixtureMainGoForLocalSetting(t *testing.T, pluginRoot string, localSettingID string, invalidPostWrite bool) {
	behavior := backendUISettingFixtureBehaviorNormal
	if invalidPostWrite {
		behavior = backendUISettingFixtureBehaviorInvalidPostWrite
	}
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
		t,
		pluginRoot,
		localSettingID,
		behavior,
	)
}

func writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
	t *testing.T,
	pluginRoot string,
	localSettingID string,
	behavior backendUISettingFixtureBehavior,
) {
	t.Helper()

	assignment := "state.Enabled = value"
	switch behavior {
	case backendUISettingFixtureBehaviorNormal:
	case backendUISettingFixtureBehaviorInvalidPostWrite:
		assignment = "if value {\n\t\tstate.Enabled = \"invalid-value\"\n\t} else {\n\t\tstate.Enabled = value\n\t}"
	case backendUISettingFixtureBehaviorRollbackWriteFailure:
		assignment = "if value {\n\t\tstate.Enabled = \"invalid-value\"\n\t} else {\n\t\tfail(\"rollback write failed\")\n\t}"
	default:
		t.Fatalf("unsupported backend ui setting fixture behavior %q", behavior)
	}

	source := fmt.Sprintf(`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

type runtimeRequest struct {
	SchemaVersion int               `+"`json:\"schemaVersion\"`"+`
	Kind          string            `+"`json:\"kind\"`"+`
	UISetting     *uiSettingRequest `+"`json:\"uiSetting,omitempty\"`"+`
}

type uiSettingRequest struct {
	HandlerID       string `+"`json:\"handlerId\"`"+`
	Operation       string `+"`json:\"operation\"`"+`
	ProjectConfigID string `+"`json:\"projectConfigId\"`"+`
	Value           any    `+"`json:\"value,omitempty\"`"+`
}

type runtimeResponse struct {
	SchemaVersion int            `+"`json:\"schemaVersion\"`"+`
	UISetting     map[string]any `+"`json:\"uiSetting,omitempty\"`"+`
}

type stateFile struct {
	Enabled any `+"`json:\"enabled\"`"+`
}

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"uiSettings": []map[string]any{
				{
					"id":             %q,
					"title":          "Backend Enabled",
					"description":    "Enable backend-provided fixture behavior.",
					"paneId":         "full-settings-pane",
					"revealKey":      "full-settings",
					"synonyms":       []string{"backend enabled"},
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "boolean"},
					"readHandlerId":  "read-backend-enabled",
					"writeHandlerId": "write-backend-enabled",
				},
			},
			"routes":            []map[string]any{},
			"staticDirs":        []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		handleRuntime()
	}
}

func handleRuntime() {
	var request runtimeRequest
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		fail("decode backend runtime request: %%v", err)
	}
	switch strings.TrimSpace(request.Kind) {
	case "ui_setting":
		if request.UISetting == nil {
			fail("ui setting runtime payload is required")
		}
		handleUISetting(*request.UISetting)
	default:
		fail("unsupported backend runtime kind %%q", request.Kind)
	}
}

func handleUISetting(request uiSettingRequest) {
	switch strings.TrimSpace(request.HandlerID) {
	case "read-backend-enabled":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %%q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "write-backend-enabled":
		if strings.TrimSpace(request.Operation) != "write" {
			fail("unexpected ui setting operation %%q", request.Operation)
		}
		value, ok := request.Value.(bool)
		if !ok {
			fail("ui setting write value must be boolean")
		}
		state := loadState()
		%s
		saveState(state)
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	default:
		fail("unsupported ui setting handler %%q", request.HandlerID)
	}
}

func statePath() string {
	return filepath.Join(".", "backend_ui_setting_state.json")
}

func loadState() stateFile {
	bytes, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			return stateFile{Enabled: false}
		}
		fail("read ui setting state: %%v", err)
	}
	var state stateFile
	if err := json.Unmarshal(bytes, &state); err != nil {
		fail("decode ui setting state: %%v", err)
	}
	if state.Enabled == nil {
		state.Enabled = false
	}
	return state
}

func saveState(state stateFile) {
	payload, err := json.Marshal(state)
	if err != nil {
		fail("encode ui setting state: %%v", err)
	}
	if err := os.WriteFile(statePath(), payload, 0o644); err != nil {
		fail("write ui setting state: %%v", err)
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode payload: %%v", err)
	}
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
`, localSettingID, assignment)

	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.go"), []byte(source), 0o644); err != nil {
		t.Fatalf("write scoped backend ui setting fixture main.go: %v", err)
	}
}

func writeScopedPluginBackendUISettingFixtureState(t *testing.T, pluginRoot string, enabled any) {
	t.Helper()

	payload, err := json.Marshal(map[string]any{"enabled": enabled})
	if err != nil {
		t.Fatalf("encode scoped backend ui setting state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pluginRoot, "backend_ui_setting_state.json"), payload, 0o644); err != nil {
		t.Fatalf("write scoped backend ui setting state: %v", err)
	}
}

func writeScopedPluginBackendUISettingInvalidSchemaFixtureMainGo(t *testing.T, pluginRoot string) {
	t.Helper()

	source := `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

type runtimeRequest struct {
	SchemaVersion int               ` + "`json:\"schemaVersion\"`" + `
	Kind          string            ` + "`json:\"kind\"`" + `
	UISetting     *uiSettingRequest ` + "`json:\"uiSetting,omitempty\"`" + `
}

type uiSettingRequest struct {
	HandlerID       string ` + "`json:\"handlerId\"`" + `
	Operation       string ` + "`json:\"operation\"`" + `
	ProjectConfigID string ` + "`json:\"projectConfigId\"`" + `
	Value           any    ` + "`json:\"value,omitempty\"`" + `
}

type runtimeResponse struct {
	SchemaVersion int            ` + "`json:\"schemaVersion\"`" + `
	UISetting     map[string]any ` + "`json:\"uiSetting,omitempty\"`" + `
}

type stateFile struct {
	Enabled any    ` + "`json:\"enabled\"`" + `
	Label   string ` + "`json:\"label\"`" + `
}

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"uiSettings": []map[string]any{
				{
					"id":             "backend_enabled",
					"title":          "Backend Enabled",
					"description":    "Enable backend-provided fixture behavior.",
					"paneId":         "full-settings-pane",
					"revealKey":      "full-settings",
					"synonyms":       []string{"backend enabled"},
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "totally_invalid"},
					"readHandlerId":  "read-backend-enabled",
					"writeHandlerId": "write-backend-enabled",
				},
				{
					"id":            "backend_label",
					"title":         "Backend Label",
					"description":   "Healthy backend-provided label setting.",
					"paneId":        "full-settings-pane",
					"revealKey":     "full-settings",
					"synonyms":      []string{"backend label"},
					"mutability":    "readOnly",
					"valueSchema":   map[string]any{"type": "string"},
					"readHandlerId": "read-backend-label",
				},
			},
			"routes":            []map[string]any{},
			"staticDirs":        []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		handleRuntime()
	}
}

func handleRuntime() {
	var request runtimeRequest
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		fail("decode backend runtime request: %v", err)
	}
	switch strings.TrimSpace(request.Kind) {
	case "ui_setting":
		if request.UISetting == nil {
			fail("ui setting runtime payload is required")
		}
		handleUISetting(*request.UISetting)
	default:
		fail("unsupported backend runtime kind %q", request.Kind)
	}
}

func handleUISetting(request uiSettingRequest) {
	switch strings.TrimSpace(request.HandlerID) {
	case "read-backend-enabled":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "write-backend-enabled":
		if strings.TrimSpace(request.Operation) != "write" {
			fail("unexpected ui setting operation %q", request.Operation)
		}
		value, ok := request.Value.(bool)
		if !ok {
			fail("ui setting write value must be boolean")
		}
		state := loadState()
		state.Enabled = value
		saveState(state)
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "read-backend-label":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Label,
			},
		})
	default:
		fail("unsupported ui setting handler %q", request.HandlerID)
	}
}

func statePath() string {
	return filepath.Join(".", "backend_ui_setting_state.json")
}

func loadState() stateFile {
	bytes, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			return stateFile{Enabled: false, Label: "unset"}
		}
		fail("read ui setting state: %v", err)
	}
	var state stateFile
	if err := json.Unmarshal(bytes, &state); err != nil {
		fail("decode ui setting state: %v", err)
	}
	if state.Enabled == nil {
		state.Enabled = false
	}
	if strings.TrimSpace(state.Label) == "" {
		state.Label = "unset"
	}
	return state
}

func saveState(state stateFile) {
	payload, err := json.Marshal(state)
	if err != nil {
		fail("encode ui setting state: %v", err)
	}
	if err := os.WriteFile(statePath(), payload, 0o644); err != nil {
		fail("write ui setting state: %v", err)
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode payload: %v", err)
	}
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
`

	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.go"), []byte(source), 0o644); err != nil {
		t.Fatalf("write scoped backend ui setting invalid-schema fixture main.go: %v", err)
	}
}
