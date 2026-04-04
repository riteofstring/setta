package frontendbindings

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
)

func TestRenderTypesUsesStructuredCreateBody(t *testing.T) {
	t.Helper()

	typesTS, err := renderTemplate(typesTemplateText, map[string]any{
		"Declarations": []TypeDeclaration{
			objectDeclarationWithCreateBody(
				"BodyThing",
				`  const normalized = options.value ?? "";
  return {
    value: normalized.toUpperCase(),
  };`,
				TypeProperty{Name: "value", TypeExpr: "string"},
			),
		},
	})
	if err != nil {
		t.Fatalf("renderTemplate(...) error = %v", err)
	}

	if !strings.Contains(typesTS, "export function createBodyThing(options: Partial<BodyThing> = {}): BodyThing {") {
		t.Fatalf("types output missing structured create-body function:\n%s", typesTS)
	}
	if !strings.Contains(typesTS, "const normalized = options.value ?? \"\";") {
		t.Fatalf("types output missing structured create-body content:\n%s", typesTS)
	}
	if strings.Contains(typesTS, "return options as BodyThing;") {
		t.Fatalf("types output rendered default factory instead of structured create body:\n%s", typesTS)
	}
}

func TestRenderTemplateRejectsMissingKeys(t *testing.T) {
	t.Helper()

	_, err := renderTemplate(`{{ .Missing }}`, map[string]any{
		"Present": "ok",
	})
	if err == nil {
		t.Fatalf("renderTemplate(...) unexpectedly succeeded")
	}
	if !strings.Contains(err.Error(), `map has no entry for key "Missing"`) {
		t.Fatalf("renderTemplate(...) error = %q, want missing-key failure", err.Error())
	}
}

func TestBuildBindingsIncludesAdditionalDeclarations(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		constDeclaration("GeneratedSupport", true, `"ok"`),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, `export const GeneratedSupport = "ok";`) {
		t.Fatalf("types output missing additional declaration:\n%s", bindings.TypesTS)
	}
}

func TestNameValidationSupportDeclarationsRenderStructuredBodies(t *testing.T) {
	t.Helper()

	declarations := nameValidationSupportDeclarations()
	bodies := map[string]string{}
	for _, declaration := range declarations {
		if declaration.Kind != "function" {
			continue
		}
		bodies[declaration.Name] = declaration.FunctionBody
	}

	if !strings.Contains(
		bodies["validateGeneratedSimpleNameInput"],
		`generatedBindingRuntime.validateGeneratedSimpleNameInput(`,
	) {
		t.Fatalf(
			"validateGeneratedSimpleNameInput body missing runtime delegation:\n%s",
			bodies["validateGeneratedSimpleNameInput"],
		)
	}
	if !strings.Contains(
		bodies["validateGeneratedProjectNameInput"],
		`const allowReserved = options.allowReserved ?? false;`,
	) {
		t.Fatalf(
			"validateGeneratedProjectNameInput body missing generated allowReserved prelude:\n%s",
			bodies["validateGeneratedProjectNameInput"],
		)
	}
	if !strings.Contains(
		bodies["validateGeneratedParamNameInput"],
		`generatedBindingRuntime.validateGeneratedParamNameInput(`,
	) {
		t.Fatalf(
			"validateGeneratedParamNameInput body missing runtime delegation:\n%s",
			bodies["validateGeneratedParamNameInput"],
		)
	}
	if !strings.Contains(
		bodies["validateGeneratedParamNameInput"],
		`generatedBindingRuntime.isGeneratedPythonIdentifier(`,
	) {
		t.Fatalf(
			"validateGeneratedParamNameInput body missing runtime Python identifier callback:\n%s",
			bodies["validateGeneratedParamNameInput"],
		)
	}
}

