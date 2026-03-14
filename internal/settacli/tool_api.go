package settacli

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/localsessions"
	"setta/internal/mcpx"
)

const missingAuthMessage = "Missing Setta auth. Provide auth via --cookie-header, --cookie, --auth-json, or --auth-stdin."

type apiFlags struct {
	jsonPayload            string
	payloadStdin           bool
	payloadFile            string
	jsonOutput             bool
	cookieHeader           string
	cookie                 string
	authJSONPath           string
	authStdin              bool
	timeoutSeconds         float64
	baseURL                string
	agenticProjectConfigID string
	agenticChatID          string
	agenticSectionID       string
}

func runTools(args []string, stdout io.Writer, stderr io.Writer) error {
	flags := flag.NewFlagSet("tools", flag.ContinueOnError)
	flags.SetOutput(stderr)
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("tools does not accept positional arguments")
	}

	payloads, err := mcpx.BuildToolPayloads()
	if err != nil {
		return err
	}
	return emitJSON(stdout, payloads)
}

func runAPI(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, stdin io.Reader, envLookup func(string) (string, bool), now func() time.Time, cwd string) error {
	var parsed apiFlags
	toolArg := ""
	flagArgs := args
	if len(args) > 0 && !strings.HasPrefix(strings.TrimSpace(args[0]), "-") {
		toolArg = strings.TrimSpace(args[0])
		flagArgs = args[1:]
	}
	flags := flag.NewFlagSet("api", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&parsed.jsonPayload, "json", "", "Inline JSON arguments.")
	flags.BoolVar(&parsed.payloadStdin, "stdin", false, "Read JSON arguments from stdin.")
	flags.StringVar(&parsed.payloadFile, "file", "", "Read JSON arguments from a file.")
	flags.BoolVar(&parsed.jsonOutput, "json-output", false, "Emit JSON only on stdout.")
	flags.StringVar(&parsed.cookieHeader, "cookie-header", "", "Explicit Cookie header value.")
	flags.StringVar(&parsed.cookie, "cookie", "", "Explicit cookie value.")
	flags.StringVar(&parsed.authJSONPath, "auth-json", "", "Auth JSON file from `setta auth --json`.")
	flags.BoolVar(&parsed.authStdin, "auth-stdin", false, "Read auth JSON from stdin.")
	flags.Float64Var(&parsed.timeoutSeconds, "timeout", 30.0, "Request timeout in seconds (0 disables).")
	flags.StringVar(&parsed.baseURL, "base-url", "", "Override backend base URL.")
	flags.StringVar(&parsed.agenticProjectConfigID, "agentic-project-config-id", "", "Set x-setta-project-config-id for scoped tool calls.")
	flags.StringVar(&parsed.agenticChatID, "agentic-chat-id", "", "Set x-setta-chat-id for scoped tool calls.")
	flags.StringVar(&parsed.agenticSectionID, "agentic-section-id", "", "Set x-setta-section-id for scoped tool calls.")
	if err := flags.Parse(flagArgs); err != nil {
		return err
	}
	if parsed.authStdin && parsed.payloadStdin {
		return apiInputError(stdout, parsed.jsonOutput, "", fmt.Errorf("use --auth-stdin or --stdin, not both"))
	}

	remaining := flags.Args()
	switch {
	case toolArg == "" && len(remaining) == 1:
		toolArg = strings.TrimSpace(remaining[0])
	case toolArg == "" && len(remaining) != 1:
		return fmt.Errorf("api requires exactly one tool name argument")
	case toolArg != "" && len(remaining) != 0:
		return fmt.Errorf("api accepts flags either before or after a single tool name, not additional positional arguments")
	}

	normalizedToolName := strings.TrimSpace(toolArg)
	if _, err := normalizeToolName(toolArg); err != nil {
		return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
	}
	normalizedToolName, _ = normalizeToolName(toolArg)

	hasExplicitAuth := strings.TrimSpace(parsed.authJSONPath) != "" || parsed.authStdin || strings.TrimSpace(parsed.cookieHeader) != "" || strings.TrimSpace(parsed.cookie) != ""

	payload, err := loadJSONPayload(parsed.jsonPayload, parsed.payloadStdin, parsed.payloadFile, stdin)
	if err != nil {
		return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
	}
	arguments := map[string]any{}
	if payload != nil {
		object, ok := payload.(map[string]any)
		if !ok {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, fmt.Errorf("tool arguments must be a JSON object"))
		}
		arguments = object
	}

	authPayload, err := loadAuthPayload(parsed.authJSONPath, parsed.authStdin, stdin)
	if err != nil {
		return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
	}

	toolPayloads, err := mcpx.BuildToolPayloads()
	if err != nil {
		return err
	}
	toolNames := make(map[string]struct{}, len(toolPayloads))
	for _, payload := range toolPayloads {
		toolNames[payload.Name] = struct{}{}
	}
	if _, ok := toolNames[normalizedToolName]; !ok {
		if !hasExplicitAuth {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, fmt.Errorf("%s", missingAuthMessage))
		}
		if parsed.jsonOutput {
			return emitJSONAndExit(stdout, map[string]any{
				"error": "UnknownTool",
				"tool":  normalizedToolName,
			}, fmt.Errorf("unknown tool: %s", normalizedToolName))
		}
		return fmt.Errorf("unknown tool: %s", normalizedToolName)
	}

	var commandCfg config.Config
	var session auth.SessionMetadata
	var registry *localsessions.Registry
	sessionResolved := false

	resolveSession := func() error {
		if sessionResolved {
			return nil
		}
		resolvedCfg, resolvedRegistry, resolvedSession, resolveErr := resolveLatestAPISession(global, cwd, envLookup)
		if resolveErr != nil {
			return resolveErr
		}
		commandCfg = resolvedCfg
		registry = resolvedRegistry
		session = resolvedSession
		sessionResolved = true
		return nil
	}

	resolvedBaseURL := ""
	if strings.TrimSpace(parsed.baseURL) != "" {
		resolvedBaseURL, err = normalizeBaseURL(parsed.baseURL)
		if err != nil {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
		}
	}
	cookieValue := ""

	switch {
	case strings.TrimSpace(parsed.cookieHeader) != "" || strings.TrimSpace(parsed.cookie) != "":
		if strings.TrimSpace(parsed.cookieHeader) != "" {
			cookieValue = stripCookieHeaderPrefix(parsed.cookieHeader)
		} else {
			cookieValue = stripCookieHeaderPrefix(parsed.cookie)
			if !strings.Contains(cookieValue, "=") {
				return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, fmt.Errorf("cookie must be provided in name=value form"))
			}
		}
		if resolvedBaseURL == "" {
			if err := resolveSession(); err != nil {
				return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
			}
			resolvedBaseURL = baseURLFromSession(session)
		}
	case authPayload != nil:
		cookieValue, err = cookieHeaderFromAuthPayload(authPayload)
		if err != nil {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
		}
		if resolvedBaseURL == "" {
			resolvedBaseURL, err = baseURLFromAuthPayload(authPayload)
			if err != nil {
				return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
			}
		}
		if resolvedBaseURL == "" {
			if err := resolveSession(); err != nil {
				return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
			}
			resolvedBaseURL = baseURLFromSession(session)
		}
	default:
		if err := resolveSession(); err != nil {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
		}
		if resolvedBaseURL == "" {
			resolvedBaseURL = baseURLFromSession(session)
		}
		secret, err := registry.LoadSecret(session)
		if err != nil {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, fmt.Errorf("secret file missing for session %s", session.ID))
		}
		cookieName, err := auth.CookieName(commandCfg.Paths.AuthCookieName, session.ID)
		if err != nil {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
		}
		cookieToken, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(session.ID, secret, now())
		if err != nil {
			return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
		}
		cookieValue = cookieName + "=" + cookieToken
	}

	if resolvedBaseURL == "" {
		return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, fmt.Errorf("missing base URL. Use --base-url or --auth-json"))
	}
	if strings.TrimSpace(cookieValue) == "" {
		return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, fmt.Errorf("missing auth cookie"))
	}

	requestURL, err := buildToolCallURL(resolvedBaseURL)
	if err != nil {
		return apiInputError(stdout, parsed.jsonOutput, normalizedToolName, err)
	}

	requestBody, err := json.Marshal(map[string]any{
		"tool":      normalizedToolName,
		"arguments": arguments,
	})
	if err != nil {
		return err
	}

	request, err := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(requestBody))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Cookie", cookieValue)
	if trimmed := strings.TrimSpace(parsed.agenticProjectConfigID); trimmed != "" {
		request.Header.Set(mcpx.AgenticContextProjectConfigIDHeader, trimmed)
		if chatID := strings.TrimSpace(parsed.agenticChatID); chatID != "" {
			request.Header.Set(mcpx.AgenticContextChatIDHeader, chatID)
		}
		if sectionID := strings.TrimSpace(parsed.agenticSectionID); sectionID != "" {
			request.Header.Set(mcpx.AgenticContextSectionIDHeader, sectionID)
		}
	}

	timeout := time.Duration(0)
	if parsed.timeoutSeconds > 0 {
		timeout = time.Duration(parsed.timeoutSeconds * float64(time.Second))
	}
	client := &http.Client{Timeout: timeout}
	response, err := client.Do(request)
	if err != nil {
		if parsed.jsonOutput {
			return emitJSONAndExit(stdout, map[string]any{
				"error":   "RequestError",
				"message": err.Error(),
				"tool":    normalizedToolName,
			}, err)
		}
		return err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		if parsed.jsonOutput {
			return emitJSONAndExit(stdout, map[string]any{
				"error":   "RequestError",
				"message": err.Error(),
				"tool":    normalizedToolName,
			}, err)
		}
		return err
	}

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		if parsed.jsonOutput {
			return emitJSONAndExit(stdout, map[string]any{
				"error":  "HTTPError",
				"status": response.StatusCode,
				"tool":   normalizedToolName,
				"body":   decodeResponseBody(body),
			}, fmt.Errorf("%d %s", response.StatusCode, strings.TrimSpace(string(body))))
		}
		return fmt.Errorf("%d %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	if len(body) == 0 {
		if parsed.jsonOutput {
			return emitJSON(stdout, nil)
		}
		return nil
	}

	var decoded any
	if err := json.Unmarshal(body, &decoded); err != nil {
		if parsed.jsonOutput {
			return emitJSON(stdout, map[string]any{"raw": string(body)})
		}
		_, _ = fmt.Fprintln(stdout, string(body))
		return nil
	}

	if parsed.jsonOutput {
		return emitJSON(stdout, decoded)
	}
	pretty, err := json.MarshalIndent(decoded, "", "  ")
	if err != nil {
		return err
	}
	_, _ = fmt.Fprintln(stdout, string(pretty))
	return nil
}

