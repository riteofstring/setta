package pythonsharedtypes

import (
	"os"
	"os/exec"
	"path/filepath"
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

	ownerType := reflect.TypeOf(omitEmptyExample{})
	field, ok := ownerType.FieldByName("MimeType")
	if !ok {
		t.Fatalf("expected MimeType field")
	}
	resolvedField, _, err := buildModelFieldSpec(
		"omitEmptyExample",
		ownerType,
		field,
		map[string]struct{}{"omitEmptyExample": {}},
		map[reflect.Type]reflect.Value{},
	)
	if err != nil {
		t.Fatalf("buildModelFieldSpec(...) error = %v", err)
	}

	if resolvedField.Name != "mimeType" {
		t.Fatalf("field.Name = %q, want %q", resolvedField.Name, "mimeType")
	}
	if resolvedField.TypeExpr != "str | None" {
		t.Fatalf("field.TypeExpr = %q, want %q", resolvedField.TypeExpr, "str | None")
	}
	if resolvedField.DefaultExpr != "None" {
		t.Fatalf("field.DefaultExpr = %q, want %q", resolvedField.DefaultExpr, "None")
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
		"from datetime import datetime",
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
		"secondYAxisColumns: list[str] = []",
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
		"content: list[MessageContentDelta]",
		"class ProjectConfig(BaseModel):",
		"name: str = Field(default_factory=generate_memorable_string)",
		"viewModes: dict[ID, ViewMode] = Field(default_factory=dict)",
		"codegenTargets: list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget] = Field(default_factory=",
		"class SectionDependencyKey(BaseModel):",
		"sectionId: ID",
		"class SectionParamDependencyKey(BaseModel):",
		"codeObjId: ID",
		"class Viewport(BaseModel):",
		"x: float = 0",
		"zoom: float = 1",
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
		"from setta.types.artifact import BaseArtifactUnion",
		"from setta.types.protocol import BaseDependencyKeyUnionWithDiscriminator",
		"from setta.types.protocol import BaseDependencyValueUnion",
		"from setta.types.generated.go_shared_types import BaseChatMessageUnion",
	} {
		if strings.Contains(output, snippet) {
			t.Fatalf("generated output should not contain snippet %q", snippet)
		}
	}
}

func TestBuildEmitsDiscriminatedSharedUnionAliases(t *testing.T) {
	t.Helper()

	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	output := generated.PythonModule
	for _, snippet := range []string{
		"def _base_artifact_union_discriminator(value: Any) -> str | None:",
		"type BaseArtifactUnion = Annotated[",
		"Tag(ArtifactType.Image.value)",
		"Discriminator(_base_artifact_union_discriminator)",
		"def _base_chat_message_union_discriminator(value: Any) -> str | None:",
		"Tag(ChatRole.assistant.value)",
		"Discriminator(_base_chat_message_union_discriminator)",
		"def _base_dependency_value_union_discriminator(value: Any) -> str | None:",
		"Tag(DependencyValueType.Binary.value)",
		"Discriminator(_base_dependency_value_union_discriminator)",
		"def _llm_streaming_response_chunk_discriminator(value: Any) -> str | None:",
		"Tag(StreamingEventType.message_start.value)",
		"Discriminator(_llm_streaming_response_chunk_discriminator)",
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing discriminated-union snippet %q", snippet)
		}
	}
}

func TestBuildProducesSyntacticallyValidPythonModule(t *testing.T) {
	t.Helper()

	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	modulePath := filepath.Join(t.TempDir(), "go_shared_types.py")
	if err := os.WriteFile(modulePath, []byte(generated.PythonModule), 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", modulePath, err)
	}

	pythonBin, err := pythonGeneratorExecutable()
	if err != nil {
		t.Fatalf("pythonGeneratorExecutable() error = %v", err)
	}

	cmd := exec.Command(
		pythonBin,
		"-c",
		"import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))",
		modulePath,
	)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("python syntax check failed: %v\n%s", err, strings.TrimSpace(string(output)))
	}
}
