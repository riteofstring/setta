package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	doctorSchemaVersion  = 1
	doctorCommandLimit   = 8000
	doctorCommandTimeout = 10 * time.Second

	doctorStatusOK      = "ok"
	doctorStatusWarning = "warning"
	doctorStatusError   = "error"
)

var tailscaleIPv4Prefix = netip.MustParsePrefix("100.64.0.0/10")

type doctorOptions struct {
	AppDataDir   string
	JSON         bool
	WorkspaceDir string
}

type doctorReport struct {
	SchemaVersion int                       `json:"schemaVersion"`
	GeneratedAt   string                    `json:"generatedAt"`
	SettaVersion  string                    `json:"settaVersion"`
	AppDataDir    string                    `json:"appDataDir"`
	WorkspaceDir  string                    `json:"workspaceDir"`
	OK            bool                      `json:"ok"`
	Checks        []doctorCheck             `json:"checks"`
	Runtime       doctorRuntimeReport       `json:"runtime"`
	Tailscale     doctorTailscaleReport     `json:"tailscale"`
	PWA           doctorPWAReport           `json:"pwa"`
	AgentCLIs     []doctorAgentCLIReport    `json:"agentClis"`
	SourceControl doctorSourceControlReport `json:"sourceControl"`
	SetupReport   doctorSetupReport         `json:"setupReport"`
}

type doctorCheck struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type doctorRuntimeReport struct {
	ServeStatePath string      `json:"serveStatePath"`
	ServeState     *serveState `json:"serveState,omitempty"`
	RuntimeInfo    any         `json:"runtimeInfo,omitempty"`
	BaseURL        string      `json:"baseUrl,omitempty"`
	TailnetBound   bool        `json:"tailnetBound"`
	Error          string      `json:"error,omitempty"`
}

type doctorTailscaleReport struct {
	StatusCommand doctorCommandReport `json:"statusCommand"`
	ServeCommand  doctorCommandReport `json:"serveCommand"`
	DNSName       string              `json:"dnsName,omitempty"`
	Online        *bool               `json:"online,omitempty"`
	TailscaleIPs  []string            `json:"tailscaleIps,omitempty"`
	Error         string              `json:"error,omitempty"`
}

type doctorPWAReport struct {
	BaseURL       string `json:"baseUrl,omitempty"`
	ManifestURL   string `json:"manifestUrl,omitempty"`
	HTTPStatus    int    `json:"httpStatus,omitempty"`
	ContentType   string `json:"contentType,omitempty"`
	TLSValid      bool   `json:"tlsValid"`
	TLSServerName string `json:"tlsServerName,omitempty"`
	Error         string `json:"error,omitempty"`
}

type doctorAgentCLIReport struct {
	Name           string              `json:"name"`
	Path           string              `json:"path,omitempty"`
	VersionCommand doctorCommandReport `json:"versionCommand"`
	AuthCommand    doctorCommandReport `json:"authCommand"`
	Error          string              `json:"error,omitempty"`
}

type doctorSourceControlReport struct {
	GitRoot                  string              `json:"gitRoot,omitempty"`
	OriginRemote             string              `json:"originRemote,omitempty"`
	OriginKind               string              `json:"originKind,omitempty"`
	SSHAuthSock              string              `json:"sshAuthSock,omitempty"`
	SSHAuthSockPresent       bool                `json:"sshAuthSockPresent"`
	SSHAgentStatus           string              `json:"sshAgentStatus,omitempty"`
	SSHIdentities            []doctorSSHIdentity `json:"sshIdentities,omitempty"`
	SSHSecurityKeyPresent    bool                `json:"sshSecurityKeyPresent"`
	GitRootCommand           doctorCommandReport `json:"gitRootCommand"`
	OriginCommand            doctorCommandReport `json:"originCommand"`
	SSHAddCommand            doctorCommandReport `json:"sshAddCommand"`
	GitHubSSHCommand         doctorCommandReport `json:"githubSshCommand"`
	GitHubSSHTouchAwareProbe bool                `json:"githubSshTouchAwareProbe"`
	GitHubAccepted           *bool               `json:"githubAccepted,omitempty"`
	Error                    string              `json:"error,omitempty"`
}

