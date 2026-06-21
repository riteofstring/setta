package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"setta/internal/workspace"
)

type AgentToolRegistry struct {
	tools map[string]AgentTool
}

type AgentToolSchemaType string

const (
	AgentToolSchemaArray   AgentToolSchemaType = "array"
	AgentToolSchemaBoolean AgentToolSchemaType = "boolean"
	AgentToolSchemaInteger AgentToolSchemaType = "integer"
	AgentToolSchemaNull    AgentToolSchemaType = "null"
	AgentToolSchemaNumber  AgentToolSchemaType = "number"
	AgentToolSchemaObject  AgentToolSchemaType = "object"
	AgentToolSchemaString  AgentToolSchemaType = "string"
)

var agentToolSchemaTypes = map[AgentToolSchemaType]struct{}{
	AgentToolSchemaArray:   {},
	AgentToolSchemaBoolean: {},
	AgentToolSchemaInteger: {},
	AgentToolSchemaNull:    {},
	AgentToolSchemaNumber:  {},
	AgentToolSchemaObject:  {},
	AgentToolSchemaString:  {},
}

type AgentTool struct {
	Name                   string
	Namespace              string
	InputSchema            AgentToolSchema
	OutputSchema           AgentToolSchema
	DeferLoading           bool
	PermissionRequirements []AgentToolPermissionRequirement
	FileOperation          *AgentToolFileOperation
	AuditMetadata          AgentToolAuditMetadata
	Handler                AgentToolHandler
}

type AgentToolHandler func(context.Context, AgentToolCall) (AgentToolResult, error)

type AgentToolSchema struct {
	Type                 AgentToolSchemaType
	Title                string
	Description          string
	Required             []string
	Properties           map[string]AgentToolSchema
	Items                *AgentToolSchema
	Enum                 []string
	AdditionalProperties *bool
}

type AgentToolPermissionKind string

const (
	AgentToolPermissionOpenExternal   AgentToolPermissionKind = "open_external"
	AgentToolPermissionReadWorkspace  AgentToolPermissionKind = "read_workspace"
	AgentToolPermissionSecretAccess   AgentToolPermissionKind = "secret_access"
	AgentToolPermissionUseNetwork     AgentToolPermissionKind = "use_network"
	AgentToolPermissionWriteWorkspace AgentToolPermissionKind = "write_workspace"
)

var agentToolPermissionKinds = map[AgentToolPermissionKind]struct{}{
	AgentToolPermissionOpenExternal:   {},
	AgentToolPermissionReadWorkspace:  {},
	AgentToolPermissionSecretAccess:   {},
	AgentToolPermissionUseNetwork:     {},
	AgentToolPermissionWriteWorkspace: {},
}

type AgentToolPermissionRequirement struct {
	Kind        AgentToolPermissionKind
	Description string
}

type AgentToolFileOperation struct {
	Operation            RunItemFileOperation
	PathArgument         string
	RangeStartArgument   string
	RangeEndArgument     string
	AdditionsArgument    string
	DeletionsArgument    string
	ChangedFilesArgument string
	ContentHashArgument  string
}

type AgentToolAuditMetadata struct {
	DisplayName string
	Description string
	Category    string
}

type AgentToolCall struct {
	CallID    string
	Namespace string
	Tool      string
	Arguments json.RawMessage
}

type AgentToolRuntimeContext struct {
	Workspace    workspace.WorkspaceSummary
	Conversation Conversation
	Run          Run
	ThreadID     string
	TurnID       string
}

type agentToolRuntimeContextKey struct{}

type AgentToolResult struct {
	ContentItems []AgentToolContentItem
	Success      bool
}

type AgentToolContentItem struct {
	Type     string
	Text     string
	ImageURL string
}

func NewAgentToolRegistry(tools ...AgentTool) (*AgentToolRegistry, error) {
	registry := &AgentToolRegistry{tools: map[string]AgentTool{}}
	for _, tool := range tools {
		if err := registry.Register(tool); err != nil {
			return nil, err
		}
	}
	return registry, nil
}

