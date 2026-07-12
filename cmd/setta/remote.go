package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

const (
	defaultRemoteAddTimeout             = 20 * time.Minute
	defaultRemoteProvisioningTTL        = time.Hour
	remoteSetupTranscriptDirectoryName  = "remote-setup"
	remoteSetupTranscriptSchemaVersion  = 1
	remoteBootstrapPrivilegeCommand     = `if [ "$(id -u)" -eq 0 ]; then exec /bin/sh -s; fi; if command -v sudo >/dev/null 2>&1; then exec sudo -n /bin/sh -s; fi; echo "setta ssh bootstrap: root privileges required; reconnect as root or configure passwordless sudo" >&2; exit 1`
	remotePairingURLMissingErrorMessage = "remote setup output did not include structured pairing JSON"
)

type remoteAddOptions struct {
	JSON                 bool
	Provision            provisionRenderCloudInitOptions
	SSHOptions           repeatedStringFlag
	TailscaleAuthKeyFile string
	Target               remoteSSHTarget
	Timeout              time.Duration
	TranscriptPath       string
}

type remoteAddResult struct {
	OK             bool   `json:"ok"`
	PairingURL     string `json:"pairingUrl"`
	RuntimeName    string `json:"runtimeName"`
	Target         string `json:"target"`
	TranscriptPath string `json:"transcriptPath"`
	Transport      string `json:"transport"`
}

type remoteSSHTarget struct {
	Host     string
	Original string
	Port     string
	User     string
}

type remoteSetupTranscript struct {
	Command         []string `json:"command"`
	FinishedAt      string   `json:"finishedAt"`
	PairingURLFound bool     `json:"pairingUrlFound"`
	RedactedOutput  string   `json:"redactedOutput"`
	RedactedScript  string   `json:"redactedScript"`
	RuntimeName     string   `json:"runtimeName"`
	SchemaVersion   int      `json:"schemaVersion"`
	ScriptSHA256    string   `json:"scriptSha256"`
	StartedAt       string   `json:"startedAt"`
	Status          string   `json:"status"`
	Target          string   `json:"target"`
	Transport       string   `json:"transport"`
}

type repeatedStringFlag []string

func runRemote(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta remote requires a subcommand")}
	}
	switch args[0] {
	case "add":
		return runRemoteAdd(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown setta remote subcommand %q", args[0])}
	}
}

func runRemoteAdd(args []string, deps cliDeps) error {
	options, err := remoteAddOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := executeRemoteAdd(options, deps)
	if err != nil {
		return err
	}
	if options.JSON {
		encoder := json.NewEncoder(deps.stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(result); err != nil {
			return fmt.Errorf("encode remote add JSON: %w", err)
		}
		return nil
	}
	fmt.Fprintln(deps.stdout, "Setta remote installed over SSH.")
	fmt.Fprintln(deps.stdout, "Pairing URL:")
	fmt.Fprintf(deps.stdout, "  %s\n", result.PairingURL)
	fmt.Fprintf(deps.stdout, "Transcript: %s\n", result.TranscriptPath)
	fmt.Fprintln(deps.stdout, "Transport after setup: Tailscale")
	return nil
}

func remoteAddOptionsFromArgs(args []string, deps cliDeps) (remoteAddOptions, error) {
	targetValue, flagArgs, err := extractRemoteAddTarget(args)
	if err != nil {
		return remoteAddOptions{}, err
	}
	options := defaultRemoteAddOptions()
	if err := parseRemoteAddFlags(flagArgs, deps, &options); err != nil {
		return remoteAddOptions{}, err
	}
	if err := completeRemoteAddOptions(targetValue, deps, &options); err != nil {
		return remoteAddOptions{}, err
	}
	return options, nil
}

func defaultRemoteAddOptions() remoteAddOptions {
	return remoteAddOptions{
		Provision: defaultRemoteProvisionOptions(),
		Timeout:   defaultRemoteAddTimeout,
	}
}

func defaultRemoteProvisionOptions() provisionRenderCloudInitOptions {
	return provisionRenderCloudInitOptions{
		AppDataDir:          defaultProvisionAppDataDir,
		BootstrapPath:       defaultProvisionBootstrapPath,
		ImageContract:       defaultProvisionImageContract,
		InstallRepo:         defaultProvisionInstallRepo,
		RuntimePort:         defaultProvisionRuntimePort,
		ServiceGroup:        defaultProvisionServiceGroup,
		ServiceUser:         defaultProvisionServiceUser,
		SettaVersion:        version,
		SetupReportPath:     defaultProvisionSetupReportPath,
		Shape:               defaultProvisionShape,
		TailscaleInstallURL: defaultProvisionTailscaleInstall,
	}
}

func parseRemoteAddFlags(flagArgs []string, deps cliDeps, options *remoteAddOptions) error {
	flagSet := newFlagSet("setta remote add", deps.stderr)
	bindRemoteAddFlags(flagSet, options)
	if err := flagSet.Parse(flagArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return usageError{err: err}
		}
		return usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return usageError{err: errors.New("setta remote add accepts one ssh://user@host target and flags only")}
	}
	return nil
}