type doctorSSHIdentity struct {
	Line        string `json:"line"`
	KeyType     string `json:"keyType,omitempty"`
	SecurityKey bool   `json:"securityKey"`
}

type doctorSetupReport struct {
	Path     string `json:"path"`
	Exists   bool   `json:"exists"`
	Readable bool   `json:"readable"`
	Error    string `json:"error,omitempty"`
}

type doctorCommandReport struct {
	Name     string   `json:"name"`
	Args     []string `json:"args"`
	OK       bool     `json:"ok"`
	ExitCode *int     `json:"exitCode,omitempty"`
	Output   string   `json:"output,omitempty"`
	Error    string   `json:"error,omitempty"`
}

type tailscaleStatusReport struct {
	Self *struct {
		DNSName      string   `json:"DNSName"`
		Online       bool     `json:"Online"`
		TailscaleIPs []string `json:"TailscaleIPs"`
	} `json:"Self"`
}

func runDoctor(args []string, deps cliDeps) error {
	options, err := doctorOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	report := buildDoctorReport(context.Background(), options, deps)
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		return fmt.Errorf("encode doctor report: %w", err)
	}
	return nil
}

func doctorOptionsFromArgs(args []string, deps cliDeps) (doctorOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return doctorOptions{}, err
	}
	workspaceDir, err := os.Getwd()
	if err != nil {
		return doctorOptions{}, fmt.Errorf("resolve current workspace directory: %w", err)
	}
	options := doctorOptions{
		AppDataDir:   appDataDir,
		WorkspaceDir: workspaceDir,
	}
	flagSet := newFlagSet("setta doctor", deps.stderr)
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", options.AppDataDir, "directory for persisted Setta app state")
	flagSet.BoolVar(&options.JSON, "json", false, "emit a machine-readable JSON report")
	flagSet.StringVar(&options.WorkspaceDir, "workspace-dir", options.WorkspaceDir, "workspace directory for source-control diagnostics")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return doctorOptions{}, usageError{err: err}
		}
		return doctorOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return doctorOptions{}, usageError{err: errors.New("setta doctor does not accept positional arguments")}
	}
	if !options.JSON {
		return doctorOptions{}, usageError{err: errors.New("setta doctor currently requires --json")}
	}
	workspaceDir, err = filepath.Abs(options.WorkspaceDir)
	if err != nil {
		return doctorOptions{}, fmt.Errorf("resolve workspace directory %s: %w", options.WorkspaceDir, err)
	}
	options.WorkspaceDir = workspaceDir
	return options, nil
}

func buildDoctorReport(ctx context.Context, options doctorOptions, deps cliDeps) doctorReport {
	report := doctorReport{
		SchemaVersion: doctorSchemaVersion,
		GeneratedAt:   deps.now().UTC().Format(time.RFC3339Nano),
		SettaVersion:  version,
		AppDataDir:    options.AppDataDir,
		WorkspaceDir:  options.WorkspaceDir,
		OK:            true,
	}
	report.Runtime = doctorRuntime(ctx, options.AppDataDir, deps)
	report.Tailscale = doctorTailscale(ctx, deps)
	report.PWA = doctorPWA(ctx, report.Tailscale.DNSName, deps)
	report.AgentCLIs = []doctorAgentCLIReport{doctorCodexCLI(ctx, deps)}
	report.SourceControl = doctorSourceControl(ctx, options.WorkspaceDir, deps)
	report.SetupReport = doctorSetupReportForAppDataDir(options.AppDataDir)
	report.Checks = doctorChecks(report)
	report.OK = doctorReportOK(report.Checks)
	return report
}