func TestSupportDeclarationsRenderStructuredBodies(t *testing.T) {
	t.Helper()

	appGenerationBodies := map[string]string{}
	for _, declaration := range appGenerationSupportDeclarations() {
		if declaration.Kind != "function" {
			continue
		}
		appGenerationBodies[declaration.Name] = declaration.FunctionBody
	}
	if !strings.Contains(
		appGenerationBodies["parseGeneratedAppGenerationMode"],
		`case "json_render":`,
	) {
		t.Fatalf(
			"parseGeneratedAppGenerationMode body missing generated mode switch:\n%s",
			appGenerationBodies["parseGeneratedAppGenerationMode"],
		)
	}

	interopBodies := map[string]string{}
	for _, declaration := range interopSupportDeclarations() {
		if declaration.Kind != "function" {
			continue
		}
		interopBodies[declaration.Name] = declaration.FunctionBody
	}
	if !strings.Contains(
		interopBodies["normalizeGeneratedOrigin"],
		`generatedBindingRuntime.normalizeGeneratedOrigin(rawOrigin)`,
	) {
		t.Fatalf(
			"normalizeGeneratedOrigin body missing runtime delegation:\n%s",
			interopBodies["normalizeGeneratedOrigin"],
		)
	}
	if !strings.Contains(
		interopBodies["normalizeGeneratedToolName"],
		`generatedBindingRuntime.normalizeGeneratedToolName(`,
	) {
		t.Fatalf(
			"normalizeGeneratedToolName body missing runtime delegation:\n%s",
			interopBodies["normalizeGeneratedToolName"],
		)
	}
	if !strings.Contains(
		interopBodies["normalizeGeneratedToolName"],
		tsStringLiteralExpr(generatedAskUserQuestionToolName),
	) {
		t.Fatalf(
			"normalizeGeneratedToolName body missing AskUserQuestion literal:\n%s",
			interopBodies["normalizeGeneratedToolName"],
		)
	}

	transportBodies := map[string]string{}
	for _, declaration := range transportPolicySupportDeclarations() {
		if declaration.Kind != "function" {
			continue
		}
		transportBodies[declaration.Name] = declaration.FunctionBody
	}
	if !strings.Contains(
		transportBodies["resolveGeneratedEndpointOriginForMode"],
		`generatedBindingRuntime.resolveGeneratedEndpointOriginForMode(`,
	) {
		t.Fatalf(
			"resolveGeneratedEndpointOriginForMode body missing runtime delegation:\n%s",
			transportBodies["resolveGeneratedEndpointOriginForMode"],
		)
	}
	if !strings.Contains(
		transportBodies["resolveGeneratedEndpointOriginForMode"],
		`bootstrapPage: `+tsStringLiteralExpr(httpapi.RouteBootstrapPage),
	) {
		t.Fatalf(
			"resolveGeneratedEndpointOriginForMode body missing bootstrap route literal:\n%s",
			transportBodies["resolveGeneratedEndpointOriginForMode"],
		)
	}
	if !strings.Contains(
		transportBodies["resolveGeneratedEndpointOriginForMode"],
		`launcherMode: `+tsStringLiteralExpr(string(config.ModeLauncher)),
	) {
		t.Fatalf(
			"resolveGeneratedEndpointOriginForMode body missing launcher mode literal:\n%s",
			transportBodies["resolveGeneratedEndpointOriginForMode"],
		)
	}

	websocketBodies := map[string]string{}
	for _, declaration := range websocketSupportDeclarations() {
		if declaration.Kind != "function" {
			continue
		}
		websocketBodies[declaration.Name] = declaration.FunctionBody
	}
	if !strings.Contains(
		websocketBodies["websocketSupportReadRequiredString"],
		`generatedBindingRuntime.websocketSupportReadRequiredString(value, fieldName, issues)`,
	) {
		t.Fatalf(
			"websocketSupportReadRequiredString body missing runtime delegation:\n%s",
			websocketBodies["websocketSupportReadRequiredString"],
		)
	}
	if !strings.Contains(
		websocketBodies["websocketSupportReadDurationMs"],
		`generatedBindingRuntime.websocketSupportReadDurationMs(value, issues)`,
	) {
		t.Fatalf(
			"websocketSupportReadDurationMs body missing runtime delegation:\n%s",
			websocketBodies["websocketSupportReadDurationMs"],
		)
	}

	if !strings.Contains(
		buildSectionSizingPolicyCreateBodyTS(),
		`const metaControlByType = createMetaControlSizingPolicyByType(`,
	) {
		t.Fatalf(
			"SectionSizingPolicy create body missing template-rendered meta control setup:\n%s",
			buildSectionSizingPolicyCreateBodyTS(),
		)
	}
	if !strings.Contains(
		buildSettingsStateCreateBodyTS(),
		`languageServer: cloneGeneratedValue(`,
	) {
		t.Fatalf(
			"SettingsState create body missing template-rendered language server clone:\n%s",
			buildSettingsStateCreateBodyTS(),
		)
	}
	if !strings.Contains(
		buildProjectCodegenPythonTargetCreateBodyTS(),
		`genCodeSuffix: "state = SettaState()"`,
	) {
		t.Fatalf(
			"ProjectCodegenPythonTarget create body missing template-rendered default suffix:\n%s",
			buildProjectCodegenPythonTargetCreateBodyTS(),
		)
	}
}

func TestBuildCodegenPolicyCreateBodiesUseGoBackedDefaults(t *testing.T) {
	t.Helper()

	sectionBody := buildSectionCodegenPolicyCreateBodyTS()
	if !strings.Contains(sectionBody, `const defaults: SectionCodegenPolicy = {`) {
		t.Fatalf("SectionCodegenPolicy create body missing Go-backed defaults literal:\n%s", sectionBody)
	}
	if strings.Contains(sectionBody, `defaultSectionRepresentation(`) {
		t.Fatalf("SectionCodegenPolicy create body still contains handwritten representation switch:\n%s", sectionBody)
	}
	if strings.Contains(sectionBody, `Object.values(SectionTypeEnum)`) {
		t.Fatalf("SectionCodegenPolicy create body still seeds defaults from frontend enum iteration:\n%s", sectionBody)
	}
	if !strings.Contains(sectionBody, `Chat: {`) || !strings.Contains(sectionBody, `representation: "file_read"`) {
		t.Fatalf("SectionCodegenPolicy create body missing Go-backed Chat file_read default:\n%s", sectionBody)
	}

	codeObjBody := buildCodeObjValuePolicyCreateBodyTS()
	if !strings.Contains(codeObjBody, `const defaults: CodeObjValuePolicy = {`) {
		t.Fatalf("CodeObjValuePolicy create body missing Go-backed defaults literal:\n%s", codeObjBody)
	}
	if strings.Contains(codeObjBody, `defaultCodeObjValueRepresentation(`) {
		t.Fatalf("CodeObjValuePolicy create body still contains handwritten representation switch:\n%s", codeObjBody)
	}
	if strings.Contains(codeObjBody, `Object.values(CodeObjTypeEnum)`) {
		t.Fatalf("CodeObjValuePolicy create body still seeds defaults from frontend enum iteration:\n%s", codeObjBody)
	}
	if !strings.Contains(codeObjBody, `DropzoneParam: {`) || !strings.Contains(codeObjBody, `representation: "file_path"`) {
		t.Fatalf("CodeObjValuePolicy create body missing Go-backed DropzoneParam file_path default:\n%s", codeObjBody)
	}
}