func (registry *AgentToolRegistry) Register(tool AgentTool) error {
	if tool.Name == "" {
		return errors.New("agent tool name is required")
	}
	if err := validateAgentToolSchema(tool.InputSchema, "agent tool "+tool.Name+" input schema"); err != nil {
		return err
	}
	if err := validateAgentToolSchema(tool.OutputSchema, "agent tool "+tool.Name+" output schema"); err != nil {
		return err
	}
	if err := validateAgentToolPermissions(tool); err != nil {
		return err
	}
	if err := validateAgentToolFileOperation(tool); err != nil {
		return err
	}
	if tool.AuditMetadata.DisplayName == "" {
		return fmt.Errorf("agent tool %s audit display name is required", tool.Name)
	}
	if tool.AuditMetadata.Description == "" {
		return fmt.Errorf("agent tool %s audit description is required", tool.Name)
	}
	if tool.AuditMetadata.Category == "" {
		return fmt.Errorf("agent tool %s audit category is required", tool.Name)
	}
	if tool.Handler == nil {
		return fmt.Errorf("agent tool %s handler is required", tool.Name)
	}
	key := agentToolKey(tool.Namespace, tool.Name)
	if _, exists := registry.tools[key]; exists {
		return fmt.Errorf("agent tool is already registered: %s", key)
	}
	registry.tools[key] = tool
	return nil
}

func (registry *AgentToolRegistry) Lookup(namespace string, name string) (AgentTool, bool) {
	if registry == nil {
		return AgentTool{}, false
	}
	tool, ok := registry.tools[agentToolKey(namespace, name)]
	return tool, ok
}

