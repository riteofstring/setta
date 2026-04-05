package pythonsharedtypes

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/projectview"
	"setta/internal/scriptablechat"
	"setta/internal/sharedtypes"
)

func TestBuildModelFieldLineUsesCurrentDatamodelTypeExpr(t *testing.T) {
	t.Helper()

	ownerType := reflect.TypeOf(projectview.ProjectConfig{})
	field := fieldByNameForTest(t, ownerType, "Name")
	renderedLine, imports, err := buildModelFieldLine(
		sharedtypes.ContractNameForType(ownerType),
		ownerType,
		field,
		schemaFieldTypeExprForOwnerField(t, ownerType, "name"),
		nil,
	)
	if err != nil {
		t.Fatalf("buildModelFieldLine(...) error = %v", err)
	}
	if renderedLine != "    name: str = Field(default_factory=generate_memorable_string)" {
		t.Fatalf("renderedLine = %q", renderedLine)
	}
	importLine := "from setta.utils.generate_memorable_string import generate_memorable_string"
	if _, ok := imports[importLine]; !ok {
		t.Fatalf("expected import %q, got %#v", importLine, imports)
	}
}

func TestBuildModelFieldLineUsesExplicitPyTypeOverride(t *testing.T) {
	t.Helper()

	ownerType := reflect.TypeOf(scriptablechat.SystemChatMessage{})
	field := fieldByNameForTest(t, ownerType, "ID")
	renderedLine, imports, err := buildModelFieldLine(
		sharedtypes.ContractNameForType(ownerType),
		ownerType,
		field,
		schemaFieldTypeExprForOwnerField(t, ownerType, "id"),
		nil,
	)
	if err != nil {
		t.Fatalf("buildModelFieldLine(...) error = %v", err)
	}
	if !strings.Contains(renderedLine, "id: ID") {
		t.Fatalf("renderedLine = %q, want ID override", renderedLine)
	}
	importLine := "from setta.types.id import ID, create_new_id"
	if _, ok := imports[importLine]; !ok {
		t.Fatalf("expected import %q, got %#v", importLine, imports)
	}
}

func TestBuildModelFieldLineRewritesSchemaGeneratedTypeAdapterDefaults(t *testing.T) {
	t.Helper()

	ownerType := reflect.TypeOf(projectview.ProjectConfig{})
	field := fieldByNameForTest(t, ownerType, "CodegenTargets")
	renderedLine, imports, err := buildModelFieldLine(
		sharedtypes.ContractNameForType(ownerType),
		ownerType,
		field,
		schemaFieldTypeExprForOwnerField(t, ownerType, "codegenTargets"),
		defaultSourcesForTest(t),
	)
	if err != nil {
		t.Fatalf("buildModelFieldLine(...) error = %v", err)
	}
	if !strings.Contains(
		renderedLine,
		"codegenTargets: list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget]",
	) {
		t.Fatalf("renderedLine = %q", renderedLine)
	}
	if !strings.Contains(
		renderedLine,
		`TypeAdapter(list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget]).validate_json("`,
	) {
		t.Fatalf("renderedLine = %q", renderedLine)
	}
	if strings.Contains(renderedLine, "ProjectCodegenTarget") {
		t.Fatalf("renderedLine still references unpatched type: %q", renderedLine)
	}
	if _, ok := imports["from pydantic import TypeAdapter"]; !ok {
		t.Fatalf("expected TypeAdapter import, got %#v", imports)
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
		"type BaseArtifactUnion = Annotated[",
		`Field(..., discriminator="type", title="BaseArtifactUnion")`,
		"type BaseChatMessageUnion = Annotated[",
		`Field(..., discriminator="role", title="BaseChatMessageUnion")`,
		`role: Literal["assistant"] = ChatRole.assistant`,
		"type BaseDependencyValueUnion = Annotated[",
		`Field(..., discriminator="type", title="BaseDependencyValueUnion")`,
		`type: Literal["Binary"]`,
		"type LLMStreamingResponseChunk = Annotated[",
		`Field(..., discriminator="type", title="LLMStreamingResponseChunk")`,
		`type: Literal["message_start"]`,
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

func fieldByNameForTest(t *testing.T, ownerType reflect.Type, fieldName string) reflect.StructField {
	t.Helper()
	field, ok := ownerType.FieldByName(fieldName)
	if !ok {
		t.Fatalf("expected field %s on %s", fieldName, ownerType)
	}
	return field
}

func defaultSourcesForTest(t *testing.T) map[reflect.Type]reflect.Value {
	t.Helper()
	sidecar, err := sharedtypes.BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}
	defaultSources, err := defaultSourcesFromSidecar(
		sidecar,
		sharedtypes.DefaultProfilePythonShared,
		sharedtypes.DefaultProfileFrontend,
	)
	if err != nil {
		t.Fatalf("defaultSourcesFromSidecar() error = %v", err)
	}
	return defaultSources
}

func schemaFieldTypeExprForOwnerField(t *testing.T, ownerType reflect.Type, fieldName string) string {
	t.Helper()
	module, err := pythonSharedSchemaModule()
	if err != nil {
		t.Fatalf("pythonSharedSchemaModule() error = %v", err)
	}
	contractName := sharedtypes.ContractNameForType(ownerType)
	for _, declaration := range module.Declarations {
		if declaration.Name != contractName {
			continue
		}
		lines := strings.Split(declaration.Block, "\n")
		for index := 0; index < len(lines); {
			name, typeExpr, end, ok, err := parseDatamodelField(lines, index)
			if err != nil {
				t.Fatalf("parseDatamodelField(%s.%s) error = %v", contractName, fieldName, err)
			}
			if !ok {
				index++
				continue
			}
			if name != fieldName {
				index = end
				continue
			}
			return typeExpr
		}
	}
	t.Fatalf("field %q not found in datamodel declaration %s", fieldName, contractName)
	return ""
}
