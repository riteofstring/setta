package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/runtimeauth"
)

func TestConsumeProvisioningSeedSeedsStoreAndRemovesFile(t *testing.T) {
	appDataDir := t.TempDir()
	pairingToken := "4444444444444444444444444444444444444444444444444444444444444444"
	tokenHash := sha256.Sum256([]byte(pairingToken))
	seedPath := filepath.Join(t.TempDir(), "provisioning-seed.json")
	writeProvisioningSeed(t, seedPath, `{
  "pairingTokenHash": "`+hex.EncodeToString(tokenHash[:])+`",
  "provisionId": "provision_seed_012345",
  "provisionAttestationKey": "attestation-key-4444444444444444"
}
`)

	if err := consumeProvisioningSeed(context.Background(), appDataDir, seedPath); err != nil {
		t.Fatalf("consume provisioning seed: %v", err)
	}
	if _, err := os.Stat(seedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("consumed provisioning seed stat err = %v, want not exists", err)
	}

	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("open runtime auth store: %v", err)
	}
	defer store.Close()
	session, _, ok, err := store.CompletePairing(context.Background(), pairingToken, "Provisioned desktop")
	if err != nil {
		t.Fatalf("complete seeded pairing: %v", err)
	}
	if !ok || session.DisplayName != "Provisioned desktop" {
		t.Fatalf("seeded pairing result session=%+v ok=%v, want success", session, ok)
	}
}

func TestConsumeProvisioningSeedRejectsGroupReadableFile(t *testing.T) {
	seedPath := filepath.Join(t.TempDir(), "provisioning-seed.json")
	writeProvisioningSeed(t, seedPath, "{}\n")
	if err := os.Chmod(seedPath, 0o640); err != nil {
		t.Fatalf("chmod seed: %v", err)
	}

	err := consumeProvisioningSeed(context.Background(), t.TempDir(), seedPath)
	if err == nil {
		t.Fatal("consume group-readable provisioning seed succeeded")
	}
}

func TestValidateProvisioningSeedPathRequiresAbsolutePath(t *testing.T) {
	if err := validateProvisioningSeedPath("relative-seed.json"); err == nil {
		t.Fatal("relative provisioning seed path validated")
	}
}

func writeProvisioningSeed(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write provisioning seed: %v", err)
	}
}