func resolveLatestAPISession(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, *localsessions.Registry, auth.SessionMetadata, error) {
	commandCfg, err := resolveCommandConfig(global, "", "api", cwd, envLookup)
	if err != nil {
		return config.Config{}, nil, auth.SessionMetadata{}, err
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(commandCfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		return config.Config{}, nil, auth.SessionMetadata{}, err
	}
	sessions, err := registry.LoadSessions()
	if err != nil {
		return config.Config{}, nil, auth.SessionMetadata{}, err
	}
	sessions = filterSessionsForWorkspace(sessions, commandCfg.Paths.WorkspaceRoot)
	sessions = filterSessionsByDefaultMode(sessions, "api", false, "")
	sessions = localsessions.FilterActiveSessions(sessions)
	if len(sessions) == 0 {
		return config.Config{}, nil, auth.SessionMetadata{}, fmt.Errorf("no matching Setta sessions found")
	}
	selected, err := selectSession(sessions, "", true)
	if err != nil {
		return config.Config{}, nil, auth.SessionMetadata{}, err
	}
	return commandCfg, registry, selected, nil
}

func normalizeToolName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", fmt.Errorf("tool name must be a non-empty string")
	}
	if strings.Contains(name, "/") {
		return "", fmt.Errorf("tool name must be a bare MCP tool name")
	}
	if strings.Contains(name, mcpx.ToolNameSeparator) {
		return "", fmt.Errorf("tool name must be a bare MCP tool name")
	}
	if httpapi.IsBareRouteName(name) {
		return "", fmt.Errorf("tool name must be a bare MCP tool name")
	}
	return name, nil
}

