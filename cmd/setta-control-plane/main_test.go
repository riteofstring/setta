package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

func TestConfigFromArgsRequiresDurableBoundariesAndProviderSecret(t *testing.T) {
	validEnvironment := map[string]string{
		"SETTA_CONTROL_PLANE_DATA_DIR":   filepath.Join(t.TempDir(), "data"),
		"SETTA_CONTROL_PLANE_SECRET_DIR": filepath.Join(t.TempDir(), "secrets"),
		"SPRITE_TOKEN":                   "provider-token",
	}
	config, err := configFromArgs(nil, &bytes.Buffer{}, mapEnvironment(validEnvironment))
	if err != nil {
		t.Fatalf("configFromArgs: %v", err)
	}
	if config.Host != "127.0.0.1" || config.Port != 8080 ||
		config.MaxConcurrentRequest != 64 || config.MaxRequestBytes != 1<<20 ||
		config.RuntimeTarget != "127.0.0.1:7345" {
		t.Fatalf("default config = %+v", config)
	}

	for _, name := range []string{
		"SETTA_CONTROL_PLANE_DATA_DIR",
		"SETTA_CONTROL_PLANE_SECRET_DIR",
		"SPRITE_TOKEN",
	} {
		environment := map[string]string{}
		for key, value := range validEnvironment {
			environment[key] = value
		}
		delete(environment, name)
		if _, err := configFromArgs(nil, &bytes.Buffer{}, mapEnvironment(environment)); err == nil {
			t.Fatalf("config without %s succeeded", name)
		}
	}
}

func TestConfigFromArgsAcceptsExplicitHostedCeilings(t *testing.T) {
	environment := map[string]string{
		"SETTA_CONTROL_PLANE_DATA_DIR":   filepath.Join(t.TempDir(), "data"),
		"SETTA_CONTROL_PLANE_SECRET_DIR": filepath.Join(t.TempDir(), "secrets"),
		"SPRITE_TOKEN":                   "provider-token",
	}
	config, err := configFromArgs([]string{
		"--host", "0.0.0.0",
		"--port", "9090",
		"--max-concurrent-requests", "8",
		"--max-request-bytes", "65536",
		"--shutdown-timeout", "20s",
	}, &bytes.Buffer{}, mapEnvironment(environment))
	if err != nil {
		t.Fatalf("configFromArgs: %v", err)
	}
	if config.Host != "0.0.0.0" || config.Port != 9090 ||
		config.MaxConcurrentRequest != 8 || config.MaxRequestBytes != 65536 ||
		config.ShutdownTimeout.String() != "20s" {
		t.Fatalf("explicit config = %+v", config)
	}
}

func TestBootstrapIsRestartSafeAndKeepsCredentialsInPrivateFiles(t *testing.T) {
	fixture := newBootstrapFixture(t)
	for attempt := 0; attempt < 2; attempt++ {
		runBootstrapAttempt(t, fixture.args, fixture.runtimeName, attempt)
	}
	verifyBootstrapState(t, fixture)
}

