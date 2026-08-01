package probefixture

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

const (
	Prefix           = "SETTA_PHASE0_"
	RandomBytes      = 16
	Pattern          = `^SETTA_PHASE0_[0-9a-f]{32}$`
	MaximumFileBytes = 128
)

func NewToken() (string, error) {
	value := make([]byte, RandomBytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("create Phase 0 fixture token: %w", err)
	}
	return Prefix + hex.EncodeToString(value), nil
}

func DecodeFile(value []byte) (string, error) {
	if len(value) == 0 || len(value) > MaximumFileBytes || value[len(value)-1] != '\n' ||
		bytes.Count(value, []byte{'\n'}) != 1 {
		return "", errors.New("probe fixture must contain one bounded newline-terminated token")
	}
	fixtureToken := string(value[:len(value)-1])
	hexValue := strings.TrimPrefix(fixtureToken, Prefix)
	decoded, err := hex.DecodeString(hexValue)
	if !strings.HasPrefix(fixtureToken, Prefix) || err != nil || len(decoded) != RandomBytes ||
		hex.EncodeToString(decoded) != hexValue {
		return "", errors.New("probe fixture token is invalid")
	}
	return fixtureToken, nil
}
