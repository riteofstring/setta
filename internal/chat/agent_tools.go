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

type AgentTool struct {
	Name      string
	Namespace string
	Handler   AgentToolHandler
}

type AgentToolHandler func(context.Context, AgentToolCall) (AgentToolResult, error)

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

type ChatGPTAuthTokenProvider interface {
	RefreshChatGPTAuthTokens(context.Context, ChatGPTAuthRefreshRequest) (ChatGPTAuthTokens, error)
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