func bindRemoteAddFlags(flagSet *flag.FlagSet, options *remoteAddOptions) {
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.DurationVar(&options.Timeout, "timeout", options.Timeout, "maximum time to wait for SSH setup")
	flagSet.StringVar(&options.TranscriptPath, "transcript-path", "", "local path for the redacted setup transcript")
	flagSet.Var(&options.SSHOptions, "ssh-option", "additional ssh -o option, repeatable")
	flagSet.StringVar(&options.Provision.RuntimeName, "runtime-name", "", "Tailscale hostname for the runtime")
	flagSet.StringVar(&options.Provision.TailscaleAuthKey, "tailscale-auth-key", "", "single-use Tailscale auth key to consume during setup")
	flagSet.StringVar(&options.TailscaleAuthKeyFile, "tailscale-auth-key-file", "", "read the single-use Tailscale auth key from a local file")
	flagSet.StringVar(&options.Provision.SettaVersion, "setta-version", options.Provision.SettaVersion, "explicit Setta release version")
	flagSet.StringVar(&options.Provision.InstallRepo, "install-repo", options.Provision.InstallRepo, "GitHub owner/repo for release downloads")
	flagSet.StringVar(&options.Provision.ReleaseBaseURL, "release-base-url", "", "explicit release asset base URL")
	flagSet.StringVar(&options.Provision.InstallerURL, "installer-url", "", "pinned installer script URL")
	flagSet.StringVar(&options.Provision.InstallerSHA256, "installer-sha256", "", "expected SHA-256 of the installer script")
	flagSet.StringVar(&options.Provision.MinisignPublicKey, "minisign-public-key", "", "minisign public key trusted for release verification")
	flagSet.StringVar(&options.Provision.Shape, "shape", options.Provision.Shape, "machine shape used for disk floor metadata")
	flagSet.IntVar(&options.Provision.DiskGB, "disk-gb", 0, "boot disk size in GiB; defaults to the shape floor")
	flagSet.StringVar(&options.Provision.ImageContract, "image-contract", options.Provision.ImageContract, "image contract identifier")
	flagSet.StringVar(&options.Provision.ServiceUser, "service-user", options.Provision.ServiceUser, "runtime service user")
	flagSet.StringVar(&options.Provision.ServiceGroup, "service-group", options.Provision.ServiceGroup, "runtime service group")
	flagSet.StringVar(&options.Provision.AppDataDir, "app-data-dir", options.Provision.AppDataDir, "runtime app data directory")
	flagSet.StringVar(&options.Provision.SeedPath, "seed-path", "", "provisioning seed file path; defaults under app-data-dir")
	flagSet.IntVar(&options.Provision.RuntimePort, "runtime-port", options.Provision.RuntimePort, "runtime HTTP port")
	flagSet.StringVar(&options.Provision.BootstrapPath, "bootstrap-path", options.Provision.BootstrapPath, "temporary bootstrap script path")
	flagSet.StringVar(&options.Provision.SetupReportPath, "setup-report-path", options.Provision.SetupReportPath, "runtime setup report path")
	flagSet.StringVar(&options.Provision.TailscaleInstallURL, "tailscale-install-url", options.Provision.TailscaleInstallURL, "official Tailscale install script URL")
}

