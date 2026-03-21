package settacli

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/localsessions"
	"setta/internal/statefs"
)

const (
	connectInfoJSONPrefix = "__SETTA_JSON_B64__"
	defaultLocalPort      = 61000
	apiPrefix             = "/api"
)

type RunOptions struct {
	Stdout    io.Writer
	Stderr    io.Writer
	Stdin     io.Reader
	EnvLookup func(string) (string, bool)
	Now       func() time.Time
	CWD       string
}

type ExitError struct {
	Code   int
	Err    error
	Silent bool
}

func (e *ExitError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return fmt.Sprintf("exit %d", e.Code)
}

func ExitCode(err error) int {
	var exitErr *ExitError
	if errors.As(err, &exitErr) && exitErr.Code > 0 {
		return exitErr.Code
	}
	return 1
}

func ShouldPrintError(err error) bool {
	var exitErr *ExitError
	if errors.As(err, &exitErr) {
		return !exitErr.Silent && exitErr.Err != nil
	}
	return err != nil
}

func DisplayError(err error) string {
	var exitErr *ExitError
	if errors.As(err, &exitErr) && exitErr.Err != nil {
		return exitErr.Err.Error()
	}
	if err == nil {
		return ""
	}
	return err.Error()
}

type globalFlags struct {
	workspaceRoot      string
	settaHome          string
	profileLookupHome  string
	settaFilesRoot     string
	settaFilesLocation string
	runtimeRoot        string
	profile            string
}

type statusFlags struct {
	connectInfo    bool
	deleteSession  string
	listSessions   bool
	jsonOutput     bool
	workspaceRoot  string
	sessionID      string
	latest         bool
	serverMode     string
	launcherOrigin string
}

type authFlags struct {
	jsonOutput    bool
	workspaceRoot string
	sessionID     string
	latest        bool
	baseURL       string
}

type sessionJSON struct {
	ID                     string    `json:"id"`
	WorkspacePath          string    `json:"workspacePath"`
	WorkspacePathCanonical string    `json:"workspacePathCanonical"`
	Host                   string    `json:"host"`
	Port                   int       `json:"port"`
	PID                    int       `json:"pid"`
	StartedAt              time.Time `json:"startedAt"`
	ServerMode             string    `json:"serverMode"`
}

type statusConnectInfoJSON struct {
	Session              sessionJSON `json:"session"`
	BootstrapURLFragment string      `json:"bootstrapUrlFragment"`
	BootstrapURLPlain    string      `json:"bootstrapUrlPlain"`
	SSHTunnelCommand     string      `json:"sshTunnelCommand"`
	LauncherOrigin       string      `json:"launcherOrigin,omitempty"`
	LauncherOriginProof  string      `json:"launcherOriginProof,omitempty"`
	SettaFilesLocation   string      `json:"settaFilesLocation,omitempty"`
	SettaFilesRoot       string      `json:"settaFilesRoot,omitempty"`
	RuntimeRoot          string      `json:"runtimeRoot,omitempty"`
	SettaHome            string      `json:"settaHome,omitempty"`
	Profile              string      `json:"profile,omitempty"`
}

type statusListJSON struct {
	Sessions []sessionJSON `json:"sessions"`
}

type authJSON struct {
	BaseURL              string      `json:"baseUrl"`
	APIBaseURL           string      `json:"apiBaseUrl"`
	CookieHeader         string      `json:"cookieHeader"`
	Cookie               string      `json:"cookie"`
	CookieName           string      `json:"cookieName"`
	Session              sessionJSON `json:"session"`
	BootstrapURLFragment string      `json:"bootstrapUrlFragment"`
	BootstrapURLPlain    string      `json:"bootstrapUrlPlain"`
	Source               string      `json:"source"`
}