func TestBootstrapAcceptsOnePinnedClientCredentialFromStdinAcrossRetries(t *testing.T) {
	fixture := newBootstrapFixture(t)
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	args := append(append([]string(nil), fixture.args...), "--client-credential-stdin")
	for attempt := 0; attempt < 2; attempt++ {
		var stdout bytes.Buffer
		if exitCode := runBootstrap(args, bytes.NewReader(payload), &stdout, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 0 {
			t.Fatalf("stdin bootstrap attempt %d exit code = %d", attempt+1, exitCode)
		}
	}
	stored, err := os.ReadFile(fixture.clientCredentialFile)
	if err != nil {
		t.Fatal(err)
	}
	var storedCredential controlplane.DeviceCredential
	if err := json.Unmarshal(stored, &storedCredential); err != nil || storedCredential != credential {
		t.Fatalf("stored credential = %+v, %v", storedCredential, err)
	}
	different, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	differentPayload, _ := json.Marshal(different)
	if exitCode := runBootstrap(args, bytes.NewReader(differentPayload), &bytes.Buffer{}, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 1 {
		t.Fatalf("mismatched stdin bootstrap exit code = %d", exitCode)
	}
}

func TestEnsureRuntimeCommandPersistsOneRestartSafeIntent(t *testing.T) {
	root := t.TempDir()
	identity, err := runtimeprovider.NewManagedIdentity("control-plane-ensure-command")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	args := []string{
		"--data-dir", filepath.Join(root, "data"),
		"--idempotency-key", "ensure-command-operation",
		"--runtime-name", identity.Name,
		"--runtime-secret-ref", "future_runtime_credential",
		"--user-id", "user-ensure-command",
	}
	for attempt := 0; attempt < 2; attempt++ {
		var stdout bytes.Buffer
		if exitCode := runEnsureRuntime(args, &stdout, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 0 {
			t.Fatalf("ensure-runtime attempt %d exit code = %d", attempt+1, exitCode)
		}
		var event ensureRuntimeEvent
		if err := json.Unmarshal(stdout.Bytes(), &event); err != nil {
			t.Fatalf("decode ensure-runtime event: %v", err)
		}
		if event.RuntimeName != identity.Name || event.Status != controlplane.RuntimeOperationPending {
			t.Fatalf("ensure-runtime event = %+v", event)
		}
	}
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: filepath.Join(root, "data")})
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	defer store.Close()
	operation, err := store.RuntimeOperation(context.Background(), "ensure-command-operation")
	if err != nil || operation.AttemptCount != 0 || operation.Status != controlplane.RuntimeOperationPending {
		t.Fatalf("persisted ensure-runtime operation = %+v, %v", operation, err)
	}
}

func TestAdminCommandsMutateTheLiveControlPlaneWithoutPrintingCredentials(t *testing.T) {
	fixture := newBootstrapFixture(t)
	runBootstrapAttempt(t, fixture.args, fixture.runtimeName, 0)
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: fixture.dataDirectory})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server, err := controlplane.StartAdminServer(controlplane.AdminServerConfig{
		SocketPath: controlplane.AdminSocketPath(fixture.dataDirectory), Store: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			t.Error(err)
		}
		if err := server.Wait(); err != nil {
			t.Error(err)
		}
	}()

	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	socketPath := controlplane.AdminSocketPath(fixture.dataDirectory)
	ensureOutput := runAdminTestCommand(t, []string{
		"ensure-device", "--socket", socketPath, "--device-name", "Hosted replacement",
		"--runtime-name", fixture.runtimeName, "--user-id", "user-bootstrap",
	}, payload)
	if bytes.Contains(ensureOutput, []byte(credential.Token)) {
		t.Fatal("administration output exposed the device token")
	}
	authorization, err := store.AuthorizeClient(context.Background(), credential.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("replacement authorization = %+v, %v", authorization, err)
	}
	runAdminTestCommand(t, []string{
		"set-user-status", "--socket", socketPath, "--status", "suspended", "--user-id", "user-bootstrap",
	}, nil)
	select {
	case <-authorization.Invalidated:
	case <-time.After(time.Second):
		t.Fatal("administrative suspension did not push invalidation")
	}
	runAdminTestCommand(t, []string{
		"set-user-status", "--socket", socketPath, "--status", "active", "--user-id", "user-bootstrap",
	}, nil)
	runAdminTestCommand(t, []string{
		"revoke-device", "--socket", socketPath, "--device-id", credential.DeviceID,
	}, nil)
	authorization, err = store.AuthorizeClient(context.Background(), credential.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationRevoked {
		t.Fatalf("revoked authorization = %+v, %v", authorization, err)
	}
}

func runAdminTestCommand(t *testing.T, args []string, stdin []byte) []byte {
	t.Helper()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if exitCode := runAdmin(args, bytes.NewReader(stdin), &stdout, &stderr); exitCode != 0 {
		t.Fatalf("admin command exit %d: %s", exitCode, stderr.String())
	}
	return stdout.Bytes()
}

