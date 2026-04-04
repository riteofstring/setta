package mcpx

import (
	"context"
	"sort"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/tools"
)

type catalogCodeUpdateProvider struct{}

func (catalogCodeUpdateProvider) SetCode(context.Context, string, string, string) error {
	return nil
}

func (catalogCodeUpdateProvider) FormatCode(context.Context, string, string) error {
	return nil
}

type catalogSectionNameProvider struct{}

func (catalogSectionNameProvider) SetSectionName(context.Context, string, string, string) error {
	return nil
}

type catalogLSPDiagnosticsProvider struct{}

func (catalogLSPDiagnosticsProvider) Snapshot(string) projectstate.LSPDiagnosticsPayload {
	return projectstate.LSPDiagnosticsPayload{}
}

func (catalogLSPDiagnosticsProvider) ReapplyCodeSectionIgnoreState(projectstate.Project, string) error {
	return nil
}

func BuildToolPayloads() ([]sdkmcp.Tool, error) {
	registry := tools.NewRegistry()
	server := &Server{registry: registry}
	var projectRuntime *projectstate.Runtime
	var settingsRuntime *settingsstate.Runtime

	definitions := defaultToolDefinitions(
		server,
		".",
		registry,
		projectRuntime,
		nil,
		nil,
		catalogCodeUpdateProvider{},
		settingsRuntime,
		catalogSectionNameProvider{},
		nil,
		catalogLSPDiagnosticsProvider{},
		nil,
	)

	payloads := make([]sdkmcp.Tool, 0, len(definitions))
	for _, definition := range definitions {
		registered, err := registry.Register(definition.Spec)
		if err != nil {
			return nil, err
		}
		payloads = append(payloads, sdkmcp.Tool{
			Meta:         buildSDKToolMeta(registered.Metadata),
			Annotations:  buildSDKToolAnnotations(registered.Metadata),
			Description:  registered.Description,
			InputSchema:  definition.InputSchema,
			Name:         registered.Name,
			OutputSchema: definition.OutputSchema,
		})
	}

	sort.Slice(payloads, func(i int, j int) bool {
		return payloads[i].Name < payloads[j].Name
	})
	return payloads, nil
}