func Run(args []string, options RunOptions) error {
	stdout := options.Stdout
	if stdout == nil {
		stdout = io.Discard
	}
	stderr := options.Stderr
	if stderr == nil {
		stderr = io.Discard
	}
	stdin := options.Stdin
	if stdin == nil {
		stdin = os.Stdin
	}
	envLookup := options.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	cwd := options.CWD
	if strings.TrimSpace(cwd) == "" {
		resolvedCWD, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("resolve cwd: %w", err)
		}
		cwd = resolvedCWD
	}

	global, remaining, err := parseGlobalFlags(args, stderr)
	if err != nil {
		return err
	}
	if len(remaining) == 0 {
		return fmt.Errorf("missing command (supported: status, auth, tools, api, stop, connect)")
	}

	switch remaining[0] {
	case "status":
		return runStatus(remaining[1:], global, stdout, stderr, envLookup, now, cwd)
	case "auth":
		return runAuth(remaining[1:], global, stdout, stderr, envLookup, now, cwd)
	case "tools":
		return runTools(remaining[1:], stdout, stderr)
	case "api":
		return runAPI(remaining[1:], global, stdout, stderr, stdin, envLookup, now, cwd)
	case "stop":
		return runStop(remaining[1:], global, stdout, stderr, envLookup, cwd)
	case "connect", "c":
		return runConnect(remaining[1:], global, stdout, stderr, stdin, envLookup, cwd)
	default:
		return fmt.Errorf("unknown command %q", remaining[0])
	}
}

