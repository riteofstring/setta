package runtime

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/jsonio"
)

const defaultRuntimeDisplayName = "Setta Runtime"

type runtimeIdentity struct {
	RuntimeID   string `json:"runtimeId"`
	DisplayName string `json:"displayName"`
}

func loadRuntimeIdentity(appDataDir string) (runtimeIdentity, error) {
	runtimeDir := filepath.Join(appDataDir, "runtime")
	identityPath := filepath.Join(runtimeDir, "identity.json")
	data, err := os.ReadFile(identityPath)
	if errors.Is(err, os.ErrNotExist) {
		return createRuntimeIdentity(runtimeDir, identityPath)
	}
	if err != nil {
		return runtimeIdentity{}, fmt.Errorf("read runtime identity %s: %w", identityPath, err)
	}
	var identity runtimeIdentity
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &identity); err != nil {
		return runtimeIdentity{}, fmt.Errorf("parse runtime identity %s: %w", identityPath, err)
	}
	if err := validateRuntimeIdentity(identity); err != nil {
		return runtimeIdentity{}, fmt.Errorf("validate runtime identity %s: %w", identityPath, err)
	}
	return identity, nil
}

func createRuntimeIdentity(runtimeDir string, identityPath string) (runtimeIdentity, error) {
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return runtimeIdentity{}, fmt.Errorf("create runtime identity directory %s: %w", runtimeDir, err)
	}
	runtimeID, err := randomRuntimeID()
	if err != nil {
		return runtimeIdentity{}, err
	}
	identity := runtimeIdentity{
		RuntimeID:   runtimeID,
		DisplayName: defaultRuntimeDisplayName,
	}
	if err := writeRuntimeIdentity(identityPath, identity); err != nil {
		return runtimeIdentity{}, err
	}
	return identity, nil
}

func writeRuntimeIdentity(identityPath string, identity runtimeIdentity) error {
	payload, err := json.MarshalIndent(identity, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal runtime identity: %w", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(identityPath, payload, 0o644); err != nil {
		return fmt.Errorf("write runtime identity %s: %w", identityPath, err)
	}
	return nil
}

func validateRuntimeIdentity(identity runtimeIdentity) error {
	if len(identity.RuntimeID) != 32 {
		return fmt.Errorf("runtimeId must be 32 lowercase hex characters")
	}
	if _, err := hex.DecodeString(identity.RuntimeID); err != nil || strings.ToLower(identity.RuntimeID) != identity.RuntimeID {
		return fmt.Errorf("runtimeId must be 32 lowercase hex characters")
	}
	if strings.TrimSpace(identity.DisplayName) == "" {
		return errors.New("displayName is required")
	}
	return nil
}

func randomRuntimeID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate runtime id: %w", err)
	}
	return hex.EncodeToString(data[:]), nil
}
