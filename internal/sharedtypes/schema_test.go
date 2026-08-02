package sharedtypes

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/google/jsonschema-go/jsonschema"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/frontendbindingmeta"
	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/stringenumvalues"
	"setta/internal/tools"
	"setta/internal/wsapi"
)

func TestBuildSchemaDocumentIncludesAuthoritativeEnumValues(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	schema := document.Defs["SectionType"]
	if schema == nil {
		t.Fatalf("expected SectionType schema in $defs")
	}

	values, ok, err := stringenumvalues.Default().Values(reflect.TypeOf(projectstate.FrontendSectionType("")))
	if err != nil {
		t.Fatalf("enum discovery error = %v", err)
	}
	if !ok || len(values) == 0 {
		t.Fatalf("expected authoritative SectionType enum values")
	}
	if got, want := len(schema.Enum), len(values); got != want {
		t.Fatalf("SectionType enum count = %d, want %d", got, want)
	}
}

func TestBuildSchemaDocumentIncludesAuthoritativeWebsocketMessageTypeEnumValues(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	schema := document.Defs["WebsocketMessageType"]
	if schema == nil {
		t.Fatalf("expected WebsocketMessageType schema in $defs")
	}

	values, ok, err := stringenumvalues.Default().Values(reflect.TypeOf(realtime.WebsocketMessageType("")))
	if err != nil {
		t.Fatalf("enum discovery error = %v", err)
	}
	if !ok || len(values) == 0 {
		t.Fatalf("expected authoritative WebsocketMessageType enum values")
	}
	if got, want := len(schema.Enum), len(values); got != want {
		t.Fatalf("WebsocketMessageType enum count = %d, want %d", got, want)
	}

	enumValues := map[string]struct{}{}
	for _, value := range schema.Enum {
		text, ok := value.(string)
		if !ok {
			t.Fatalf("WebsocketMessageType enum value type = %T, want string", value)
		}
		enumValues[text] = struct{}{}
	}
	for _, want := range []string{
		string(realtime.MessageTypeFrontendIdentity),
		string(realtime.MessageTypeNotification),
		string(realtime.MessageTypeAllConnections),
		string(realtime.MessageTypeLLMStreamingResponse),
		string(realtime.WebsocketMessageTypeBackendLogEvent),
	} {
		if _, ok := enumValues[want]; !ok {
			t.Fatalf("WebsocketMessageType schema is missing %q", want)
		}
	}
}

func TestBuildSchemaDocumentUsesProjectCodegenTargetUnionForProjectConfig(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	unionSchema := document.Defs["ProjectCodegenTarget"]
	if unionSchema == nil {
		t.Fatalf("expected ProjectCodegenTarget schema in $defs")
	}
	if got := len(unionSchema.AnyOf); got != 2 {
		t.Fatalf("ProjectCodegenTarget anyOf count = %d, want 2", got)
	}

	projectConfigSchema := document.Defs["ProjectConfig"]
	if projectConfigSchema == nil {
		t.Fatalf("expected ProjectConfig schema in $defs")
	}
	codegenTargetsSchema := projectConfigSchema.Properties["codegenTargets"]
	if codegenTargetsSchema == nil || codegenTargetsSchema.Items == nil {
		t.Fatalf("expected ProjectConfig.codegenTargets array schema with items")
	}
	if got := len(codegenTargetsSchema.Items.AnyOf); got != 2 {
		t.Fatalf("ProjectConfig.codegenTargets anyOf count = %d, want 2", got)
	}
}

func TestBuildSchemaDocumentMarksDropdownChoicesAsNonNullArray(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	schema := document.Defs["DropdownParamCodeObjImpl"]
	if schema == nil {
		t.Fatalf("expected DropdownParamCodeObjImpl schema in $defs")
	}
	choicesSchema := schema.Properties["choices"]
	if choicesSchema == nil {
		t.Fatalf("expected DropdownParamCodeObjImpl.choices property")
	}
	if schemaAllowsNull(choicesSchema) {
		t.Fatalf("expected DropdownParamCodeObjImpl.choices to be non-null, got %#v", choicesSchema)
	}
	if got := strings.TrimSpace(string(choicesSchema.Default)); got != "[]" {
		t.Fatalf("DropdownParamCodeObjImpl.choices default = %q, want %q", got, "[]")
	}
}

func TestBuildSchemaDocumentMarksDrawCollectionsAsNonNullArrays(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	testCases := []struct {
		definition string
		property   string
	}{
		{definition: "BrushStroke", property: "points"},
		{definition: "BrushStrokeWithTransform", property: "points"},
		{definition: "DrawAreaLayer", property: "elements"},
		{definition: "DrawAreaLayerItemTransform", property: "eraserStrokes"},
	}

	for _, tc := range testCases {
		schema := document.Defs[tc.definition]
		if schema == nil {
			t.Fatalf("expected %s schema in $defs", tc.definition)
		}
		propertySchema := schema.Properties[tc.property]
		if propertySchema == nil {
			t.Fatalf("expected %s.%s property", tc.definition, tc.property)
		}
		if schemaAllowsNull(propertySchema) {
			t.Fatalf("expected %s.%s to be non-null, got %#v", tc.definition, tc.property, propertySchema)
		}
	}
}