func TestEngineAndRunDeclarationsUseGoBackedDefaults(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, root := range []reflect.Type{
		reflect.TypeOf(EngineConfigDefaults{}),
		reflect.TypeOf(EngineRuntimeSupport{}),
		reflect.TypeOf(EngineConfig{}),
		reflect.TypeOf(RunEvent{}),
		reflect.TypeOf(AgentRun{}),
	} {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", root, err)
		}
	}

	engineDefaults := mustFindDeclarationByName(t, converter.Declarations(), "EngineConfigDefaults")
	if engineDefaults.CreateBody != "" {
		t.Fatalf("EngineConfigDefaults should use a Go-backed create expr, got create body:\n%s", engineDefaults.CreateBody)
	}
	if !strings.Contains(engineDefaults.CreateExpr, `thinking: null,`) {
		t.Fatalf("EngineConfigDefaults create expr missing Go-backed thinking default:\n%s", engineDefaults.CreateExpr)
	}

	engineRuntimeSupport := mustFindDeclarationByName(t, converter.Declarations(), "EngineRuntimeSupport")
	if engineRuntimeSupport.CreateBody != "" {
		t.Fatalf("EngineRuntimeSupport should use a Go-backed create expr, got create body:\n%s", engineRuntimeSupport.CreateBody)
	}
	if !strings.Contains(engineRuntimeSupport.CreateExpr, `thinking: false,`) {
		t.Fatalf("EngineRuntimeSupport create expr missing Go-backed thinking default:\n%s", engineRuntimeSupport.CreateExpr)
	}

	engineConfig := mustFindDeclarationByName(t, converter.Declarations(), "EngineConfig")
	if engineConfig.CreateExpr != "" {
		t.Fatalf("EngineConfig should use a structured create body, got create expr:\n%s", engineConfig.CreateExpr)
	}
	if strings.Contains(engineConfig.CreateBody, "(() => {") {
		t.Fatalf("EngineConfig create body should not embed a handwritten IIFE:\n%s", engineConfig.CreateBody)
	}
	for _, snippet := range []string{
		`const defaults = createEngineConfigDefaults();`,
		`const mergedDefaults = mergeGeneratedOptions(defaults, options.defaults ?? {});`,
		`const mergedRuntimeSupport =`,
		`defaults: mergedDefaults,`,
		`runtimeSupport: mergedRuntimeSupport,`,
	} {
		if !strings.Contains(engineConfig.CreateBody, snippet) {
			t.Fatalf("EngineConfig create body missing %q:\n%s", snippet, engineConfig.CreateBody)
		}
	}

	runEvent := mustFindDeclarationByName(t, converter.Declarations(), "RunEvent")
	if runEvent.CreateBody != "" {
		t.Fatalf("RunEvent should use a Go-backed create expr, got create body:\n%s", runEvent.CreateBody)
	}
	if !strings.Contains(runEvent.CreateExpr, `timestamp: "",`) {
		t.Fatalf("RunEvent create expr missing empty-string timestamp default:\n%s", runEvent.CreateExpr)
	}
	if !strings.Contains(runEvent.CreateExpr, "payload: {\n") {
		t.Fatalf("RunEvent create expr missing Go-backed payload default:\n%s", runEvent.CreateExpr)
	}

	agentRun := mustFindDeclarationByName(t, converter.Declarations(), "AgentRun")
	if agentRun.CreateBody != "" {
		t.Fatalf("AgentRun should use a Go-backed create expr, got create body:\n%s", agentRun.CreateBody)
	}
	for _, snippet := range []string{
		`status: "queued",`,
		`toolCalls: [],`,
		`events: [],`,
	} {
		if !strings.Contains(agentRun.CreateExpr, snippet) {
			t.Fatalf("AgentRun create expr missing %q:\n%s", snippet, agentRun.CreateExpr)
		}
	}
}