func doctorRuntime(ctx context.Context, appDataDir string, deps cliDeps) doctorRuntimeReport {
	report := doctorRuntimeReport{ServeStatePath: serveStatePath(appDataDir)}
	state, err := readServeState(appDataDir)
	if err != nil {
		report.Error = err.Error()
		return report
	}
	report.ServeState = &state
	report.BaseURL = state.BaseURL
	report.TailnetBound = serveStateAddrIsTailscale(state.Addr)
	info, err := verifyServeState(ctx, deps.httpClient, state)
	if err != nil {
		report.Error = err.Error()
		return report
	}
	report.RuntimeInfo = info
	return report
}

func doctorTailscale(ctx context.Context, deps cliDeps) doctorTailscaleReport {
	status := runDoctorCommand(ctx, deps, "tailscale", "status", "--json")
	serve := runDoctorCommand(ctx, deps, "tailscale", "serve", "status", "--json")
	report := doctorTailscaleReport{
		StatusCommand: status,
		ServeCommand:  serve,
	}
	if !status.OK {
		report.Error = status.Error
		return report
	}
	var parsed tailscaleStatusReport
	if err := json.Unmarshal([]byte(status.Output), &parsed); err != nil {
		report.Error = fmt.Sprintf("parse tailscale status JSON: %v", err)
		return report
	}
	if parsed.Self == nil {
		report.Error = "tailscale status JSON did not include Self"
		return report
	}
	online := parsed.Self.Online
	report.Online = &online
	report.DNSName = normalizeTailscaleDNSName(parsed.Self.DNSName)
	report.TailscaleIPs = append([]string(nil), parsed.Self.TailscaleIPs...)
	return report
}

func doctorPWA(ctx context.Context, dnsName string, deps cliDeps) doctorPWAReport {
	report := doctorPWAReport{}
	if dnsName == "" {
		report.Error = "tailscale status did not provide a DNS name"
		return report
	}
	if !strings.HasSuffix(strings.ToLower(dnsName), ".ts.net") {
		report.Error = "tailscale DNS name is not an official ts.net hostname"
		return report
	}
	baseURL := "https://" + dnsName
	manifestURL := baseURL + "/manifest.webmanifest"
	report.BaseURL = baseURL
	report.ManifestURL = manifestURL
	report.TLSServerName = dnsName
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, manifestURL, nil)
	if err != nil {
		report.Error = fmt.Sprintf("create manifest request: %v", err)
		return report
	}
	response, err := deps.httpClient.Do(request)
	if err != nil {
		report.Error = fmt.Sprintf("request PWA manifest over ts.net HTTPS: %v", err)
		return report
	}
	defer response.Body.Close()
	report.HTTPStatus = response.StatusCode
	report.ContentType = response.Header.Get("Content-Type")
	report.TLSValid = true
	if response.StatusCode != http.StatusOK {
		report.Error = fmt.Sprintf("PWA manifest returned HTTP %d", response.StatusCode)
	}
	return report
}

func doctorCodexCLI(ctx context.Context, deps cliDeps) doctorAgentCLIReport {
	report := doctorAgentCLIReport{Name: "codex"}
	path, err := deps.lookPath("codex")
	if err != nil {
		report.Error = fmt.Sprintf("codex CLI not found in PATH: %v", err)
		return report
	}
	report.Path = path
	report.VersionCommand = runDoctorCommand(ctx, deps, "codex", "--version")
	report.AuthCommand = runDoctorCommand(ctx, deps, "codex", "doctor", "--json")
	if !report.VersionCommand.OK {
		report.Error = report.VersionCommand.Error
		return report
	}
	if !report.AuthCommand.OK {
		report.Error = report.AuthCommand.Error
	}
	return report
}