func TestBuildSchemaDocumentIncludesAuthoritativeRouteEnum(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	routeSchema := document.Defs["Route"]
	if routeSchema == nil {
		t.Fatalf("expected Route schema in $defs")
	}
	if got := routeSchema.Type; got != "string" {
		t.Fatalf("Route schema type = %q, want %q", got, "string")
	}

	routeValues := map[string]struct{}{}
	for _, value := range routeSchema.Enum {
		text, ok := value.(string)
		if !ok {
			t.Fatalf("Route enum value type = %T, want string", value)
		}
		routeValues[text] = struct{}{}
	}
	for _, want := range []string{httpapi.RouteAPIPrefix, wsapi.RouteListenerByID} {
		if _, ok := routeValues[want]; !ok {
			t.Fatalf("Route schema is missing %q", want)
		}
	}
}

func TestBuildSchemaDocumentIncludesToolArgumentPreviewMetadataContracts(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	previewKindSchema := document.Defs["PreviewKind"]
	if previewKindSchema == nil {
		t.Fatalf("expected PreviewKind schema in $defs")
	}
	values, ok, err := stringenumvalues.Default().Values(reflect.TypeOf(tools.PreviewKind("")))
	if err != nil {
		t.Fatalf("enum discovery error = %v", err)
	}
	if !ok || len(values) == 0 {
		t.Fatalf("expected authoritative PreviewKind enum values")
	}
	if got, want := len(previewKindSchema.Enum), len(values); got != want {
		t.Fatalf("PreviewKind enum count = %d, want %d", got, want)
	}

	targetIDsSchema := document.Defs["ToolArgumentPreviewTargetIDs"]
	if targetIDsSchema == nil {
		t.Fatalf("expected ToolArgumentPreviewTargetIDs schema in $defs")
	}
	for _, propertyName := range []string{"section", "codeObj"} {
		if targetIDsSchema.Properties[propertyName] == nil {
			t.Fatalf("expected ToolArgumentPreviewTargetIDs.%s property", propertyName)
		}
	}

	eventSchema := document.Defs["ToolArgumentPreviewDeltaEvent"]
	if eventSchema == nil {
		t.Fatalf("expected ToolArgumentPreviewDeltaEvent schema in $defs")
	}
	if eventSchema.Properties["preview_kind"] == nil {
		t.Fatalf("expected ToolArgumentPreviewDeltaEvent.preview_kind property")
	}
	if eventSchema.Properties["target_ids_by_type"] == nil {
		t.Fatalf("expected ToolArgumentPreviewDeltaEvent.target_ids_by_type property")
	}
}

func TestBuildSemanticSidecarUsesAuthoritativeRoutesAndDefaults(t *testing.T) {
	t.Parallel()

	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}

	assertSemanticSidecarRoutes(t, sidecar)
	assertSemanticSidecarRouteContract(t, sidecar)
	assertSemanticSidecarDefaults(t, sidecar)
}

func assertSemanticSidecarRoutes(t *testing.T, sidecar SemanticSidecar) {
	t.Helper()

	routeByName := map[string]string{}
	for _, route := range sidecar.Routes {
		routeByName[route.Name] = route.Path
	}
	if got := routeByName["API_PREFIX"]; got != httpapi.RouteAPIPrefix {
		t.Fatalf("API_PREFIX route = %q, want %q", got, httpapi.RouteAPIPrefix)
	}
	if got := routeByName["LISTENER_BY_ID"]; got != wsapi.RouteListenerByID {
		t.Fatalf("LISTENER_BY_ID route = %q, want %q", got, wsapi.RouteListenerByID)
	}
}

func assertSemanticSidecarRouteContract(t *testing.T, sidecar SemanticSidecar) {
	t.Helper()

	routeEnumByName := map[string]string{}
	for _, contract := range sidecar.Contracts {
		if contract.Name != "Route" {
			continue
		}
		if contract.Kind != "enum" {
			t.Fatalf("Route contract kind = %q, want %q", contract.Kind, "enum")
		}
		for _, value := range contract.EnumValues {
			routeEnumByName[value.Name] = value.Value
		}
	}
	if got := routeEnumByName["API_PREFIX"]; got != httpapi.RouteAPIPrefix {
		t.Fatalf("Route contract API_PREFIX = %q, want %q", got, httpapi.RouteAPIPrefix)
	}
	if got := routeEnumByName["LISTENER_BY_ID"]; got != wsapi.RouteListenerByID {
		t.Fatalf("Route contract LISTENER_BY_ID = %q, want %q", got, wsapi.RouteListenerByID)
	}
}

func assertSemanticSidecarDefaults(t *testing.T, sidecar SemanticSidecar) {
	t.Helper()

	foundViewportDefault := false
	foundPythonSharedProjectConfigDefault := false
	for _, entry := range sidecar.Defaults {
		if entry.Type == "Viewport" && entry.Profile == DefaultProfileFrontend {
			foundViewportDefault = true
		}
		if entry.Type == "ProjectConfig" && entry.Profile == DefaultProfilePythonShared {
			config, ok := entry.Value.(projectview.ProjectConfig)
			if !ok {
				t.Fatalf("ProjectConfig default value type = %T, want projectview.ProjectConfig", entry.Value)
			}
			if config.PreviewImgColor != projectview.PythonSharedDefaultProjectConfig().PreviewImgColor {
				t.Fatalf("python shared ProjectConfig preview color = %q, want %q", config.PreviewImgColor, projectview.PythonSharedDefaultProjectConfig().PreviewImgColor)
			}
			foundPythonSharedProjectConfigDefault = true
		}
	}
	if !foundViewportDefault {
		t.Fatalf("expected shared sidecar to include Viewport default entry")
	}
	if !foundPythonSharedProjectConfigDefault {
		t.Fatalf("expected shared sidecar to include python_shared ProjectConfig default entry")
	}
}

