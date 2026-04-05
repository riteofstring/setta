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

type apiInvocation struct {
	toolName string
	flags    apiFlags
}

type apiRequestTarget struct {
	baseURL     string
	cookieValue string
}

type apiSessionResolver struct {
	global    globalFlags
	cwd       string
	envLookup func(string) (string, bool)

	resolved   bool
	commandCfg config.Config
	registry   *localsessions.Registry
	session    auth.SessionMetadata
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
	invocation, err := parseAPIInvocation(args, stderr)
	if err != nil {
		return err
	}
	if invocation.flags.authStdin && invocation.flags.payloadStdin {
		return apiInputError(stdout, invocation.flags.jsonOutput, "", fmt.Errorf("use --auth-stdin or --stdin, not both"))
	}

	normalizedToolName, err := normalizeToolName(invocation.toolName)
	if err != nil {
		return apiInputError(stdout, invocation.flags.jsonOutput, strings.TrimSpace(invocation.toolName), err)
	}

	arguments, err := loadAPIArguments(invocation.flags, stdin)
	if err != nil {
		return apiInputError(stdout, invocation.flags.jsonOutput, normalizedToolName, err)
	}

	authPayload, err := loadAuthPayload(invocation.flags.authJSONPath, invocation.flags.authStdin, stdin)
	if err != nil {
		return apiInputError(stdout, invocation.flags.jsonOutput, normalizedToolName, err)
	}

	if err := ensureKnownAPITool(stdout, normalizedToolName, hasExplicitAPIAuth(invocation.flags), invocation.flags.jsonOutput); err != nil {
		return err
	}

	target, err := resolveAPIRequestTarget(invocation.flags, authPayload, global, now, cwd, envLookup)
	if err != nil {
		return apiInputError(stdout, invocation.flags.jsonOutput, normalizedToolName, err)
	}

	request, err := buildAPIToolRequest(normalizedToolName, arguments, invocation.flags, target)
	if err != nil {
		return err
	}

	statusCode, body, err := doAPIToolRequest(request, invocation.flags.timeoutSeconds)
	return emitAPIToolResult(stdout, invocation.flags.jsonOutput, normalizedToolName, statusCode, body, err)
}

func parseAPIInvocation(args []string, stderr io.Writer) (apiInvocation, error) {
	invocation := apiInvocation{}
	flagArgs := args
	if len(args) > 0 && !strings.HasPrefix(strings.TrimSpace(args[0]), "-") {
		invocation.toolName = strings.TrimSpace(args[0])
		flagArgs = args[1:]
	}

	flags := flag.NewFlagSet("api", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&invocation.flags.jsonPayload, "json", "", "Inline JSON arguments.")
	flags.BoolVar(&invocation.flags.payloadStdin, "stdin", false, "Read JSON arguments from stdin.")
	flags.StringVar(&invocation.flags.payloadFile, "file", "", "Read JSON arguments from a file.")
	flags.BoolVar(&invocation.flags.jsonOutput, "json-output", false, "Emit JSON only on stdout.")
	flags.StringVar(&invocation.flags.cookieHeader, "cookie-header", "", "Explicit Cookie header value.")
	flags.StringVar(&invocation.flags.cookie, "cookie", "", "Explicit cookie value.")
	flags.StringVar(&invocation.flags.authJSONPath, "auth-json", "", "Auth JSON file from `setta auth --json`.")
	flags.BoolVar(&invocation.flags.authStdin, "auth-stdin", false, "Read auth JSON from stdin.")
	flags.Float64Var(&invocation.flags.timeoutSeconds, "timeout", 30.0, "Request timeout in seconds (0 disables).")
	flags.StringVar(&invocation.flags.baseURL, "base-url", "", "Override backend base URL.")
	flags.StringVar(&invocation.flags.agenticProjectConfigID, "agentic-project-config-id", "", "Set x-setta-project-config-id for scoped tool calls.")
	flags.StringVar(&invocation.flags.agenticChatID, "agentic-chat-id", "", "Set x-setta-chat-id for scoped tool calls.")
	flags.StringVar(&invocation.flags.agenticSectionID, "agentic-section-id", "", "Set x-setta-section-id for scoped tool calls.")
	if err := flags.Parse(flagArgs); err != nil {
		return apiInvocation{}, err
	}

	remaining := flags.Args()
	switch {
	case invocation.toolName == "" && len(remaining) == 1:
		invocation.toolName = strings.TrimSpace(remaining[0])
	case invocation.toolName == "" && len(remaining) != 1:
		return apiInvocation{}, fmt.Errorf("api requires exactly one tool name argument")
	case invocation.toolName != "" && len(remaining) != 0:
		return apiInvocation{}, fmt.Errorf("api accepts flags either before or after a single tool name, not additional positional arguments")
	}
	return invocation, nil
}