func parseGlobalFlags(args []string, stderr io.Writer) (globalFlags, []string, error) {
	var parsed globalFlags
	flags := flag.NewFlagSet("setta-cli", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Workspace root.")
	flags.StringVar(&parsed.profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&parsed.settaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&parsed.profileLookupHome, "profile-lookup-home", "", "Setta profile lookup home.")
	flags.StringVar(&parsed.settaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&parsed.settaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&parsed.runtimeRoot, "runtime-root", "", "Runtime root.")
	if err := flags.Parse(args); err != nil {
		return globalFlags{}, nil, err
	}
	return parsed, flags.Args(), nil
}

func runStatus(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), now func() time.Time, cwd string) error {
	var parsed statusFlags
	flags := flag.NewFlagSet("status", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.BoolVar(&parsed.connectInfo, "connect-info", false, "Print session connection info.")
	flags.StringVar(&parsed.deleteSession, "delete-session", "", "Stop and remove the selected local session.")
	flags.BoolVar(&parsed.listSessions, "list-sessions", false, "List sessions.")
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON output.")
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Workspace root.")
	flags.StringVar(&parsed.sessionID, "session", "", "Session ID.")
	flags.BoolVar(&parsed.latest, "latest", false, "Select the latest session.")
	flags.StringVar(&parsed.serverMode, "server-mode", "", "Filter sessions by server mode: ide or launcher.")
	flags.StringVar(&parsed.launcherOrigin, "launcher-origin", "", "Optional launcher origin to bind and sign in connect-info JSON output.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(parsed.sessionID) != "" && parsed.latest {
		return fmt.Errorf("use either --session or --latest, not both")
	}
	if strings.TrimSpace(parsed.deleteSession) != "" {
		if parsed.connectInfo || parsed.listSessions || strings.TrimSpace(parsed.sessionID) != "" || parsed.latest {
			return fmt.Errorf("use --delete-session by itself")
		}
	}
	if !parsed.connectInfo && !parsed.listSessions {
		if strings.TrimSpace(parsed.deleteSession) != "" {
			commandCfg, err := resolveCommandConfig(global, parsed.workspaceRoot, "status", cwd, envLookup)
			if err != nil {
				return err
			}
			registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
				SessionsRoot: filepath.Join(commandCfg.Paths.RuntimeRoot, "sessions"),
			})
			if err != nil {
				return err
			}
			sessions, err := registry.LoadSessions()
			if err != nil {
				return err
			}
			sessions = filterSessionsForWorkspace(sessions, commandCfg.Paths.WorkspaceRoot)
			if parsed.serverMode != "" {
				if parsed.serverMode != "ide" && parsed.serverMode != "launcher" {
					return fmt.Errorf("invalid --server-mode %q", parsed.serverMode)
				}
				sessions = filterSessionsByDefaultMode(sessions, "status", false, strings.TrimSpace(parsed.serverMode))
			}
			selected, err := selectSession(sessions, parsed.deleteSession, false)
			if err != nil {
				return err
			}
			if localsessions.IsSessionActive(selected) {
				process, err := os.FindProcess(selected.PID)
				if err == nil && process != nil {
					_ = process.Kill()
				}
			}
			if err := registry.DeleteSession(selected.ID); err != nil {
				return err
			}
			_, _ = fmt.Fprintf(stdout, "Deleted session %s.\n", selected.ID)
			return nil
		}
		return fmt.Errorf("use --connect-info to print session details")
	}
	if parsed.listSessions && !parsed.jsonOutput {
		return fmt.Errorf("use --json with --list-sessions")
	}

	commandCfg, err := resolveCommandConfig(global, parsed.workspaceRoot, "status", cwd, envLookup)
	if err != nil {
		return err
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(commandCfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		return err
	}
	workspaceRoot := commandCfg.Paths.WorkspaceRoot
	allSessions, err := registry.LoadSessions()
	if err != nil {
		return err
	}
	sessions := filterSessionsForWorkspace(allSessions, workspaceRoot)
	if parsed.serverMode != "" {
		if parsed.serverMode != "ide" && parsed.serverMode != "launcher" {
			return fmt.Errorf("invalid --server-mode %q", parsed.serverMode)
		}
	}
	sessions = filterSessionsByDefaultMode(sessions, "status", parsed.connectInfo, strings.TrimSpace(parsed.serverMode))
	sessions = localsessions.FilterActiveSessions(sessions)
	if len(sessions) == 0 {
		return fmt.Errorf("no matching Setta sessions found")
	}

	if parsed.listSessions {
		response := statusListJSON{Sessions: make([]sessionJSON, 0, len(sessions))}
		for _, session := range sessions {
			response.Sessions = append(response.Sessions, sessionToJSON(session))
		}
		emitConnectInfoJSON(stdout, response)
		return nil
	}

	selected, err := selectSession(sessions, parsed.sessionID, parsed.latest)
	if err != nil {
		return err
	}
	secret, err := registry.LoadSecret(selected)
	if err != nil {
		return fmt.Errorf("secret file missing for session %s", selected.ID)
	}
	bootstrapToken, err := auth.NewBootstrapTokenManager(auth.DefaultBootstrapTokenTTL, auth.NewNonceTracker()).Mint(selected.ID, secret, now())
	if err != nil {
		return err
	}
	bootstrapURLFragment, err := launcher.BuildBootstrapURLFragment(selected.Host, selected.Port, bootstrapToken)
	if err != nil {
		return err
	}
	bootstrapURLPlain := strings.SplitN(bootstrapURLFragment, "#", 2)[0]

	normalizedLauncherOrigin := frontendorigins.NormalizeOrigin(parsed.launcherOrigin)
	if strings.TrimSpace(parsed.launcherOrigin) != "" && normalizedLauncherOrigin == "" {
		return fmt.Errorf("--launcher-origin must be an absolute http(s) origin")
	}
	launcherOriginProof := ""
	if normalizedLauncherOrigin != "" {
		launcherOriginProof = frontendorigins.MintLauncherOriginHandoffProof(selected.ID, normalizedLauncherOrigin, secret)
	}

	if parsed.jsonOutput {
		response := statusConnectInfoJSON{
			Session:              sessionToJSON(selected),
			BootstrapURLFragment: bootstrapURLFragment,
			BootstrapURLPlain:    bootstrapURLPlain,
			SSHTunnelCommand:     buildSSHTunnelCommand(selected.Host, selected.Port),
			LauncherOrigin:       normalizedLauncherOrigin,
			LauncherOriginProof:  launcherOriginProof,
			SettaFilesLocation:   strings.TrimSpace(selected.SettaFilesLocation),
			SettaFilesRoot:       strings.TrimSpace(selected.SettaFilesRoot),
			RuntimeRoot:          strings.TrimSpace(selected.RuntimeRoot),
			SettaHome:            strings.TrimSpace(selected.SettaHome),
			Profile:              strings.TrimSpace(selected.Profile),
		}
		emitConnectInfoJSON(stdout, response)
		return nil
	}

	_, _ = fmt.Fprintln(stdout, renderConnectInfoMessage(selected, bootstrapURLFragment, bootstrapURLPlain, bootstrapToken))
	return nil
}