type bootstrapFixture struct {
	args                 []string
	clientCredentialFile string
	dataDirectory        string
	runtimeName          string
	secretDirectory      string
}

func newBootstrapFixture(t *testing.T) bootstrapFixture {
	t.Helper()
	root := t.TempDir()
	runtimeCredentialFile := filepath.Join(root, "input", "runtime-credential")
	if err := os.MkdirAll(filepath.Dir(runtimeCredentialFile), 0o700); err != nil {
		t.Fatalf("create runtime credential directory: %v", err)
	}
	if err := os.WriteFile(runtimeCredentialFile, []byte("runtime-bootstrap-secret"), 0o600); err != nil {
		t.Fatalf("write runtime credential: %v", err)
	}
	identity, err := runtimeprovider.NewManagedIdentity("control-plane-bootstrap-test")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	fixture := bootstrapFixture{
		clientCredentialFile: filepath.Join(root, "output", "client-credential.json"),
		dataDirectory:        filepath.Join(root, "data"),
		runtimeName:          identity.Name,
		secretDirectory:      filepath.Join(root, "secrets"),
	}
	fixture.args = []string{
		"--client-credential-file", fixture.clientCredentialFile,
		"--data-dir", fixture.dataDirectory,
		"--device-name", "Bootstrap phone",
		"--idempotency-key", "bootstrap-operation",
		"--runtime-credential-file", runtimeCredentialFile,
		"--runtime-name", fixture.runtimeName,
		"--runtime-secret-ref", "runtime_bootstrap",
		"--secret-dir", fixture.secretDirectory,
		"--user-id", "user-bootstrap",
	}
	return fixture
}

func runBootstrapAttempt(t *testing.T, args []string, runtimeName string, attempt int) {
	t.Helper()
	var stdout bytes.Buffer
	if exitCode := runBootstrap(args, &bytes.Buffer{}, &stdout, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 0 {
		t.Fatalf("bootstrap attempt %d exit code = %d", attempt+1, exitCode)
	}
	var event controlplane.BootstrapEvent
	if err := json.Unmarshal(stdout.Bytes(), &event); err != nil {
		t.Fatalf("decode bootstrap event: %v", err)
	}
	if event.Event != controlplane.BootstrapReadyEvent || event.RuntimeName != runtimeName {
		t.Fatalf("bootstrap event = %+v", event)
	}
}

func verifyBootstrapState(t *testing.T, fixture bootstrapFixture) {
	t.Helper()
	credentialBytes, err := os.ReadFile(fixture.clientCredentialFile)
	if err != nil {
		t.Fatalf("read client credential: %v", err)
	}
	var credential controlplane.DeviceCredential
	if err := json.Unmarshal(credentialBytes, &credential); err != nil {
		t.Fatalf("decode client credential: %v", err)
	}
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: fixture.dataDirectory})
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	defer store.Close()
	authorization, err := store.AuthorizeClient(context.Background(), credential.Token)
	if err != nil {
		t.Fatalf("AuthorizeClient: %v", err)
	}
	if authorization.Outcome != runtimeaccess.AuthorizationAllowed || authorization.RuntimeName != fixture.runtimeName {
		t.Fatalf("bootstrap authorization = %+v", authorization)
	}
	secretStore, err := controlplane.OpenFileSecretStore(fixture.secretDirectory)
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	secret, err := secretStore.ReadSecret(context.Background(), "runtime_bootstrap")
	if err != nil || string(secret) != "runtime-bootstrap-secret" {
		t.Fatalf("runtime secret = %q, %v", secret, err)
	}
	info, err := os.Stat(fixture.clientCredentialFile)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("client credential permissions = %v, %v", info, err)
	}
}

func TestRunRequiresExplicitSubcommand(t *testing.T) {
	var stderr bytes.Buffer
	if exitCode := run(nil, &bytes.Buffer{}, &bytes.Buffer{}, &stderr, mapEnvironment(nil), func(string) error { return nil }); exitCode != 2 {
		t.Fatalf("run without subcommand exit code = %d", exitCode)
	}
}

func mapEnvironment(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}
