package notify

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	webpush "github.com/SherClockHolmes/webpush-go"

	"setta/internal/jsonio"
)

const vapidKeyFileName = "web-push-vapid.json"

type vapidKeyGenerator func() (privateKey string, publicKey string, err error)

func loadOrCreateVAPIDKeys(appDataDir string, generate vapidKeyGenerator) (VAPIDKeyPair, error) {
	if strings.TrimSpace(appDataDir) == "" {
		return VAPIDKeyPair{}, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return VAPIDKeyPair{}, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	if generate == nil {
		generate = webpush.GenerateVAPIDKeys
	}
	runtimeDir := filepath.Join(filepath.Clean(appDataDir), "runtime")
	keyPath := filepath.Join(runtimeDir, vapidKeyFileName)
	data, err := os.ReadFile(keyPath)
	if errors.Is(err, os.ErrNotExist) {
		return createVAPIDKeys(runtimeDir, keyPath, generate)
	}
	if err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("read VAPID keypair %s: %w", keyPath, err)
	}
	var pair VAPIDKeyPair
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &pair); err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("parse VAPID keypair %s: %w", keyPath, err)
	}
	if err := validateVAPIDKeyPair(pair); err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("validate VAPID keypair %s: %w", keyPath, err)
	}
	return pair, nil
}

func createVAPIDKeys(runtimeDir string, keyPath string, generate vapidKeyGenerator) (VAPIDKeyPair, error) {
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("create VAPID key directory %s: %w", runtimeDir, err)
	}
	privateKey, publicKey, err := generate()
	if err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("generate VAPID keypair: %w", err)
	}
	pair := VAPIDKeyPair{PublicKey: publicKey, PrivateKey: privateKey}
	if err := validateVAPIDKeyPair(pair); err != nil {
		return VAPIDKeyPair{}, err
	}
	payload, err := json.MarshalIndent(pair, "", "  ")
	if err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("marshal VAPID keypair: %w", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(keyPath, payload, 0o600); err != nil {
		return VAPIDKeyPair{}, fmt.Errorf("write VAPID keypair %s: %w", keyPath, err)
	}
	return pair, nil
}

func validateVAPIDKeyPair(pair VAPIDKeyPair) error {
	if strings.TrimSpace(pair.PublicKey) == "" {
		return errors.New("VAPID public key is required")
	}
	if strings.TrimSpace(pair.PrivateKey) == "" {
		return errors.New("VAPID private key is required")
	}
	return nil
}