func doctorSourceControl(ctx context.Context, workspaceDir string, deps cliDeps) doctorSourceControlReport {
	report := doctorSourceControlReport{
		SSHAuthSock:        deps.getenv("SSH_AUTH_SOCK"),
		SSHAuthSockPresent: strings.TrimSpace(deps.getenv("SSH_AUTH_SOCK")) != "",
	}
	report.GitRootCommand = runDoctorCommand(ctx, deps, "git", "-C", workspaceDir, "rev-parse", "--show-toplevel")
	if !report.GitRootCommand.OK {
		report.Error = report.GitRootCommand.Error
		return report
	}
	report.GitRoot = strings.TrimSpace(report.GitRootCommand.Output)
	report.OriginCommand = runDoctorCommand(ctx, deps, "git", "-C", workspaceDir, "remote", "get-url", "origin")
	if report.OriginCommand.OK {
		report.OriginRemote = strings.TrimSpace(report.OriginCommand.Output)
		report.OriginKind = sourceControlOriginKind(report.OriginRemote)
	}
	report.SSHAddCommand = runDoctorCommand(ctx, deps, "ssh-add", "-l")
	report.SSHAgentStatus = doctorSSHAgentStatus(report.SSHAddCommand)
	report.SSHIdentities = doctorSSHIdentities(report.SSHAddCommand.Output)
	report.SSHSecurityKeyPresent = doctorSSHIdentitiesHaveSecurityKey(report.SSHIdentities)
	if report.OriginKind == "github_ssh" {
		report.GitHubSSHTouchAwareProbe = report.SSHSecurityKeyPresent
		report.GitHubSSHCommand = runDoctorCommand(ctx, deps, "ssh", githubSSHProbeArgs(report.GitHubSSHTouchAwareProbe)...)
		report.GitHubAccepted = githubSSHAccepted(report.GitHubSSHCommand)
	}
	return report
}

func doctorSetupReportForAppDataDir(appDataDir string) doctorSetupReport {
	path := filepath.Join(appDataDir, "runtime", "setup-report.json")
	report := doctorSetupReport{Path: path}
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			report.Error = "setup report does not exist"
			return report
		}
		report.Error = err.Error()
		return report
	}
	defer file.Close()
	report.Exists = true
	report.Readable = true
	return report
}

func runDoctorCommand(ctx context.Context, deps cliDeps, name string, args ...string) doctorCommandReport {
	commandCtx, cancel := context.WithTimeout(ctx, doctorCommandTimeout)
	defer cancel()
	output, err := deps.commandRunner(commandCtx, name, args...)
	report := doctorCommandReport{
		Name:   name,
		Args:   append([]string(nil), args...),
		OK:     err == nil,
		Output: trimDoctorOutput(string(output)),
	}
	if err != nil {
		report.Error = err.Error()
		if exitCode, ok := commandExitCode(err); ok {
			report.ExitCode = &exitCode
		}
	}
	return report
}

func doctorChecks(report doctorReport) []doctorCheck {
	checks := []doctorCheck{
		runtimeDoctorCheck(report.Runtime),
		tailscaleStatusDoctorCheck(report.Tailscale),
		tailscaleServeDoctorCheck(report.Tailscale),
		pwaDoctorCheck(report.PWA),
		setupReportDoctorCheck(report.SetupReport),
		sourceControlDoctorCheck(report.SourceControl),
	}
	for _, agent := range report.AgentCLIs {
		checks = append(checks, agentCLIDoctorCheck(agent))
	}
	return checks
}

func runtimeDoctorCheck(report doctorRuntimeReport) doctorCheck {
	if report.Error != "" {
		return doctorCheck{ID: "runtime", Status: doctorStatusError, Message: report.Error}
	}
	if !report.TailnetBound {
		return doctorCheck{ID: "runtime", Status: doctorStatusWarning, Message: "setta serve is reachable, but it is not bound to a Tailscale IPv4 address"}
	}
	return doctorCheck{ID: "runtime", Status: doctorStatusOK, Message: "setta serve is reachable"}
}

