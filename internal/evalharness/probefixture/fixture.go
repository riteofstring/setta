package probefixture

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

const (
	Prefix      = "SETTA_PHASE0_"
	RandomBytes = 16
	Pattern     = `^SETTA_PHASE0_[0-9a-f]{32}$`
)

func NewToken() (string, error) {
	value := make([]byte, RandomBytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("create Phase 0 fixture token: %w", err)
	}
	return Prefix + hex.EncodeToString(value), nil
}
