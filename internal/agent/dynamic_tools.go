package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

type DynamicTool struct {
	Namespace            string
	NamespaceDescription string
	Name                 string
	Description          string
	InputSchema          json.RawMessage
	Handler              DynamicToolHandler
}

type DynamicToolHandler func(context.Context, DynamicToolCall) (DynamicToolResult, error)

type DynamicToolCall struct {
	CallID           string
	ConversationID   string
	TurnID           string
	ProviderThreadID string
	ProviderTurnID   string
	Namespace        string
	Tool             string
	Arguments        json.RawMessage
}

type DynamicToolResult struct {
	ContentItems []DynamicToolContentItem
	Success      bool
}

type DynamicToolContentItem struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL string `json:"imageUrl,omitempty"`
}

type dynamicToolKey struct {
	namespace string
	name      string
}

func validateDynamicTools(tools []DynamicTool) error {
	seen := map[dynamicToolKey]struct{}{}
	for index, tool := range tools {
		if err := validateDynamicTool(tool); err != nil {
			return fmt.Errorf("dynamic tool[%d]: %w", index, err)
		}
		key := tool.dynamicToolKey()
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate dynamic tool %s", key.display())
		}
		seen[key] = struct{}{}
	}
	return nil
}

func validateDynamicTool(tool DynamicTool) error {
	if strings.TrimSpace(tool.Name) == "" || strings.TrimSpace(tool.Name) != tool.Name {
		return errors.New("name is required without surrounding whitespace")
	}
	if strings.TrimSpace(tool.Namespace) != tool.Namespace {
		return errors.New("namespace must not have surrounding whitespace")
	}
	if tool.Namespace != "" && strings.TrimSpace(tool.NamespaceDescription) == "" {
		return errors.New("namespace description is required for namespaced tools")
	}
	if strings.TrimSpace(tool.Description) == "" {
		return errors.New("description is required")
	}
	if len(tool.InputSchema) == 0 || !json.Valid(tool.InputSchema) {
		return errors.New("input schema must be valid JSON")
	}
	if tool.Handler == nil {
		return errors.New("handler is required")
	}
	return nil
}

func dynamicToolSpecs(tools []DynamicTool) ([]codexapp.DynamicToolSpec, error) {
	if len(tools) == 0 {
		return nil, nil
	}
	if err := validateDynamicTools(tools); err != nil {
		return nil, err
	}
	rootSpecs := make([]codexapp.DynamicToolSpec, 0, len(tools))
	namespaceOrder := make([]string, 0)
	namespaceTools := map[string][]DynamicTool{}
	namespaceDescriptions := map[string]string{}
	for _, tool := range tools {
		if tool.Namespace == "" {
			spec, err := dynamicFunctionToolSpec(tool)
			if err != nil {
				return nil, err
			}
			rootSpecs = append(rootSpecs, spec)
			continue
		}
		if _, exists := namespaceTools[tool.Namespace]; !exists {
			namespaceOrder = append(namespaceOrder, tool.Namespace)
			namespaceDescriptions[tool.Namespace] = tool.NamespaceDescription
		}
		namespaceTools[tool.Namespace] = append(namespaceTools[tool.Namespace], tool)
	}
	for _, namespace := range namespaceOrder {
		children := make([]json.RawMessage, 0, len(namespaceTools[namespace]))
		for _, tool := range namespaceTools[namespace] {
			spec, err := dynamicFunctionToolSpec(tool)
			if err != nil {
				return nil, err
			}
			children = append(children, spec)
		}
		raw, err := json.Marshal(map[string]any{
			"type":        "namespace",
			"name":        namespace,
			"description": namespaceDescriptions[namespace],
			"tools":       children,
		})
		if err != nil {
			return nil, fmt.Errorf("encode dynamic tool namespace %s: %w", namespace, err)
		}
		rootSpecs = append(rootSpecs, codexapp.DynamicToolSpec(raw))
	}
	return rootSpecs, nil
}

func dynamicFunctionToolSpec(tool DynamicTool) (codexapp.DynamicToolSpec, error) {
	raw, err := json.Marshal(map[string]any{
		"type":        "function",
		"name":        tool.Name,
		"description": tool.Description,
		"inputSchema": json.RawMessage(tool.InputSchema),
	})
	if err != nil {
		return nil, fmt.Errorf("encode dynamic tool %s: %w", tool.dynamicToolKey().display(), err)
	}
	return codexapp.DynamicToolSpec(raw), nil
}

func dynamicToolMap(tools []DynamicTool) map[dynamicToolKey]DynamicTool {
	result := make(map[dynamicToolKey]DynamicTool, len(tools))
	for _, tool := range tools {
		result[tool.dynamicToolKey()] = tool
	}
	return result
}

func (tool DynamicTool) dynamicToolKey() dynamicToolKey {
	return dynamicToolKey{namespace: tool.Namespace, name: tool.Name}
}

func (key dynamicToolKey) display() string {
	if key.namespace == "" {
		return key.name
	}
	return key.namespace + "." + key.name
}

func validateDynamicToolResult(result DynamicToolResult) error {
	if result.ContentItems == nil {
		return errors.New("dynamic tool result content items must be an array")
	}
	for index, item := range result.ContentItems {
		switch item.Type {
		case "inputText":
			if strings.TrimSpace(item.Text) == "" {
				return fmt.Errorf("dynamic tool result contentItems[%d].text is required", index)
			}
			if item.ImageURL != "" {
				return fmt.Errorf("dynamic tool result contentItems[%d].imageUrl is invalid for inputText", index)
			}
		case "inputImage":
			if strings.TrimSpace(item.ImageURL) == "" {
				return fmt.Errorf("dynamic tool result contentItems[%d].imageUrl is required", index)
			}
			if item.Text != "" {
				return fmt.Errorf("dynamic tool result contentItems[%d].text is invalid for inputImage", index)
			}
		default:
			return fmt.Errorf("dynamic tool result contentItems[%d].type is unsupported: %q", index, item.Type)
		}
	}
	return nil
}
