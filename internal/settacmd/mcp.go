package settacmd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/mcpx"
)

const (
	defaultMCPBridgeBackendURL  = "http://127.0.0.1:8000/mcp"
	mcpBridgeMissingAuthMessage = "Missing MCP auth. Provide --token/--bootstrap-url or set SETTA_SESSION_ID (and SETTA_SESSIONS_ROOT if running outside the session workspace)."
)

type mcpBridgeFlags struct {
	backend        string
	verbose        bool
	bootstrapToken string
	bootstrapURL   string
}

func runMCP(
	args []string,
	global globalFlags,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	envLookup func(string) (string, bool),
	now func() time.Time,
	cwd string,
) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return runMCPBridge(args, global, stdin, stdout, stderr, envLookup, now, cwd)
	}
	if args[0] == "-h" || args[0] == "--help" {
		return writeMCPUsage(stdout)
	}

	switch args[0] {
	case "bridge":
		return runMCPBridge(args[1:], global, stdin, stdout, stderr, envLookup, now, cwd)
	default:
		err := fmt.Errorf("unknown mcp subcommand %q", args[0])
		if writeErr := writeUsageError(stderr, err.Error(), writeMCPUsage); writeErr != nil {
			return writeErr
		}
		return &ExitError{Code: 2, Err: err, Silent: true}
	}
}

func runMCPBridge(
	args []string,
	global globalFlags,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	envLookup func(string) (string, bool),
	now func() time.Time,
	cwd string,
) error {
	flags := flag.NewFlagSet("mcp", flag.ContinueOnError)
	flags.SetOutput(io.Discard)

	var parsed mcpBridgeFlags
	flags.StringVar(&parsed.backend, "backend", defaultMCPBridgeBackendURL, "Full URL to the Setta MCP endpoint.")
	flags.BoolVar(&parsed.verbose, "verbose", false, "Enable bridge debug logging on stderr.")
	flags.StringVar(&parsed.bootstrapToken, "token", "", "Bootstrap token for MCP authentication.")
	flags.StringVar(&parsed.bootstrapURL, "bootstrap-url", "", "Bootstrap URL containing a token fragment or query parameter.")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return writeMCPUsage(stdout)
		}
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("mcp bridge does not accept positional arguments")
	}

	headers, err := resolveMCPBridgeHeaders(parsed, global, envLookup, now, cwd)
	if err != nil {
		return err
	}

	return mcpx.RunStdioBridge(context.Background(), mcpx.StdioBridgeConfig{
		BackendURL:  parsed.backend,
		HTTPHeaders: headers,
		Stdin:       asReadCloser(stdin),
		Stdout:      asWriteCloser(stdout),
		Logger:      newMCPBridgeLogger(stderr, parsed.verbose),
	})
}

func resolveMCPBridgeHeaders(
	parsed mcpBridgeFlags,
	global globalFlags,
	envLookup func(string) (string, bool),
	now func() time.Time,
	cwd string,
) (http.Header, error) {
	token := strings.TrimSpace(parsed.bootstrapToken)
	if token == "" && strings.TrimSpace(parsed.bootstrapURL) != "" {
		parsedToken, err := extractBootstrapToken(parsed.bootstrapURL)
		if err != nil {
			return nil, err
		}
		token = parsedToken
	}
	if token != "" {
		return consumeMCPBridgeBootstrapToken(parsed.backend, token)
	}
	return resolveCurrentSessionMCPBridgeHeaders(global, envLookup, now, cwd)
}