func (registry *AgentToolRegistry) Tools() []AgentTool {
	if registry == nil {
		return []AgentTool{}
	}
	keys := make([]string, 0, len(registry.tools))
	for key := range registry.tools {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	tools := make([]AgentTool, 0, len(keys))
	for _, key := range keys {
		tools = append(tools, registry.tools[key])
	}
	return tools
}

func ContextWithAgentToolRuntime(ctx context.Context, runtime AgentToolRuntimeContext) context.Context {
	return context.WithValue(ctx, agentToolRuntimeContextKey{}, runtime)
}

func AgentToolRuntimeFromContext(ctx context.Context) (AgentToolRuntimeContext, bool) {
	runtime, ok := ctx.Value(agentToolRuntimeContextKey{}).(AgentToolRuntimeContext)
	return runtime, ok
}

func agentToolKey(namespace string, name string) string {
	if namespace == "" {
		return name
	}
	return namespace + "." + name
}

func validateAgentToolSchema(schema AgentToolSchema, label string) error {
	if err := validateAgentToolSchemaShape(schema, label); err != nil {
		return err
	}
	if err := validateAgentToolSchemaProperties(schema, label); err != nil {
		return err
	}
	return validateAgentToolSchemaItems(schema, label)
}

func validateAgentToolSchemaShape(schema AgentToolSchema, label string) error {
	if _, ok := agentToolSchemaTypes[schema.Type]; !ok {
		return fmt.Errorf("%s has unsupported type %s", label, schema.Type)
	}
	if schema.Type == AgentToolSchemaArray && schema.Items == nil {
		return fmt.Errorf("%s array items schema is required", label)
	}
	if schema.Type != AgentToolSchemaArray && schema.Items != nil {
		return fmt.Errorf("%s items schema is only valid for arrays", label)
	}
	if schema.Type != AgentToolSchemaObject && len(schema.Properties) > 0 {
		return fmt.Errorf("%s properties are only valid for objects", label)
	}
	if schema.Type != AgentToolSchemaObject && schema.AdditionalProperties != nil {
		return fmt.Errorf("%s additionalProperties is only valid for objects", label)
	}
	return nil
}

func validateAgentToolSchemaProperties(schema AgentToolSchema, label string) error {
	for name, property := range schema.Properties {
		if name == "" {
			return fmt.Errorf("%s property name is required", label)
		}
		if err := validateAgentToolSchema(property, label+"."+name); err != nil {
			return err
		}
	}
	return nil
}

func validateAgentToolSchemaItems(schema AgentToolSchema, label string) error {
	if schema.Items == nil {
		return nil
	}
	return validateAgentToolSchema(*schema.Items, label+"[]")
}

func validateAgentToolPermissions(tool AgentTool) error {
	for _, requirement := range tool.PermissionRequirements {
		if _, ok := agentToolPermissionKinds[requirement.Kind]; !ok {
			return fmt.Errorf("agent tool %s has unsupported permission requirement %s", tool.Name, requirement.Kind)
		}
		if requirement.Description == "" {
			return fmt.Errorf("agent tool %s permission %s description is required", tool.Name, requirement.Kind)
		}
	}
	return nil
}

func validateAgentToolFileOperation(tool AgentTool) error {
	if tool.FileOperation == nil {
		return nil
	}
	operation := *tool.FileOperation
	if !validValue(operation.Operation, runItemFileOperationValues) {
		return fmt.Errorf("agent tool %s file operation has unsupported operation %s", tool.Name, operation.Operation)
	}
	if operation.PathArgument == "" {
		return fmt.Errorf("agent tool %s file operation path argument is required", tool.Name)
	}
	if tool.InputSchema.Type != AgentToolSchemaObject {
		return fmt.Errorf("agent tool %s file operation requires an object input schema", tool.Name)
	}
	if err := validateAgentToolFileOperationPermission(tool); err != nil {
		return err
	}
	if err := requireAgentToolSchemaPropertyType(tool, operation.PathArgument, AgentToolSchemaString, "file operation path argument"); err != nil {
		return err
	}
	if err := validateAgentToolFileOperationLineRange(tool, operation); err != nil {
		return err
	}
	if err := validateAgentToolFileOperationStats(tool, operation); err != nil {
		return err
	}
	return validateAgentToolFileOperationHash(tool, operation)
}

func validateAgentToolFileOperationLineRange(tool AgentTool, operation AgentToolFileOperation) error {
	if operation.RangeStartArgument != "" || operation.RangeEndArgument != "" {
		if operation.RangeStartArgument == "" || operation.RangeEndArgument == "" {
			return fmt.Errorf("agent tool %s file operation line range requires both start and end arguments", tool.Name)
		}
		if err := requireAgentToolSchemaPropertyType(tool, operation.RangeStartArgument, AgentToolSchemaInteger, "file operation range start argument"); err != nil {
			return err
		}
		if err := requireAgentToolSchemaPropertyType(tool, operation.RangeEndArgument, AgentToolSchemaInteger, "file operation range end argument"); err != nil {
			return err
		}
	}
	return nil
}

func validateAgentToolFileOperationStats(tool AgentTool, operation AgentToolFileOperation) error {
	for _, argument := range []struct {
		name  string
		label string
	}{
		{name: operation.AdditionsArgument, label: "file operation additions argument"},
		{name: operation.DeletionsArgument, label: "file operation deletions argument"},
		{name: operation.ChangedFilesArgument, label: "file operation changed files argument"},
	} {
		if argument.name == "" {
			continue
		}
		if err := requireAgentToolSchemaPropertyType(tool, argument.name, AgentToolSchemaInteger, argument.label); err != nil {
			return err
		}
	}
	return nil
}

func validateAgentToolFileOperationHash(tool AgentTool, operation AgentToolFileOperation) error {
	if operation.ContentHashArgument != "" {
		if err := requireAgentToolSchemaPropertyType(tool, operation.ContentHashArgument, AgentToolSchemaString, "file operation content hash argument"); err != nil {
			return err
		}
	}
	return nil
}

func validateAgentToolFileOperationPermission(tool AgentTool) error {
	switch tool.FileOperation.Operation {
	case RunItemFileOperationRead:
		if !agentToolRequiresPermission(tool, AgentToolPermissionReadWorkspace) {
			return fmt.Errorf("agent tool %s read file operation requires read_workspace permission", tool.Name)
		}
	case RunItemFileOperationWrite,
		RunItemFileOperationCreate,
		RunItemFileOperationDelete,
		RunItemFileOperationRename,
		RunItemFileOperationDiff:
		if !agentToolRequiresPermission(tool, AgentToolPermissionWriteWorkspace) {
			return fmt.Errorf("agent tool %s %s file operation requires write_workspace permission", tool.Name, tool.FileOperation.Operation)
		}
	case RunItemFileOperationUnknown:
		return fmt.Errorf("agent tool %s file operation cannot be unknown", tool.Name)
	}
	return nil
}

func requireAgentToolSchemaPropertyType(tool AgentTool, propertyName string, propertyType AgentToolSchemaType, label string) error {
	property, ok := tool.InputSchema.Properties[propertyName]
	if !ok {
		return fmt.Errorf("agent tool %s %s %q is not present in the input schema", tool.Name, label, propertyName)
	}
	if property.Type != propertyType {
		return fmt.Errorf("agent tool %s %s %q must be %s, got %s", tool.Name, label, propertyName, propertyType, property.Type)
	}
	return nil
}

func agentToolRequiresPermission(tool AgentTool, permission AgentToolPermissionKind) bool {
	for _, requirement := range tool.PermissionRequirements {
		if requirement.Kind == permission {
			return true
		}
	}
	return false
}

type AttestationProvider interface {
	GenerateAttestation(context.Context) (string, error)
}