func TestProjectStateDeclarationsUseGoBackedCapabilityDefaults(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, root := range []reflect.Type{
		reflect.TypeOf(ProjectConfig{}),
		reflect.TypeOf(ProjectStateSingleConfig{}),
	} {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", root, err)
		}
	}

	projectRunCapabilities := mustFindDeclarationByName(
		t,
		converter.Declarations(),
		"ProjectRunCapabilities",
	)
	if projectRunCapabilities.CreateBody != "" {
		t.Fatalf("ProjectRunCapabilities should use a Go-backed create expr, got create body:\n%s", projectRunCapabilities.CreateBody)
	}
	for _, snippet := range []string{
		`canRunFromMain: false,`,
		`mainRunDisabledReason: null,`,
		`effectiveEntrySectionId: null,`,
	} {
		if !strings.Contains(projectRunCapabilities.CreateExpr, snippet) {
			t.Fatalf("ProjectRunCapabilities create expr missing %q:\n%s", snippet, projectRunCapabilities.CreateExpr)
		}
	}

	sectionCapabilities := mustFindDeclarationByName(
		t,
		converter.Declarations(),
		"SectionCapabilities",
	)
	if sectionCapabilities.CreateBody != "" {
		t.Fatalf("SectionCapabilities should use a Go-backed create expr, got create body:\n%s", sectionCapabilities.CreateBody)
	}
	for _, snippet := range []string{
		`canRun: false,`,
		`canSelectAsEntryCodeBlock: false,`,
		`entryCodeBlockValue: null,`,
	} {
		if !strings.Contains(sectionCapabilities.CreateExpr, snippet) {
			t.Fatalf("SectionCapabilities create expr missing %q:\n%s", snippet, sectionCapabilities.CreateExpr)
		}
	}

	projectConfig := mustFindDeclarationByName(t, converter.Declarations(), "ProjectConfig")
	if projectConfig.CreateBody != "" {
		t.Fatalf("ProjectConfig should use a Go-backed create expr, got create body:\n%s", projectConfig.CreateBody)
	}
	for _, snippet := range []string{
		`runCapabilities: {`,
		`codegenTargets: [],`,
		`watchCodeRegistry: {`,
		`windowSpaces: {`,
		`stateMachineEdges: [],`,
	} {
		if !strings.Contains(projectConfig.CreateExpr, snippet) {
			t.Fatalf("ProjectConfig create expr missing %q:\n%s", snippet, projectConfig.CreateExpr)
		}
	}

	projectStateSingleConfig := mustFindDeclarationByName(
		t,
		converter.Declarations(),
		"ProjectStateSingleConfig",
	)
	if projectStateSingleConfig.CreateBody != "" {
		t.Fatalf("ProjectStateSingleConfig should use a Go-backed create expr, got create body:\n%s", projectStateSingleConfig.CreateBody)
	}
	for _, snippet := range []string{
		`projectConfig: {`,
		`sectionCapabilities: {`,
		`singletonSections: {`,
		`projectChatWindowing: {`,
	} {
		if !strings.Contains(projectStateSingleConfig.CreateExpr, snippet) {
			t.Fatalf("ProjectStateSingleConfig create expr missing %q:\n%s", snippet, projectStateSingleConfig.CreateExpr)
		}
	}
}

func TestSettingsCreateExprsUseGoDefaultSettingsDocument(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, root := range []reflect.Type{
		reflect.TypeOf(SettingsShortcuts{}),
		reflect.TypeOf(SettingsGUI{}),
		reflect.TypeOf(SettingsBackend{}),
	} {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", root, err)
		}
	}

	guiDeclaration := mustFindDeclarationByName(t, converter.Declarations(), "SettingsGUI")
	if !strings.Contains(guiDeclaration.CreateExpr, `gridPattern: "dots",`) {
		t.Fatalf("SettingsGUI create expr missing Go-backed grid pattern default:\n%s", guiDeclaration.CreateExpr)
	}
	if !strings.Contains(guiDeclaration.CreateExpr, `panOnScrollMode: "free",`) {
		t.Fatalf("SettingsGUI create expr missing Go-backed panOnScrollMode default:\n%s", guiDeclaration.CreateExpr)
	}
	if !strings.Contains(guiDeclaration.CreateExpr, "sectionTagColorChoices: [\n") {
		t.Fatalf("SettingsGUI create expr missing structured array rendering:\n%s", guiDeclaration.CreateExpr)
	}
	if strings.Contains(guiDeclaration.CreateExpr, "BackgroundVariantEnum.") {
		t.Fatalf("SettingsGUI create expr still embeds handwritten enum references:\n%s", guiDeclaration.CreateExpr)
	}

	backendDeclaration := mustFindDeclarationByName(t, converter.Declarations(), "SettingsBackend")
	if !strings.Contains(backendDeclaration.CreateExpr, `renameRefactorMode: "ALWAYS_ASK",`) {
		t.Fatalf("SettingsBackend create expr missing Go-backed renameRefactorMode default:\n%s", backendDeclaration.CreateExpr)
	}
	if !strings.Contains(backendDeclaration.CreateExpr, `runSnapshotMode: "ephemeral",`) {
		t.Fatalf("SettingsBackend create expr missing Go-backed runSnapshotMode default:\n%s", backendDeclaration.CreateExpr)
	}
	if strings.Contains(backendDeclaration.CreateExpr, "RunSnapshotModeEnum.") {
		t.Fatalf("SettingsBackend create expr still embeds handwritten enum references:\n%s", backendDeclaration.CreateExpr)
	}
}