func TestBuildSemanticSidecarIncludesAppSubsystemSDKScopeMetadata(t *testing.T) {
	t.Parallel()

	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}

	contractsByName := make(map[string]ContractEntry, len(sidecar.Contracts))
	for _, entry := range sidecar.Contracts {
		contractsByName[entry.Name] = entry
	}
	if !stringSliceContains(
		contractsByName["SectionType"].FrontendSDKScopes,
		frontendbindingmeta.FrontendSDKScopeAppSubsystem,
	) {
		t.Fatalf("expected SectionType to be scoped to the app-subsystem SDK, got %#v", contractsByName["SectionType"])
	}
	if scopes := contractsByName["AddKwargResult"].FrontendSDKScopes; len(scopes) != 0 {
		t.Fatalf("expected host-only AddKwargResult to have no SDK scopes, got %#v", scopes)
	}

	exportsByName := make(map[string]ExportedValueEntry, len(sidecar.ExportedValues))
	for _, entry := range sidecar.ExportedValues {
		exportsByName[entry.Name] = entry
	}
	appSpecPatchScope := onlyAppSubsystemSDKScope(t, exportsByName["AppSpecPatchPolicyConfig"])
	if !appSpecPatchScope.IncludeFullValue {
		t.Fatalf("expected AppSpecPatchPolicyConfig to include its full value, got %#v", appSpecPatchScope)
	}
	transportScope := onlyAppSubsystemSDKScope(t, exportsByName["TransportRouteConstants"])
	expectedTransportPaths := [][]string{
		{"apiPrefix"},
		{"binary", "download"},
		{"binary", "upload"},
		{"root", "bootstrapPage"},
		{"root", "toolsCall"},
		{"websocket", "frontend"},
		{"websocket", "listenerById"},
		{"websocket", "terminalBySection"},
	}
	if !reflect.DeepEqual(transportScope.ValuePaths, expectedTransportPaths) {
		t.Fatalf("unexpected TransportRouteConstants SDK value paths %#v", transportScope.ValuePaths)
	}
	modeScopedRoutesScope := onlyAppSubsystemSDKScope(t, exportsByName["ModeScopedLauncherRoutesList"])
	if modeScopedRoutesScope.IncludeFullValue || len(modeScopedRoutesScope.ValuePaths) != 0 {
		t.Fatalf("expected ModeScopedLauncherRoutesList to be intentionally empty for SDK, got %#v", modeScopedRoutesScope)
	}
	if scopes := exportsByName["PluginFrontendBuildManifest"].FrontendSDKScopes; len(scopes) != 0 {
		t.Fatalf("expected host-only PluginFrontendBuildManifest to have no SDK scopes, got %#v", scopes)
	}
}

func TestBuildSemanticSidecarIncludesDiscriminatedUnionSemantics(t *testing.T) {
	t.Parallel()

	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}

	var chatUnion *DiscriminatedUnionEntry
	for index := range sidecar.DiscriminatedUnions {
		entry := &sidecar.DiscriminatedUnions[index]
		if entry.Name == "BaseChatMessageUnion" {
			chatUnion = entry
			break
		}
	}
	if chatUnion == nil {
		t.Fatalf("expected shared sidecar discriminated union entry for BaseChatMessageUnion")
	}
	if got := chatUnion.DiscriminatorField; got != "role" {
		t.Fatalf("BaseChatMessageUnion discriminatorField = %q, want %q", got, "role")
	}
	if got := chatUnion.EnumType; got != "ChatRole" {
		t.Fatalf("BaseChatMessageUnion enumType = %q, want %q", got, "ChatRole")
	}

	memberValues := map[string]string{}
	for _, member := range chatUnion.Members {
		memberValues[member.Name] = member.DiscriminatorValue
	}
	if got := memberValues["AssistantChatMessage"]; got != "assistant" {
		t.Fatalf("AssistantChatMessage discriminator value = %q, want %q", got, "assistant")
	}

	var artifactUnion *DiscriminatedUnionEntry
	for index := range sidecar.DiscriminatedUnions {
		entry := &sidecar.DiscriminatedUnions[index]
		if entry.Name == "BaseArtifactUnion" {
			artifactUnion = entry
			break
		}
	}
	if artifactUnion == nil {
		t.Fatalf("expected shared sidecar discriminated union entry for BaseArtifactUnion")
	}
	if got := artifactUnion.DiscriminatorField; got != "type" {
		t.Fatalf("BaseArtifactUnion discriminatorField = %q, want %q", got, "type")
	}
}

func TestSharedArtifactsSkipUnexportedRuntimeTypes(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}
	if document.Defs["zone"] != nil || document.Defs["zoneTrans"] != nil {
		t.Fatalf("shared schema should not expose unexported time internals")
	}

	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}
	for _, contract := range sidecar.Contracts {
		if contract.Name == "zone" || contract.Name == "zoneTrans" {
			t.Fatalf("shared sidecar should not expose unexported contract %q", contract.Name)
		}
	}
}