func completeRemoteAddOptions(targetValue string, deps cliDeps, options *remoteAddOptions) error {
	if err := readRemoteAddSecretFiles(options); err != nil {
		return err
	}
	target, err := parseRemoteSSHTarget(targetValue)
	if err != nil {
		return err
	}
	options.Target = target
	if err := fillRemoteProvisioningDefaults(options, deps); err != nil {
		return err
	}
	options.Provision.JSON = true
	if err := normalizeProvisionCloudInitOptions(&options.Provision); err != nil {
		return err
	}
	if options.TranscriptPath == "" {
		transcriptPath, err := defaultRemoteSetupTranscriptPath(options.Provision.RuntimeName, deps)
		if err != nil {
			return err
		}
		options.TranscriptPath = transcriptPath
	}
	if options.Timeout <= 0 {
		return fmt.Errorf("timeout must be positive: %s", options.Timeout)
	}
	return nil
}

func readRemoteAddSecretFiles(options *remoteAddOptions) error {
	if options.TailscaleAuthKeyFile == "" {
		return nil
	}
	if options.Provision.TailscaleAuthKey != "" {
		return errors.New("use only one of --tailscale-auth-key or --tailscale-auth-key-file")
	}
	data, err := os.ReadFile(options.TailscaleAuthKeyFile)
	if err != nil {
		return fmt.Errorf("read tailscale auth key file: %w", err)
	}
	options.Provision.TailscaleAuthKey = strings.TrimSpace(string(data))
	return nil
}

func extractRemoteAddTarget(args []string) (string, []string, error) {
	target := ""
	flagArgs := make([]string, 0, len(args))
	for _, arg := range args {
		if strings.HasPrefix(strings.TrimSpace(arg), "ssh://") {
			if target != "" {
				return "", nil, usageError{err: errors.New("setta remote add requires exactly one ssh://user@host target")}
			}
			target = arg
			continue
		}
		flagArgs = append(flagArgs, arg)
	}
	if target == "" {
		return "", nil, usageError{err: errors.New("setta remote add requires exactly one ssh://user@host target")}
	}
	return target, flagArgs, nil
}

func fillRemoteProvisioningDefaults(options *remoteAddOptions, deps cliDeps) error {
	if options.Provision.RuntimeName == "" {
		options.Provision.RuntimeName = defaultRuntimeNameForSSHTarget(options.Target)
	}
	if options.Provision.ProvisionID == "" {
		token, err := randomHex(12)
		if err != nil {
			return err
		}
		options.Provision.ProvisionID = "ssh_" + token
	}
	if options.Provision.PairingToken == "" {
		token, err := randomHex(32)
		if err != nil {
			return err
		}
		options.Provision.PairingToken = token
	}
	if options.Provision.PairingTokenHash == "" {
		sum := sha256.Sum256([]byte(options.Provision.PairingToken))
		options.Provision.PairingTokenHash = hex.EncodeToString(sum[:])
	}
	if options.Provision.AttestationKey == "" {
		token, err := randomHex(32)
		if err != nil {
			return err
		}
		options.Provision.AttestationKey = "ssh-attestation-" + token
	}
	if options.Provision.ExpiresAt == "" {
		options.Provision.ExpiresAt = deps.now().UTC().Add(defaultRemoteProvisioningTTL).Format(time.RFC3339Nano)
	}
	return nil
}