func tailscaleStatusDoctorCheck(report doctorTailscaleReport) doctorCheck {
	if report.Error != "" {
		return doctorCheck{ID: "tailscale_status", Status: doctorStatusError, Message: report.Error}
	}
	if report.Online != nil && !*report.Online {
		return doctorCheck{ID: "tailscale_status", Status: doctorStatusError, Message: "tailscale status reports this node offline"}
	}
	return doctorCheck{ID: "tailscale_status", Status: doctorStatusOK, Message: "tailscale status is available"}
}

func tailscaleServeDoctorCheck(report doctorTailscaleReport) doctorCheck {
	if !report.ServeCommand.OK {
		return doctorCheck{ID: "tailscale_serve", Status: doctorStatusError, Message: report.ServeCommand.Error}
	}
	return doctorCheck{ID: "tailscale_serve", Status: doctorStatusOK, Message: "tailscale serve status is available"}
}

func pwaDoctorCheck(report doctorPWAReport) doctorCheck {
	if report.Error != "" {
		return doctorCheck{ID: "pwa_https", Status: doctorStatusError, Message: report.Error}
	}
	return doctorCheck{ID: "pwa_https", Status: doctorStatusOK, Message: "PWA manifest is reachable over ts.net HTTPS with a valid certificate"}
}

func setupReportDoctorCheck(report doctorSetupReport) doctorCheck {
	if report.Exists && report.Readable {
		return doctorCheck{ID: "setup_report", Status: doctorStatusOK, Message: "setup report is readable"}
	}
	return doctorCheck{ID: "setup_report", Status: doctorStatusWarning, Message: report.Error}
}

func sourceControlDoctorCheck(report doctorSourceControlReport) doctorCheck {
	if report.Error != "" {
		return doctorCheck{ID: "source_control", Status: doctorStatusWarning, Message: report.Error}
	}
	if report.OriginKind == "github_https" {
		return doctorCheck{ID: "source_control", Status: doctorStatusWarning, Message: "origin uses GitHub HTTPS; SSH agent forwarding will not affect git pulls until the remote or HTTPS credentials are configured"}
	}
	if report.OriginKind == "github_ssh" && report.SSHAgentStatus == "no_agent" {
		return doctorCheck{ID: "source_control", Status: doctorStatusWarning, Message: "no SSH agent is reachable from this process; configure SSH_AUTH_SOCK or launch Setta from an environment that can see the agent"}
	}
	if report.OriginKind == "github_ssh" && report.SSHAgentStatus == "no_identities" {
		return doctorCheck{ID: "source_control", Status: doctorStatusWarning, Message: "SSH agent is reachable but has no identities loaded; load a key for interactive work or add a repo-scoped deploy key for unattended pulls"}
	}
	if report.OriginKind == "github_ssh" && report.GitHubAccepted != nil && !*report.GitHubAccepted {
		if report.SSHSecurityKeyPresent {
			return doctorCheck{ID: "source_control", Status: doctorStatusWarning, Message: "GitHub SSH probe did not confirm authentication; a security-key touch may be required, and touch-required keys cannot serve unattended background pulls, so use agent forwarding for interactive work or a repo-scoped deploy key for unattended pulls"}
		}
		return doctorCheck{ID: "source_control", Status: doctorStatusWarning, Message: "GitHub SSH probe did not confirm authentication"}
	}
	return doctorCheck{ID: "source_control", Status: doctorStatusOK, Message: "source-control diagnostics completed"}
}

func agentCLIDoctorCheck(report doctorAgentCLIReport) doctorCheck {
	if report.Error != "" {
		return doctorCheck{ID: "agent_cli_" + report.Name, Status: doctorStatusError, Message: report.Error}
	}
	return doctorCheck{ID: "agent_cli_" + report.Name, Status: doctorStatusOK, Message: report.Name + " CLI doctor passed"}
}

func doctorReportOK(checks []doctorCheck) bool {
	for _, check := range checks {
		if check.Status == doctorStatusError {
			return false
		}
	}
	return true
}