func loadJSONPayload(jsonPayload string, payloadStdin bool, payloadFile string, stdin io.Reader) (any, error) {
	sources := 0
	if strings.TrimSpace(jsonPayload) != "" {
		sources++
	}
	if payloadStdin {
		sources++
	}
	if strings.TrimSpace(payloadFile) != "" {
		sources++
	}
	if sources > 1 {
		return nil, fmt.Errorf("use only one of --json, --stdin, or --file")
	}

	raw := ""
	switch {
	case strings.TrimSpace(jsonPayload) != "":
		raw = strings.TrimSpace(jsonPayload)
	case payloadStdin:
		read, err := io.ReadAll(stdin)
		if err != nil {
			return nil, err
		}
		raw = strings.TrimSpace(string(read))
	case strings.TrimSpace(payloadFile) != "":
		read, err := os.ReadFile(payloadFile)
		if err != nil {
			return nil, err
		}
		raw = strings.TrimSpace(string(read))
	default:
		return nil, nil
	}
	if raw == "" {
		return nil, nil
	}
	return loadJSONValue(raw, "payload")
}

func loadAuthPayload(authJSONPath string, authStdin bool, stdin io.Reader) (map[string]any, error) {
	if strings.TrimSpace(authJSONPath) == "" && !authStdin {
		return nil, nil
	}
	if strings.TrimSpace(authJSONPath) != "" && authStdin {
		return nil, fmt.Errorf("use only one of --auth-json or --auth-stdin")
	}

	raw := ""
	if strings.TrimSpace(authJSONPath) != "" {
		read, err := os.ReadFile(authJSONPath)
		if err != nil {
			return nil, err
		}
		raw = strings.TrimSpace(string(read))
	} else {
		read, err := io.ReadAll(stdin)
		if err != nil {
			return nil, err
		}
		raw = strings.TrimSpace(string(read))
	}
	if raw == "" {
		return nil, fmt.Errorf("auth JSON input was empty")
	}

	payload, err := loadJSONValue(raw, "auth")
	if err != nil {
		return nil, err
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("auth JSON must be an object")
	}
	return object, nil
}