func loadAPIArguments(parsed apiFlags, stdin io.Reader) (map[string]any, error) {
	payload, err := loadJSONPayload(parsed.jsonPayload, parsed.payloadStdin, parsed.payloadFile, stdin)
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return map[string]any{}, nil
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("tool arguments must be a JSON object")
	}
	return object, nil
}

func hasExplicitAPIAuth(parsed apiFlags) bool {
	return strings.TrimSpace(parsed.authJSONPath) != "" || parsed.authStdin || strings.TrimSpace(parsed.cookieHeader) != "" || strings.TrimSpace(parsed.cookie) != ""
}

func ensureKnownAPITool(stdout io.Writer, toolName string, hasExplicitAuth bool, jsonOutput bool) error {
	toolPayloads, err := mcpx.BuildToolPayloads()
	if err != nil {
		return err
	}
	for _, payload := range toolPayloads {
		if payload.Name == toolName {
			return nil
		}
	}
	if !hasExplicitAuth {
		return apiInputError(stdout, jsonOutput, toolName, fmt.Errorf("%s", missingAuthMessage))
	}
	if jsonOutput {
		return emitJSONAndExit(stdout, map[string]any{
			"error": "UnknownTool",
			"tool":  toolName,
		}, fmt.Errorf("unknown tool: %s", toolName))
	}
	return fmt.Errorf("unknown tool: %s", toolName)
}

func resolveAPIRequestTarget(parsed apiFlags, authPayload map[string]any, global globalFlags, now func() time.Time, cwd string, envLookup func(string) (string, bool)) (apiRequestTarget, error) {
	resolver := &apiSessionResolver{
		global:    global,
		cwd:       cwd,
		envLookup: envLookup,
	}
	target := apiRequestTarget{}

	if strings.TrimSpace(parsed.baseURL) != "" {
		baseURL, err := normalizeBaseURL(parsed.baseURL)
		if err != nil {
			return apiRequestTarget{}, err
		}
		target.baseURL = baseURL
	}

	switch {
	case strings.TrimSpace(parsed.cookieHeader) != "" || strings.TrimSpace(parsed.cookie) != "":
		cookieValue, err := explicitAPICookieValue(parsed)
		if err != nil {
			return apiRequestTarget{}, err
		}
		target.cookieValue = cookieValue
		if target.baseURL == "" {
			baseURL, err := resolver.baseURL()
			if err != nil {
				return apiRequestTarget{}, err
			}
			target.baseURL = baseURL
		}
	case authPayload != nil:
		cookieValue, err := cookieHeaderFromAuthPayload(authPayload)
		if err != nil {
			return apiRequestTarget{}, err
		}
		target.cookieValue = cookieValue
		if target.baseURL == "" {
			baseURL, err := baseURLFromAuthPayload(authPayload)
			if err != nil {
				return apiRequestTarget{}, err
			}
			if baseURL == "" {
				baseURL, err = resolver.baseURL()
				if err != nil {
					return apiRequestTarget{}, err
				}
			}
			target.baseURL = baseURL
		}
	default:
		cookieValue, err := resolver.cookieValue(now)
		if err != nil {
			return apiRequestTarget{}, err
		}
		target.cookieValue = cookieValue
		if target.baseURL == "" {
			baseURL, err := resolver.baseURL()
			if err != nil {
				return apiRequestTarget{}, err
			}
			target.baseURL = baseURL
		}
	}

	if target.baseURL == "" {
		return apiRequestTarget{}, fmt.Errorf("missing base URL. Use --base-url or --auth-json")
	}
	if strings.TrimSpace(target.cookieValue) == "" {
		return apiRequestTarget{}, fmt.Errorf("missing auth cookie")
	}
	return target, nil
}

func explicitAPICookieValue(parsed apiFlags) (string, error) {
	if strings.TrimSpace(parsed.cookieHeader) != "" {
		return stripCookieHeaderPrefix(parsed.cookieHeader), nil
	}
	cookieValue := stripCookieHeaderPrefix(parsed.cookie)
	if !strings.Contains(cookieValue, "=") {
		return "", fmt.Errorf("cookie must be provided in name=value form")
	}
	return cookieValue, nil
}

