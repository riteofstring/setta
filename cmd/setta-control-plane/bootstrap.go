package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"setta/internal/controlplane"
)

const maximumBootstrapCredentialBytes = 16 * 1024

type bootstrapConfig struct {
	ClientCredentialFile  string
	ClientCredentialStdin bool
	CredentialEpoch       uint64
	DataDirectory         string
	DeviceDisplayName     string
	GrantTTL              time.Duration
	IdempotencyKey        string
	RuntimeCredentialFile string
	RuntimeName           string
	RuntimeSecretRef      string
	RuntimeTarget         string
	SecretDirectory       string
	UserID                string
}

func runBootstrap(
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	getenv func(string) string,
) int {
	config, err := bootstrapConfigFromArgs(args, stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	if err := bootstrapControlPlane(context.Background(), config, stdin, stdout); err != nil {
		fmt.Fprintf(stderr, "bootstrap control plane: %v\n", err)
		return 1
	}
	return 0
}

func bootstrapControlPlane(ctx context.Context, config bootstrapConfig, stdin io.Reader, stdout io.Writer) (returnErr error) {
	credential, err := ensureDeviceCredential(config.ClientCredentialFile, config.ClientCredentialStdin, stdin)
	if err != nil {
		return err
	}
	runtimeCredential, err := readPrivateCredentialFile(config.RuntimeCredentialFile)
	if err != nil {
		return err
	}
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: config.DataDirectory})
	if err != nil {
		return err
	}
	defer func() {
		if err := store.Close(); err != nil && returnErr == nil {
			returnErr = err
		}
	}()
	secrets, err := controlplane.OpenFileSecretStore(config.SecretDirectory)
	if err != nil {
		return err
	}
	if err := secrets.WriteSecret(ctx, config.RuntimeSecretRef, runtimeCredential); err != nil {
		return err
	}
	if _, err := store.UpsertUser(ctx, config.UserID); err != nil {
		return err
	}
	if _, err := store.AssignRuntime(ctx, controlplane.AssignRuntimeRequest{
		IdempotencyKey:      config.IdempotencyKey,
		UserID:              config.UserID,
		RuntimeName:         config.RuntimeName,
		Lifecycle:           controlplane.RuntimeLifecycleReady,
		AccessState:         controlplane.RuntimeAccessEnabled,
		CredentialEpoch:     config.CredentialEpoch,
		UpstreamAuthority:   config.RuntimeTarget,
		CredentialSecretRef: config.RuntimeSecretRef,
	}); err != nil {
		return err
	}
	created, err := store.EnsureDeviceGrant(ctx, controlplane.EnsureDeviceGrantRequest{
		Credential:  credential,
		UserID:      config.UserID,
		RuntimeName: config.RuntimeName,
		DisplayName: config.DeviceDisplayName,
		GrantTTL:    config.GrantTTL,
	})
	if err != nil {
		return err
	}
	return json.NewEncoder(stdout).Encode(controlplane.BootstrapEvent{
		DeviceID:    created.Device.ID,
		Event:       controlplane.BootstrapReadyEvent,
		RuntimeName: created.Grant.RuntimeName,
	})
}

