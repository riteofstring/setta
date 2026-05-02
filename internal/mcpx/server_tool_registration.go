package mcpx

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/tools"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerServerToolDefinitions(
	instance *Server,
	workspaceRoot string,
	registry *tools.Registry,
	opts ServerOptions,
) error {
	searchEntries := []tools.SearchEntry{}
	for _, definition := range defaultToolDefinitions(
		instance,
		workspaceRoot,
		registry,
		opts.ProjectState,
		opts.CodegenTargetValidator,
		opts.PythonCodegenSectionReconciler,
		opts.CodeUpdates,
		opts.SettingsState,
		opts.SectionNames,
		opts.CallableSignatures,
		opts.LSPDiagnostics,
		opts.StateMachineRuns,
	) {
		registered, err := registry.Register(definition.Spec)
		if err != nil {
			return err
		}
		instance.addTool(registered, definition.InputSchema, definition.OutputSchema)
		if registered.Metadata.Kind == tools.KindDiscoverable {
			searchEntries = append(searchEntries, tools.SearchEntry{
				Name:        registered.Name,
				Description: registered.Description,
				Metadata:    registered.Metadata,
				InputSchema: definition.InputSchema,
			})
		}
	}
	instance.searchEntries = append([]tools.SearchEntry(nil), searchEntries...)
	instance.toolSearch = tools.BuildSearchIndex(instance.searchEntries)
	for _, registration := range opts.ContributedToolRegistrations {
		if _, err := instance.RegisterTool(registration); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) Handler() http.Handler {
	if s == nil {
		return nil
	}
	return s.handler
}

func (s *Server) HasProjectStateMutationBroadcast() bool {
	return s != nil && s.afterProjectMutation != nil
}

func newHTTPHandler(server *sdkmcp.Server) http.Handler {
	sseHandler := sdkmcp.NewSSEHandler(func(*http.Request) *sdkmcp.Server {
		return server
	}, nil)
	streamableHandler := sdkmcp.NewStreamableHTTPHandler(func(*http.Request) *sdkmcp.Server {
		return server
	}, nil)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if shouldUseLegacySSEHandler(r) {
			sseHandler.ServeHTTP(w, r)
			return
		}
		streamableHandler.ServeHTTP(w, r)
	})
}

func shouldUseLegacySSEHandler(r *http.Request) bool {
	if r == nil {
		return false
	}
	if strings.TrimSpace(r.Header.Get("Mcp-Session-Id")) != "" {
		return false
	}
	if strings.TrimSpace(r.URL.Query().Get("sessionid")) != "" {
		return true
	}
	return r.Method == http.MethodGet
}

func (s *Server) Registry() *tools.Registry {
	if s == nil {
		return nil
	}
	return s.registry
}

func (s *Server) RegisterTool(registration ToolRegistration) (tools.Registered, error) {
	if s == nil {
		return tools.Registered{}, fmt.Errorf("mcpx: server is required")
	}

	registered, err := s.registry.Register(registration.Spec)
	if err != nil {
		return tools.Registered{}, err
	}

	s.addTool(registered, registration.InputSchema, registration.OutputSchema)
	if registered.Metadata.Kind == tools.KindDiscoverable {
		s.searchEntries = append(s.searchEntries, tools.SearchEntry{
			Name:        registered.Name,
			Description: registered.Description,
			Metadata:    registered.Metadata,
			InputSchema: registration.InputSchema,
		})
		s.toolSearch = tools.BuildSearchIndex(s.searchEntries)
	}
	return registered, nil
}

func (s *Server) RemoveTools(names ...string) {
	if s == nil || len(names) == 0 {
		return
	}

	normalizedNames := normalizeToolNames(names)
	if len(normalizedNames) == 0 {
		return
	}

	s.server.RemoveTools(normalizedNames...)
	s.registry.Remove(normalizedNames...)
	s.removeSearchEntries(normalizedNames)
}

func (s *Server) ReplaceTools(removeNames []string, registrations []ToolRegistration) error {
	if s == nil {
		return fmt.Errorf("mcpx: server is required")
	}

	normalizedRemoveNames := normalizeToolNames(removeNames)
	if err := s.validateToolReplacement(normalizedRemoveNames, registrations); err != nil {
		return err
	}

	s.RemoveTools(normalizedRemoveNames...)
	for _, registration := range registrations {
		if _, err := s.RegisterTool(registration); err != nil {
			return err
		}
	}
	return nil
}

func normalizeToolNames(names []string) []string {
	normalized := make([]string, 0, len(names))
	seen := map[string]struct{}{}
	for _, rawName := range names {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		normalized = append(normalized, name)
	}
	return normalized
}

func (s *Server) validateToolReplacement(removeNames []string, registrations []ToolRegistration) error {
	if s == nil {
		return fmt.Errorf("mcpx: server is required")
	}

	removeNameSet := make(map[string]struct{}, len(removeNames))
	for _, name := range removeNames {
		removeNameSet[name] = struct{}{}
	}

	protectedNames := map[string]struct{}{}
	for _, registered := range s.registry.List() {
		if _, willRemove := removeNameSet[registered.Name]; willRemove {
			continue
		}
		protectedNames[registered.Name] = struct{}{}
	}

	newNames := map[string]struct{}{}
	for _, registration := range registrations {
		name := strings.TrimSpace(registration.Spec.Name)
		if name == "" {
			return tools.ErrToolNameRequired
		}
		if registration.Spec.Handler == nil {
			return tools.ErrToolHandlerNil
		}
		if _, err := registration.Spec.Metadata.Normalize(name); err != nil {
			return err
		}
		if _, exists := protectedNames[name]; exists {
			return fmt.Errorf("%w: %s", tools.ErrToolDuplicate, name)
		}
		if _, exists := newNames[name]; exists {
			return fmt.Errorf("%w: %s", tools.ErrToolDuplicate, name)
		}
		newNames[name] = struct{}{}
	}
	return nil
}

func (s *Server) removeSearchEntries(names []string) {
	if s == nil || len(names) == 0 {
		return
	}

	nameSet := make(map[string]struct{}, len(names))
	for _, name := range names {
		nameSet[name] = struct{}{}
	}

	filtered := make([]tools.SearchEntry, 0, len(s.searchEntries))
	for _, entry := range s.searchEntries {
		if _, exists := nameSet[entry.Name]; exists {
			continue
		}
		filtered = append(filtered, entry)
	}
	s.searchEntries = filtered
	s.toolSearch = tools.BuildSearchIndex(filtered)
}

func (s *Server) addTool(registered tools.Registered, inputSchema map[string]any, outputSchema map[string]any) {
	s.server.AddTool(&sdkmcp.Tool{
		Name:         registered.Name,
		Description:  registered.Description,
		InputSchema:  inputSchema,
		OutputSchema: normalizeSDKToolOutputSchema(outputSchema),
		Annotations:  buildSDKToolAnnotations(registered.Metadata),
		Meta:         buildSDKToolMeta(registered.Metadata),
	}, func(ctx context.Context, req *sdkmcp.CallToolRequest) (*sdkmcp.CallToolResult, error) {
		arguments, err := decodeToolArguments(req)
		if err != nil {
			return s.buildToolErrorResult(err), nil
		}
		return s.invokeRegisteredTool(ctx, registered, arguments, requestContextFromSDK(req)), nil
	})
}

func normalizeSDKToolOutputSchema(outputSchema map[string]any) map[string]any {
	if schemaType, ok := outputSchema["type"].(string); ok && strings.TrimSpace(schemaType) == "object" {
		return outputSchema
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": true,
	}
}
