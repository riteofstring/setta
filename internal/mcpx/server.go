package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/statefs"
	"setta/internal/tools"
)

const (
	toolMetaNamespace = "setta"
	serverName        = "setta"
	serverVersion     = "0.1.0"
)

type Server struct {
	logger   *slog.Logger
	registry *tools.Registry
	server   *sdkmcp.Server
	handler  http.Handler
}

type ServerOptions struct {
	Logger        *slog.Logger
	Registry      *tools.Registry
	WorkspaceRoot string
}

type toolDefinition struct {
	Spec         tools.Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}

type listMCPToolsResult struct {
	Tools []string `json:"tools"`
}

type readFileRangeResult struct {
	Path         string `json:"path"`
	AbsolutePath string `json:"absolute_path"`
	StartLine    int    `json:"start_line"`
	EndLine      int    `json:"end_line"`
	Encoding     string `json:"encoding"`
	Content      string `json:"content"`
}

type toolErrorResult struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type toolError struct {
	code    string
	message string
}

func (e *toolError) Error() string {
	return e.message
}

func NewServer(opts ServerOptions) (*Server, error) {
	workspaceRoot := strings.TrimSpace(opts.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, fmt.Errorf("mcpx: workspace root is required")
	}
	registry := opts.Registry
	if registry == nil {
		registry = tools.NewRegistry()
	}

	server := sdkmcp.NewServer(&sdkmcp.Implementation{
		Name:    serverName,
		Version: serverVersion,
	}, &sdkmcp.ServerOptions{
		Logger: opts.Logger,
	})

	instance := &Server{
		logger:   opts.Logger,
		registry: registry,
		server:   server,
	}

	for _, definition := range defaultToolDefinitions(workspaceRoot, registry) {
		registered, err := registry.Register(definition.Spec)
		if err != nil {
			return nil, err
		}
		instance.addTool(registered, definition.InputSchema, definition.OutputSchema)
	}

	instance.handler = sdkmcp.NewSSEHandler(func(*http.Request) *sdkmcp.Server {
		return instance.server
	}, nil)
	return instance, nil
}

func (s *Server) Handler() http.Handler {
	if s == nil {
		return nil
	}
	return s.handler
}

func (s *Server) Registry() *tools.Registry {
	if s == nil {
		return nil
	}
	return s.registry
}

func (s *Server) addTool(registered tools.Registered, inputSchema map[string]any, outputSchema map[string]any) {
	s.server.AddTool(&sdkmcp.Tool{
		Name:         registered.Name,
		Description:  registered.Description,
		InputSchema:  inputSchema,
		OutputSchema: outputSchema,
		Annotations:  buildSDKToolAnnotations(registered.Metadata),
		Meta:         buildSDKToolMeta(registered.Metadata),
	}, func(ctx context.Context, req *sdkmcp.CallToolRequest) (*sdkmcp.CallToolResult, error) {
		arguments, err := decodeToolArguments(req)
		if err != nil {
			return buildToolErrorResult(err), nil
		}

		result, err := registered.Handler(ctx, arguments)
		if err != nil {
			return buildToolErrorResult(err), nil
		}

		callResult, err := buildToolSuccessResult(result)
		if err != nil {
			return buildToolErrorResult(err), nil
		}
		return callResult, nil
	})
}

func defaultToolDefinitions(workspaceRoot string, registry *tools.Registry) []toolDefinition {
	return []toolDefinition{
		{
			Spec: tools.Spec{
				Name:        "list_mcp_tools",
				Description: "Return every registered MCP tool name without schemas or descriptions.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: func(context.Context, map[string]any) (any, error) {
					registered := registry.List()
					names := make([]string, 0, len(registered))
					for _, tool := range registered {
						names = append(names, tool.Name)
					}
					return listMCPToolsResult{Tools: names}, nil
				},
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"tools": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"tools"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "read_file_range",
				Description: "Return the requested line range from a UTF-8 text file.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeRead,
					SearchCategory: "files",
					SearchTags:     []string{"file", "read", "lines", "workspace"},
				},
				Handler: newReadFileRangeHandler(workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Workspace-relative file path to read.",
					},
					"start_line": map[string]any{
						"type":        "integer",
						"description": "First line number to include.",
					},
					"end_line": map[string]any{
						"type":        "integer",
						"description": "Last line number to include.",
					},
				},
				"required": []string{"path"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path": map[string]any{
						"type": "string",
					},
					"absolute_path": map[string]any{
						"type": "string",
					},
					"start_line": map[string]any{
						"type": "integer",
					},
					"end_line": map[string]any{
						"type": "integer",
					},
					"encoding": map[string]any{
						"type": "string",
					},
					"content": map[string]any{
						"type": "string",
					},
				},
				"required": []string{
					"path",
					"absolute_path",
					"start_line",
					"end_line",
					"encoding",
					"content",
				},
			},
		},
	}
}

