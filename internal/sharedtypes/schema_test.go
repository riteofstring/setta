package sharedtypes

import (
	"reflect"
	"strings"
	"testing"

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
}