func consumeMCPBridgeBootstrapToken(backendURL string, token string) (http.Header, error) {
	origin, err := originFromBackendURL(backendURL)
	if err != nil {
		return nil, err
	}

	requestBody, err := json.Marshal(map[string]string{"token": strings.TrimSpace(token)})
	if err != nil {
		return nil, fmt.Errorf("marshal bootstrap consume request: %w", err)
	}

	request, err := http.NewRequest(http.MethodPost, origin+"/__setta__/bootstrap/consume", bytes.NewReader(requestBody))
	if err != nil {
		return nil, fmt.Errorf("build bootstrap consume request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := (&http.Client{Timeout: 5 * time.Second}).Do(request)
	if err != nil {
		return nil, fmt.Errorf("consume bootstrap token: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		trimmedBody := strings.TrimSpace(string(responseBody))
		if trimmedBody != "" {
			return nil, fmt.Errorf("bootstrap consume failed: %s: %s", response.Status, trimmedBody)
		}
		return nil, fmt.Errorf("bootstrap consume failed: %s", response.Status)
	}

	selectedCookie, err := selectMCPBridgeAuthCookie(response.Cookies())
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Cookie", selectedCookie.Name+"="+selectedCookie.Value)
	return headers, nil
}

func selectMCPBridgeAuthCookie(cookies []*http.Cookie) (*http.Cookie, error) {
	usable := make([]*http.Cookie, 0, len(cookies))
	for _, cookie := range cookies {
		if cookie == nil || strings.TrimSpace(cookie.Name) == "" || strings.TrimSpace(cookie.Value) == "" {
			continue
		}
		usable = append(usable, cookie)
	}
	if len(usable) == 0 {
		return nil, fmt.Errorf("bootstrap response did not include auth cookie")
	}

	expectedPrefix := auth.NormalizeCookieBaseName(auth.DefaultAuthCookieName) + "_"
	var matched *http.Cookie
	for _, cookie := range usable {
		if strings.HasPrefix(cookie.Name, expectedPrefix) {
			if matched != nil {
				return nil, fmt.Errorf("bootstrap response included multiple possible auth cookies")
			}
			matched = cookie
		}
	}
	if matched != nil {
		return matched, nil
	}
	if len(usable) == 1 && auth.NormalizeCookieBaseName(usable[0].Name) == auth.NormalizeCookieBaseName(auth.DefaultAuthCookieName) {
		return nil, fmt.Errorf("bootstrap response included only base auth cookie without session suffix")
	}
	return nil, fmt.Errorf("bootstrap response did not include a unique session-scoped auth cookie")
}

func resolveCurrentSessionMCPBridgeHeaders(
	global globalFlags,
	envLookup func(string) (string, bool),
	now func() time.Time,
	cwd string,
) (http.Header, error) {
	currentSession, cookieBaseName, err := loadMCPBridgeCurrentSession(global, envLookup, cwd)
	if err != nil {
		return nil, err
	}
	if currentSession == nil {
		return nil, fmt.Errorf("%s", mcpBridgeMissingAuthMessage)
	}

	cookieName, err := auth.CookieName(cookieBaseName, currentSession.Metadata.ID)
	if err != nil {
		return nil, err
	}
	cookieValue, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(
		currentSession.Metadata.ID,
		currentSession.Secret,
		now(),
	)
	if err != nil {
		return nil, err
	}

	headers := http.Header{}
	headers.Set("Cookie", cookieName+"="+cookieValue)
	return headers, nil
}

func loadMCPBridgeCurrentSession(
	global globalFlags,
	envLookup func(string) (string, bool),
	cwd string,
) (*auth.CurrentSession, string, error) {
	if sessionID := lookupTrimmedEnv(envLookup, "SETTA_SESSION_ID"); sessionID == "" {
		return nil, "", nil
	}

	sessionsRoot := lookupTrimmedEnv(envLookup, "SETTA_SESSIONS_ROOT")
	if sessionsRoot != "" {
		currentSession, err := auth.LoadCurrentSession(auth.LoadCurrentSessionOptions{
			EnvLookup: envLookup,
		})
		if err != nil {
			return nil, "", err
		}
		if currentSession == nil {
			return nil, "", nil
		}
		cookieBaseName, err := loadMCPBridgeCookieBaseNameFromSession(currentSession, envLookup)
		if err != nil {
			return nil, "", err
		}
		return currentSession, cookieBaseName, nil
	}

	commandCfg, err := resolveMCPCommandConfig(global, cwd, envLookup)
	if err != nil {
		return nil, "", fmt.Errorf("resolve current Setta session: %w (set SETTA_SESSIONS_ROOT if running outside the session workspace)", err)
	}
	currentSession, err := auth.LoadCurrentSession(auth.LoadCurrentSessionOptions{
		RuntimeRoot: commandCfg.Paths.RuntimeRoot,
		EnvLookup:   envLookup,
	})
	if err != nil {
		return nil, "", err
	}
	if currentSession == nil {
		return nil, "", nil
	}
	return currentSession, commandCfg.Paths.AuthCookieName, nil
}

func loadMCPBridgeCookieBaseNameFromSession(
	currentSession *auth.CurrentSession,
	envLookup func(string) (string, bool),
) (string, error) {
	if currentSession == nil {
		return "", fmt.Errorf("current session is required")
	}
	resolvedCfg, err := config.Load(config.LoadOptions{
		CWD: currentSession.Metadata.WorkspacePath,
		CLI: config.CLIOptions{
			WorkspaceRoot:     currentSession.Metadata.WorkspacePath,
			SettaHome:         currentSession.Metadata.SettaHome,
			ProfileLookupHome: currentSession.Metadata.SettaHome,
			RuntimeRoot:       currentSession.Metadata.RuntimeRoot,
			Profile:           currentSession.Metadata.Profile,
			Mode:              string(config.ModeIDE),
		},
		EnvLookup: envLookup,
	})
	if err != nil {
		return "", fmt.Errorf("resolve auth cookie name for current session: %w", err)
	}
	return resolvedCfg.Paths.AuthCookieName, nil
}

func resolveMCPCommandConfig(
	global globalFlags,
	cwd string,
	envLookup func(string) (string, bool),
) (config.Config, error) {
	return config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      strings.TrimSpace(global.workspaceRoot),
			SettaHome:          strings.TrimSpace(global.settaHome),
			ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			Profile:            strings.TrimSpace(global.profile),
		},
	})
}