func TestBuildSchemaDocumentUsesSharedSchemaOverridesForRawCarrierFields(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	baseArtifactUnion := requireSchemaDef(t, document, "BaseArtifactUnion")
	assertSchemaAnyOfCount(t, baseArtifactUnion, "BaseArtifactUnion", 5)

	singleConfigSchema := requireSchemaDef(t, document, "SingleConfig")
	assertAdditionalPropertiesAnyOfFirstRef(t, singleConfigSchema, "SingleConfig", "sectionImpls", "#/$defs/BaseSectionImpl")
	assertAdditionalPropertiesAnyOfFirstRef(t, singleConfigSchema, "SingleConfig", "codeObjImpls", "#/$defs/BaseCodeObjImpl")

	chatStateSchema := requireSchemaDef(t, document, "ChatSectionState")
	assertPropertyItemsRef(t, chatStateSchema, "ChatSectionState", "messages", "#/$defs/BaseChatMessageUnion")
	assertPropertyAdditionalPropertiesRef(t, chatStateSchema, "ChatSectionState", "branches", "#/$defs/ChatSectionBranch")

	chatSchema := requireSchemaDef(t, document, "Chat")
	assertPropertyRef(t, chatSchema, "Chat", "llmConfig", "#/$defs/LLMConfig")

	chatMetadataSchema := requireSchemaDef(t, document, "ChatMetadata")
	assertPropertyRef(t, chatMetadataSchema, "ChatMetadata", "llmConfig", "#/$defs/LLMConfig")

	realtimeUIChangeSchema := document.Defs["RealtimeUIChangeContent"]
	if realtimeUIChangeSchema == nil {
		t.Fatalf("expected RealtimeUIChangeContent schema in $defs")
	}
	dependencyKeySchema := realtimeUIChangeSchema.Properties["dependencyKey"]
	if dependencyKeySchema == nil || len(dependencyKeySchema.AnyOf) != 2 {
		t.Fatalf("expected RealtimeUIChangeContent.dependencyKey anyOf schema")
	}
	if got := dependencyKeySchema.AnyOf[0].Ref; got != "#/$defs/BaseDependencyKeyUnion" {
		t.Fatalf("RealtimeUIChangeContent.dependencyKey first anyOf ref = %q, want %q", got, "#/$defs/BaseDependencyKeyUnion")
	}
	dependencyValueSchema := realtimeUIChangeSchema.Properties["value"]
	if dependencyValueSchema == nil || len(dependencyValueSchema.AnyOf) != 2 {
		t.Fatalf("expected RealtimeUIChangeContent.value anyOf schema")
	}
	if got := dependencyValueSchema.AnyOf[0].Ref; got != "#/$defs/BaseDependencyValueUnion" {
		t.Fatalf("RealtimeUIChangeContent.value first anyOf ref = %q, want %q", got, "#/$defs/BaseDependencyValueUnion")
	}

	streamingSchema := requireSchemaDef(t, document, "LLMStreamingResponseContent")
	assertPropertyRef(t, streamingSchema, "LLMStreamingResponseContent", "chunk", "#/$defs/LLMStreamingResponseChunk")

	updateArtifactsSchema := requireSchemaDef(t, document, "UpdateArtifactsContent")
	assertPropertyItemsRef(t, updateArtifactsSchema, "UpdateArtifactsContent", "artifacts", "#/$defs/BaseArtifactUnion")
}

func requireSchemaDef(t *testing.T, document *jsonschema.Schema, name string) *jsonschema.Schema {
	t.Helper()

	schema := document.Defs[name]
	if schema == nil {
		t.Fatalf("expected %s schema in $defs", name)
	}
	return schema
}

func assertSchemaAnyOfCount(t *testing.T, schema *jsonschema.Schema, schemaName string, want int) {
	t.Helper()

	if got := len(schema.AnyOf); got != want {
		t.Fatalf("%s anyOf count = %d, want %d", schemaName, got, want)
	}
}

func assertAdditionalPropertiesAnyOfFirstRef(t *testing.T, schema *jsonschema.Schema, schemaName string, propertyName string, wantRef string) {
	t.Helper()

	valueSchema := schema.Properties[propertyName].AdditionalProperties
	if valueSchema == nil {
		t.Fatalf("expected %s.%s additionalProperties schema", schemaName, propertyName)
	}
	if got := len(valueSchema.AnyOf); got < 2 {
		t.Fatalf("%s.%s anyOf count = %d, want at least 2", schemaName, propertyName, got)
	}
	if got := valueSchema.AnyOf[0].Ref; got != wantRef {
		t.Fatalf("%s.%s first anyOf ref = %q, want %q", schemaName, propertyName, got, wantRef)
	}
}

func assertPropertyRef(t *testing.T, schema *jsonschema.Schema, schemaName string, propertyName string, wantRef string) {
	t.Helper()

	if got := schema.Properties[propertyName].Ref; got != wantRef {
		t.Fatalf("%s.%s ref = %q, want %q", schemaName, propertyName, got, wantRef)
	}
}

func assertPropertyItemsRef(t *testing.T, schema *jsonschema.Schema, schemaName string, propertyName string, wantRef string) {
	t.Helper()

	if got := schema.Properties[propertyName].Items.Ref; got != wantRef {
		t.Fatalf("%s.%s items ref = %q, want %q", schemaName, propertyName, got, wantRef)
	}
}

func assertPropertyAdditionalPropertiesRef(t *testing.T, schema *jsonschema.Schema, schemaName string, propertyName string, wantRef string) {
	t.Helper()

	if got := schema.Properties[propertyName].AdditionalProperties.Ref; got != wantRef {
		t.Fatalf("%s.%s additionalProperties ref = %q, want %q", schemaName, propertyName, got, wantRef)
	}
}