func runAuth(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), now func() time.Time, cwd string) error {
	var parsed authFlags
	flags := flag.NewFlagSet("auth", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload only.")
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Workspace root.")
	flags.StringVar(&parsed.sessionID, "session", "", "Session ID.")
	flags.BoolVar(&parsed.latest, "latest", false, "Select the latest session.")
	flags.StringVar(&parsed.baseURL, "base-url", "", "Override the backend base URL.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(parsed.sessionID) != "" && parsed.latest {
		return fmt.Errorf("use either --session or --latest, not both")
	}

	commandCfg, err := resolveCommandConfig(global, parsed.workspaceRoot, "auth", cwd, envLookup)
	if err != nil {
		return err
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(commandCfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		return err
	}
	sessions, err := registry.LoadSessions()
	if err != nil {
		return err
	}
	sessions = filterSessionsForWorkspace(sessions, commandCfg.Paths.WorkspaceRoot)
	sessions = filterSessionsByDefaultMode(sessions, "auth", false, "")
	sessions = localsessions.FilterActiveSessions(sessions)
	if len(sessions) == 0 {
		return fmt.Errorf("no matching Setta sessions found")
	}
	selected, err := selectSession(sessions, parsed.sessionID, parsed.latest)
	if err != nil {
		return err
	}
	secret, err := registry.LoadSecret(selected)
	if err != nil {
		return fmt.Errorf("secret file missing for session %s", selected.ID)
	}

	baseURL := baseURLFromSession(selected)
	if strings.TrimSpace(parsed.baseURL) != "" {
		baseURL, err = normalizeBaseURL(parsed.baseURL)
		if err != nil {
			return err
		}
	}
	cookieName, err := auth.CookieName(commandCfg.Paths.AuthCookieName, selected.ID)
	if err != nil {
		return err
	}
	cookieValue, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(selected.ID, secret, now())
	if err != nil {
		return err
	}
	bootstrapToken, err := auth.NewBootstrapTokenManager(auth.DefaultBootstrapTokenTTL, auth.NewNonceTracker()).Mint(selected.ID, secret, now())
	if err != nil {
		return err
	}
	bootstrapURLFragment, bootstrapURLPlain, err := buildBootstrapURLsFromBase(baseURL, bootstrapToken)
	if err != nil {
		return err
	}
	response := authJSON{
		BaseURL:              baseURL,
		APIBaseURL:           baseURL + apiPrefix,
		CookieHeader:         "Cookie: " + cookieName + "=" + cookieValue,
		Cookie:               cookieName + "=" + cookieValue,
		CookieName:           cookieName,
		Session:              sessionToJSON(selected),
		BootstrapURLFragment: bootstrapURLFragment,
		BootstrapURLPlain:    bootstrapURLPlain,
		Source:               "bootstrap",
	}
	if parsed.jsonOutput {
		return emitJSON(stdout, response)
	}
	_, _ = fmt.Fprintf(stdout, "Base URL: %s\nAPI Base URL: %s\nCookie Header: %s\nBootstrap URL: %s\n", response.BaseURL, response.APIBaseURL, response.CookieHeader, response.BootstrapURLFragment)
	return nil
}

func resolveCommandConfig(global globalFlags, subcommandWorkspace string, command string, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
	globalWorkspace := strings.TrimSpace(global.workspaceRoot)
	commandWorkspace := strings.TrimSpace(subcommandWorkspace)
	finalWorkspace := globalWorkspace
	if commandWorkspace != "" {
		if finalWorkspace != "" {
			left, err := statefs.NormalizePath(finalWorkspace, "")
			if err != nil {
				return config.Config{}, err
			}
			right, err := statefs.NormalizePath(commandWorkspace, "")
			if err != nil {
				return config.Config{}, err
			}
			if left != right {
				return config.Config{}, fmt.Errorf("conflicting --workspace provided at both the global CLI level and the %s subcommand", command)
			}
		}
		finalWorkspace = commandWorkspace
	}

	return config.Load(config.LoadOptions{
		CWD: cwd,
		CLI: config.CLIOptions{
			WorkspaceRoot:      finalWorkspace,
			SettaHome:          global.settaHome,
			ProfileLookupHome:  global.profileLookupHome,
			SettaFilesRoot:     global.settaFilesRoot,
			SettaFilesLocation: global.settaFilesLocation,
			RuntimeRoot:        global.runtimeRoot,
			Profile:            global.profile,
		},
		EnvLookup: envLookup,
	})
}

func filterSessionsForWorkspace(sessions []auth.SessionMetadata, workspaceRoot string) []auth.SessionMetadata {
	resolvedWorkspaceRoot, err := statefs.NormalizePath(workspaceRoot, "")
	if err != nil {
		return []auth.SessionMetadata{}
	}
	filtered := make([]auth.SessionMetadata, 0, len(sessions))
	for _, session := range sessions {
		if strings.TrimSpace(session.WorkspacePathCanonical) == "" {
			continue
		}
		if !filepath.IsAbs(strings.TrimSpace(session.SecretPath)) {
			continue
		}
		resolvedSessionRoot, err := statefs.NormalizePath(session.WorkspacePathCanonical, "")
		if err != nil {
			continue
		}
		if resolvedSessionRoot != resolvedWorkspaceRoot {
			continue
		}
		filtered = append(filtered, session)
	}
	return filtered
}

func filterSessionsByDefaultMode(sessions []auth.SessionMetadata, command string, connectInfo bool, requestedMode string) []auth.SessionMetadata {
	mode := strings.TrimSpace(requestedMode)
	if mode == "" {
		switch {
		case command == "auth":
			mode = "ide"
		case command == "api":
			mode = "ide"
		case command == "status" && connectInfo:
			mode = "ide"
		}
	}
	if mode == "" {
		return sessions
	}
	filtered := make([]auth.SessionMetadata, 0, len(sessions))
	for _, session := range sessions {
		if session.ServerMode != mode {
			continue
		}
		filtered = append(filtered, session)
	}
	return filtered
}

func selectSession(sessions []auth.SessionMetadata, sessionID string, latest bool) (auth.SessionMetadata, error) {
	if trimmed := strings.TrimSpace(sessionID); trimmed != "" {
		for _, session := range sessions {
			if session.ID == trimmed {
				return session, nil
			}
		}
		return auth.SessionMetadata{}, fmt.Errorf("session %s not found", trimmed)
	}
	if latest {
		sorted := append([]auth.SessionMetadata(nil), sessions...)
		sort.Slice(sorted, func(i int, j int) bool {
			return sorted[i].StartedAt.After(sorted[j].StartedAt)
		})
		return sorted[0], nil
	}
	if len(sessions) == 1 {
		return sessions[0], nil
	}
	return auth.SessionMetadata{}, fmt.Errorf("multiple sessions found; use --session <id> or --latest")
}

func sessionToJSON(session auth.SessionMetadata) sessionJSON {
	return sessionJSON{
		ID:                     session.ID,
		WorkspacePath:          session.WorkspacePath,
		WorkspacePathCanonical: session.WorkspacePathCanonical,
		Host:                   session.Host,
		Port:                   session.Port,
		PID:                    session.PID,
		StartedAt:              session.StartedAt.UTC(),
		ServerMode:             session.ServerMode,
	}
}

func emitConnectInfoJSON(w io.Writer, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	encoded := base64.StdEncoding.EncodeToString(raw)
	_, err = fmt.Fprintln(w, connectInfoJSONPrefix+encoded)
	return err
}

func emitJSON(w io.Writer, payload any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(w, string(encoded))
	return err
}

func normalizeBaseURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("empty base URL")
	}
	trimmed = strings.TrimRight(trimmed, "/")
	if strings.HasSuffix(trimmed, apiPrefix) {
		trimmed = strings.TrimRight(strings.TrimSuffix(trimmed, apiPrefix), "/")
	}
	if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
		trimmed = "http://" + trimmed
	}
	return trimmed, nil
}