func TestGoBackedFactoryCreateExprsUseGoOwnedDefaults(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, root := range []reflect.Type{
		reflect.TypeOf(MessageThinkingContent{}),
		reflect.TypeOf(ToolCall{}),
		reflect.TypeOf(AssistantChatMessage{}),
		reflect.TypeOf(BrowserSavedSearch{}),
		reflect.TypeOf(TaskBoardTask{}),
		reflect.TypeOf(LineChartSettings{}),
		reflect.TypeOf(WebsocketConnectionInfo{}),
		reflect.TypeOf(WebsocketMsgCurrentAddressUpdate{}),
	} {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", root, err)
		}
	}

	messageThinking := mustFindDeclarationByName(t, converter.Declarations(), "MessageThinkingContent")
	if !strings.Contains(messageThinking.CreateExpr, `summary: "",`) {
		t.Fatalf("MessageThinkingContent create expr missing Go-backed summary default:\n%s", messageThinking.CreateExpr)
	}
	if strings.Contains(messageThinking.CreateExpr, "ChatRoleEnum.") {
		t.Fatalf("MessageThinkingContent create expr unexpectedly embeds handwritten enum refs:\n%s", messageThinking.CreateExpr)
	}

	toolCall := mustFindDeclarationByName(t, converter.Declarations(), "ToolCall")
	if !strings.Contains(toolCall.CreateExpr, "function: {") {
		t.Fatalf("ToolCall create expr missing inlined Go-backed function default:\n%s", toolCall.CreateExpr)
	}
	if strings.Contains(toolCall.CreateExpr, "createToolCallFunction()") {
		t.Fatalf("ToolCall create expr still calls handwritten nested factory:\n%s", toolCall.CreateExpr)
	}

	assistant := mustFindDeclarationByName(t, converter.Declarations(), "AssistantChatMessage")
	if !strings.Contains(assistant.CreateExpr, `tool_calls: null,`) {
		t.Fatalf("AssistantChatMessage create expr missing Go-backed null tool_calls default:\n%s", assistant.CreateExpr)
	}
	if strings.Contains(assistant.CreateExpr, "ChatRoleEnum.assistant") {
		t.Fatalf("AssistantChatMessage create expr still embeds handwritten assistant enum ref:\n%s", assistant.CreateExpr)
	}

	savedSearch := mustFindDeclarationByName(t, converter.Declarations(), "BrowserSavedSearch")
	if !strings.Contains(savedSearch.CreateExpr, `searchScope: "recursive",`) {
		t.Fatalf("BrowserSavedSearch create expr missing Go-backed search scope default:\n%s", savedSearch.CreateExpr)
	}
	if strings.Contains(savedSearch.CreateExpr, "createBrowserSavedSearchTypeFilters()") {
		t.Fatalf("BrowserSavedSearch create expr still calls handwritten type-filter factory:\n%s", savedSearch.CreateExpr)
	}

	task := mustFindDeclarationByName(t, converter.Declarations(), "TaskBoardTask")
	if !strings.Contains(task.CreateExpr, `recurrence: "none",`) {
		t.Fatalf("TaskBoardTask create expr missing Go-backed recurrence default:\n%s", task.CreateExpr)
	}
	if strings.Contains(task.CreateExpr, "TaskBoardTaskRecurrenceEnum.none") {
		t.Fatalf("TaskBoardTask create expr still embeds handwritten recurrence enum ref:\n%s", task.CreateExpr)
	}

	lineChart := mustFindDeclarationByName(t, converter.Declarations(), "LineChartSettings")
	if !strings.Contains(lineChart.CreateExpr, `type: "line",`) {
		t.Fatalf("LineChartSettings create expr missing Go-backed chart type default:\n%s", lineChart.CreateExpr)
	}
	if strings.Contains(lineChart.CreateExpr, "ChartTypeEnum.line") {
		t.Fatalf("LineChartSettings create expr still embeds handwritten chart type enum ref:\n%s", lineChart.CreateExpr)
	}

	connectionInfo := mustFindDeclarationByName(t, converter.Declarations(), "WebsocketConnectionInfo")
	if !strings.Contains(connectionInfo.CreateExpr, `connectionType: "SERVER",`) {
		t.Fatalf("WebsocketConnectionInfo create expr missing Go-backed connection type default:\n%s", connectionInfo.CreateExpr)
	}
	if strings.Contains(connectionInfo.CreateExpr, "WebsocketConnectionTypeEnum.SERVER") {
		t.Fatalf("WebsocketConnectionInfo create expr still embeds handwritten websocket enum ref:\n%s", connectionInfo.CreateExpr)
	}

	currentAddressUpdate := mustFindDeclarationByName(
		t,
		converter.Declarations(),
		"WebsocketMsgCurrentAddressUpdate",
	)
	if !strings.Contains(currentAddressUpdate.CreateExpr, `messageType: "CurrentAddressUpdate",`) {
		t.Fatalf("WebsocketMsgCurrentAddressUpdate create expr missing Go-backed message type default:\n%s", currentAddressUpdate.CreateExpr)
	}
	if strings.Contains(currentAddressUpdate.CreateExpr, "WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate") {
		t.Fatalf("WebsocketMsgCurrentAddressUpdate create expr still embeds handwritten message type enum ref:\n%s", currentAddressUpdate.CreateExpr)
	}
}

func mustFindDeclarationByName(t *testing.T, declarations []TypeDeclaration, name string) TypeDeclaration {
	t.Helper()
	for _, declaration := range declarations {
		if declaration.Name == name {
			return declaration
		}
	}
	t.Fatalf("declaration %q not found", name)
	return TypeDeclaration{}
}

func TestBuildBindingsRendersPathParamAwareEndpoints(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:       "GoHTTPRoutes",
			HelperConstName: "GoHTTPRouteHelpers",
			Routes: []NamedRoute{
				{
					Name:     "getDeploymentThing",
					Path:     "/deployments/{deploymentName}/{version}",
					EnumName: "GET_DEPLOYMENT_THING",
				},
				{
					Name:     "saveDeploymentThing",
					Path:     "/deployments/{deploymentName}/{version}/save",
					EnumName: "SAVE_DEPLOYMENT_THING",
				},
			},
		},
	}, []EndpointSpec{
		{
			FunctionName:    "route_get_deployment_thing",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getDeploymentThing",
			PathParamsType:  reflect.TypeOf(BuildTestRouteParams{}),
			ResponseType:    reflect.TypeOf(BuildTestResponse{}),
		},
		{
			FunctionName:    "route_save_deployment_thing",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "saveDeploymentThing",
			PathParamsType:  reflect.TypeOf(BuildTestRouteParams{}),
			RequestType:     reflect.TypeOf(BuildTestRequest{}),
			ResponseType:    reflect.TypeOf(BuildTestResponse{}),
		},
	}, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"export async function route_get_deployment_thing(deploymentName: string, version: string): Promise<ResponseDataAndStatus<gt.BuildTestResponse>> {",
		"return await get(GoHTTPRouteHelpers.getDeploymentThing(deploymentName, version));",
		"export async function route_save_deployment_thing(deploymentName: string, version: string, x: gt.BuildTestRequest): Promise<ResponseDataAndStatus<gt.BuildTestResponse>> {",
		"return await post(GoHTTPRouteHelpers.saveDeploymentThing(deploymentName, version), x);",
	} {
		if !strings.Contains(bindings.EndpointsTS, snippet) {
			t.Fatalf("generated endpoints output missing %q:\n%s", snippet, bindings.EndpointsTS)
		}
	}
}