func loadJSONValue(raw string, label string) (any, error) {
	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, fmt.Errorf("invalid %s JSON: %w", label, err)
	}
	return payload, nil
}

func stripCookieHeaderPrefix(value string) string {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(strings.ToLower(trimmed), "cookie:") {
		return strings.TrimSpace(strings.SplitN(trimmed, ":", 2)[1])
	}
	return trimmed
}

func cookieHeaderFromAuthPayload(payload map[string]any) (string, error) {
	if header, ok := payload["cookieHeader"].(string); ok && strings.TrimSpace(header) != "" {
		return stripCookieHeaderPrefix(header), nil
	}
	if cookie, ok := payload["cookie"].(string); ok && strings.TrimSpace(cookie) != "" {
		cookieValue := stripCookieHeaderPrefix(cookie)
		if strings.Contains(cookieValue, "=") {
			return cookieValue, nil
		}
		cookieName, ok := payload["cookieName"].(string)
		if !ok || strings.TrimSpace(cookieName) == "" {
			return "", fmt.Errorf("auth JSON missing cookieName for raw cookie values")
		}
		return strings.TrimSpace(cookieName) + "=" + cookieValue, nil
	}
	return "", fmt.Errorf("auth JSON missing cookieHeader/cookie fields")
}

func baseURLFromAuthPayload(payload map[string]any) (string, error) {
	if baseURL, ok := payload["baseUrl"].(string); ok && strings.TrimSpace(baseURL) != "" {
		return normalizeBaseURL(baseURL)
	}
	if apiBaseURL, ok := payload["apiBaseUrl"].(string); ok && strings.TrimSpace(apiBaseURL) != "" {
		return normalizeBaseURL(apiBaseURL)
	}
	return "", nil
}

func buildToolCallURL(baseURL string) (string, error) {
	normalizedBaseURL, err := normalizeBaseURL(baseURL)
	if err != nil {
		return "", err
	}
	return normalizedBaseURL + httpapi.RouteMCPToolCall, nil
}

func decodeResponseBody(body []byte) any {
	if len(body) == 0 {
		return nil
	}
	var decoded any
	if err := json.Unmarshal(body, &decoded); err != nil {
		return string(body)
	}
	return decoded
}

func apiInputError(stdout io.Writer, jsonOutput bool, toolName string, err error) error {
	if !jsonOutput {
		return err
	}

	payload := map[string]any{
		"error":   "InputError",
		"message": err.Error(),
	}
	if strings.TrimSpace(toolName) != "" {
		payload["tool"] = strings.TrimSpace(toolName)
	}
	return emitJSONAndExit(stdout, payload, err)
}

func emitJSONAndExit(stdout io.Writer, payload any, err error) error {
	if emitErr := emitJSON(stdout, payload); emitErr != nil {
		return emitErr
	}
	return &ExitError{
		Code:   1,
		Err:    err,
		Silent: true,
	}
}
