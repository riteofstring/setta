package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"syscall"
	"time"

	"setta/internal/controlplane"
)

const offlineControlPlaneProbeTimeout = 250 * time.Millisecond

type backupCommandConfig struct {
	DataDirectory   string
	OutputDirectory string
	SecretDirectory string
}

type restoreCommandConfig struct {
	BackupDirectory string
	DataDirectory   string
	SecretDirectory string
}

type backupCommandEvent struct {
	CreatedAt   string `json:"created_at"`
	Event       string `json:"event"`
	SecretCount int    `json:"secret_count"`
}

func runBackup(args []string, stdout io.Writer, stderr io.Writer) int {
	config, err := parseBackupCommand(args, stderr)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	if err := requireStoppedControlPlane(config.DataDirectory); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	if err := requireBackupSources(config.DataDirectory, config.SecretDirectory); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: config.DataDirectory})
	if err != nil {
		fmt.Fprintf(stderr, "open control-plane store for backup: %v\n", err)
		return 1
	}
	secrets, err := controlplane.OpenFileSecretStore(config.SecretDirectory)
	if err != nil {
		_ = store.Close()
		fmt.Fprintf(stderr, "open control-plane secrets for backup: %v\n", err)
		return 1
	}
	manifest, backupErr := controlplane.CreateBackup(
		context.Background(),
		store,
		secrets,
		config.OutputDirectory,
	)
	closeErr := store.Close()
	if backupErr != nil || closeErr != nil {
		fmt.Fprintf(stderr, "create control-plane backup: %v\n", errors.Join(backupErr, closeErr))
		return 1
	}
	if err := json.NewEncoder(stdout).Encode(backupCommandEvent{
		CreatedAt:   manifest.CreatedAt,
		Event:       "control_plane_backup_complete",
		SecretCount: len(manifest.Secrets),
	}); err != nil {
		fmt.Fprintf(stderr, "write control-plane backup result: %v\n", err)
		return 1
	}
	return 0
}

func runRestore(args []string, stdout io.Writer, stderr io.Writer) int {
	config, err := parseRestoreCommand(args, stderr)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	manifest, err := controlplane.RestoreBackup(
		context.Background(),
		config.BackupDirectory,
		config.DataDirectory,
		config.SecretDirectory,
	)
	if err != nil {
		fmt.Fprintf(stderr, "restore control-plane backup: %v\n", err)
		return 1
	}
	if err := json.NewEncoder(stdout).Encode(backupCommandEvent{
		CreatedAt:   manifest.CreatedAt,
		Event:       "control_plane_restore_complete",
		SecretCount: len(manifest.Secrets),
	}); err != nil {
		fmt.Fprintf(stderr, "write control-plane restore result: %v\n", err)
		return 1
	}
	return 0
}

func parseBackupCommand(args []string, stderr io.Writer) (backupCommandConfig, error) {
	var config backupCommandConfig
	flags := flag.NewFlagSet("setta-control-plane backup", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&config.DataDirectory, "data-dir", "", "absolute stopped control-plane database directory")
	flags.StringVar(&config.OutputDirectory, "output-dir", "", "absolute new backup directory")
	flags.StringVar(&config.SecretDirectory, "secret-dir", "", "absolute stopped runtime credential directory")
	if err := flags.Parse(args); err != nil {
		return backupCommandConfig{}, err
	}
	if flags.NArg() != 0 {
		return backupCommandConfig{}, errors.New("setta-control-plane backup does not accept positional arguments")
	}
	if err := requireAbsoluteDirectories(
		config.DataDirectory,
		config.OutputDirectory,
		config.SecretDirectory,
	); err != nil {
		return backupCommandConfig{}, err
	}
	return config, nil
}

func parseRestoreCommand(args []string, stderr io.Writer) (restoreCommandConfig, error) {
	var config restoreCommandConfig
	flags := flag.NewFlagSet("setta-control-plane restore", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&config.BackupDirectory, "backup-dir", "", "absolute control-plane backup directory")
	flags.StringVar(&config.DataDirectory, "data-dir", "", "absolute absent restore database directory")
	flags.StringVar(&config.SecretDirectory, "secret-dir", "", "absolute absent restore runtime credential directory")
	if err := flags.Parse(args); err != nil {
		return restoreCommandConfig{}, err
	}
	if flags.NArg() != 0 {
		return restoreCommandConfig{}, errors.New("setta-control-plane restore does not accept positional arguments")
	}
	if err := requireAbsoluteDirectories(
		config.BackupDirectory,
		config.DataDirectory,
		config.SecretDirectory,
	); err != nil {
		return restoreCommandConfig{}, err
	}
	return config, nil
}

func requireAbsoluteDirectories(paths ...string) error {
	for _, path := range paths {
		if path == "" || !filepath.IsAbs(path) {
			return errors.New("control-plane backup and restore directories must be absolute")
		}
	}
	return nil
}

func requireBackupSources(dataDirectory string, secretDirectory string) error {
	if err := requireExistingPrivateDirectory(dataDirectory, "control-plane data"); err != nil {
		return err
	}
	if err := requireExistingPrivateDirectory(secretDirectory, "control-plane secret"); err != nil {
		return err
	}
	info, err := os.Lstat(controlplane.StoreDatabasePath(dataDirectory))
	if err != nil {
		return fmt.Errorf("inspect control-plane database for backup: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
		return errors.New("control-plane database for backup must be a private regular file")
	}
	return nil
}

func requireExistingPrivateDirectory(path string, label string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect %s directory for backup: %w", label, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("%s directory for backup must be private and non-symlink", label)
	}
	return nil
}

func requireStoppedControlPlane(dataDirectory string) error {
	socketPath := controlplane.AdminSocketPath(dataDirectory)
	info, err := os.Lstat(socketPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect control-plane administration socket: %w", err)
	}
	if info.Mode()&os.ModeSocket == 0 {
		return errors.New("control-plane administration path exists and is not a socket")
	}
	connection, err := net.DialTimeout("unix", socketPath, offlineControlPlaneProbeTimeout)
	if err != nil {
		if errors.Is(err, syscall.ECONNREFUSED) || errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("confirm control-plane serving process is stopped: %w", err)
	}
	_ = connection.Close()
	return errors.New("control-plane backup requires the serving process to be stopped")
}

func decodeBackupCommandEvent(data []byte) (backupCommandEvent, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var event backupCommandEvent
	if err := decoder.Decode(&event); err != nil {
		return backupCommandEvent{}, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return backupCommandEvent{}, errors.New("backup command emitted more than one event")
	}
	return event, nil
}