func TestBuildBindingsRendersRequestBackedGETPathParams(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:       "GoHTTPRoutes",
			HelperConstName: "GoHTTPRouteHelpers",
			Routes: []NamedRoute{
				{
					Name:     "binaryDownload",
					Path:     "/binary/{contentId}",
					EnumName: "BINARY_DOWNLOAD",
				},
			},
		},
	}, []EndpointSpec{
		{
			FunctionName:    "route_binary_download",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "binaryDownload",
			RequestType:     reflect.TypeOf(BuildTestDownloadRequest{}),
			ResponseType:    reflect.TypeOf(BuildTestResponse{}),
			BinaryResponse:  true,
		},
	}, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"function omitGeneratedRouteParams<T extends object>(",
		"export async function route_binary_download(x: gt.BuildTestDownloadRequest): Promise<ResponseDataAndStatus<gt.BuildTestResponse>> {",
		`return await getBinary(GoHTTPRouteHelpers.binaryDownload(x.contentId), omitGeneratedRouteParams(x, ["contentId"]));`,
	} {
		if !strings.Contains(bindings.EndpointsTS, snippet) {
			t.Fatalf("generated endpoints output missing %q:\n%s", snippet, bindings.EndpointsTS)
		}
	}
}

func TestBuildBindingsRendersRouteHelperCollections(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:       "GoWebsocketRoutes",
			HelperConstName: "GoWebsocketRouteHelpers",
			Routes: []NamedRoute{
				{
					Name:     "frontend",
					Path:     "/ws/frontend",
					EnumName: "WEBSOCKET_FRONTEND",
				},
				{
					Name:     "listenerById",
					Path:     "/ws/listeners/{listenerID}",
					EnumName: "WEBSOCKET_LISTENER_BY_ID",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"export const GoWebsocketRouteHelpers = {",
		"frontend(): string {",
		"return GoWebsocketRoutes.frontend;",
		"listenerById(listenerID: string): string {",
		"return replaceGeneratedRoutePathParams(GoWebsocketRoutes.listenerById, { listenerID });",
	} {
		if !strings.Contains(bindings.RoutesTS, snippet) {
			t.Fatalf("generated routes output missing %q:\n%s", snippet, bindings.RoutesTS)
		}
	}
}

func TestBuildBindingsCanLimitRouteHelpersToPathParamRoutes(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:            "GoHTTPRoutes",
			HelperConstName:      "GoHTTPRouteHelpers",
			HelperOnlyPathParams: true,
			Routes: []NamedRoute{
				{
					Name:     "loadThing",
					Path:     "/things",
					EnumName: "LOAD_THING",
				},
				{
					Name:     "loadThingByID",
					Path:     "/things/{thingId}",
					EnumName: "LOAD_THING_BY_ID",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.RoutesTS, "export const GoHTTPRouteHelpers = {") {
		t.Fatalf("generated routes output missing GoHTTPRouteHelpers:\n%s", bindings.RoutesTS)
	}
	if strings.Contains(bindings.RoutesTS, "loadThing(): string") {
		t.Fatalf("generated routes output unexpectedly rendered helper for non-path route:\n%s", bindings.RoutesTS)
	}
	if !strings.Contains(bindings.RoutesTS, "loadThingByID(thingId: string): string {") {
		t.Fatalf("generated routes output missing path-param helper:\n%s", bindings.RoutesTS)
	}
}

func TestBuildBindingsRendersTailPathRouteHelpers(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:            "GoHTTPRoutes",
			HelperConstName:      "GoHTTPRouteHelpers",
			HelperOnlyPathParams: true,
			Routes: []NamedRoute{
				{
					Name:     "tailPathRoute",
					Path:     "/fixtures/{fixtureId}{tailPath}",
					EnumName: "TAIL_PATH_ROUTE",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(
		bindings.RoutesTS,
		"tailPathRoute(fixtureId: string, tailPath: string): string {",
	) {
		t.Fatalf("generated routes output missing tail-path helper:\n%s", bindings.RoutesTS)
	}
	if !strings.Contains(bindings.RoutesTS, "GoHTTPRoutes.tailPathRoute") {
		t.Fatalf("generated routes output missing tailPathRoute constant usage:\n%s", bindings.RoutesTS)
	}
}

func TestBuildBindingsEscapesRoutePathsInGeneratedRoutes(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName: "GoHTTPRoutes",
			Routes: []NamedRoute{
				{
					Name:     "saveThing",
					Path:     "/status/\"quoted\"\nnext\\slash",
					EnumName: "SAVE_THING",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		`saveThing: "/status/\"quoted\"\nnext\\slash",`,
		`SAVE_THING: "/status/\"quoted\"\nnext\\slash",`,
	} {
		if !strings.Contains(bindings.RoutesTS, snippet) {
			t.Fatalf("routes output missing escaped route path %q:\n%s", snippet, bindings.RoutesTS)
		}
	}
}

func TestBuildBindingsRendersStructuredHelperDeclarations(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		localAliasDeclaration("LocalThing", "<T>", "{ value: T }"),
		functionDeclaration(
			"computeThing",
			false,
			"string",
			"  return value.toUpperCase();",
			TypeProperty{Name: "value", TypeExpr: "string"},
		),
		constDeclaration(
			"ExampleSchema",
			true,
			`{
  ok: true,
}`,
		),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"type LocalThing<T> = { value: T };",
		"function computeThing(",
		"return value.toUpperCase();",
		"export const ExampleSchema = {",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("types output missing structured helper declaration %q:\n%s", snippet, bindings.TypesTS)
		}
	}
}

func TestBuildBindingsRendersFunctionParamDefaults(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		exportedFunctionDeclaration(
			"createThing",
			"Thing",
			`  return options;`,
			TypeProperty{Name: "options", TypeExpr: "Thing", DefaultValue: "{} as Thing"},
			TypeProperty{Name: "overrides", TypeExpr: "Partial<Thing>", Optional: true},
		),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, "options: Thing = {} as Thing,") {
		t.Fatalf("types output missing defaulted function param:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "overrides?: Partial<Thing>,") {
		t.Fatalf("types output missing optional function param:\n%s", bindings.TypesTS)
	}
}

func TestBuildBindingsIncludesSharedFactoryHelpers(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, "function mergeGeneratedOptions<T extends object>(") {
		t.Fatalf("types output missing shared merge helper:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "function resolveGeneratedFactoryInputs<") {
		t.Fatalf("types output missing shared factory-resolution helper:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "export function createDefaultAppPolicy(") {
		t.Fatalf("types output missing generated app policy defaults helper:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "export type ImplArgsBundleMap = {") {
		t.Fatalf("types output missing project-state impl args alias:\n%s", bindings.TypesTS)
	}
	if strings.Contains(bindings.TypesTS, "function createGeneratedBaseSectionDefaults(): {") {
		t.Fatalf("types output still emits handwritten project-state base defaults helper:\n%s", bindings.TypesTS)
	}
	if strings.Contains(bindings.TypesTS, "type ImplArgsBundleWithUpdaters<") {
		t.Fatalf("types output still emits raw impl args helper alias:\n%s", bindings.TypesTS)
	}
}

func TestUserDefaultSectionCreateExprsUseGoOwnedSectionDefaults(t *testing.T) {
	t.Helper()

	lookup := func(root reflect.Type, name string) TypeDeclaration {
		t.Helper()

		converter := newTypeConverter()
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", root, err)
		}
		return mustFindDeclarationByName(t, converter.Declarations(), name)
	}

	callable := lookup(reflect.TypeOf(UserDefaultCallableSectionImpl{}), "UserDefaultCallableSectionImpl")
	if !strings.Contains(callable.CreateExpr, `configLanguage: "python",`) {
		t.Fatalf("callable create expr missing Go-backed config language default:\n%s", callable.CreateExpr)
	}
	if strings.Contains(callable.CreateExpr, "createGeneratedBaseSectionWithParamsDefaults()") {
		t.Fatalf("callable create expr still depends on handwritten base helper:\n%s", callable.CreateExpr)
	}

	prompt := lookup(reflect.TypeOf(UserDefaultPromptSectionImpl{}), "UserDefaultPromptSectionImpl")
	if !strings.Contains(prompt.CreateExpr, `format: "Jinja",`) {
		t.Fatalf("prompt create expr missing Go-backed format default:\n%s", prompt.CreateExpr)
	}
	if strings.Contains(prompt.CreateExpr, "PromptFormatEnum.") {
		t.Fatalf("prompt create expr still embeds handwritten enum refs:\n%s", prompt.CreateExpr)
	}

	chat := lookup(reflect.TypeOf(UserDefaultChatSectionImpl{}), "UserDefaultChatSectionImpl")
	for _, snippet := range []string{
		`permissionMode: "minimal",`,
		`dictationMode: "auto",`,
		`toolCallArguments: {`,
	} {
		if !strings.Contains(chat.CreateExpr, snippet) {
			t.Fatalf("chat create expr missing %q:\n%s", snippet, chat.CreateExpr)
		}
	}
	if strings.Contains(chat.CreateExpr, "createGeneratedBaseSectionDefaults()") {
		t.Fatalf("chat create expr still depends on handwritten base helper:\n%s", chat.CreateExpr)
	}

	chart := lookup(reflect.TypeOf(UserDefaultChartSectionImpl{}), "UserDefaultChartSectionImpl")
	for _, snippet := range []string{
		`chartSettings: {`,
		`type: "line",`,
	} {
		if !strings.Contains(chart.CreateExpr, snippet) {
			t.Fatalf("chart create expr missing %q:\n%s", snippet, chart.CreateExpr)
		}
	}
	if strings.Contains(chart.CreateExpr, "createLineChartSettings()") {
		t.Fatalf("chart create expr still calls handwritten chart helper:\n%s", chart.CreateExpr)
	}

	spreadsheet := lookup(reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}), "UserDefaultSpreadsheetSectionImpl")
	if !strings.Contains(spreadsheet.CreateExpr, `density: "compact",`) {
		t.Fatalf("spreadsheet create expr missing Go-backed density default:\n%s", spreadsheet.CreateExpr)
	}
	if strings.Contains(spreadsheet.CreateExpr, "SpreadsheetGridDensityEnum.") {
		t.Fatalf("spreadsheet create expr still embeds handwritten enum refs:\n%s", spreadsheet.CreateExpr)
	}
}

func TestBuildBindingsIncludesProjectStateTypeGuardSupport(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	for _, snippet := range []string{
		"export const BaseChildlessCodeObjImplTypeSet = new Set<CodeObjType>([",
		"const BaseParentSectionImplTypeSet = new Set<SectionType>([",
		"export function isBaseParentSectionImpl(",
		"export function isBaseSectionWithParamsImpl(",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("types output missing project-state guard support %q:\n%s", snippet, bindings.TypesTS)
		}
	}
}

func TestProjectStateTypeGuardSupportUsesStructuredDeclarations(t *testing.T) {
	t.Helper()

	declarations := projectStateSupportDeclarations()
	seenSets := 0
	seenGuards := 0
	for _, declaration := range declarations {
		switch declaration.Kind {
		case "set":
			seenSets++
		case "type_guard":
			seenGuards++
		case "raw":
			if declaration.Name == "ProjectStateTypeGuardSupport" {
				t.Fatalf("project-state guard support still uses raw declaration")
			}
		}
	}

	if seenSets != len(projectStateTypeGuardTypeSets) {
		t.Fatalf("project-state set declaration count = %d, want %d", seenSets, len(projectStateTypeGuardTypeSets))
	}
	if seenGuards != len(projectStateTypeGuards) {
		t.Fatalf("project-state type-guard declaration count = %d, want %d", seenGuards, len(projectStateTypeGuards))
	}
}

func TestBuildBindingsIncludesWebsocketSchemaSupport(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	for _, snippet := range []string{
		"type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;",
		"function websocketSupportReadRevealTargets(",
		"export const UISettingRevealContentSchema = {",
		"export const DependencyEventSchema = {",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("types output missing websocket schema support %q:\n%s", snippet, bindings.TypesTS)
		}
	}
}

func TestWebsocketSchemaSupportUsesStructuredDeclarations(t *testing.T) {
	t.Helper()

	declarations := websocketSupportDeclarations()
	seenLocalAliases := 0
	seenFunctions := 0
	seenConsts := 0
	for _, declaration := range declarations {
		switch declaration.Kind {
		case "local_alias":
			seenLocalAliases++
		case "function":
			seenFunctions++
		case "const":
			seenConsts++
		case "raw":
			t.Fatalf("websocket schema support still uses raw declaration %q", declaration.Name)
		}
	}

	if seenLocalAliases != 3 {
		t.Fatalf("websocket local alias declaration count = %d, want 3", seenLocalAliases)
	}
	if seenFunctions != 6 {
		t.Fatalf("websocket function declaration count = %d, want 6", seenFunctions)
	}
	if seenConsts != 2 {
		t.Fatalf("websocket const declaration count = %d, want 2", seenConsts)
	}
}

func TestCurrentBuildInputsContainNoRawDeclarations(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, extraType := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(extraType); err != nil {
			t.Fatalf("AddRootType(%s) error = %v", extraType.String(), err)
		}
	}
	for _, spec := range CurrentEndpoints() {
		if err := converter.AddRootType(spec.RequestType); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", spec.RequestType, err)
		}
		if err := converter.AddRootType(spec.ResponseType); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", spec.ResponseType, err)
		}
	}
	for _, declaration := range append(converter.Declarations(), CurrentAdditionalDeclarations()...) {
		if declaration.Kind == "raw" {
			t.Fatalf("build input still contains raw declaration %q", declaration.Name)
		}
	}
}

