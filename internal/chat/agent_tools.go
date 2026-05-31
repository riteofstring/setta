package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	PermissionRequirements []AgentToolPermissionRequirement
	AuditMetadata          AgentToolAuditMetadata
	Handler                AgentToolHandler
}

type AgentToolHandler func(context.Context, AgentToolCall) (AgentToolResult, error)

type AgentToolSchema struct {
	Type        AgentToolSchemaType
	Title       string
	Description string
	Required    []string
	Properties  map[string]AgentToolSchema
	Items       *AgentToolSchema
	Enum        []string
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
	if tool.AuditMetadata.DisplayName == "" {
		return fmt.Errorf("agent tool %s audit display name is required", tool.Name)
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

type ChatGPTAuthTokenProvider interface {
	RefreshChatGPTAuthTokens(context.Context, ChatGPTAuthRefreshRequest) (ChatGPTAuthTokens, error)
}

type ChatGPTAuthUnavailableError struct {
	Message string
}

func (err *ChatGPTAuthUnavailableError) Error() string {
	if err.Message != "" {
		return err.Message
	}
	return "ChatGPT auth token refresh is unavailable in Setta"
}

func IsChatGPTAuthUnavailable(err error) bool {
	var unavailable *ChatGPTAuthUnavailableError
	return errors.As(err, &unavailable)
}

type ChatGPTAuthRefreshRequest struct {
	PreviousAccountID string
	Reason            string
}

type ChatGPTAuthTokens struct {
	AccessToken      string
	ChatGPTAccountID string
	ChatGPTPlanType  string
}

type AttestationProvider interface {
	GenerateAttestation(context.Context) (string, error)
}
