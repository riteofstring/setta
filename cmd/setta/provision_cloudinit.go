package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
)

const (
	defaultProvisionInstallRepo      = "riteofstring/setta"
	defaultProvisionServiceUser      = "setta"
	defaultProvisionServiceGroup     = "setta"
	defaultProvisionAppDataDir       = "/var/lib/setta"
	defaultProvisionBootstrapPath    = "/usr/local/lib/setta/bootstrap.sh"
	defaultProvisionSetupReportPath  = "/var/lib/setta/setup-report.json"
	defaultProvisionRuntimePort      = defaultServePort
	defaultProvisionShape            = "dev-standard"
	defaultProvisionImageContract    = "ubuntu-lts-cloud-init-systemd-apt"
	defaultProvisionTailscaleInstall = "https://tailscale.com/install.sh"
)

var (
	cloudInitHostnamePattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
	hexSHA256Pattern         = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)
)

type provisionRenderCloudInitOptions struct {
	AppDataDir          string
	AttestationKey      string
	BootstrapPath       string
	DiskGB              int
	ExpiresAt           string
	ImageContract       string
	InstallRepo         string
	InstallerSHA256     string
	InstallerURL        string
	JSON                bool
	MinisignPublicKey   string
	PairingTokenHash    string
	ProvisionID         string
	ReleaseBaseURL      string
	RuntimeName         string
	RuntimePort         int
	SeedPath            string
	ServiceGroup        string
	ServiceUser         string
	SettaVersion        string
	Shape               string
	SetupReportPath     string
	TailscaleAuthKey    string
	TailscaleInstallURL string
}

type provisionCloudInitResult struct {
	OK                      bool                       `json:"ok"`
	CloudInit               string                     `json:"cloudInit"`
	CloudInitSHA256         string                     `json:"cloudInitSha256"`
	RedactedCloudInit       string                     `json:"redactedCloudInit"`
	RedactedCloudInitSHA256 string                     `json:"redactedCloudInitSha256"`
	Runtime                 provisionCloudInitRuntime  `json:"runtime"`
	Release                 provisionCloudInitRelease  `json:"release"`
	Disk                    provisionCloudInitDisk     `json:"disk"`
	ImageContract           provisionCloudInitImage    `json:"imageContract"`
	Secrets                 provisionCloudInitRedacted `json:"secrets"`
}

type provisionCloudInitRuntime struct {
	RuntimeName     string `json:"runtimeName"`
	ProvisionID     string `json:"provisionId"`
	RuntimePort     int    `json:"runtimePort"`
	ServiceUser     string `json:"serviceUser"`
	ServiceGroup    string `json:"serviceGroup"`
	AppDataDir      string `json:"appDataDir"`
	SeedPath        string `json:"seedPath"`
	SetupReportPath string `json:"setupReportPath"`
}

type provisionCloudInitRelease struct {
	Version             string `json:"version"`
	Repo                string `json:"repo"`
	ReleaseBaseURL      string `json:"releaseBaseUrl"`
	InstallerURL        string `json:"installerUrl"`
	InstallerSHA256     string `json:"installerSha256"`
	MinisignPublicKey   string `json:"minisignPublicKey"`
	TailscaleInstallURL string `json:"tailscaleInstallUrl"`
}

type provisionCloudInitDisk struct {
	Shape   string `json:"shape"`
	FloorGB int    `json:"floorGb"`
	DiskGB  int    `json:"diskGb"`
}

type provisionCloudInitImage struct {
	Contract        string   `json:"contract"`
	OperatingSystem string   `json:"operatingSystem"`
	Assumptions     []string `json:"assumptions"`
}

type provisionCloudInitRedacted struct {
	RedactedFields []string `json:"redactedFields"`
}

func runProvisionRenderCloudInit(args []string, deps cliDeps) error {
	options, err := provisionRenderCloudInitOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := renderProvisionCloudInit(options)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(deps.stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode cloud-init JSON: %w", err)
	}
	return nil
}