func bootstrapConfigFromArgs(
	args []string,
	stderr io.Writer,
	getenv func(string) string,
) (bootstrapConfig, error) {
	config := bootstrapConfig{
		DataDirectory:   getenv("SETTA_CONTROL_PLANE_DATA_DIR"),
		GrantTTL:        2 * time.Hour,
		RuntimeTarget:   defaultRuntimeTarget,
		SecretDirectory: getenv("SETTA_CONTROL_PLANE_SECRET_DIR"),
		CredentialEpoch: 1,
	}
	flagSet := flag.NewFlagSet("setta-control-plane bootstrap", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.ClientCredentialFile, "client-credential-file", "", "private durable file for the client credential")
	flagSet.BoolVar(&config.ClientCredentialStdin, "client-credential-stdin", false, "read and persist the client credential from stdin")
	flagSet.Uint64Var(&config.CredentialEpoch, "credential-epoch", config.CredentialEpoch, "runtime credential epoch")
	flagSet.StringVar(&config.DataDirectory, "data-dir", config.DataDirectory, "absolute durable control-plane database directory")
	flagSet.StringVar(&config.DeviceDisplayName, "device-name", "", "operator-visible device name")
	flagSet.DurationVar(&config.GrantTTL, "grant-ttl", config.GrantTTL, "bounded client access grant lifetime")
	flagSet.StringVar(&config.IdempotencyKey, "idempotency-key", "", "unique runtime assignment operation key")
	flagSet.StringVar(&config.RuntimeCredentialFile, "runtime-credential-file", "", "private input file containing the inner runtime credential")
	flagSet.StringVar(&config.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	flagSet.StringVar(&config.RuntimeSecretRef, "runtime-secret-ref", "", "secret-store reference for the runtime credential")
	flagSet.StringVar(&config.RuntimeTarget, "runtime-target", config.RuntimeTarget, "loopback runtime HTTP target")
	flagSet.StringVar(&config.SecretDirectory, "secret-dir", config.SecretDirectory, "absolute durable runtime credential directory")
	flagSet.StringVar(&config.UserID, "user-id", "", "immutable Setta user identifier")
	if err := flagSet.Parse(args); err != nil {
		return bootstrapConfig{}, err
	}
	if flagSet.NArg() != 0 {
		return bootstrapConfig{}, errors.New("bootstrap does not accept positional arguments")
	}
	if err := validateBootstrapConfig(config); err != nil {
		return bootstrapConfig{}, err
	}
	return config, nil
}

func ensureDeviceCredential(path string, fromStdin bool, stdin io.Reader) (controlplane.DeviceCredential, error) {
	if !fromStdin {
		return ensureDeviceCredentialFile(path)
	}
	if stdin == nil {
		return controlplane.DeviceCredential{}, errors.New("bootstrap client credential stdin is required")
	}
	credential, err := decodeDeviceCredential(stdin)
	if err != nil {
		return controlplane.DeviceCredential{}, err
	}
	if err := controlplane.ValidateDeviceCredential(credential); err != nil {
		return controlplane.DeviceCredential{}, err
	}
	existing, err := readDeviceCredentialFile(path)
	if err == nil {
		if existing != credential {
			return controlplane.DeviceCredential{}, errors.New("bootstrap client credential differs from the durable credential")
		}
		return existing, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return controlplane.DeviceCredential{}, err
	}
	if err := writePrivateJSONFile(path, credential); err != nil {
		return controlplane.DeviceCredential{}, err
	}
	return credential, nil
}

func decodeDeviceCredential(reader io.Reader) (controlplane.DeviceCredential, error) {
	payload, err := io.ReadAll(io.LimitReader(reader, maximumBootstrapCredentialBytes+1))
	if err != nil {
		return controlplane.DeviceCredential{}, fmt.Errorf("read bootstrap client credential stdin: %w", err)
	}
	if len(payload) > maximumBootstrapCredentialBytes {
		return controlplane.DeviceCredential{}, errors.New("bootstrap client credential stdin exceeds the size limit")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var credential controlplane.DeviceCredential
	if err := decoder.Decode(&credential); err != nil {
		return controlplane.DeviceCredential{}, fmt.Errorf("decode bootstrap client credential stdin: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return controlplane.DeviceCredential{}, errors.New("bootstrap client credential stdin must contain one JSON value")
	}
	return credential, nil
}

func validateBootstrapConfig(config bootstrapConfig) error {
	if err := validateBootstrapPaths(config); err != nil {
		return err
	}
	if err := validateBootstrapIdentity(config); err != nil {
		return err
	}
	if config.CredentialEpoch == 0 || config.GrantTTL <= 0 || config.GrantTTL > 30*24*time.Hour {
		return errors.New("bootstrap credential epoch and grant TTL are out of bounds")
	}
	return nil
}

func validateBootstrapPaths(config bootstrapConfig) error {
	for label, path := range map[string]string{
		"client credential file":         config.ClientCredentialFile,
		"control-plane data directory":   config.DataDirectory,
		"runtime credential file":        config.RuntimeCredentialFile,
		"control-plane secret directory": config.SecretDirectory,
	} {
		if path == "" || !filepath.IsAbs(path) {
			return fmt.Errorf("%s must be absolute", label)
		}
	}
	return nil
}

func validateBootstrapIdentity(config bootstrapConfig) error {
	if config.UserID == "" || config.RuntimeName == "" || config.RuntimeSecretRef == "" ||
		config.DeviceDisplayName == "" || config.IdempotencyKey == "" {
		return errors.New("bootstrap identity, runtime, device, secret reference, and idempotency key are required")
	}
	return nil
}

func ensureDeviceCredentialFile(path string) (controlplane.DeviceCredential, error) {
	credential, err := readDeviceCredentialFile(path)
	if err == nil {
		return credential, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return controlplane.DeviceCredential{}, err
	}
	credential, err = controlplane.NewDeviceCredential()
	if err != nil {
		return controlplane.DeviceCredential{}, err
	}
	if err := writePrivateJSONFile(path, credential); err != nil {
		return controlplane.DeviceCredential{}, err
	}
	return credential, nil
}

func readDeviceCredentialFile(path string) (controlplane.DeviceCredential, error) {
	file, err := openPrivateRegularFile(path)
	if err != nil {
		return controlplane.DeviceCredential{}, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, maximumBootstrapCredentialBytes+1))
	decoder.DisallowUnknownFields()
	var credential controlplane.DeviceCredential
	if err := decoder.Decode(&credential); err != nil {
		return controlplane.DeviceCredential{}, fmt.Errorf("decode client credential file: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return controlplane.DeviceCredential{}, errors.New("client credential file must contain one JSON value")
	}
	return credential, nil
}

func readPrivateCredentialFile(path string) ([]byte, error) {
	file, err := openPrivateRegularFile(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := bufio.NewReader(io.LimitReader(file, maximumBootstrapCredentialBytes+1))
	credential, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read private credential file: %w", err)
	}
	return credential, nil
}

func openPrivateRegularFile(path string) (*os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
		_ = file.Close()
		return nil, errors.New("credential path must be a private regular file")
	}
	return file, nil
}

func writePrivateJSONFile(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create client credential directory: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".client-credential-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	installed := false
	defer func() {
		if !installed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return err
	}
	if err := json.NewEncoder(temporary).Encode(value); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return err
	}
	installed = true
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
