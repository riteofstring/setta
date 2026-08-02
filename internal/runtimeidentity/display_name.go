package runtimeidentity

import (
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode"
)

const DisplayNameMaxLength = 80

var displayNameAdjectives = []string{
	"copper",
	"amber",
	"bright",
	"calm",
	"cedar",
	"cobalt",
	"golden",
	"green",
	"lucid",
	"marble",
	"northern",
	"quiet",
	"silver",
	"solar",
	"steady",
	"violet",
}

var displayNameNouns = []string{
	"lantern",
	"beacon",
	"bridge",
	"compass",
	"harbor",
	"keystone",
	"meadow",
	"signal",
	"summit",
	"vault",
	"window",
	"workshop",
	"anchor",
	"atlas",
	"forge",
	"garden",
}

func GeneratedDisplayName(runtimeID string) (string, error) {
	data, err := hex.DecodeString(runtimeID)
	if err != nil || len(data) < 2 || strings.ToLower(runtimeID) != runtimeID {
		return "", fmt.Errorf("generate runtime display name from invalid runtime id %q", runtimeID)
	}
	adjective := displayNameAdjectives[int(data[0])%len(displayNameAdjectives)]
	noun := displayNameNouns[int(data[1])%len(displayNameNouns)]
	return "setta-" + adjective + "-" + noun, nil
}

func NormalizeDisplayName(displayName string) (string, error) {
	trimmed := strings.TrimSpace(displayName)
	if trimmed == "" {
		return "", errors.New("displayName is required")
	}
	if len(trimmed) > DisplayNameMaxLength {
		return "", fmt.Errorf("displayName must be at most %d bytes", DisplayNameMaxLength)
	}
	for _, character := range trimmed {
		if unicode.IsControl(character) {
			return "", errors.New("displayName must not contain control characters")
		}
	}
	return trimmed, nil
}
