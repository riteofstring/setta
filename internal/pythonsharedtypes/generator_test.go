package pythonsharedtypes

import (
	"reflect"
	"strings"
	"testing"

	binarypayload "setta/internal/binary"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
)

func TestBuildModelSpecTreatsOmitEmptyFieldsAsOptional(t *testing.T) {
	t.Helper()

	type omitEmptyExample struct {
		Name     string `json:"name"`
		MimeType string `json:"mimeType,omitempty"`
	}

	model, err := buildModelSpec(contractSpec{
		Name: "omitEmptyExample",
		Kind: contractKindModel,
		Type: reflect.TypeOf(omitEmptyExample{}),
	}, map[string]struct{}{"omitEmptyExample": {}})
	if err != nil {
		t.Fatalf("buildModelSpec(...) error = %v", err)
	}

	if len(model.Fields) != 2 {
		t.Fatalf("field count = %d, want 2", len(model.Fields))
	}
	if model.Fields[1].Name != "mimeType" {
		t.Fatalf("field[1].Name = %q, want %q", model.Fields[1].Name, "mimeType")
	}
	if model.Fields[1].TypeExpr != "str | None" {
		t.Fatalf("field[1].TypeExpr = %q, want %q", model.Fields[1].TypeExpr, "str | None")
	}
	if model.Fields[1].DefaultExpr != "None" {
		t.Fatalf("field[1].DefaultExpr = %q, want %q", model.Fields[1].DefaultExpr, "None")
	}
}

func TestSortModelSpecsByDependencies(t *testing.T) {
	t.Helper()

	models := []modelSpec{
		{
			Name: "Chat",
			Fields: []fieldSpec{
				{Name: "llmConfig", TypeExpr: "LLMConfig"},
				{Name: "branches", TypeExpr: "dict[str, ChatSectionBranch]"},
			},
		},
		{
			Name: "ChatSectionBranch",
			Fields: []fieldSpec{
				{Name: "messages", TypeExpr: "list[dict[str, Any]]"},
			},
		},
		{
			Name: "LLMConfig",
			Fields: []fieldSpec{
				{Name: "id", TypeExpr: "str"},
			},
		},
	}

	sorted := sortModelSpecsByDependencies(models)
	if len(sorted) != 3 {
		t.Fatalf("sorted len = %d, want 3", len(sorted))
	}
	if sorted[0].Name != "ChatSectionBranch" {
		t.Fatalf("sorted[0].Name = %q, want %q", sorted[0].Name, "ChatSectionBranch")
	}
	if sorted[1].Name != "LLMConfig" {
		t.Fatalf("sorted[1].Name = %q, want %q", sorted[1].Name, "LLMConfig")
	}
	if sorted[2].Name != "Chat" {
		t.Fatalf("sorted[2].Name = %q, want %q", sorted[2].Name, "Chat")
	}
}

func TestPythonTypeExprUsesWrapperOverrideNamesForNestedOwnerFields(t *testing.T) {
	t.Helper()

	typeExpr, err := pythonTypeExpr(reflect.TypeOf(binarypayload.ContentRef{}), "")
	if err != nil {
		t.Fatalf("pythonTypeExpr(...) error = %v", err)
	}
	if typeExpr != "ContentRef" {
		t.Fatalf("typeExpr = %q, want %q", typeExpr, "ContentRef")
	}
}

func TestPythonTypeExprPreservesNamedStringEnumsForNestedOwnerFields(t *testing.T) {
	t.Helper()

	typeExpr, err := pythonTypeExpr(reflect.TypeOf(realtime.DependencyValueType("")), "")
	if err != nil {
		t.Fatalf("pythonTypeExpr(...) error = %v", err)
	}
	if typeExpr != "DependencyValueType" {
		t.Fatalf("typeExpr = %q, want %q", typeExpr, "DependencyValueType")
	}
}

func TestPythonTypeExprWithImportsUsesSDKContractModuleForExternalTypes(t *testing.T) {
	t.Helper()

	spec, err := pythonTypeExprWithImports(
		reflect.TypeOf(pythonsdkcontracts.ListenerSnapshot{}),
		"",
		nil,
	)
	if err != nil {
		t.Fatalf("pythonTypeExprWithImports(...) error = %v", err)
	}
	if spec.TypeExpr != "ListenerSnapshot" {
		t.Fatalf("spec.TypeExpr = %q, want %q", spec.TypeExpr, "ListenerSnapshot")
	}
	importLine := "from setta.sdk_contracts.generated import ListenerSnapshot"
	if _, ok := spec.Imports[importLine]; !ok {
		t.Fatalf("expected import %q, got %#v", importLine, spec.Imports)
	}
}

