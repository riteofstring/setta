package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/jsonio"
	"setta/internal/runtimeauth"
)

type provisioningSeedFile struct {
	PairingTokenHash string `json:"pairingTokenHash"`
	ProvisionID      string `json:"provisionId"`
	AttestationKey   string `json:"provisionAttestationKey"`
	ExpiresAt        string `json:"expiresAt,omitempty"`
}

type consumedProvisioningSeedMarker struct {
	SchemaVersion int    `json:"schemaVersion"`
	ProvisionID   string `json:"provisionId"`
	ConsumedAt    string `json:"consumedAt"`
	SeedPath      string `json:"seedPath"`
}

func consumeProvisioningSeedIfConfigured(ctx context.Context, options serveOptions) error {
	if options.ProvisioningSeedPath == "" {
		return nil
	}
	if _, err := os.Stat(options.ProvisioningSeedPath); errors.Is(err, os.ErrNotExist) {
		if provisioningSeedConsumedMarkerExists(options.AppDataDir) {
			return nil
		}
		return fmt.Errorf("stat provisioning seed %s: %w", options.ProvisioningSeedPath, err)
	}
	return consumeProvisioningSeed(ctx, options.AppDataDir, options.ProvisioningSeedPath)
}

func consumeProvisioningSeed(ctx context.Context, appDataDir string, path string) error {
	seed, err := readProvisioningSeed(path)
	if err != nil {
		return err
	}
	expiresAt, err := parseProvisioningSeedExpiry(seed.ExpiresAt)
	if err != nil {
		return err
	}
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		return fmt.Errorf("open runtime auth store for provisioning seed: %w", err)
	}
	defer func() {
		_ = store.Close()
	}()
	if _, err := store.SeedProvisionedPairingToken(ctx, runtimeauth.SeedProvisionedPairingTokenInput{
		PairingTokenHash: seed.PairingTokenHash,
		ProvisionID:      seed.ProvisionID,
		AttestationKey:   seed.AttestationKey,
		ExpiresAt:        expiresAt,
	}); err != nil {
		return fmt.Errorf("seed provisioned pairing token from %s: %w", path, err)
	}
	if err := writeProvisioningSeedConsumedMarker(appDataDir, seed.ProvisionID, path); err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove consumed provisioning seed %s: %w", path, err)
	}
	return nil
}

func validateProvisioningSeedPath(path string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if !filepath.IsAbs(path) {
		return fmt.Errorf("provisioning seed path must be absolute: %s", path)
	}
	return nil
}

func readProvisioningSeed(path string) (provisioningSeedFile, error) {
	info, err := os.Stat(path)
	if err != nil {
		return provisioningSeedFile{}, fmt.Errorf("stat provisioning seed %s: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return provisioningSeedFile{}, fmt.Errorf("provisioning seed %s must be a regular file", path)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return provisioningSeedFile{}, fmt.Errorf("provisioning seed %s must not be readable by group or other users", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return provisioningSeedFile{}, fmt.Errorf("read provisioning seed %s: %w", path, err)
	}
	var seed provisioningSeedFile
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &seed); err != nil {
		return provisioningSeedFile{}, fmt.Errorf("parse provisioning seed %s: %w", path, err)
	}
	return seed, nil
}

func parseProvisioningSeedExpiry(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("provisioning seed expiresAt must be RFC3339Nano: %w", err)
	}
	return expiresAt, nil
}

func provisioningSeedConsumedMarkerPath(appDataDir string) string {
	return filepath.Join(appDataDir, "provisioning-seed-consumed.json")
}

func provisioningSeedConsumedMarkerExists(appDataDir string) bool {
	info, err := os.Stat(provisioningSeedConsumedMarkerPath(appDataDir))
	return err == nil && info.Mode().IsRegular()
}

func writeProvisioningSeedConsumedMarker(appDataDir string, provisionID string, seedPath string) error {
	marker := consumedProvisioningSeedMarker{
		SchemaVersion: 1,
		ProvisionID:   provisionID,
		ConsumedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		SeedPath:      seedPath,
	}
	var data bytes.Buffer
	encoder := json.NewEncoder(&data)
	if err := encoder.Encode(marker); err != nil {
		return fmt.Errorf("encode consumed provisioning seed marker: %w", err)
	}
	if err := os.MkdirAll(appDataDir, 0o700); err != nil {
		return fmt.Errorf("create app data dir for consumed provisioning seed marker: %w", err)
	}
	path := provisioningSeedConsumedMarkerPath(appDataDir)
	if err := os.WriteFile(path, data.Bytes(), 0o600); err != nil {
		return fmt.Errorf("write consumed provisioning seed marker %s: %w", path, err)
	}
	return nil
}