func newReadFileRangeHandler(workspaceRoot string) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		rawPath, err := readRequiredStringArgument(arguments, "path")
		if err != nil {
			return nil, err
		}
		startLine, err := readOptionalPositiveIntArgument(arguments, "start_line")
		if err != nil {
			return nil, err
		}
		endLine, err := readOptionalPositiveIntArgument(arguments, "end_line")
		if err != nil {
			return nil, err
		}

		resolvedStartLine := 1
		if startLine != nil {
			resolvedStartLine = *startLine
		}
		if endLine != nil && *endLine < resolvedStartLine {
			return nil, newToolError(
				"invalid_arguments",
				"end_line must be greater than or equal to start_line",
			)
		}

		resolvedPath, err := statefs.ResolveWithinRoot(workspaceRoot, rawPath, "path")
		if err != nil {
			return nil, newToolError("invalid_arguments", "%s", err.Error())
		}

		info, err := os.Stat(resolvedPath)
		if err != nil {
			if os.IsNotExist(err) {
				return nil, newToolError("file_not_found", "File not found: %s", resolvedPath)
			}
			return nil, fmt.Errorf("stat %s: %w", resolvedPath, err)
		}
		if !info.Mode().IsRegular() {
			return nil, newToolError("invalid_arguments", "Path is not a file: %s", resolvedPath)
		}

		data, err := os.ReadFile(resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", resolvedPath, err)
		}
		if !utf8.Valid(data) {
			return nil, newToolError("invalid_arguments", "File is not UTF-8 encoded: %s", resolvedPath)
		}

		lines := splitFileLines(string(data))
		selectedLines := make([]string, 0, len(lines))
		resolvedEndLine := resolvedStartLine - 1
		for lineNumber := resolvedStartLine; lineNumber <= len(lines); lineNumber++ {
			if endLine != nil && lineNumber > *endLine {
				break
			}
			selectedLines = append(selectedLines, lines[lineNumber-1])
			resolvedEndLine = lineNumber
		}

		relativePath, err := filepath.Rel(workspaceRoot, resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("relative path for %s: %w", resolvedPath, err)
		}

		return readFileRangeResult{
			Path:         filepath.ToSlash(filepath.Clean(relativePath)),
			AbsolutePath: resolvedPath,
			StartLine:    resolvedStartLine,
			EndLine:      resolvedEndLine,
			Encoding:     "utf-8",
			Content:      strings.Join(selectedLines, "\n"),
		}, nil
	}
}

func splitFileLines(content string) []string {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func readRequiredStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return "", newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", newToolError("invalid_arguments", "%s must not be empty", key)
	}
	return value, nil
}

func readOptionalPositiveIntArgument(arguments map[string]any, key string) (*int, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s must be an integer", key)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s must be an integer", key)
	}
	if value < 1 {
		return nil, newToolError("invalid_arguments", "%s must be at least 1", key)
	}
	return &value, nil
}

func decodeToolArguments(req *sdkmcp.CallToolRequest) (map[string]any, error) {
	if req == nil || req.Params == nil || len(req.Params.Arguments) == 0 {
		return map[string]any{}, nil
	}
	var decoded any
	if err := json.Unmarshal(req.Params.Arguments, &decoded); err != nil {
		return nil, newToolError("invalid_arguments", "Tool arguments must be valid JSON.")
	}
	arguments, ok := decoded.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "Tool arguments must be a JSON object.")
	}
	return arguments, nil
}

func buildToolSuccessResult(payload any) (*sdkmcp.CallToolResult, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal tool result: %w", err)
	}

	var structured map[string]any
	if err := json.Unmarshal(encoded, &structured); err != nil {
		return nil, fmt.Errorf("decode tool result: %w", err)
	}

	return &sdkmcp.CallToolResult{
		Content:           []sdkmcp.Content{&sdkmcp.TextContent{Text: string(encoded)}},
		StructuredContent: structured,
	}, nil
}

func buildToolErrorResult(err error) *sdkmcp.CallToolResult {
	result := toolErrorResult{
		Code:    "internal_error",
		Message: "Internal server error.",
	}
	var typed *toolError
	if ok := asToolError(err, &typed); ok {
		result.Code = typed.code
		result.Message = typed.message
	} else if err != nil {
		result.Message = err.Error()
	}

	return &sdkmcp.CallToolResult{
		IsError: true,
		Content: []sdkmcp.Content{
			&sdkmcp.TextContent{Text: result.Message},
		},
		StructuredContent: map[string]any{
			"code":    result.Code,
			"message": result.Message,
		},
	}
}

func buildSDKToolAnnotations(metadata tools.Metadata) *sdkmcp.ToolAnnotations {
	if metadata.AccessType != tools.AccessTypeRead {
		return nil
	}
	openWorld := false
	return &sdkmcp.ToolAnnotations{
		ReadOnlyHint:   true,
		IdempotentHint: true,
		OpenWorldHint:  &openWorld,
	}
}

func buildSDKToolMeta(metadata tools.Metadata) sdkmcp.Meta {
	idPathsByType := make(map[string]any, len(metadata.IDPathsByType))
	for idType, paths := range metadata.IDPathsByType {
		copied := append([]string(nil), paths...)
		idPathsByType[string(idType)] = copied
	}

	payload := map[string]any{
		"toolKind":       string(metadata.Kind),
		"accessType":     string(metadata.AccessType),
		"idPathsByType":  idPathsByType,
		"searchTags":     append([]string(nil), metadata.SearchTags...),
		"searchCategory": metadata.SearchCategory,
	}
	if metadata.DefaultTargetSingletonSection != "" {
		payload["defaultTargetSingletonSection"] = metadata.DefaultTargetSingletonSection
	}

	return sdkmcp.Meta{
		toolMetaNamespace: payload,
	}
}

func newToolError(code string, format string, args ...any) error {
	return &toolError{
		code:    code,
		message: fmt.Sprintf(format, args...),
	}
}

func asToolError(err error, target **toolError) bool {
	if err == nil {
		return false
	}
	typed, ok := err.(*toolError)
	if !ok {
		return false
	}
	*target = typed
	return true
}