func TestCurrentBuildInputsPassDeclarationValidation(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, extraType := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(extraType); err != nil {
			t.Fatalf("AddRootType(%s) error = %v", extraType.String(), err)
		}
	}
	for _, spec := range CurrentEndpoints() {
		if err := converter.AddRootType(spec.RequestType); err != nil {
			t.Fatalf("AddRootType(request %s) error = %v", spec.FunctionName, err)
		}
		if err := converter.AddRootType(spec.ResponseType); err != nil {
			t.Fatalf("AddRootType(response %s) error = %v", spec.FunctionName, err)
		}
	}

	declarations := append(converter.Declarations(), CurrentAdditionalDeclarations()...)
	if err := validateTypeDeclarations(declarations); err != nil {
		t.Fatalf("validateTypeDeclarations(...) error = %v", err)
	}
}

func TestBuildUsesStructuredDeclarationsForCurrentInputs(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	for _, marker := range []string{
		"ProjectStateFrontendSupport",
		"WebsocketFrontendSupport",
	} {
		if strings.Contains(bindings.TypesTS, marker) {
			t.Fatalf("types output still emits legacy marker %q:\n%s", marker, bindings.TypesTS)
		}
	}
}

func assertGoldenFile(t *testing.T, name string, actual string) {
	t.Helper()

	path := filepath.Join("testdata", name)
	if os.Getenv("SETTA_UPDATE_FRONTENDBINDING_GOLDENS") == "1" {
		if err := os.WriteFile(path, []byte(strings.TrimSpace(actual)+"\n"), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
		return
	}
	expectedBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	expected := strings.TrimSpace(string(expectedBytes))
	if strings.TrimSpace(actual) != expected {
		t.Fatalf("unexpected generated output for %s:\n%s", name, actual)
	}
}