func serveStateAddrIsTailscale(rawAddr string) bool {
	host, _, err := net.SplitHostPort(rawAddr)
	if err != nil {
		return false
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	return tailscaleIPv4Prefix.Contains(addr)
}

func normalizeTailscaleDNSName(raw string) string {
	return strings.TrimSuffix(strings.TrimSpace(raw), ".")
}

func sourceControlOriginKind(remote string) string {
	trimmed := strings.TrimSpace(remote)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "git@github.com:") {
		return "github_ssh"
	}
	parsed, err := url.Parse(trimmed)
	if err == nil && strings.EqualFold(parsed.Hostname(), "github.com") {
		if parsed.Scheme == "ssh" || (parsed.User != nil && parsed.User.Username() == "git") {
			return "github_ssh"
		}
		if parsed.Scheme == "https" {
			return "github_https"
		}
	}
	return "other"
}

func githubSSHProbeArgs(touchAware bool) []string {
	batchMode := "BatchMode=yes"
	connectTimeout := "ConnectTimeout=5"
	if touchAware {
		batchMode = "BatchMode=no"
		connectTimeout = "ConnectTimeout=10"
	}
	return []string{
		"-T",
		"-o", batchMode,
		"-o", connectTimeout,
		"-o", "StrictHostKeyChecking=yes",
		"git@github.com",
	}
}

func githubSSHAccepted(command doctorCommandReport) *bool {
	if command.Name == "" {
		return nil
	}
	output := command.Output
	accepted := strings.Contains(output, "successfully authenticated")
	return &accepted
}

func doctorSSHAgentStatus(command doctorCommandReport) string {
	if command.Name == "" {
		return ""
	}
	if command.OK {
		if strings.TrimSpace(command.Output) == "" {
			return "no_identities"
		}
		return "identities_loaded"
	}
	if command.ExitCode != nil {
		switch *command.ExitCode {
		case 1:
			return "no_identities"
		case 2:
			return "no_agent"
		}
	}
	lower := strings.ToLower(command.Output + "\n" + command.Error)
	switch {
	case strings.Contains(lower, "the agent has no identities"):
		return "no_identities"
	case strings.Contains(lower, "could not open a connection to your authentication agent"),
		strings.Contains(lower, "no such file or directory"):
		return "no_agent"
	default:
		return "error"
	}
}

func doctorSSHIdentities(output string) []doctorSSHIdentity {
	lines := nonEmptyLines(output)
	identities := make([]doctorSSHIdentity, 0, len(lines))
	for _, line := range lines {
		identities = append(identities, doctorSSHIdentity{
			Line:        line,
			KeyType:     doctorSSHIdentityType(line),
			SecurityKey: doctorSSHIdentityIsSecurityKey(line),
		})
	}
	return identities
}

func doctorSSHIdentitiesHaveSecurityKey(identities []doctorSSHIdentity) bool {
	for _, identity := range identities {
		if identity.SecurityKey {
			return true
		}
	}
	return false
}

func doctorSSHIdentityType(line string) string {
	start := strings.LastIndex(line, "(")
	if start < 0 || !strings.HasSuffix(line, ")") {
		return ""
	}
	return strings.TrimSpace(line[start+1 : len(line)-1])
}

func doctorSSHIdentityIsSecurityKey(line string) bool {
	lower := strings.ToLower(line)
	return strings.Contains(lower, "sk-ssh-ed25519@openssh.com") ||
		strings.Contains(lower, "sk-ecdsa-sha2-") ||
		strings.Contains(lower, "(ed25519-sk)") ||
		strings.Contains(lower, "(ecdsa-sk)")
}

type commandExitCoder interface {
	ExitCode() int
}

func commandExitCode(err error) (int, bool) {
	var exitErr commandExitCoder
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), true
	}
	return 0, false
}

func trimDoctorOutput(output string) string {
	trimmed := strings.TrimSpace(output)
	if len(trimmed) <= doctorCommandLimit {
		return trimmed
	}
	return trimmed[:doctorCommandLimit] + "\n[truncated]"
}