func executeRemoteAdd(options remoteAddOptions, deps cliDeps) (remoteAddResult, error) {
	if _, err := deps.lookPath("ssh"); err != nil {
		return remoteAddResult{}, fmt.Errorf("ssh command not found in PATH: %w", err)
	}
	startedAt := deps.now().UTC()
	script := renderBootstrapScript(options.Provision)
	sshArgs := remoteSSHArgs(options)
	ctx, stop := signalContext()
	defer stop()
	runCtx, cancel := context.WithTimeout(ctx, options.Timeout)
	defer cancel()
	output, runErr := deps.commandStdinRunner(runCtx, "ssh", sshArgs, strings.NewReader(script))
	pairingURL, parseErr := pairingURLFromRemoteSetupOutput(output)
	transcriptErr := writeRemoteSetupTranscript(options, sshArgs, script, output, startedAt, runErr, parseErr, deps)
	if runErr != nil {
		if transcriptErr != nil {
			return remoteAddResult{}, fmt.Errorf("remote SSH setup failed and transcript write failed: %w; transcript error: %v", runErr, transcriptErr)
		}
		return remoteAddResult{}, fmt.Errorf("remote SSH setup failed; transcript: %s: %w: %s", options.TranscriptPath, runErr, strings.TrimSpace(redactRemoteSetupOutput(output, options.Provision)))
	}
	if parseErr != nil {
		if transcriptErr != nil {
			return remoteAddResult{}, fmt.Errorf("remote SSH setup completed but transcript write failed: %w; transcript error: %v", parseErr, transcriptErr)
		}
		return remoteAddResult{}, fmt.Errorf("remote SSH setup completed without pairing URL; transcript: %s: %w", options.TranscriptPath, parseErr)
	}
	if transcriptErr != nil {
		return remoteAddResult{}, transcriptErr
	}
	return remoteAddResult{
		OK:             true,
		PairingURL:     pairingURL,
		RuntimeName:    options.Provision.RuntimeName,
		Target:         options.Target.RedactedURI(),
		TranscriptPath: options.TranscriptPath,
		Transport:      "tailscale",
	}, nil
}

func parseRemoteSSHTarget(value string) (remoteSSHTarget, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return remoteSSHTarget{}, fmt.Errorf("parse SSH target: %w", err)
	}
	if err := validateRemoteSSHURL(parsed, value); err != nil {
		return remoteSSHTarget{}, err
	}
	port, err := remoteSSHPort(parsed)
	if err != nil {
		return remoteSSHTarget{}, err
	}
	return remoteSSHTarget{
		Host:     parsed.Hostname(),
		Original: parsed.String(),
		Port:     port,
		User:     parsed.User.Username(),
	}, nil
}

func validateRemoteSSHURL(parsed *url.URL, value string) error {
	if parsed.Scheme != "ssh" {
		return fmt.Errorf("remote target must use ssh://: %s", value)
	}
	if parsed.User == nil || parsed.User.Username() == "" {
		return errors.New("remote SSH target must include a user, for example ssh://ubuntu@example.com")
	}
	if _, hasPassword := parsed.User.Password(); hasPassword {
		return errors.New("remote SSH target must not include a password")
	}
	if parsed.Hostname() == "" {
		return errors.New("remote SSH target must include a host")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return errors.New("remote SSH target must not include a path")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("remote SSH target must not include query or fragment")
	}
	return nil
}

func remoteSSHPort(parsed *url.URL) (string, error) {
	port := parsed.Port()
	if port == "" {
		return "", nil
	}
	if _, err := net.LookupPort("tcp", port); err != nil {
		return "", fmt.Errorf("remote SSH target port is invalid: %w", err)
	}
	return port, nil
}

func (target remoteSSHTarget) RedactedURI() string {
	uri := url.URL{
		Scheme: "ssh",
		User:   url.User(target.User),
		Host:   target.Host,
	}
	if target.Port != "" {
		uri.Host = net.JoinHostPort(target.Host, target.Port)
	}
	return uri.String()
}

func (target remoteSSHTarget) Destination() string {
	host := target.Host
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}
	return target.User + "@" + host
}

func remoteSSHArgs(options remoteAddOptions) []string {
	args := []string{"-T", "-o", "BatchMode=yes"}
	if options.Target.Port != "" {
		args = append(args, "-p", options.Target.Port)
	}
	for _, option := range options.SSHOptions {
		args = append(args, "-o", option)
	}
	args = append(args, options.Target.Destination(), remoteBootstrapPrivilegeCommand)
	return args
}