func buildAPIToolRequest(toolName string, arguments map[string]any, parsed apiFlags, target apiRequestTarget) (*http.Request, error) {
	requestURL, err := buildToolCallURL(target.baseURL)
	if err != nil {
		return nil, err
	}
	requestBody, err := json.Marshal(map[string]any{
		"tool":      toolName,
		"arguments": arguments,
	})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(requestBody))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Cookie", target.cookieValue)
	applyAPIAgenticContextHeaders(request.Header, parsed)
	return request, nil
}

func applyAPIAgenticContextHeaders(header http.Header, parsed apiFlags) {
	projectConfigID := strings.TrimSpace(parsed.agenticProjectConfigID)
	if projectConfigID == "" {
		return
	}
	header.Set(mcpx.AgenticContextProjectConfigIDHeader, projectConfigID)
	if chatID := strings.TrimSpace(parsed.agenticChatID); chatID != "" {
		header.Set(mcpx.AgenticContextChatIDHeader, chatID)
	}
	if sectionID := strings.TrimSpace(parsed.agenticSectionID); sectionID != "" {
		header.Set(mcpx.AgenticContextSectionIDHeader, sectionID)
	}
}

func doAPIToolRequest(request *http.Request, timeoutSeconds float64) (int, []byte, error) {
	timeout := time.Duration(0)
	if timeoutSeconds > 0 {
		timeout = time.Duration(timeoutSeconds * float64(time.Second))
	}
	client := &http.Client{Timeout: timeout}
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return response.StatusCode, nil, err
	}
	return response.StatusCode, body, nil
}

func emitAPIToolResult(stdout io.Writer, jsonOutput bool, toolName string, statusCode int, body []byte, requestErr error) error {
	if requestErr != nil {
		if jsonOutput {
			return emitJSONAndExit(stdout, map[string]any{
				"error":   "RequestError",
				"message": requestErr.Error(),
				"tool":    toolName,
			}, requestErr)
		}
		return requestErr
	}
	if statusCode < http.StatusOK || statusCode >= http.StatusMultipleChoices {
		err := fmt.Errorf("%d %s", statusCode, strings.TrimSpace(string(body)))
		if jsonOutput {
			return emitJSONAndExit(stdout, map[string]any{
				"error":  "HTTPError",
				"status": statusCode,
				"tool":   toolName,
				"body":   decodeResponseBody(body),
			}, err)
		}
		return err
	}
	if len(body) == 0 {
		if jsonOutput {
			return emitJSON(stdout, nil)
		}
		return nil
	}
	var decoded any
	if err := json.Unmarshal(body, &decoded); err != nil {
		if jsonOutput {
			return emitJSON(stdout, map[string]any{"raw": string(body)})
		}
		_, _ = fmt.Fprintln(stdout, string(body))
		return nil
	}
	if jsonOutput {
		return emitJSON(stdout, decoded)
	}
	pretty, err := json.MarshalIndent(decoded, "", "  ")
	if err != nil {
		return err
	}
	_, _ = fmt.Fprintln(stdout, string(pretty))
	return nil
}

func (resolver *apiSessionResolver) resolve() error {
	if resolver.resolved {
		return nil
	}
	commandCfg, registry, session, err := resolveLatestAPISession(resolver.global, resolver.cwd, resolver.envLookup)
	if err != nil {
		return err
	}
	resolver.commandCfg = commandCfg
	resolver.registry = registry
	resolver.session = session
	resolver.resolved = true
	return nil
}

func (resolver *apiSessionResolver) baseURL() (string, error) {
	if err := resolver.resolve(); err != nil {
		return "", err
	}
	return baseURLFromSession(resolver.session), nil
}

func (resolver *apiSessionResolver) cookieValue(now func() time.Time) (string, error) {
	if err := resolver.resolve(); err != nil {
		return "", err
	}
	secret, err := resolver.registry.LoadSecret(resolver.session)
	if err != nil {
		return "", fmt.Errorf("secret file missing for session %s", resolver.session.ID)
	}
	cookieName, err := auth.CookieName(resolver.commandCfg.Paths.AuthCookieName, resolver.session.ID)
	if err != nil {
		return "", err
	}
	cookieToken, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(resolver.session.ID, secret, now())
	if err != nil {
		return "", err
	}
	return cookieName + "=" + cookieToken, nil
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