func baseURLFromSession(session auth.SessionMetadata) string {
	return "http://" + net.JoinHostPort(urlHostForBaseURL(session.Host), fmt.Sprintf("%d", session.Port))
}

func buildBootstrapURLsFromBase(baseURL string, token string) (string, string, error) {
	normalizedBaseURL, err := normalizeBaseURL(baseURL)
	if err != nil {
		return "", "", err
	}
	parsedBaseURL, err := url.Parse(normalizedBaseURL)
	if err != nil {
		return "", "", err
	}
	parsedBaseURL.Path = "/__setta__/bootstrap"
	parsedBaseURL.RawQuery = ""
	parsedBaseURL.Fragment = url.Values{"token": []string{strings.TrimSpace(token)}}.Encode()
	fragmentURL := parsedBaseURL.String()
	parsedBaseURL.Fragment = ""
	return fragmentURL, parsedBaseURL.String(), nil
}

func urlHostForBaseURL(host string) string {
	trimmed := strings.TrimSpace(host)
	switch trimmed {
	case "0.0.0.0":
		return "127.0.0.1"
	case "::":
		return "::1"
	default:
		return trimmed
	}
}

func sshTunnelHost(host string) string {
	return urlHostForBaseURL(host)
}

func buildSSHTunnelCommand(host string, port int) string {
	return fmt.Sprintf("ssh -N -L ${LOCAL_PORT}:%s <user@host> -o ExitOnForwardFailure=yes", net.JoinHostPort(sshTunnelHost(host), fmt.Sprintf("%d", port)))
}

