package sharedtypes

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/google/jsonschema-go/jsonschema"

	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/stringenumvalues"
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

func TestBuildSemanticSidecarUsesAuthoritativeRoutesAndDefaults(t *testing.T) {
	t.Parallel()

	sidecar, err := BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}

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

	baseArtifactUnion := document.Defs["BaseArtifactUnion"]
	if baseArtifactUnion == nil {
		t.Fatalf("expected BaseArtifactUnion schema in $defs")
	}
	if got := len(baseArtifactUnion.AnyOf); got != 5 {
		t.Fatalf("BaseArtifactUnion anyOf count = %d, want 5", got)
	}

	singleConfigSchema := document.Defs["SingleConfig"]
	if singleConfigSchema == nil {
		t.Fatalf("expected SingleConfig schema in $defs")
	}
	sectionImplsValueSchema := singleConfigSchema.Properties["sectionImpls"].AdditionalProperties
	if sectionImplsValueSchema == nil {
		t.Fatalf("expected SingleConfig.sectionImpls additionalProperties schema")
	}
	if got := len(sectionImplsValueSchema.AnyOf); got < 2 {
		t.Fatalf("SingleConfig.sectionImpls anyOf count = %d, want at least 2", got)
	}
	if got := sectionImplsValueSchema.AnyOf[0].Ref; got != "#/$defs/BaseSectionImpl" {
		t.Fatalf("SingleConfig.sectionImpls first anyOf ref = %q, want %q", got, "#/$defs/BaseSectionImpl")
	}
	codeObjImplsValueSchema := singleConfigSchema.Properties["codeObjImpls"].AdditionalProperties
	if codeObjImplsValueSchema == nil {
		t.Fatalf("expected SingleConfig.codeObjImpls additionalProperties schema")
	}
	if got := len(codeObjImplsValueSchema.AnyOf); got < 2 {
		t.Fatalf("SingleConfig.codeObjImpls anyOf count = %d, want at least 2", got)
	}
	if got := codeObjImplsValueSchema.AnyOf[0].Ref; got != "#/$defs/BaseCodeObjImpl" {
		t.Fatalf("SingleConfig.codeObjImpls first anyOf ref = %q, want %q", got, "#/$defs/BaseCodeObjImpl")
	}

	chatStateSchema := document.Defs["ChatSectionState"]
	if chatStateSchema == nil {
		t.Fatalf("expected ChatSectionState schema in $defs")
	}
	if got := chatStateSchema.Properties["messages"].Items.Ref; got != "#/$defs/BaseChatMessageUnion" {
		t.Fatalf("ChatSectionState.messages items ref = %q, want %q", got, "#/$defs/BaseChatMessageUnion")
	}
	if got := chatStateSchema.Properties["branches"].AdditionalProperties.Ref; got != "#/$defs/ChatSectionBranch" {
		t.Fatalf("ChatSectionState.branches additionalProperties ref = %q, want %q", got, "#/$defs/ChatSectionBranch")
	}

	chatSchema := document.Defs["Chat"]
	if chatSchema == nil {
		t.Fatalf("expected Chat schema in $defs")
	}
	if got := chatSchema.Properties["llmConfig"].Ref; got != "#/$defs/LLMConfig" {
		t.Fatalf("Chat.llmConfig ref = %q, want %q", got, "#/$defs/LLMConfig")
	}

	chatMetadataSchema := document.Defs["ChatMetadata"]
	if chatMetadataSchema == nil {
		t.Fatalf("expected ChatMetadata schema in $defs")
	}
	if got := chatMetadataSchema.Properties["llmConfig"].Ref; got != "#/$defs/LLMConfig" {
		t.Fatalf("ChatMetadata.llmConfig ref = %q, want %q", got, "#/$defs/LLMConfig")
	}

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

	streamingSchema := document.Defs["LLMStreamingResponseContent"]
	if streamingSchema == nil {
		t.Fatalf("expected LLMStreamingResponseContent schema in $defs")
	}
	if got := streamingSchema.Properties["chunk"].Ref; got != "#/$defs/LLMStreamingResponseChunk" {
		t.Fatalf("LLMStreamingResponseContent.chunk ref = %q, want %q", got, "#/$defs/LLMStreamingResponseChunk")
	}

	updateArtifactsSchema := document.Defs["UpdateArtifactsContent"]
	if updateArtifactsSchema == nil {
		t.Fatalf("expected UpdateArtifactsContent schema in $defs")
	}
	if got := updateArtifactsSchema.Properties["artifacts"].Items.Ref; got != "#/$defs/BaseArtifactUnion" {
		t.Fatalf("UpdateArtifactsContent.artifacts items ref = %q, want %q", got, "#/$defs/BaseArtifactUnion")
	}
}