func TestPythonTypeExprWithImportsSkipsExternalImportWhenTypeIsGeneratedLocally(t *testing.T) {
	t.Helper()

	spec, err := pythonTypeExprWithImports(
		reflect.TypeOf(pythonsdkcontracts.ListenerSnapshot{}),
		"",
		map[string]struct{}{"ListenerSnapshot": {}},
	)
	if err != nil {
		t.Fatalf("pythonTypeExprWithImports(...) error = %v", err)
	}
	if spec.TypeExpr != "ListenerSnapshot" {
		t.Fatalf("spec.TypeExpr = %q, want %q", spec.TypeExpr, "ListenerSnapshot")
	}
	if len(spec.Imports) != 0 {
		t.Fatalf("expected no imports, got %#v", spec.Imports)
	}
}

func TestBuildEmitsSharedSchemaAliasesAndDependentModels(t *testing.T) {
	t.Helper()

	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	output := generated.PythonModule
	for _, snippet := range []string{
		"from mcp.types import EmbeddedResource, ImageContent, TextContent",
		"from setta.types.id import ID, create_new_id",
		"from setta.utils.generate_memorable_string import generate_memorable_string",
		"from setta.utils.timestamps import get_now_timestamp",
		"type BaseChatMessageUnion = Annotated[",
		"type BaseArtifactUnion = Annotated[",
		"type SectionSizeValue = Annotated[",
		"class SectionSize(BaseModel):",
		"class AssistantChatMessage(BaseModel):",
		"id: ID = Field(default_factory=create_new_id)",
		"content: list[MessageTextContent | MessageImageURLContent | MessageThinkingContent] = Field(default_factory=list)",
		"class Chat(BaseModel):",
		"lastUpdated: datetime = Field(default_factory=get_now_timestamp)",
		"messages: list[BaseChatMessageUnion]",
		"projectConfigId: ID | None = None",
		"class ChatSectionBranch(BaseModel):",
		"parentBranchId: ID | None = None",
		"class ChatSectionState(BaseModel):",
		"branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)",
		"class ChatFileAttachment(BaseModel):",
		"class DependencyEvent(BaseModel):",
		"class LLMConfig(BaseModel):",
		"temporary: bool = False",
		"class LineChartSettings(BaseModel):",
		"type: ChartType = ChartType.line",
		"secondYAxisColumns: list[str] = Field(default_factory=list)",
		"class ScatterChartSettings(BaseModel):",
		"type: ChartType = ChartType.scatter",
		"class MessageThinkingDelta(BaseModel):",
		"class ProjectRunCapabilities(BaseModel):",
		"class RawArtifact(BaseModel):",
		"class StateMachineEdge(BaseModel):",
		"class ToolCallDeltaEvent(BaseModel):",
		"class ToolChatMessage(BaseModel):",
		"content: list[TextContent | ImageContent | EmbeddedResource | ToolReferenceContent] = Field(default_factory=list)",
		"started_at: datetime = Field(default_factory=get_now_timestamp)",
		"messages: list[BaseChatMessageUnion]",
		"dependencyKey: BaseDependencyKeyUnion",
		"payload: BaseDependencyValueUnion | None",
		"class MessageStartEvent(BaseModel):",
		"message: BaseChatMessageUnion",
		"class MessageDeltaEvent(BaseModel):",
		"content: list[MessageContentDelta] | None",
		"class ProjectConfig(BaseModel):",
		"name: str = Field(default_factory=generate_memorable_string)",
		"viewModes: dict[ID, ViewMode] = Field(default_factory=dict)",
		"codegenTargets: list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget] = Field(default_factory=",
		"class SectionDependencyKey(BaseModel):",
		"sectionId: ID",
		"class SectionParamDependencyKey(BaseModel):",
		"codeObjId: ID",
		"class Viewport(BaseModel):",
		"x: float = 0.0",
		"zoom: float = 1.0",
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing snippet %q", snippet)
		}
	}
	for _, snippet := range []string{
		"class SettaSharedTypeModel(",
		"class AssistantChatMessage(SettaSharedTypeModel):",
		"class Chat(SettaSharedTypeModel):",
		"class ChatMetadata(SettaSharedTypeModel):",
		"class ChatSectionBranch(SettaSharedTypeModel):",
		"class ChatSectionState(SettaSharedTypeModel):",
		"class ProjectConfig(SettaSharedTypeModel):",
		"class SectionDependencyKey(SettaSharedTypeModel):",
		"class SectionParamDependencyKey(SettaSharedTypeModel):",
		"class SystemChatMessage(SettaSharedTypeModel):",
		"class ToolChatMessage(SettaSharedTypeModel):",
		"class UserChatMessage(SettaSharedTypeModel):",
	} {
		if strings.Contains(output, snippet) {
			t.Fatalf("generated output should not contain snippet %q", snippet)
		}
	}
}