func TestSchemaForTypeNormalizesNestedSharedRefsAndDefaults(t *testing.T) {
	t.Parallel()

	chatStateSchema, err := schemaForType(reflect.TypeOf(projectstate.ChatSectionState{}))
	if err != nil {
		t.Fatalf("schemaForType(ChatSectionState) error = %v", err)
	}
	if got := chatStateSchema.Properties["messages"].Items.Ref; got != "#/$defs/BaseChatMessageUnion" {
		t.Fatalf("ChatSectionState.messages items ref = %q, want %q", got, "#/$defs/BaseChatMessageUnion")
	}
	if got := chatStateSchema.Properties["branches"].AdditionalProperties.Ref; got != "#/$defs/ChatSectionBranch" {
		t.Fatalf("ChatSectionState.branches additionalProperties ref = %q, want %q", got, "#/$defs/ChatSectionBranch")
	}

	viewportSchema, err := schemaForType(reflect.TypeOf(projectstate.Viewport{}))
	if err != nil {
		t.Fatalf("schemaForType(Viewport) error = %v", err)
	}
	if got := decodeSchemaDefaultFloat(t, viewportSchema.Properties["zoom"]); got != 1 {
		t.Fatalf("Viewport.zoom default = %v, want 1", got)
	}
}

func TestBuildSchemaDocumentUsesSpecialSchemasForRecursiveJSONAndSyntheticUnions(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	rawMessageSchema := requireSchemaDef(t, document, "RawMessage")
	assertSchemaAnyOfCount(t, rawMessageSchema, "RawMessage", 6)
	if got := rawMessageSchema.AnyOf[4].Items.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("RawMessage array items ref = %q, want %q", got, "#/$defs/RawMessage")
	}
	if got := rawMessageSchema.AnyOf[5].AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("RawMessage additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}

	sectionSizeValueSchema := requireSchemaDef(t, document, "SectionSizeValue")
	assertSchemaAnyOfCount(t, sectionSizeValueSchema, "SectionSizeValue", 2)
	if got := sectionSizeValueSchema.AnyOf[1].Ref; got != "#/$defs/SectionSizeMode" {
		t.Fatalf("SectionSizeValue enum ref = %q, want %q", got, "#/$defs/SectionSizeMode")
	}

	chartDataValueSchema := requireSchemaDef(t, document, "ChartDataValue")
	if chartDataValueSchema.AdditionalProperties == nil || chartDataValueSchema.AdditionalProperties.Items == nil {
		t.Fatalf("expected ChartDataValue additionalProperties array schema")
	}
	if got := len(chartDataValueSchema.AdditionalProperties.Items.AnyOf); got != 2 {
		t.Fatalf("ChartDataValue item anyOf count = %d, want 2", got)
	}

	baseSectionImplUnion := requireSchemaDef(t, document, "BaseSectionImplUnion")
	assertSchemaAnyOfFirstRef(t, baseSectionImplUnion, "BaseSectionImplUnion", "#/$defs/BaseSectionImpl")

	baseCodeObjImplUnion := requireSchemaDef(t, document, "BaseCodeObjImplUnion")
	assertSchemaAnyOfFirstRef(t, baseCodeObjImplUnion, "BaseCodeObjImplUnion", "#/$defs/BaseCodeObjImpl")

	baseChildlessCodeObjImplUnion := requireSchemaDef(t, document, "BaseChildlessCodeObjImplUnion")
	assertSchemaAnyOfAtLeast(t, baseChildlessCodeObjImplUnion, "BaseChildlessCodeObjImplUnion", 2)
}

func assertSchemaAnyOfFirstRef(t *testing.T, schema *jsonschema.Schema, schemaName string, wantRef string) {
	t.Helper()

	assertSchemaAnyOfAtLeast(t, schema, schemaName, 2)
	if got := schema.AnyOf[0].Ref; got != wantRef {
		t.Fatalf("%s first ref = %q, want %q", schemaName, got, wantRef)
	}
}

func assertSchemaAnyOfAtLeast(t *testing.T, schema *jsonschema.Schema, schemaName string, minimum int) {
	t.Helper()

	if got := len(schema.AnyOf); got < minimum {
		t.Fatalf("%s anyOf count = %d, want at least %d", schemaName, got, minimum)
	}
}