func originFromBackendURL(backendURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(backendURL))
	if err != nil {
		return "", fmt.Errorf("invalid backend URL: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("invalid backend URL: %s", backendURL)
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func extractBootstrapToken(bootstrapURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(bootstrapURL))
	if err != nil {
		return "", fmt.Errorf("invalid bootstrap URL: %w", err)
	}

	for _, rawValues := range []string{parsed.Fragment, parsed.RawQuery} {
		if rawValues == "" {
			continue
		}
		values, err := url.ParseQuery(rawValues)
		if err != nil {
			continue
		}
		token := strings.TrimSpace(values.Get("token"))
		if token != "" {
			return token, nil
		}
	}
	return "", fmt.Errorf("bootstrap URL missing token parameter")
}

func newMCPBridgeLogger(w io.Writer, verbose bool) *slog.Logger {
	if !verbose {
		return slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

func lookupTrimmedEnv(envLookup func(string) (string, bool), key string) string {
	if envLookup == nil {
		return ""
	}
	value, ok := envLookup(key)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func asReadCloser(reader io.Reader) io.ReadCloser {
	if readCloser, ok := reader.(io.ReadCloser); ok {
		return readCloser
	}
	return nopReadCloser{Reader: reader}
}

func asWriteCloser(writer io.Writer) io.WriteCloser {
	if writeCloser, ok := writer.(io.WriteCloser); ok {
		return writeCloser
	}
	return nopWriteCloser{Writer: writer}
}

type nopReadCloser struct {
	io.Reader
}

func (nopReadCloser) Close() error {
	return nil
}

type nopWriteCloser struct {
	io.Writer
}

func (nopWriteCloser) Close() error {
	return nil
}