func provisionRenderCloudInitOptionsFromArgs(args []string, deps cliDeps) (provisionRenderCloudInitOptions, error) {
	options := provisionRenderCloudInitOptions{
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
	flagSet := newFlagSet("setta provision render-cloudinit", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.StringVar(&options.RuntimeName, "runtime-name", "", "Tailscale hostname for the runtime")
	flagSet.StringVar(&options.TailscaleAuthKey, "tailscale-auth-key", "", "single-use Tailscale auth key to consume on first boot")
	flagSet.StringVar(&options.PairingTokenHash, "pairing-token-hash", "", "SHA-256 hash of the desktop-held pairing token")
	flagSet.StringVar(&options.ProvisionID, "provision-id", "", "non-secret provisioning correlation ID")
	flagSet.StringVar(&options.AttestationKey, "provision-attestation-key", "", "setup attestation HMAC key")
	flagSet.StringVar(&options.ExpiresAt, "expires-at", "", "RFC3339Nano provisioning expiry")
	flagSet.StringVar(&options.SettaVersion, "setta-version", options.SettaVersion, "explicit Setta release version")
	flagSet.StringVar(&options.InstallRepo, "install-repo", options.InstallRepo, "GitHub owner/repo for release downloads")
	flagSet.StringVar(&options.ReleaseBaseURL, "release-base-url", "", "explicit release asset base URL")
	flagSet.StringVar(&options.InstallerURL, "installer-url", "", "pinned installer script URL")
	flagSet.StringVar(&options.InstallerSHA256, "installer-sha256", "", "expected SHA-256 of the installer script")
	flagSet.StringVar(&options.MinisignPublicKey, "minisign-public-key", "", "minisign public key trusted for release verification")
	flagSet.StringVar(&options.Shape, "shape", options.Shape, "machine shape used for disk floor metadata")
	flagSet.IntVar(&options.DiskGB, "disk-gb", 0, "boot disk size in GiB; defaults to the shape floor")
	flagSet.StringVar(&options.ImageContract, "image-contract", options.ImageContract, "image contract identifier")
	flagSet.StringVar(&options.ServiceUser, "service-user", options.ServiceUser, "runtime service user")
	flagSet.StringVar(&options.ServiceGroup, "service-group", options.ServiceGroup, "runtime service group")
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", options.AppDataDir, "runtime app data directory")
	flagSet.StringVar(&options.SeedPath, "seed-path", "", "provisioning seed file path; defaults under app-data-dir")
	flagSet.IntVar(&options.RuntimePort, "runtime-port", options.RuntimePort, "runtime HTTP port")
	flagSet.StringVar(&options.BootstrapPath, "bootstrap-path", options.BootstrapPath, "temporary bootstrap script path")
	flagSet.StringVar(&options.SetupReportPath, "setup-report-path", options.SetupReportPath, "runtime setup report path")
	flagSet.StringVar(&options.TailscaleInstallURL, "tailscale-install-url", options.TailscaleInstallURL, "official Tailscale install script URL")
	if err := flagSet.Parse(args); err != nil {
		return provisionRenderCloudInitOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionRenderCloudInitOptions{}, usageError{err: errors.New("setta provision render-cloudinit does not accept positional arguments")}
	}
	if err := normalizeProvisionCloudInitOptions(&options); err != nil {
		return provisionRenderCloudInitOptions{}, err
	}
	return options, nil
}

func normalizeProvisionCloudInitOptions(options *provisionRenderCloudInitOptions) error {
	if !options.JSON {
		return usageError{err: errors.New("setta provision render-cloudinit requires --json")}
	}
	if err := normalizeProvisionCloudInitSecrets(options); err != nil {
		return err
	}
	if err := normalizeProvisionCloudInitRelease(options); err != nil {
		return err
	}
	return validateProvisionCloudInitLayout(options)
}

func normalizeProvisionCloudInitSecrets(options *provisionRenderCloudInitOptions) error {
	var err error
	if options.RuntimeName, err = validateCloudInitHostname(options.RuntimeName); err != nil {
		return err
	}
	if options.TailscaleAuthKey, err = requireSecretField("tailscale auth key", options.TailscaleAuthKey, 8); err != nil {
		return err
	}
	if options.PairingTokenHash, err = validateSHA256Hex("pairing token hash", options.PairingTokenHash); err != nil {
		return err
	}
	if options.ProvisionID, err = validateProvisionCloudInitID(options.ProvisionID); err != nil {
		return err
	}
	if options.AttestationKey, err = requireSecretField("provision attestation key", options.AttestationKey, 32); err != nil {
		return err
	}
	if options.ExpiresAt, err = validateRFC3339NanoField("expires-at", options.ExpiresAt); err != nil {
		return err
	}
	return nil
}

func normalizeProvisionCloudInitRelease(options *provisionRenderCloudInitOptions) error {
	var err error
	if options.SettaVersion, err = validatePinnedSettaVersion(options.SettaVersion); err != nil {
		return err
	}
	if options.InstallRepo, err = validateInstallRepo(options.InstallRepo); err != nil {
		return err
	}
	if options.ReleaseBaseURL == "" {
		options.ReleaseBaseURL = "https://github.com/" + options.InstallRepo + "/releases/download/" + options.SettaVersion
	}
	if options.ReleaseBaseURL, err = validateHTTPURL("release-base-url", options.ReleaseBaseURL); err != nil {
		return err
	}
	if options.InstallerURL == "" {
		options.InstallerURL = strings.TrimRight(options.ReleaseBaseURL, "/") + "/install.sh"
	}
	if options.InstallerURL, err = validateHTTPURL("installer-url", options.InstallerURL); err != nil {
		return err
	}
	if options.TailscaleInstallURL, err = validateHTTPURL("tailscale-install-url", options.TailscaleInstallURL); err != nil {
		return err
	}
	if options.InstallerSHA256, err = validateSHA256Hex("installer sha256", options.InstallerSHA256); err != nil {
		return err
	}
	if options.MinisignPublicKey, err = requirePlainField("minisign public key", options.MinisignPublicKey, 8, 256); err != nil {
		return err
	}
	return nil
}

func validateProvisionCloudInitLayout(options *provisionRenderCloudInitOptions) error {
	if err := validateProvisionCloudInitNames(options); err != nil {
		return err
	}
	if err := validateProvisionCloudInitPaths(options); err != nil {
		return err
	}
	return validateProvisionCloudInitDisk(options)
}

func validateProvisionCloudInitNames(options *provisionRenderCloudInitOptions) error {
	var err error
	if options.Shape, err = requirePlainField("shape", options.Shape, 1, 64); err != nil {
		return err
	}
	if options.ImageContract, err = requirePlainField("image contract", options.ImageContract, 1, 128); err != nil {
		return err
	}
	if options.ServiceUser, err = validateLinuxName("service user", options.ServiceUser); err != nil {
		return err
	}
	if options.ServiceGroup, err = validateLinuxName("service group", options.ServiceGroup); err != nil {
		return err
	}
	if options.RuntimePort <= 0 || options.RuntimePort > 65535 {
		return fmt.Errorf("runtime port must be between 1 and 65535: %d", options.RuntimePort)
	}
	return nil
}

func validateProvisionCloudInitPaths(options *provisionRenderCloudInitOptions) error {
	for label, path := range map[string]string{
		"app-data-dir":      options.AppDataDir,
		"bootstrap-path":    options.BootstrapPath,
		"seed-path":         options.SeedPath,
		"setup-report-path": options.SetupReportPath,
	} {
		if label == "seed-path" && path == "" {
			continue
		}
		if err := validateAbsoluteNoSpacePath(label, path); err != nil {
			return err
		}
	}
	if options.SeedPath == "" {
		options.SeedPath = path.Join(options.AppDataDir, "provisioning-seed.json")
	}
	return nil
}

func validateProvisionCloudInitDisk(options *provisionRenderCloudInitOptions) error {
	floor := diskFloorGB(options.Shape)
	if options.DiskGB == 0 {
		options.DiskGB = floor
	}
	if options.DiskGB < floor {
		return fmt.Errorf("disk-gb %d is below %s floor %d", options.DiskGB, options.Shape, floor)
	}
	return nil
}

func renderProvisionCloudInit(options provisionRenderCloudInitOptions) (provisionCloudInitResult, error) {
	redacted := redactedProvisionCloudInitOptions(options)
	cloudInit := renderCloudInitDocument(options)
	redactedCloudInit := renderCloudInitDocument(redacted)
	return provisionCloudInitResult{
		OK:                      true,
		CloudInit:               cloudInit,
		CloudInitSHA256:         sha256Hex([]byte(cloudInit)),
		RedactedCloudInit:       redactedCloudInit,
		RedactedCloudInitSHA256: sha256Hex([]byte(redactedCloudInit)),
		Runtime: provisionCloudInitRuntime{
			RuntimeName:     options.RuntimeName,
			ProvisionID:     options.ProvisionID,
			RuntimePort:     options.RuntimePort,
			ServiceUser:     options.ServiceUser,
			ServiceGroup:    options.ServiceGroup,
			AppDataDir:      options.AppDataDir,
			SeedPath:        options.SeedPath,
			SetupReportPath: options.SetupReportPath,
		},
		Release: provisionCloudInitRelease{
			Version:             options.SettaVersion,
			Repo:                options.InstallRepo,
			ReleaseBaseURL:      options.ReleaseBaseURL,
			InstallerURL:        options.InstallerURL,
			InstallerSHA256:     strings.ToLower(options.InstallerSHA256),
			MinisignPublicKey:   options.MinisignPublicKey,
			TailscaleInstallURL: options.TailscaleInstallURL,
		},
		Disk: provisionCloudInitDisk{
			Shape:   options.Shape,
			FloorGB: diskFloorGB(options.Shape),
			DiskGB:  options.DiskGB,
		},
		ImageContract: provisionCloudInitImage{
			Contract:        options.ImageContract,
			OperatingSystem: "Ubuntu LTS",
			Assumptions: []string{
				"Linux",
				"cloud-init user data",
				"apt package manager",
				"systemd preferred with no-systemd supervisor fallback",
				"Tailscale available through the official install flow",
			},
		},
		Secrets: provisionCloudInitRedacted{
			RedactedFields: []string{
				"tailscaleAuthKey",
				"pairingTokenHash",
				"provisionAttestationKey",
			},
		},
	}, nil
}

func renderCloudInitDocument(options provisionRenderCloudInitOptions) string {
	script := renderBootstrapScript(options)
	var builder strings.Builder
	builder.WriteString("#cloud-config\n")
	builder.WriteString("package_update: true\n")
	builder.WriteString("packages:\n")
	builder.WriteString("  - ca-certificates\n")
	builder.WriteString("  - curl\n")
	builder.WriteString("  - minisign\n")
	builder.WriteString("write_files:\n")
	builder.WriteString("  - path: " + options.BootstrapPath + "\n")
	builder.WriteString("    owner: root:root\n")
	builder.WriteString("    permissions: '0700'\n")
	builder.WriteString("    content: |\n")
	builder.WriteString(indentBlock(script, "      "))
	builder.WriteString("runcmd:\n")
	builder.WriteString("  - [ /bin/sh, " + options.BootstrapPath + " ]\n")
	return builder.String()
}

func renderBootstrapScript(options provisionRenderCloudInitOptions) string {
	values := cloudInitShellValues(options)
	return "#!/bin/sh\n" +
		"set -eu\n\n" +
		renderShellAssignments(values) +
		bootstrapScriptBody()
}

func cloudInitShellValues(options provisionRenderCloudInitOptions) [][2]string {
	return [][2]string{
		{"runtime_name", options.RuntimeName},
		{"tailscale_auth_key", options.TailscaleAuthKey},
		{"pairing_token_hash", strings.ToLower(options.PairingTokenHash)},
		{"provision_id", options.ProvisionID},
		{"provision_attestation_key", options.AttestationKey},
		{"provision_expires_at", options.ExpiresAt},
		{"setta_version", options.SettaVersion},
		{"install_repo", options.InstallRepo},
		{"release_base_url", options.ReleaseBaseURL},
		{"installer_url", options.InstallerURL},
		{"installer_sha256", strings.ToLower(options.InstallerSHA256)},
		{"minisign_public_key", options.MinisignPublicKey},
		{"tailscale_install_url", options.TailscaleInstallURL},
		{"service_user", options.ServiceUser},
		{"service_group", options.ServiceGroup},
		{"service_app_data_dir", options.AppDataDir},
		{"seed_path", options.SeedPath},
		{"setup_report_path", options.SetupReportPath},
		{"bootstrap_script_path", options.BootstrapPath},
		{"runtime_port", strconv.Itoa(options.RuntimePort)},
	}
}

func renderShellAssignments(values [][2]string) string {
	var builder strings.Builder
	for _, value := range values {
		builder.WriteString(value[0])
		builder.WriteByte('=')
		builder.WriteString(shellSingleQuote(value[1]))
		builder.WriteByte('\n')
	}
	builder.WriteByte('\n')
	return builder.String()
}

func bootstrapScriptBody() string {
	return `fail() {
  echo "setta cloud-init bootstrap: $*" >&2
  exit 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    LC_ALL=C LANG=C shasum -a 256 "$1" | awk '{print $1}'
  else
    fail "no SHA256 checksum tool available (need sha256sum or shasum)"
  fi
}

download_file() {
  source_url="$1"
  output_path="$2"
  curl -fsSL "$source_url" -o "$output_path" ||
    fail "failed to download ${source_url}"
}

have_systemd() {
  command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]
}

write_setup_report() {
  step="$1"
  status="$2"
  message="$3"
  mkdir -p "$service_app_data_dir"
  report_tmp="${setup_report_path}.tmp"
  cat >"$report_tmp" <<EOF
{"schemaVersion":1,"runtimeName":"${runtime_name}","provisionId":"${provision_id}","step":"${step}","status":"${status}","message":"${message}"}
EOF
  chmod 0640 "$report_tmp"
  mv "$report_tmp" "$setup_report_path"
}

install_os_prerequisites() {
  write_setup_report "os_prerequisites" "running" "installing packages"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl minisign
    return
  fi
  fail "unsupported image: apt-get is required by the ${runtime_name} image contract"
}

install_tailscale() {
  write_setup_report "tailscale_install" "running" "installing tailscale"
  if command -v tailscale >/dev/null 2>&1 && command -v tailscaled >/dev/null 2>&1; then
    return
  fi
  curl -fsSL "$tailscale_install_url" | sh
  command -v tailscale >/dev/null 2>&1 || fail "tailscale CLI was not installed"
  command -v tailscaled >/dev/null 2>&1 || fail "tailscaled was not installed"
}

configure_userspace_tailscaled_if_needed() {
  if [ -c /dev/net/tun ]; then
    return
  fi
  write_setup_report "tailscale_userspace_networking" "running" "configuring userspace networking"
  if have_systemd; then
    tailscaled_path="$(command -v tailscaled)"
    mkdir -p /etc/systemd/system/tailscaled.service.d
    cat >/etc/systemd/system/tailscaled.service.d/setta-userspace-networking.conf <<EOF
[Service]
ExecStart=
ExecStart=${tailscaled_path} --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --port 41641 --tun=userspace-networking
EOF
    systemctl daemon-reload
  fi
}

start_tailscaled() {
  write_setup_report "tailscaled" "running" "starting tailscaled"
  if have_systemd; then
    systemctl enable --now tailscaled
    return
  fi
  mkdir -p /run/tailscale /var/lib/tailscale
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    nohup tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --tun=userspace-networking >/var/log/setta-tailscaled.log 2>&1 &
  fi
}

join_tailnet() {
  write_setup_report "tailnet_join" "running" "joining tailnet"
  attempt=1
  while [ "$attempt" -le 30 ]; do
    if tailscale status >/dev/null 2>&1; then
      break
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  tailscale up --auth-key "$tailscale_auth_key" --hostname "$runtime_name" --accept-dns=false
}

download_verified_installer() {
  write_setup_report "setta_installer" "running" "downloading setta installer"
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/setta-cloudinit.XXXXXX")"
  installer_path="${tmp_dir}/install.sh"
  download_file "$installer_url" "$installer_path"
  actual_sha256="$(sha256_file "$installer_path")"
  [ "$actual_sha256" = "$installer_sha256" ] ||
    fail "installer sha256 mismatch for ${installer_url}"
  chmod 0700 "$installer_path"
}

run_systemd_installer() {
  write_setup_report "setta_install" "running" "installing setta service"
  SETTA_VERSION="$setta_version" \
  SETTA_INSTALL_REPO="$install_repo" \
  SETTA_INSTALL_BASE_URL="$release_base_url" \
  SETTA_INSTALL_SERVICE=1 \
  SETTA_SERVICE_START=0 \
  SETTA_SERVICE_APP_DATA_DIR="$service_app_data_dir" \
  SETTA_SERVICE_USER="$service_user" \
  SETTA_SERVICE_GROUP="$service_group" \
  SETTA_PROVISIONING_SEED_FILE="$seed_path" \
  SETTA_MINISIGN_PUBLIC_KEY="$minisign_public_key" \
    sh "$installer_path"
}

ensure_no_systemd_identity() {
  if ! getent group "$service_group" >/dev/null 2>&1; then
    groupadd --system "$service_group"
  fi
  if ! id -u "$service_user" >/dev/null 2>&1; then
    useradd --system \
      --gid "$service_group" \
      --home-dir "$service_app_data_dir" \
      --no-create-home \
      --shell /usr/sbin/nologin \
      "$service_user"
  fi
  install -d -m 0750 -o "$service_user" -g "$service_group" "$service_app_data_dir"
}

run_no_systemd_installer() {
  write_setup_report "setta_install_no_systemd" "running" "installing setta without systemd"
  ensure_no_systemd_identity
  SETTA_VERSION="$setta_version" \
  SETTA_INSTALL_REPO="$install_repo" \
  SETTA_INSTALL_BASE_URL="$release_base_url" \
  SETTA_INSTALL_SERVICE=0 \
  SETTA_INSTALL_DIR=/usr/local/bin \
  SETTA_MINISIGN_PUBLIC_KEY="$minisign_public_key" \
  HOME="$service_app_data_dir" \
    sh "$installer_path"
}

write_provisioning_seed() {
  write_setup_report "provisioning_seed" "running" "writing provisioning seed"
  install -d -m 0750 -o "$service_user" -g "$service_group" "$service_app_data_dir"
  seed_tmp="${seed_path}.tmp"
  cat >"$seed_tmp" <<EOF
{"pairingTokenHash":"${pairing_token_hash}","provisionId":"${provision_id}","provisionAttestationKey":"${provision_attestation_key}","expiresAt":"${provision_expires_at}"}
EOF
  chmod 0600 "$seed_tmp"
  chown "$service_user:$service_group" "$seed_tmp"
  mv "$seed_tmp" "$seed_path"
}

write_no_systemd_supervisor() {
  supervisor_path=/usr/local/bin/setta-runtime-supervise
  cat >"$supervisor_path" <<EOF
#!/bin/sh
set -eu
while :; do
  /usr/local/bin/setta serve --app-data-dir ${service_app_data_dir} --tailnet --port ${runtime_port} --provisioning-seed-file ${seed_path} >>/var/log/setta-runtime.log 2>&1 || true
  sleep 5
done
EOF
  chmod 0755 "$supervisor_path"
  chown root:root "$supervisor_path"
}

start_no_systemd_runtime() {
  write_setup_report "setta_start_no_systemd" "running" "starting setta supervisor"
  write_no_systemd_supervisor
  if command -v runuser >/dev/null 2>&1; then
    nohup runuser -u "$service_user" -- /usr/local/bin/setta-runtime-supervise >/var/log/setta-runtime-supervise.log 2>&1 &
  else
    nohup su -s /bin/sh -c /usr/local/bin/setta-runtime-supervise "$service_user" >/var/log/setta-runtime-supervise.log 2>&1 &
  fi
  nohup sh -c '/usr/local/bin/setta service configure-tailscale-serve --app-data-dir '"$service_app_data_dir"' --timeout 180s >>/var/log/setta-tailscale-serve.log 2>&1' >/dev/null 2>&1 &
}

start_setta_runtime() {
  if have_systemd; then
    write_setup_report "setta_start" "running" "starting setta service"
    systemctl enable --now setta.service
    return
  fi
  start_no_systemd_runtime
}

cleanup_bootstrap() {
  rm -f "$bootstrap_script_path"
  if [ -n "${tmp_dir:-}" ]; then
    rm -rf "$tmp_dir"
  fi
}

trap cleanup_bootstrap EXIT HUP INT TERM

install_os_prerequisites
install_tailscale
configure_userspace_tailscaled_if_needed
start_tailscaled
join_tailnet
download_verified_installer
if have_systemd; then
  run_systemd_installer
else
  run_no_systemd_installer
fi
write_provisioning_seed
start_setta_runtime
write_setup_report "complete" "ok" "setta runtime bootstrap complete"
`
}

func redactedProvisionCloudInitOptions(options provisionRenderCloudInitOptions) provisionRenderCloudInitOptions {
	options.TailscaleAuthKey = "__SETTA_REDACTED_TAILSCALE_AUTH_KEY__"
	options.PairingTokenHash = "__SETTA_REDACTED_PAIRING_TOKEN_HASH__"
	options.AttestationKey = "__SETTA_REDACTED_PROVISION_ATTESTATION_KEY__"
	return options
}

func diskFloorGB(shape string) int {
	if strings.HasPrefix(shape, "gpu-") {
		return 128
	}
	return 64
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func indentBlock(value string, prefix string) string {
	var builder strings.Builder
	lines := strings.SplitAfter(value, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		builder.WriteString(prefix)
		builder.WriteString(line)
	}
	if !strings.HasSuffix(value, "\n") {
		builder.WriteByte('\n')
	}
	return builder.String()
}

func shellSingleQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func validateCloudInitHostname(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("runtime-name is required")
	}
	if trimmed != strings.ToLower(trimmed) || !cloudInitHostnamePattern.MatchString(trimmed) {
		return "", fmt.Errorf("runtime-name must be a lowercase DNS hostname label: %s", value)
	}
	return trimmed, nil
}

func validateSHA256Hex(label string, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if !hexSHA256Pattern.MatchString(trimmed) {
		return "", fmt.Errorf("%s must be a 64-character SHA-256 hex digest", label)
	}
	return strings.ToLower(trimmed), nil
}

func validateProvisionCloudInitID(value string) (string, error) {
	return requirePlainField("provision-id", value, 8, 128)
}

func validateRFC3339NanoField(label string, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	if _, err := time.Parse(time.RFC3339Nano, trimmed); err != nil {
		return "", fmt.Errorf("%s must be RFC3339Nano: %w", label, err)
	}
	return trimmed, nil
}

func validatePinnedSettaVersion(value string) (string, error) {
	trimmed, err := requirePlainField("setta-version", value, 1, 128)
	if err != nil {
		return "", err
	}
	switch trimmed {
	case "latest", "dev":
		return "", fmt.Errorf("setta-version must be explicit and pinned, got %q", trimmed)
	}
	return trimmed, nil
}

func validateInstallRepo(value string) (string, error) {
	trimmed, err := requirePlainField("install repo", value, 3, 256)
	if err != nil {
		return "", err
	}
	if strings.Count(trimmed, "/") != 1 || strings.HasPrefix(trimmed, "/") || strings.HasSuffix(trimmed, "/") {
		return "", fmt.Errorf("install repo must use owner/repo form: %s", value)
	}
	return trimmed, nil
}

func validateHTTPURL(label string, value string) (string, error) {
	trimmed, err := requirePlainField(label, value, 8, 2048)
	if err != nil {
		return "", err
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("%s must be a valid URL: %w", label, err)
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return "", fmt.Errorf("%s must use http or https: %s", label, value)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("%s must include a host: %s", label, value)
	}
	return trimmed, nil
}

func validateLinuxName(label string, value string) (string, error) {
	trimmed, err := requirePlainField(label, value, 1, 32)
	if err != nil {
		return "", err
	}
	for index, character := range trimmed {
		if character == '-' || character == '_' || unicode.IsLower(character) || unicode.IsDigit(character) {
			continue
		}
		if index == len(trimmed)-1 && character == '$' {
			continue
		}
		return "", fmt.Errorf("%s contains unsupported character %q", label, character)
	}
	return trimmed, nil
}

func validateAbsoluteNoSpacePath(label string, value string) error {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "/") {
		return fmt.Errorf("%s must be absolute: %s", label, value)
	}
	for _, character := range trimmed {
		if character == '/' || character == '.' || character == '_' || character == '-' ||
			unicode.IsLower(character) || unicode.IsUpper(character) || unicode.IsDigit(character) {
			continue
		}
		return fmt.Errorf("%s contains unsupported path character %q", label, character)
	}
	return nil
}

func requireSecretField(label string, value string, minLength int) (string, error) {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < minLength {
		return "", fmt.Errorf("%s must be at least %d bytes", label, minLength)
	}
	if containsControlCharacter(trimmed) {
		return "", fmt.Errorf("%s must not contain control characters", label)
	}
	return trimmed, nil
}

func requirePlainField(label string, value string, minLength int, maxLength int) (string, error) {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < minLength {
		return "", fmt.Errorf("%s must be at least %d bytes", label, minLength)
	}
	if len(trimmed) > maxLength {
		return "", fmt.Errorf("%s must be at most %d bytes", label, maxLength)
	}
	if containsControlCharacter(trimmed) || strings.ContainsAny(trimmed, " \t") {
		return "", fmt.Errorf("%s must not contain whitespace or control characters", label)
	}
	return trimmed, nil
}

func containsControlCharacter(value string) bool {
	for _, character := range value {
		if unicode.IsControl(character) {
			return true
		}
	}
	return false
}