func defaultRuntimeNameForSSHTarget(target remoteSSHTarget) string {
	host := strings.ToLower(target.Host)
	if index := strings.Index(host, "."); index > 0 {
		host = host[:index]
	}
	var builder strings.Builder
	previousHyphen := false
	for _, character := range host {
		switch {
		case unicode.IsLower(character) || unicode.IsDigit(character):
			builder.WriteRune(character)
			previousHyphen = false
		case character == '-' && builder.Len() > 0 && !previousHyphen:
			builder.WriteByte('-')
			previousHyphen = true
		}
	}
	name := strings.Trim(builder.String(), "-")
	if name == "" {
		name = "runtime"
	}
	name = "setta-" + name
	if len(name) > 63 {
		name = strings.TrimRight(name[:63], "-")
	}
	return name
}

func defaultRemoteSetupTranscriptPath(runtimeName string, deps cliDeps) (string, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return "", err
	}
	fileName := deps.now().UTC().Format("20060102T150405Z") + "-" + runtimeName + ".json"
	return filepath.Join(appDataDir, remoteSetupTranscriptDirectoryName, fileName), nil
}

func writeRemoteSetupTranscript(
	options remoteAddOptions,
	sshArgs []string,
	script string,
	output []byte,
	startedAt time.Time,
	runErr error,
	parseErr error,
	deps cliDeps,
) error {
	status := "ok"
	if runErr != nil || parseErr != nil {
		status = "failed"
	}
	pairingFound := parseErr == nil
	transcript := remoteSetupTranscript{
		Command:         append([]string{"ssh"}, sshArgs...),
		FinishedAt:      deps.now().UTC().Format(time.RFC3339Nano),
		PairingURLFound: pairingFound,
		RedactedOutput:  redactRemoteSetupOutput(output, options.Provision),
		RedactedScript:  renderBootstrapScript(redactedProvisionCloudInitOptions(options.Provision)),
		RuntimeName:     options.Provision.RuntimeName,
		SchemaVersion:   remoteSetupTranscriptSchemaVersion,
		ScriptSHA256:    sha256Hex([]byte(script)),
		StartedAt:       startedAt.Format(time.RFC3339Nano),
		Status:          status,
		Target:          options.Target.RedactedURI(),
		Transport:       "tailscale-after-setup",
	}
	payload, err := json.MarshalIndent(transcript, "", "  ")
	if err != nil {
		return fmt.Errorf("encode remote setup transcript: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(options.TranscriptPath), 0o700); err != nil {
		return fmt.Errorf("create remote setup transcript directory: %w", err)
	}
	if err := os.WriteFile(options.TranscriptPath, append(payload, '\n'), 0o600); err != nil {
		return fmt.Errorf("write remote setup transcript %s: %w", options.TranscriptPath, err)
	}
	return nil
}

func pairingURLFromRemoteSetupOutput(output []byte) (string, error) {
	for _, rawLine := range strings.Split(string(output), "\n") {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "{") {
			continue
		}
		var result pairingJSONResult
		if err := json.Unmarshal([]byte(line), &result); err != nil {
			continue
		}
		if result.OK && strings.TrimSpace(result.PairingURL) != "" {
			return result.PairingURL, nil
		}
	}
	return "", errors.New(remotePairingURLMissingErrorMessage)
}

func redactRemoteSetupOutput(output []byte, provision provisionRenderCloudInitOptions) string {
	return redactRemoteSetupSecrets(string(output), provision)
}

func redactRemoteSetupSecrets(value string, provision provisionRenderCloudInitOptions) string {
	redacted := value
	for _, secret := range []string{
		provision.TailscaleAuthKey,
		provision.PairingToken,
		provision.PairingTokenHash,
		provision.AttestationKey,
	} {
		if secret == "" {
			continue
		}
		redacted = strings.ReplaceAll(redacted, secret, "__SETTA_REDACTED__")
	}
	return redacted
}

func randomHex(byteCount int) (string, error) {
	if byteCount <= 0 {
		return "", fmt.Errorf("random byte count must be positive: %d", byteCount)
	}
	buffer := make([]byte, byteCount)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate random provisioning secret: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}

func (values *repeatedStringFlag) Set(value string) error {
	trimmed, err := requirePlainField("ssh-option", value, 1, 256)
	if err != nil {
		return err
	}
	*values = append(*values, trimmed)
	return nil
}

func (values *repeatedStringFlag) String() string {
	if values == nil {
		return ""
	}
	return strings.Join(*values, ",")
}