func TestBuildSchemaDocumentUsesSpecialSchemasForRecursiveJSONAndSyntheticUnions(t *testing.T) {
	t.Parallel()

	document, err := BuildSchemaDocument()
	if err != nil {
		t.Fatalf("BuildSchemaDocument() error = %v", err)
	}

	rawMessageSchema := document.Defs["RawMessage"]
	if rawMessageSchema == nil {
		t.Fatalf("expected RawMessage schema in $defs")
	}
	if got := len(rawMessageSchema.AnyOf); got != 6 {
		t.Fatalf("RawMessage anyOf count = %d, want 6", got)
	}
	if got := rawMessageSchema.AnyOf[4].Items.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("RawMessage array items ref = %q, want %q", got, "#/$defs/RawMessage")
	}
	if got := rawMessageSchema.AnyOf[5].AdditionalProperties.Ref; got != "#/$defs/RawMessage" {
		t.Fatalf("RawMessage additionalProperties ref = %q, want %q", got, "#/$defs/RawMessage")
	}

	sectionSizeValueSchema := document.Defs["SectionSizeValue"]
	if sectionSizeValueSchema == nil {
		t.Fatalf("expected SectionSizeValue schema in $defs")
	}
	if got := len(sectionSizeValueSchema.AnyOf); got != 2 {
		t.Fatalf("SectionSizeValue anyOf count = %d, want 2", got)
	}
	if got := sectionSizeValueSchema.AnyOf[1].Ref; got != "#/$defs/SectionSizeMode" {
		t.Fatalf("SectionSizeValue enum ref = %q, want %q", got, "#/$defs/SectionSizeMode")
	}

	chartDataValueSchema := document.Defs["ChartDataValue"]
	if chartDataValueSchema == nil {
		t.Fatalf("expected ChartDataValue schema in $defs")
	}
	if chartDataValueSchema.AdditionalProperties == nil || chartDataValueSchema.AdditionalProperties.Items == nil {
		t.Fatalf("expected ChartDataValue additionalProperties array schema")
	}
	if got := len(chartDataValueSchema.AdditionalProperties.Items.AnyOf); got != 2 {
		t.Fatalf("ChartDataValue item anyOf count = %d, want 2", got)
	}

	baseSectionImplUnion := document.Defs["BaseSectionImplUnion"]
	if baseSectionImplUnion == nil {
		t.Fatalf("expected BaseSectionImplUnion schema in $defs")
	}
	if got := len(baseSectionImplUnion.AnyOf); got < 2 {
		t.Fatalf("BaseSectionImplUnion anyOf count = %d, want at least 2", got)
	}
	if got := baseSectionImplUnion.AnyOf[0].Ref; got != "#/$defs/BaseSectionImpl" {
		t.Fatalf("BaseSectionImplUnion first ref = %q, want %q", got, "#/$defs/BaseSectionImpl")
	}

	baseCodeObjImplUnion := document.Defs["BaseCodeObjImplUnion"]
	if baseCodeObjImplUnion == nil {
		t.Fatalf("expected BaseCodeObjImplUnion schema in $defs")
	}
	if got := len(baseCodeObjImplUnion.AnyOf); got < 2 {
		t.Fatalf("BaseCodeObjImplUnion anyOf count = %d, want at least 2", got)
	}
	if got := baseCodeObjImplUnion.AnyOf[0].Ref; got != "#/$defs/BaseCodeObjImpl" {
		t.Fatalf("BaseCodeObjImplUnion first ref = %q, want %q", got, "#/$defs/BaseCodeObjImpl")
	}

	baseChildlessCodeObjImplUnion := document.Defs["BaseChildlessCodeObjImplUnion"]
	if baseChildlessCodeObjImplUnion == nil {
		t.Fatalf("expected BaseChildlessCodeObjImplUnion schema in $defs")
	}
	if got := len(baseChildlessCodeObjImplUnion.AnyOf); got < 2 {
		t.Fatalf("BaseChildlessCodeObjImplUnion anyOf count = %d, want at least 2", got)
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

	components, ok := document["components"].(map[string]any)
	if !ok {
		t.Fatalf("OpenAPI projection components type = %T, want map[string]any", document["components"])
	}
	schemas, ok := components["schemas"].(map[string]any)
	if !ok {
		t.Fatalf("OpenAPI projection schemas type = %T, want map[string]any", components["schemas"])
	}
	baseArtifactUnion, ok := schemas["BaseArtifactUnion"].(map[string]any)
	if !ok {
		t.Fatalf("BaseArtifactUnion projection type = %T, want map[string]any", schemas["BaseArtifactUnion"])
	}
	anyOf, ok := baseArtifactUnion["anyOf"].([]any)
	if !ok || len(anyOf) == 0 {
		t.Fatalf("BaseArtifactUnion anyOf type = %T, want non-empty []any", baseArtifactUnion["anyOf"])
	}
	firstRef, ok := anyOf[0].(map[string]any)["$ref"].(string)
	if !ok {
		t.Fatalf("BaseArtifactUnion first anyOf ref type = %T, want string", anyOf[0])
	}
	if !strings.HasPrefix(firstRef, "#/components/schemas/") {
		t.Fatalf("BaseArtifactUnion first anyOf ref = %q, want OpenAPI components ref", firstRef)
	}

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