func buildSSHTunnelCommandForPort(host string, localPort int, remotePort int) string {
	return fmt.Sprintf("ssh -N -L %d:%s <user@host> -o ExitOnForwardFailure=yes", localPort, net.JoinHostPort(sshTunnelHost(host), fmt.Sprintf("%d", remotePort)))
}

func renderConnectInfoMessage(session auth.SessionMetadata, bootstrapURLFragment string, bootstrapURLPlain string, token string) string {
	var builder strings.Builder
	builder.WriteString("Setta session ")
	builder.WriteString(session.ID)
	builder.WriteString("\nBind: ")
	builder.WriteString(formatBindHint(session.Host, session.Port))
	builder.WriteString("\n\nRemote start (run on host, if needed):\n  cd ")
	builder.WriteString(shellQuote(session.WorkspacePathCanonical))
	builder.WriteString(" && source .venv/bin/activate && setta")
	builder.WriteString("\n\nBootstrap URL (fragment token):\n  ")
	builder.WriteString(bootstrapURLFragment)
	builder.WriteString("\n\nBootstrap URL (manual token entry):\n  ")
	builder.WriteString(bootstrapURLPlain)
	builder.WriteString("\n  Token: ")
	builder.WriteString(token)
	builder.WriteString("\n\nFrom your laptop (Setta installed):\n  setta connect <user@host> --workspace ")
	builder.WriteString(shellQuote(session.WorkspacePathCanonical))
	builder.WriteString(" --session ")
	builder.WriteString(session.ID)
	builder.WriteString("\n\nManual tunnel (no local Setta install):\n  ")
	builder.WriteString(buildSSHTunnelCommandForPort(session.Host, defaultLocalPort, session.Port))
	builder.WriteString("\n  Open in browser (recommended):\n    http://127.0.0.1:")
	builder.WriteString(fmt.Sprintf("%d", defaultLocalPort))
	builder.WriteString("/__setta__/bootstrap#token=")
	builder.WriteString(token)
	builder.WriteString("\n  Manual token entry:\n    http://127.0.0.1:")
	builder.WriteString(fmt.Sprintf("%d", defaultLocalPort))
	builder.WriteString("/__setta__/bootstrap\n    Token: ")
	builder.WriteString(token)
	builder.WriteString("\n  Tip: if you change the local port, replace 61000 in the tunnel + URLs.")
	return builder.String()
}

func formatBindHint(host string, port int) string {
	bindHost := strings.TrimSpace(host)
	if bindHost == "" {
		bindHost = "127.0.0.1"
	}
	label := net.JoinHostPort(bindHost, fmt.Sprintf("%d", port))
	if bindHost == "127.0.0.1" || bindHost == "::1" {
		return label + " (remote only)"
	}
	return label
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	if strings.IndexFunc(value, func(r rune) bool {
		return r == ' ' || r == '\t' || r == '\n' || r == '\'' || r == '"' || r == '\\'
	}) == -1 {
		return value
	}
	var builder bytes.Buffer
	builder.WriteByte('\'')
	for _, ch := range value {
		if ch == '\'' {
			builder.WriteString(`'\''`)
			continue
		}
		builder.WriteRune(ch)
	}
	builder.WriteByte('\'')
	return builder.String()
}
