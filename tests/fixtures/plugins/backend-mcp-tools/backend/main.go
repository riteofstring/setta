package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const pluginID = "setta-fixture-backend-mcp-tools"

func main() {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    pluginID,
		Version: "0.1.0",
	}, nil)

	server.AddTool(&mcp.Tool{
		Name:        "setta_fixture_mcp_read",
		Description: "Read fixture tool for backend MCP plugin coverage.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		InputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{"value":{"type":"string"}},
			"required":["value"],
			"additionalProperties":false
		}`),
	}, func(_ context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var arguments struct {
			Value string `json:"value"`
		}
		if err := json.Unmarshal(req.Params.Arguments, &arguments); err != nil {
			return nil, err
		}
		return &mcp.CallToolResult{
			Content: []mcp.Content{
				&mcp.TextContent{Text: fmt.Sprintf("read:%s:%s", pluginID, arguments.Value)},
			},
		}, nil
	})

	server.AddTool(&mcp.Tool{
		Name:        "setta_fixture_mcp_write",
		Description: "Write fixture tool for backend MCP plugin coverage.",
		InputSchema: json.RawMessage(`{
			"type":"object",
			"properties":{"value":{"type":"string"}},
			"required":["value"],
			"additionalProperties":false
		}`),
	}, func(_ context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var arguments struct {
			Value string `json:"value"`
		}
		if err := json.Unmarshal(req.Params.Arguments, &arguments); err != nil {
			return nil, err
		}
		return &mcp.CallToolResult{
			Content: []mcp.Content{
				&mcp.TextContent{Text: fmt.Sprintf("write:%s:%s", pluginID, arguments.Value)},
			},
		}, nil
	})

	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("run backend MCP fixture: %v", err)
	}
}
