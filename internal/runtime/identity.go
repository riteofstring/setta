package runtime

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"setta/internal/httpapi"
	"setta/internal/jsonio"
	"setta/internal/runtimeidentity"
)

type runtimeIdentity struct {
	RuntimeID   string `json:"runtimeId"`
	DisplayName string `json:"displayName"`
}

type runtimeIdentityManager struct {
	mu           sync.RWMutex
	identityPath string
	identity     runtimeIdentity
}

func newRuntimeIdentityManager(appDataDir string, displayNameOverride string) (*runtimeIdentityManager, error) {
	runtimeDir := filepath.Join(appDataDir, "runtime")
	identityPath := filepath.Join(runtimeDir, "identity.json")
	identity, err := loadRuntimeIdentity(runtimeDir, identityPath)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(displayNameOverride) != "" {
		displayName, err := runtimeidentity.NormalizeDisplayName(displayNameOverride)
		if err != nil {
			return nil, err
		}
		if identity.DisplayName != displayName {
			identity.DisplayName = displayName
			if err := writeRuntimeIdentity(identityPath, identity); err != nil {
				return nil, err
			}
		}
	}
	return &runtimeIdentityManager{
		identityPath: identityPath,
		identity:     identity,
	}, nil
}

func (manager *runtimeIdentityManager) RuntimeIdentity(_ context.Context) (httpapi.RuntimeIdentity, error) {
	return toHTTPRuntimeIdentity(manager.identitySnapshot()), nil
}

func (manager *runtimeIdentityManager) UpdateRuntimeDisplayName(_ context.Context, displayName string) (httpapi.RuntimeIdentity, error) {
	identity, err := manager.updateDisplayName(displayName)
	if err != nil {
		return httpapi.RuntimeIdentity{}, err
	}
	return toHTTPRuntimeIdentity(identity), nil
}

func (manager *runtimeIdentityManager) identitySnapshot() runtimeIdentity {
	manager.mu.RLock()
	defer manager.mu.RUnlock()
	return manager.identity
}

func (manager *runtimeIdentityManager) updateDisplayName(displayName string) (runtimeIdentity, error) {
	displayName, err := runtimeidentity.NormalizeDisplayName(displayName)
	if err != nil {
		return runtimeIdentity{}, err
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.identity.DisplayName == displayName {
		return manager.identity, nil
	}
	updated := manager.identity
	updated.DisplayName = displayName
	if err := writeRuntimeIdentity(manager.identityPath, updated); err != nil {
		return runtimeIdentity{}, err
	}
	manager.identity = updated
	return updated, nil
}

func toHTTPRuntimeIdentity(identity runtimeIdentity) httpapi.RuntimeIdentity {
	return httpapi.RuntimeIdentity{
		ID:          identity.RuntimeID,
		DisplayName: identity.DisplayName,
	}
}

func loadRuntimeIdentity(runtimeDir string, identityPath string) (runtimeIdentity, error) {
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
	displayName, err := defaultRuntimeDisplayName(runtimeID)
	if err != nil {
		return runtimeIdentity{}, err
	}
	identity := runtimeIdentity{
		RuntimeID:   runtimeID,
		DisplayName: displayName,
	}
	if err := writeRuntimeIdentity(identityPath, identity); err != nil {
		return runtimeIdentity{}, err
	}
	return identity, nil
}

func defaultRuntimeDisplayName(runtimeID string) (string, error) {
	return runtimeidentity.GeneratedDisplayName(runtimeID)
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
	if _, err := runtimeidentity.NormalizeDisplayName(identity.DisplayName); err != nil {
		return err
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
