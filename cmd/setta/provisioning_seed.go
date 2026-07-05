package main

import (
	"bytes"
	"context"
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

func consumeProvisioningSeedIfConfigured(ctx context.Context, options serveOptions) error {
	if options.ProvisioningSeedPath == "" {
		return nil
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