func TestBuildSchemaDocumentMarksAppDefinitionDataBindingsAsObjectMap(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	appDefinitionSchema := document.Defs["AppDefinition"]
	if appDefinitionSchema == nil {
		t.Fatalf("expected AppDefinition schema in $defs")
	}
	dataBindingsSchema := appDefinitionSchema.Properties["dataBindings"]
	if dataBindingsSchema == nil {
		t.Fatalf("expected AppDefinition.dataBindings schema")
	}
	if got := len(dataBindingsSchema.Types); got != 2 {
		t.Fatalf("AppDefinition.dataBindings types count = %d, want 2", got)
	}
	if got := dataBindingsSchema.Types[0]; got != "object" {
		t.Fatalf("AppDefinition.dataBindings first type = %q, want %q", got, "object")
	}
	if got := dataBindingsSchema.Types[1]; got != "null" {
		t.Fatalf("AppDefinition.dataBindings second type = %q, want %q", got, "null")
	}
	if dataBindingsSchema.AdditionalProperties == nil {
		t.Fatalf("expected AppDefinition.dataBindings additionalProperties schema")
	}
	if got := dataBindingsSchema.AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("AppDefinition.dataBindings additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}
}

func TestBuildSchemaDocumentMarksAppDefinitionActionsAsObjectMap(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	appDefinitionSchema := document.Defs["AppDefinition"]
	if appDefinitionSchema == nil {
		t.Fatalf("expected AppDefinition schema in $defs")
	}
	actionsSchema := appDefinitionSchema.Properties["actions"]
	if actionsSchema == nil {
		t.Fatalf("expected AppDefinition.actions schema")
	}
	if got := len(actionsSchema.Types); got != 2 {
		t.Fatalf("AppDefinition.actions types count = %d, want 2", got)
	}
	if got := actionsSchema.Types[0]; got != "object" {
		t.Fatalf("AppDefinition.actions first type = %q, want %q", got, "object")
	}
	if got := actionsSchema.Types[1]; got != "null" {
		t.Fatalf("AppDefinition.actions second type = %q, want %q", got, "null")
	}
	if actionsSchema.AdditionalProperties == nil {
		t.Fatalf("expected AppDefinition.actions additionalProperties schema")
	}
	if got := actionsSchema.AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("AppDefinition.actions additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}
}

func TestDiscoveredTypesPreferPluginOwnedAppDefinitionContracts(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		contractName string
		want         reflect.Type
	}{
		{
			contractName: "AppDefinition",
			want:         reflect.TypeOf(appdefinition.AppDefinition{}),
		},
		{
			contractName: "AppRoute",
			want:         reflect.TypeOf(appdefinition.AppRoute{}),
		},
	}

	discovered := DiscoveredTypes()
	for _, tc := range testCases {
		got, ok := TypeByContractName(tc.contractName)
		if !ok {
			t.Fatalf("expected discovered type for %q", tc.contractName)
		}
		if got != tc.want {
			t.Fatalf("%s owner = %v, want %v", tc.contractName, got, tc.want)
		}
	}

	for _, blockedName := range []string{
		"AppRoute",
		"AppDefinition",
		"ReadResult",
		"MutationResult",
		"ValidationIssue",
		"Capabilities",
		"ValidationResult",
	} {
		for _, candidate := range discovered {
			if candidate.PkgPath() == "setta/internal/projectstate" && candidate.Name() == blockedName {
				t.Fatalf("unexpected host-owned app contract discovered: %v", candidate)
			}
		}
	}
}

func sharedTypesContain(types []reflect.Type, target reflect.Type) bool {
	for _, candidate := range types {
		if candidate == target {
			return true
		}
	}
	return false
}

func TestBuildSchemaDocumentMarksSectionSharedModifierAsObjectMap(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	sectionSchema := document.Defs["Section"]
	if sectionSchema == nil {
		t.Fatalf("expected Section schema in $defs")
	}
	sharedModifierSchema := sectionSchema.Properties["sharedModifier"]
	if sharedModifierSchema == nil {
		t.Fatalf("expected Section.sharedModifier schema")
	}
	if got := len(sharedModifierSchema.Types); got != 2 {
		t.Fatalf("Section.sharedModifier types count = %d, want 2", got)
	}
	if got := sharedModifierSchema.Types[0]; got != "object" {
		t.Fatalf("Section.sharedModifier first type = %q, want %q", got, "object")
	}
	if got := sharedModifierSchema.Types[1]; got != "null" {
		t.Fatalf("Section.sharedModifier second type = %q, want %q", got, "null")
	}
	if sharedModifierSchema.AdditionalProperties == nil {
		t.Fatalf("expected Section.sharedModifier additionalProperties schema")
	}
	if got := sharedModifierSchema.AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("Section.sharedModifier additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}
}

func TestBuildSchemaDocumentMarksSectionVariantModifierAsObjectMap(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	sectionVariantSchema := document.Defs["SectionVariant"]
	if sectionVariantSchema == nil {
		t.Fatalf("expected SectionVariant schema in $defs")
	}
	modifierSchema := sectionVariantSchema.Properties["modifier"]
	if modifierSchema == nil {
		t.Fatalf("expected SectionVariant.modifier schema")
	}
	if got := len(modifierSchema.Types); got != 2 {
		t.Fatalf("SectionVariant.modifier types count = %d, want 2", got)
	}
	if got := modifierSchema.Types[0]; got != "object" {
		t.Fatalf("SectionVariant.modifier first type = %q, want %q", got, "object")
	}
	if got := modifierSchema.Types[1]; got != "null" {
		t.Fatalf("SectionVariant.modifier second type = %q, want %q", got, "null")
	}
	if modifierSchema.AdditionalProperties == nil {
		t.Fatalf("expected SectionVariant.modifier additionalProperties schema")
	}
	if got := modifierSchema.AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("SectionVariant.modifier additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}
}

func TestBuildSchemaDocumentMarksCoreSharedModifierAsObjectMap(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	coreSchema := document.Defs["Core"]
	if coreSchema == nil {
		t.Fatalf("expected Core schema in $defs")
	}
	sharedModifierSchema := coreSchema.Properties["sharedModifier"]
	if sharedModifierSchema == nil {
		t.Fatalf("expected Core.sharedModifier schema")
	}
	if got := sharedModifierSchema.Type; got != "object" {
		t.Fatalf("Core.sharedModifier type = %q, want %q", got, "object")
	}
	if sharedModifierSchema.AdditionalProperties == nil {
		t.Fatalf("expected Core.sharedModifier additionalProperties schema")
	}
	if got := sharedModifierSchema.AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("Core.sharedModifier additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}
}

func TestBuildSchemaDocumentMarksVariantModifierAsObjectMap(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	variantSchema := document.Defs["Variant"]
	if variantSchema == nil {
		t.Fatalf("expected Variant schema in $defs")
	}
	modifierSchema := variantSchema.Properties["modifier"]
	if modifierSchema == nil {
		t.Fatalf("expected Variant.modifier schema")
	}
	if got := modifierSchema.Type; got != "object" {
		t.Fatalf("Variant.modifier type = %q, want %q", got, "object")
	}
	if modifierSchema.AdditionalProperties == nil {
		t.Fatalf("expected Variant.modifier additionalProperties schema")
	}
	if got := modifierSchema.AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("Variant.modifier additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}
}

func TestBuildSchemaDocumentUsesDateTimeFormatForTimeFields(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	chatMetadataSchema := document.Defs["ChatMetadata"]
	if chatMetadataSchema == nil {
		t.Fatalf("expected ChatMetadata schema in $defs")
	}
	lastUpdatedSchema := chatMetadataSchema.Properties["lastUpdated"]
	if lastUpdatedSchema == nil {
		t.Fatalf("expected ChatMetadata.lastUpdated schema")
	}
	if got := lastUpdatedSchema.Type; got != "string" {
		t.Fatalf("ChatMetadata.lastUpdated type = %q, want %q", got, "string")
	}
	if got := lastUpdatedSchema.Format; got != "date-time" {
		t.Fatalf("ChatMetadata.lastUpdated format = %q, want %q", got, "date-time")
	}

	toolChatMessageSchema := document.Defs["ToolChatMessage"]
	if toolChatMessageSchema == nil {
		t.Fatalf("expected ToolChatMessage schema in $defs")
	}
	startedAtSchema := toolChatMessageSchema.Properties["started_at"]
	if startedAtSchema == nil {
		t.Fatalf("expected ToolChatMessage.started_at schema")
	}
	if got := startedAtSchema.Type; got != "string" {
		t.Fatalf("ToolChatMessage.started_at type = %q, want %q", got, "string")
	}
	if got := startedAtSchema.Format; got != "date-time" {
		t.Fatalf("ToolChatMessage.started_at format = %q, want %q", got, "date-time")
	}
	completedAtSchema := toolChatMessageSchema.Properties["completed_at"]
	if completedAtSchema == nil || len(completedAtSchema.AnyOf) != 2 {
		t.Fatalf("expected ToolChatMessage.completed_at nullable anyOf schema")
	}
	if got := completedAtSchema.AnyOf[0].Format; got != "date-time" {
		t.Fatalf("ToolChatMessage.completed_at format = %q, want %q", got, "date-time")
	}
	if got := completedAtSchema.AnyOf[1].Type; got != "null" {
		t.Fatalf("ToolChatMessage.completed_at null member type = %q, want %q", got, "null")
	}
}

func TestBuildSchemaDocumentIncludesStaticFieldDefaults(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	lineChartSchema := document.Defs["LineChartSettings"]
	if lineChartSchema == nil {
		t.Fatalf("expected LineChartSettings schema in $defs")
	}
	if got := decodeSchemaDefaultString(t, lineChartSchema.Properties["type"]); got != "line" {
		t.Fatalf("LineChartSettings.type default = %q, want %q", got, "line")
	}
	if got := decodeSchemaDefaultArrayLen(t, lineChartSchema.Properties["secondYAxisColumns"]); got != 0 {
		t.Fatalf("LineChartSettings.secondYAxisColumns default length = %d, want 0", got)
	}

	viewportSchema := document.Defs["Viewport"]
	if viewportSchema == nil {
		t.Fatalf("expected Viewport schema in $defs")
	}
	if got := decodeSchemaDefaultFloat(t, viewportSchema.Properties["zoom"]); got != 1 {
		t.Fatalf("Viewport.zoom default = %v, want 1", got)
	}

	filtersSchema := document.Defs["BrowserSavedSearchTypeFilters"]
	if filtersSchema == nil {
		t.Fatalf("expected BrowserSavedSearchTypeFilters schema in $defs")
	}
	if got := decodeSchemaDefaultBool(t, filtersSchema.Properties["image"]); !got {
		t.Fatalf("BrowserSavedSearchTypeFilters.image default = %v, want true", got)
	}
}

func TestBuildOpenAPIProjectionDocumentRewritesSharedSchemaRefs(t *testing.T) {
	t.Parallel()

	document, err := BuildOpenAPIProjectionDocument()
	if err != nil {
		t.Fatalf("BuildOpenAPIProjectionDocument() error = %v", err)
	}

	if got := document["openapi"]; got != OpenAPIProjectionVersion {
		t.Fatalf("OpenAPI projection version = %#v, want %q", got, OpenAPIProjectionVersion)
	}

	schemas := requireOpenAPIProjectionSchemas(t, document)
	assertOpenAPIProjectionBaseArtifactUnion(t, schemas)
	assertOpenAPIProjectionChatRef(t, schemas)
	assertOpenAPIProjectionRouteEnum(t, schemas)
	assertOpenAPIProjectionLineChartDefault(t, schemas)
}

func requireOpenAPIProjectionSchemas(t *testing.T, document map[string]any) map[string]any {
	t.Helper()

	components, ok := document["components"].(map[string]any)
	if !ok {
		t.Fatalf("OpenAPI projection components type = %T, want map[string]any", document["components"])
	}
	schemas, ok := components["schemas"].(map[string]any)
	if !ok {
		t.Fatalf("OpenAPI projection schemas type = %T, want map[string]any", components["schemas"])
	}
	return schemas
}

func assertOpenAPIProjectionBaseArtifactUnion(t *testing.T, schemas map[string]any) {
	t.Helper()

	baseArtifactUnion, ok := schemas["BaseArtifactUnion"].(map[string]any)
	if !ok {
		t.Fatalf("BaseArtifactUnion projection type = %T, want map[string]any", schemas["BaseArtifactUnion"])
	}
	oneOf, ok := baseArtifactUnion["oneOf"].([]any)
	if !ok || len(oneOf) == 0 {
		t.Fatalf("BaseArtifactUnion oneOf type = %T, want non-empty []any", baseArtifactUnion["oneOf"])
	}
	firstRef, ok := oneOf[0].(map[string]any)["$ref"].(string)
	if !ok {
		t.Fatalf("BaseArtifactUnion first oneOf ref type = %T, want string", oneOf[0])
	}
	if !strings.HasPrefix(firstRef, "#/components/schemas/") {
		t.Fatalf("BaseArtifactUnion first oneOf ref = %q, want OpenAPI components ref", firstRef)
	}
	discriminator, ok := baseArtifactUnion["discriminator"].(map[string]any)
	if !ok {
		t.Fatalf("BaseArtifactUnion discriminator type = %T, want map[string]any", baseArtifactUnion["discriminator"])
	}
	if got, _ := discriminator["propertyName"].(string); got != "type" {
		t.Fatalf("BaseArtifactUnion discriminator propertyName = %q, want %q", got, "type")
	}
}

func assertOpenAPIProjectionChatRef(t *testing.T, schemas map[string]any) {
	t.Helper()

	chatProjection, ok := schemas["Chat"].(map[string]any)
	if !ok {
		t.Fatalf("Chat projection type = %T, want map[string]any", schemas["Chat"])
	}
	properties, ok := chatProjection["properties"].(map[string]any)
	if !ok {
		t.Fatalf("Chat projection properties type = %T, want map[string]any", chatProjection["properties"])
	}
	llmConfig, ok := properties["llmConfig"].(map[string]any)
	if !ok {
		t.Fatalf("Chat.llmConfig projection type = %T, want map[string]any", properties["llmConfig"])
	}
	if got, _ := llmConfig["$ref"].(string); got != "#/components/schemas/LLMConfig" {
		t.Fatalf("Chat.llmConfig projection ref = %q, want %q", got, "#/components/schemas/LLMConfig")
	}
}

func assertOpenAPIProjectionRouteEnum(t *testing.T, schemas map[string]any) {
	t.Helper()

	routeProjection, ok := schemas["Route"].(map[string]any)
	if !ok {
		t.Fatalf("Route projection type = %T, want map[string]any", schemas["Route"])
	}
	if got, _ := routeProjection["type"].(string); got != "string" {
		t.Fatalf("Route projection type = %q, want %q", got, "string")
	}
	enumValues, ok := routeProjection["enum"].([]any)
	if !ok || len(enumValues) == 0 {
		t.Fatalf("Route projection enum type = %T, want non-empty []any", routeProjection["enum"])
	}
	seenRouteValues := map[string]struct{}{}
	for _, value := range enumValues {
		text, ok := value.(string)
		if !ok {
			t.Fatalf("Route projection enum value type = %T, want string", value)
		}
		seenRouteValues[text] = struct{}{}
	}
	for _, want := range []string{httpapi.RouteAPIPrefix, wsapi.RouteListenerByID} {
		if _, ok := seenRouteValues[want]; !ok {
			t.Fatalf("Route projection is missing %q", want)
		}
	}
}

func assertOpenAPIProjectionLineChartDefault(t *testing.T, schemas map[string]any) {
	t.Helper()

	lineChartProjection, ok := schemas["LineChartSettings"].(map[string]any)
	if !ok {
		t.Fatalf("LineChartSettings projection type = %T, want map[string]any", schemas["LineChartSettings"])
	}
	lineChartProperties, ok := lineChartProjection["properties"].(map[string]any)
	if !ok {
		t.Fatalf("LineChartSettings projection properties type = %T, want map[string]any", lineChartProjection["properties"])
	}
	if got, _ := lineChartProperties["type"].(map[string]any)["default"].(string); got != "line" {
		t.Fatalf("LineChartSettings projection default = %q, want %q", got, "line")
	}
}

func decodeSchemaDefaultString(t *testing.T, schema *jsonschema.Schema) string {
	t.Helper()
	var value string
	if err := json.Unmarshal(schema.Default, &value); err != nil {
		t.Fatalf("decode schema default string: %v", err)
	}
	return value
}

func decodeSchemaDefaultArrayLen(t *testing.T, schema *jsonschema.Schema) int {
	t.Helper()
	var value []any
	if err := json.Unmarshal(schema.Default, &value); err != nil {
		t.Fatalf("decode schema default array: %v", err)
	}
	return len(value)
}

func decodeSchemaDefaultFloat(t *testing.T, schema *jsonschema.Schema) float64 {
	t.Helper()
	var value float64
	if err := json.Unmarshal(schema.Default, &value); err != nil {
		t.Fatalf("decode schema default float: %v", err)
	}
	return value
}

func decodeSchemaDefaultBool(t *testing.T, schema *jsonschema.Schema) bool {
	t.Helper()
	var value bool
	if err := json.Unmarshal(schema.Default, &value); err != nil {
		t.Fatalf("decode schema default bool: %v", err)
	}
	return value
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func onlyAppSubsystemSDKScope(
	t *testing.T,
	entry ExportedValueEntry,
) frontendbindingmeta.FrontendSDKExportedValueScope {
	t.Helper()
	if len(entry.FrontendSDKScopes) != 1 {
		t.Fatalf("expected one app-subsystem SDK scope for %s, got %#v", entry.Name, entry.FrontendSDKScopes)
	}
	scope := entry.FrontendSDKScopes[0]
	if scope.Scope != frontendbindingmeta.FrontendSDKScopeAppSubsystem {
		t.Fatalf("expected app-subsystem SDK scope for %s, got %#v", entry.Name, scope)
	}
	return scope
}
